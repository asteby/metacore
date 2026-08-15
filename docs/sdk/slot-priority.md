# Slot priority ordering

> **TL;DR — Higher `priority` renders first.** This is the canonical contract
> for every slot/contribution surface in the metacore ecosystem.

The metacore SDK currently ships two parallel slot systems:

- `Registry.registerSlot` from `@asteby/metacore-sdk` — consumed via
  `<Slot>` from `@asteby/metacore-sdk/react` (used by `ops` today).
- `slotRegistry.register` from `@asteby/metacore-runtime-react` — consumed
  via `<Slot>` from `@asteby/metacore-runtime-react` (used by addons that
  follow the runtime-react contract documented in `dynamic-ui.md`).

Both must order contributions identically. Until this fix landed, the SDK
`Registry` sorted **ascending** (its comment said "Lower renders first")
while the runtime-react `slotRegistry` sorted **descending** ("Higher
renders first"). The runtime-react behaviour matches the documented
contract and the `mergeNavigation` helper in `navigation-builder.tsx`, so
the SDK was the outlier and has been brought into line.

## Canonical rule

| Priority      | Position                              |
| ------------- | ------------------------------------- |
| `10`          | renders first                         |
| `5`           | renders next                          |
| `0` (default) | renders after positive priorities     |
| `-1`          | renders last                          |

Equal priorities preserve insertion order. Missing `priority` is treated
as `0`.

## Why "higher first"?

1. It is what `docs/dynamic-ui.md` has documented since the first slot
   release: *"Higher `priority` renders first."*
2. It is what `mergeNavigation` (and `useNavigation`) in
   `@asteby/metacore-runtime-react` already do for sidebar items — same
   semantic across slots and navigation keeps the mental model uniform
   for addon authors.
3. The intuitive reading of "priority" in extension systems (React Slots,
   Vue Slots, Eclipse RCP, VSCode contribution points, etc.) is that
   *higher* means *more important*, i.e. surfaces earlier / further up.

## Migration notes

Addons that always passed positive priorities and expected them to
render later (relying on the buggy SDK `Registry` order) will see their
contributions move toward the top of the slot. Auditing the in-house
ecosystem we found no addon depending on the inverted order — every
explicit `priority:` value we ship (`crud-model` template, `tickets`
example, `ops` dashboard widgets) sets a single contribution per slot,
so position is unchanged.

If you maintain an out-of-tree addon that registers multiple slot
contributions and your visual order flipped after upgrading to
`@asteby/metacore-sdk@2.5.1`, swap the priorities (e.g. `1 → 5`,
`5 → 1`) or remove them entirely.

## Where the rule lives in code

- `packages/sdk/src/registry.ts` — `Registry.registerSlot`
- `packages/runtime-react/src/slot.tsx` — `SlotRegistryImpl.register`
- `packages/runtime-react/src/navigation-builder.tsx` — `mergeNavigation`

Each sort uses the canonical comparator:

```ts
list.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
```

> When the Bridge API documentation lands on `main` (currently in
> `feat/document-bridge-api` as `docs/bridge-api.md`), the contents of
> this file should be folded into the Slots section of that document and
> this file can be deleted.
