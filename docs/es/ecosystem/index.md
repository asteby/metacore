# Ecosistema

Metacore es una plataforma distribuida en un set chico de repositorios públicos. Esta página es el mapa.

[[toc]]

## La foto grande

```
                ┌──────────────────────────────────────┐
                │          asteby/metacore             │
                │   ← you are here (the portal)        │
                └─────────────────┬────────────────────┘
                                  │
              ┌───────────────────┴────────────────────┐
              ▼                                        ▼
   ┌───────────────────────┐              ┌───────────────────────┐
   │  asteby/metacore-     │              │  asteby/metacore-     │
   │       kernel          │              │        sdk            │
   │  Go runtime           │              │  TS packages + CLI    │
   │  • dynamic CRUD       │◀────reads────│  • manifest schema    │
   │  • permissions        │              │  • runtime-react      │
   │  • lifecycle          │              │  • 16 npm packages    │
   │  • WASM sandbox       │              │  • metacore-sdk CLI   │
   │  • WebSocket hub      │              │                       │
   └──────────┬────────────┘              └────────────┬──────────┘
              │                                        │
              └────────────────┬───────────────────────┘
                               ▼
              ┌──────────────────────────────────────┐
              │             Hosts                    │
              │  • your host application             │
              │    (operator panel, portal, admin,   │
              │     embedded settings, anything)     │
              └──────────────────────────────────────┘
                               ▼
              ┌──────────────────────────────────────┐
              │       Addons (.mcbundle)             │
              │  • first-party (built by you)        │
              │  • third-party (built by anyone)     │
              └──────────────────────────────────────┘
```

## Repositorios públicos

| Repo | Qué es | Docs |
|---|---|---|
| [`asteby/metacore`](https://github.com/asteby/metacore) | Este portal — la puerta de entrada | estás acá |
| [`asteby/metacore-kernel`](https://github.com/asteby/metacore-kernel) | El runtime Go | [docs ↗](https://asteby.github.io/metacore-kernel/) |
| [`asteby/metacore-sdk`](https://github.com/asteby/metacore-sdk) | Los packages npm y la CLI | [docs ↗](https://asteby.github.io/metacore-sdk/) |

Los tres son Apache-2.0.

## Cómo se relacionan

- El **portal** explica la plataforma y dirige a las otras dos.
- El **kernel** es el runtime. Es una librería Go que embebés; posee persistencia, REST, permisos, lifecycle, sandboxing, tiempo real.
- El **SDK** es el contrato + la superficie. Define qué es un addon (schema del manifest, formato del bundle) y provee los primitivos React que consumen la metadata del kernel.

Una app Metacore funcional es un binario host que importa el kernel, emparejado con un frontend host que importa el SDK, con uno o más addons `.mcbundle` instalados.

## Hosts

Los hosts son los productos construidos arriba del kernel + SDK usando solo APIs públicas. El framework no publica un host; vos construís uno que encaje con tu producto. Las formas comunes incluyen paneles de operador, superficies de marketplace + admin, portales cara al cliente, secciones de admin embebidas y capas de UX por vertical.

Mirá [Hosts](/es/ecosystem/hosts) y [Construir un host](/es/getting-started/build-a-host) para la receta.

## Versionado

El kernel y el SDK releasean independientemente. Un host pinea ambos. Cuando un feature del kernel requiere una versión específica del SDK (o viceversa), se nota en las release notes; si no, evolucionan a su propio ritmo.

## A dónde ir después

- [Kernel](/es/ecosystem/kernel) — qué hace, con un link a su sitio de docs dedicado.
- [SDK](/es/ecosystem/sdk) — qué provee, con un link a su sitio de docs dedicado.
- [Hosts](/es/ecosystem/hosts) — formas de host y cómo construir uno.
