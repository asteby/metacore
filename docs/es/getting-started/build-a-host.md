# Construir un host

Un **host** es un producto que se sienta arriba del kernel y expone los addons instalados a los usuarios. Las formas comunes incluyen un panel de operador, una superficie de marketplace + admin, un portal cara al cliente, una herramienta interna o una sección de admin embebida dentro de un producto existente. Construís lo que encaje con tu producto — todos usan los mismos primitivos.

Esta página es una receta. Las referencias profundas para cada capa viven en las docs del SDK y del kernel.

[[toc]]

## Lo que estás construyendo

```
┌────────────────────────────────────────┐
│  your-host frontend                    │
│  Vite + React + @asteby/metacore-*     │
│  (auth UI, layout, your branding)      │
├────────────────────────────────────────┤
│  your-host backend                     │
│  Go binary embedding the kernel        │
│  (auth, billing, integrations)         │
├────────────────────────────────────────┤
│  metacore-kernel (library)             │
└────────────────────────────────────────┘
                  │
                  ▼
        installed addons (.mcbundle)
```

El host posee identidad, layout, shell de navegación y cualquier pantalla que no sea de addon. El kernel posee runtime, persistencia, permisos. Los addons poseen los features.

## Prerrequisitos

- **Node.js 20+** y **pnpm 10+** (frontend)
- **Go 1.22+** (backend)
- Una base de datos (Postgres para producción)

## 1. Backend — embebé el kernel

Empezá con la receta de [embeber el runtime](/es/getting-started/embed-the-runtime). Un backend de host es lo mismo más tu middleware de auth, tus endpoints de negocio y cualquier addon first-party compilado adentro.

```go
app, _ := host.NewApp(host.Config{
    DatabaseURL: os.Getenv("DATABASE_URL"),
    BundleDir:   "./bundles",
    Listen:      ":8080",
})

app.HTTP.Use(yourAuthMiddleware)              // sets kernel.Identity on ctx
app.HTTP.Mount("/api/auth", authRoutes(...))  // your own routes
app.Mount("/api", kernel.Router(app.Kernel))  // kernel under /api
app.Run()
```

Para features first-party, registrá un addon embebido en código para que se publique con el binario en lugar de como `.mcbundle`:

```go
app.Kernel.RegisterAddon(builtins.Notifications())
```

## 2. Frontend — Vite + React + SDK

```bash
pnpm create vite my-host -- --template react-ts
cd my-host
pnpm add @asteby/metacore-runtime-react @asteby/metacore-runtime-core \
        @tanstack/react-query react-router-dom
```

Cableá el runtime en `main.tsx`:

```tsx
import { MetacoreProvider } from '@asteby/metacore-runtime-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import App from './App'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <MetacoreProvider config={{
      apiBase: '/api',
      wsUrl:   '/api/ws',
      auth:    { tokenProvider: () => sessionStorage.getItem('jwt') },
    }}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </MetacoreProvider>
  </QueryClientProvider>
)
```

El provider le da a cada descendiente acceso a:

- **`useDynamicQuery`** / **`useDynamicMutation`** — los hooks de CRUD.
- **`useAddons`** — lista los addons instalados + su metadata.
- **`useCapabilities`** — qué puede hacer el usuario actual.
- **`<DynamicTable>`** / **`<DynamicForm>`** / **`<DynamicDetail>`** — los primitivos de UI tipados.
- **`<Slot>`** — renderiza componentes React provistos por addons.

## 3. El shell del addon

La mayoría de los hosts tienen un layout así:

```tsx
import { useAddons } from '@asteby/metacore-runtime-react'
import { Routes, Route, NavLink } from 'react-router-dom'
import { AddonView } from './AddonView'

export default function App() {
  const { addons } = useAddons()

  return (
    <div className="layout">
      <nav>
        {addons.map(a => (
          <NavLink key={a.id} to={`/addons/${a.id}`}>{a.displayName}</NavLink>
        ))}
      </nav>
      <main>
        <Routes>
          <Route path="/addons/:addonId/*" element={<AddonView />} />
        </Routes>
      </main>
    </div>
  )
}
```

`<AddonView>` compone la UI del addon desde sus slots registrados — la mayoría tiene un slot `index` por defecto que renderiza un `<DynamicTable>` para la tabla principal del addon:

```tsx
import { useParams } from 'react-router-dom'
import { Slot, DynamicTable } from '@asteby/metacore-runtime-react'

export function AddonView() {
  const { addonId } = useParams()
  return (
    <Slot name={`${addonId}.index`} fallback={
      <DynamicTable addon={addonId!} table="default" />
    } />
  )
}
```

## 4. Tailwind, CSS, branding

El SDK trae sus propios design tokens (compatibles con Tailwind v4). Cuando uses Tailwind, declará el SDK como una source para que sus clases utility sobrevivan al purging:

```css
/* main.css */
@import "tailwindcss";
@source "../node_modules/@asteby/metacore-runtime-react";
```

Este es uno de los pasos más salteados; sin él, las UIs de los addons renderizan con estilos rotos.

## 5. Auth + identidad

El kernel se mantiene neutral sobre auth. Un host típicamente:

1. Hostea su propio `/login` (email + password, OAuth, SSO — vos elegís).
2. Emite un JWT o session.
3. Lo manda en cada request vía el `tokenProvider` del SDK.
4. Lo verifica en el middleware del backend y setea `kernel.Identity` en el contexto del request.

El kernel usa esa identidad para cada llamada CRUD: chequeos de capability, chequeos de permisos por usuario, audit logging.

## 6. Checklist de producción

- HTTPS / terminación TLS adelante del binario Go
- Una base de datos real (Postgres) con backups
- Claves de firma de bundles manejadas vía tu secret store
- Observability — el kernel exporta traces de OpenTelemetry out of the box
- Health checks (`/health`) y readiness probes
- Directorio de bundles montado desde storage persistente

## Formas comunes de host

| Forma | Qué hace |
|---|---|
| **Panel de operador** | Cómo los equipos internos usan los addons instalados día a día — listas, formularios, dashboards, botones de acción. |
| **Marketplace + admin** | Discovery, install, upgrade, billing, audit, configuración de addons. |
| **Portal cara al cliente** | Superficie de end-user, frecuentemente con copy de marketing y un layout más restringido que un panel de operador. |
| **Admin embebido** | Una sección "settings" o "admin" en una SaaS existente que levanta addons sin código por sección. |
| **UX por vertical** | Un layout adaptado a un dominio — healthcare, fintech, logística, etc. |

Sea cual sea la forma que construyas, el host es un consumidor puro del SDK con su propia auth + layout. No tiene código por addon.

## Relacionado

- [Embeber el runtime](/es/getting-started/embed-the-runtime) — la mitad backend en detalle.
- [Construir un addon](/es/getting-started/build-an-addon) — qué va a correr tu host.
- [Hosts](/es/ecosystem/hosts) — formas y patrones de host.
- [Docs del SDK ↗](https://asteby.github.io/metacore-sdk/) — cada componente, cada hook.
