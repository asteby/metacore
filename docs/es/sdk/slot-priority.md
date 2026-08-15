# Orden de prioridad de slots

> **TL;DR — Mayor `priority` renderiza primero.** Este es el contrato
> canónico para cada superficie de slot/contribution en el ecosistema
> metacore.

El SDK de metacore actualmente envía dos sistemas de slot paralelos:

- `Registry.registerSlot` de `@asteby/metacore-sdk` — consumido vía
  `<Slot>` de `@asteby/metacore-sdk/react` (usado por `ops` hoy).
- `slotRegistry.register` de `@asteby/metacore-runtime-react` — consumido
  vía `<Slot>` de `@asteby/metacore-runtime-react` (usado por addons que
  siguen el contrato runtime-react documentado en `dynamic-ui.md`).

Ambos deben ordenar las contribuciones de forma idéntica. Hasta que este
fix aterrizó, el `Registry` del SDK ordenaba **ascendente** (su comentario
decía "Lower renders first") mientras que el `slotRegistry` de
runtime-react ordenaba **descendente** ("Higher renders first"). El
comportamiento de runtime-react matchea el contrato documentado y el
helper `mergeNavigation` en `navigation-builder.tsx`, así que el SDK era el
outlier y se alineó.

## Regla canónica

| Priority      | Posición                              |
| ------------- | ------------------------------------- |
| `10`          | renderiza primero                     |
| `5`           | renderiza después                     |
| `0` (default) | renderiza después de las positivas    |
| `-1`          | renderiza al final                    |

Priorities iguales preservan el orden de inserción. `priority` faltante se
trata como `0`.

## ¿Por qué "mayor primero"?

1. Es lo que `docs/dynamic-ui.md` documenta desde el primer release de
   slots: *"Mayor `priority` renderiza primero."*
2. Es lo que `mergeNavigation` (y `useNavigation`) en
   `@asteby/metacore-runtime-react` ya hacen para los ítems de sidebar —
   la misma semántica entre slots y navegación mantiene el modelo mental
   uniforme para los autores de addons.
3. La lectura intuitiva de "priority" en sistemas de extensión (React
   Slots, Vue Slots, Eclipse RCP, puntos de contribución de VSCode, etc.)
   es que *mayor* significa *más importante*, es decir, aparece antes /
   más arriba.

## Notas de migración

Los addons que siempre pasaron priorities positivas y esperaban que
renderizaran después (dependiendo del orden bugueado del `Registry` del
SDK) van a ver sus contribuciones moverse hacia arriba del slot. Auditando
el ecosistema in-house no encontramos ningún addon dependiendo del orden
invertido — cada valor explícito de `priority:` que enviamos (template
`crud-model`, ejemplo `tickets`, widgets de dashboard de `ops`) setea una
sola contribución por slot, así que la posición no cambia.

Si mantenés un addon fuera del monorepo que registra múltiples
contribuciones de slot y tu orden visual se invirtió después de actualizar
a `@asteby/metacore-sdk@2.5.1`, intercambiá las priorities (ej. `1 → 5`,
`5 → 1`) o quitalas por completo.

## Dónde vive la regla en código

- `packages/sdk/src/registry.ts` — `Registry.registerSlot`
- `packages/runtime-react/src/slot.tsx` — `SlotRegistryImpl.register`
- `packages/runtime-react/src/navigation-builder.tsx` — `mergeNavigation`

Cada sort usa el comparador canónico:

```ts
list.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
```

> Cuando la documentación de la Bridge API aterrice en `main` (actualmente
> en `feat/document-bridge-api` como `docs/bridge-api.md`), el contenido
> de este archivo debería plegarse en la sección de Slots de ese documento
> y este archivo se puede borrar.
