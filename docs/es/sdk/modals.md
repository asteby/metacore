<p align="center">
  <img src="/logo.svg" width="120" alt="Metacore" />
</p>

<h1 align="center">Modals</h1>

<p align="center">
  <strong>El contrato que un addon implementa para contribuir un modal que el host renderiza on-demand.</strong>
</p>

Los modals son componentes React propiedad del addon que el host renderiza
dentro de su propio chrome `<Dialog>` cada vez que una action del manifest
referencia su slug. El host mantiene un `Registry` keyed por slug; el addon
registra un componente una vez durante `register(api)` y el host lo
instancia tantas veces como el usuario abre el modal.

## Tabla de contenidos

- [Contrato](#contrato)
- [Referencia de `ModalProps`](#referencia-de-modalprops)
- [Estrechar en la entrada — el patrón canónico](#estrechar-en-la-entrada--el-patrón-canónico)
- [Por qué `payload` es `Record<string, unknown>`](#por-qué-payload-es-recordstring-unknown)
- [Cablear el `modal` de una acción a un componente registrado](#cablear-el-modal-de-una-acción-a-un-componente-registrado)
- [Cerrar el modal y devolver un resultado](#cerrar-el-modal-y-devolver-un-resultado)
- [Ver también](#ver-también)

## Contrato

El SDK expone la interfaz `ModalProps` que cada componente de modal debe
aceptar:

```ts
// packages/sdk/src/registry.ts
export interface ModalProps {
  payload: Record<string, unknown>;
  close: (result?: unknown) => void;
}
```

Una contribución de modal es un par `{ slug, component }` empujado al
`Registry` del host:

```ts
// packages/sdk/src/registry.ts
export interface ModalContribution {
  /** Key usada por las defs de action del manifest (`actions[model][].modal`). */
  slug: string;
  component: ComponentType<ModalProps>;
}
```

El addon registra el componente una vez, típicamente en `register(api)`:

```ts
// frontend/src/plugin.tsx
import type { AddonAPI } from '@asteby/metacore-sdk'
import { ReassignModal } from './modals/reassign'

export function register(api: AddonAPI) {
  api.registry.registerModal({
    slug: 'tickets.reassign',
    component: ReassignModal,
  })
}
```

El manifest después referencia el slug desde cualquier cantidad de
definiciones de action — ver
[Cablear el `modal` de una acción a un componente registrado](#cablear-el-modal-de-una-acción-a-un-componente-registrado).

## Referencia de `ModalProps`

| Campo | Tipo | Descripción |
|---|---|---|
| `payload` | `Record<string, unknown>` | Data arbitraria que el host pasa al abrir el modal. La forma la define el `fields[]` de la action que llama en el manifest más lo que sea extra que el dispatcher lleve. **Tratá esto siempre como sin tipar en el límite de la función.** |
| `close` | `(result?: unknown) => void` | Cierra el `<Dialog>` del host. Pasá un `result` para forwardearlo al `onSuccess` del dispatcher de la acción (ej. el id del registro creado) — el host no introspecciona el valor, así que cualquier forma serializable funciona. |

## Estrechar en la entrada — el patrón canónico

`payload` está tipado como `Record<string, unknown>` para que el registry
pueda guardar modals de cualquier addon sin filtrar la forma privada del
payload de cada addon al SDK. El trade-off es que el componente que lo
llama es responsable de estrechar el payload a su forma esperada.

Declará el tipo de payload del addon localmente y hacé el cast **una sola
vez** al principio del componente. Todo lo que sigue después trabaja con
un valor fuertemente tipado:

```tsx
import type { ModalProps } from '@asteby/metacore-sdk'

interface ReassignPayload {
  ticketId: string
  currentAssigneeId: string | null
}

export function ReassignModal(props: ModalProps) {
  const { ticketId, currentAssigneeId } = props.payload as unknown as ReassignPayload
  // …renderizá el form, llamá a useApi(), y en el submit:
  // props.close({ ticketId })
}
```

El doble cast `as unknown as <PayloadShape>` es intencional — TypeScript
va a rechazar un cast directo `as ReassignPayload` desde
`Record<string, unknown>` porque los tipos no se solapan estructuralmente.
El salto por `unknown` le dice al compilador "sé lo que estoy haciendo", y
concentra el límite inseguro en exactamente una línea por modal.

Donde el payload puede genuinamente estar mal formado (una llamada de
action escrita a mano, un input de webhook impreciso), validá en el mismo
límite en vez de castear a ciegas:

```tsx
import { z } from 'zod'
import type { ModalProps } from '@asteby/metacore-sdk'

const Payload = z.object({
  ticketId: z.string().uuid(),
  currentAssigneeId: z.string().uuid().nullable(),
})

export function ReassignModal(props: ModalProps) {
  const parsed = Payload.safeParse(props.payload)
  if (!parsed.success) {
    props.close()
    return null
  }
  const { ticketId, currentAssigneeId } = parsed.data
  // …
}
```

## Por qué `payload` es `Record<string, unknown>`

Versiones anteriores del SDK declaraban `ModalProps` parametrizado sobre un
payload genérico (`ModalProps<Payload>`), así los addons podían enchufar
su tipo estrecho y el registry guardaba
`ComponentType<ModalProps<TheirPayload>>`. Esa forma **no sobrevive a la
contravarianza**: el host guarda cada modal como `ComponentType<ModalProps>`
en un único `Map<string, ModalContribution>`, lo que requiere que cada
componente **acepte** el payload más amplio posible
(`Record<string, unknown>`), no uno estrecho.

En la práctica esto significaba que el genérico se ignoraba (el registry
guardaba `any`), o que cada addon tenía que declarar un incómodo
`ModalProps<Record<string, unknown>>` en la firma de la función de todas
formas. El SDK 2.5 colapsó la superficie al contrato de runtime:
**`payload` siempre es `Record<string, unknown>` en el límite del
registry**; los addons estrechan en el body de la función.

Si autoraste un modal antes de 2.5 con una forma de prop custom:

```tsx
// antes — typechequeaba bien, pero el registry nunca enforceaba la forma
function MyModal({ ticketId, close }: { ticketId: string; close: () => void }) { /* … */ }
```

…migrá destructurando desde `props.payload`:

```tsx
// después — compatible con el registry, payload estrechado en la entrada
function MyModal(props: ModalProps) {
  const { ticketId } = props.payload as unknown as { ticketId: string }
  // …
}
```

El comportamiento en runtime no cambia — el host siempre pasó
`{ payload, close }`, sin importar cómo declaraba el componente su forma
de props.

## Cablear el `modal` de una acción a un componente registrado

Dentro del manifest (v3, bajo `contributions.actions[]`), declará un modal
custom seteando `modal: "<slug>"` en la acción; el slug debe matchear
exactamente lo que registró el addon:

```json
"contributions": {
  "actions": [{
    "key": "reassign",
    "label": "Reassign",
    "icon": "UserPlus",
    "target_model": "Ticket",
    "modal": "tickets.reassign",
    "handler": { "type": "webhook", "url": "/webhooks/reassign" },
    "fields": [
      { "key": "assignee_id", "label": "Assignee", "type": "dynamic_select", "ref": "User", "required": true }
    ]
  }]
}
```

Setear `placement: "create"` en una acción con un `modal` es el patrón
para **reemplazar el botón genérico de create** por completo con el flujo
de creación rico propio de un addon (un documento con line items, un
wizard) — ver
[manifest-spec.md §7.2](./manifest-spec#72-actions--placement-modals-federados-wizards).

Cuando el usuario clickea la acción, el `<ActionModalDispatcher>` del host
busca el slug en el `Registry`, hace fallback al diálogo genérico manejado
por fields si no hay componente custom registrado, y si no monta el
componente registrado con:

```ts
{
  payload: { ticketId: row.id, ...row },
  close: (result) => { /* el host cierra el diálogo, refetchea la tabla */ },
}
```

El dispatcher siempre mergea la fila en `payload` así el modal no necesita
refetchear — tipá las columnas de la fila del lado del addon.

## Cerrar el modal y devolver un resultado

`close()` acepta un `result?: unknown` opcional que el host forwardea al
callback `onSuccess` del dispatcher. El host **no** inspecciona el valor —
los addons lo usan para señalar cualquier data post-action que quiera el
contexto que llama (ej. el id del nuevo registro, un flag de confirmación,
un diff).

```tsx
async function onSubmit(form: FormValues) {
  const res = await api.post(`/data/tickets/${ticketId}/action/reassign`, form)
  props.close({ ticketId, newAssigneeId: res.data.data.assignee_id })
}
```

Si el usuario cancela (clickea afuera, presiona Escape, aprieta
"Cancelar"), el host llama a `close()` sin argumentos — no se requiere
limpieza del lado del addon.

## Ver también

- [`bridge-api.md`](./bridge-api) — el contrato bridge completo; los modals son uno de cuatro tipos de contribución al registry.
- [`addon-cookbook.md`](./addon-cookbook#cómo-creo-una-acción-custom-con-un-modal) — receta para declarar una acción custom en el manifest.
- [`manifest-spec.md`](./manifest-spec#72-actions--placement-modals-federados-wizards) — referencia del campo `contributions.actions[].modal`.
- [`packages/sdk/src/registry.ts`](../packages/sdk/src/registry.ts) — fuente de `ModalProps`, `ModalContribution`, `Registry`.
