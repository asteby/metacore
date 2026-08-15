<p align="center">
  <img src="/logo.svg" width="120" alt="Metacore" />
</p>

<h1 align="center">Modals</h1>

<p align="center">
  <strong>The contract an addon implements to contribute a modal the host renders on demand.</strong>
</p>

Modals are addon-owned React components that the host renders inside its own
`<Dialog>` chrome whenever a manifest action references their slug. The host
holds a `Registry` keyed by slug; the addon registers a component once during
`register(api)` and the host instantiates it as many times as the user opens
the modal.

## Table of contents

- [Contract](#contract)
- [`ModalProps` reference](#modalprops-reference)
- [Narrow at entry — the canonical pattern](#narrow-at-entry--the-canonical-pattern)
- [Why `payload` is `Record<string, unknown>`](#why-payload-is-recordstring-unknown)
- [Wiring an action's `modal` to a registered component](#wiring-an-actions-modal-to-a-registered-component)
- [Closing the modal and returning a result](#closing-the-modal-and-returning-a-result)
- [See also](#see-also)

## Contract

The SDK exposes the `ModalProps` interface that every modal component must
accept:

```ts
// packages/sdk/src/registry.ts
export interface ModalProps {
  payload: Record<string, unknown>;
  close: (result?: unknown) => void;
}
```

A modal contribution is a `{ slug, component }` pair pushed into the host
`Registry`:

```ts
// packages/sdk/src/registry.ts
export interface ModalContribution {
  /** Key used by manifest action defs (`actions[model][].modal`). */
  slug: string;
  component: ComponentType<ModalProps>;
}
```

The addon registers the component once, typically in `register(api)`:

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

The manifest then references the slug from any number of action definitions
— see [Wiring an action's `modal` to a registered component](#wiring-an-actions-modal-to-a-registered-component).

## `ModalProps` reference

| Field | Type | Description |
|---|---|---|
| `payload` | `Record<string, unknown>` | Arbitrary data the host passes when opening the modal. Shape is defined by the calling action's `fields[]` in the manifest plus whatever extra the dispatcher carries through. **Always treat this as untyped at the function boundary.** |
| `close` | `(result?: unknown) => void` | Closes the host `<Dialog>`. Pass a `result` to forward it to the action dispatcher's `onSuccess` (e.g. the created record id) — the host does not introspect the value, so any serialisable shape works. |

## Narrow at entry — the canonical pattern

`payload` is typed as `Record<string, unknown>` so the registry can hold
modals from any addon without leaking each addon's private payload shape
into the SDK. The trade-off is that the calling component is responsible
for narrowing the payload to its expected shape.

Declare the addon's payload type locally and cast **once** at the top of the
component. Everything downstream then works with a strongly-typed value:

```tsx
import type { ModalProps } from '@asteby/metacore-sdk'

interface ReassignPayload {
  ticketId: string
  currentAssigneeId: string | null
}

export function ReassignModal(props: ModalProps) {
  const { ticketId, currentAssigneeId } = props.payload as unknown as ReassignPayload
  // …render the form, call useApi(), and on submit:
  // props.close({ ticketId })
}
```

The `as unknown as <PayloadShape>` double cast is intentional — TypeScript
will refuse a direct `as ReassignPayload` cast from `Record<string, unknown>`
because the types do not overlap structurally. The `unknown` hop tells the
compiler "I know what I am doing", and concentrates the unsafe boundary in
exactly one line per modal.

Where the payload may genuinely be malformed (a hand-written action call, a
fuzzy webhook input), validate at the same boundary instead of casting
blindly:

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

## Why `payload` is `Record<string, unknown>`

Earlier versions of the SDK declared `ModalProps` parameterised on a generic
payload (`ModalProps<Payload>`), so addons could plug in their narrow type
and the registry would hold `ComponentType<ModalProps<TheirPayload>>`. That
shape **does not survive contravariance**: the host stores every modal as
`ComponentType<ModalProps>` in a single `Map<string, ModalContribution>`,
which requires every component to **accept** the widest possible payload
(`Record<string, unknown>`), not a narrow one.

In practice this meant the generic was either ignored (registry stored
`any`), or every addon had to declare an awkward `ModalProps<Record<string, unknown>>`
on the function signature anyway. The 2.5 SDK collapsed the surface area to
the runtime contract: **`payload` is always `Record<string, unknown>` at the
registry boundary**; addons narrow at the function body.

If you authored a modal before 2.5 with a custom prop shape:

```tsx
// before — typechecks looked fine, but the registry never enforced the shape
function MyModal({ ticketId, close }: { ticketId: string; close: () => void }) { /* … */ }
```

…migrate by destructuring from `props.payload`:

```tsx
// after — registry-compatible, payload narrowed at the entry
function MyModal(props: ModalProps) {
  const { ticketId } = props.payload as unknown as { ticketId: string }
  // …
}
```

The runtime behaviour is unchanged — the host always passed `{ payload, close }`,
regardless of how the component declared its prop shape.

## Wiring an action's `modal` to a registered component

Inside the manifest (v3, under `contributions.actions[]`), declare a custom
modal by setting `modal: "<slug>"` on the action; the slug must match
exactly what the addon registered:

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

Setting `placement: "create"` on an action with a `modal` is the pattern
for **replacing the generic create button** entirely with an addon's own
rich creation flow (a document with line items, a wizard) — see
[manifest-spec.md §7.2](./manifest-spec#72-actions--placement-federated-modals-wizards).

When the user clicks the action, the host's `<ActionModalDispatcher>` looks
the slug up in the `Registry`, falls back to the generic field-driven dialog
if no custom component is registered, and otherwise mounts the registered
component with:

```ts
{
  payload: { ticketId: row.id, ...row },
  close: (result) => { /* host closes dialog, refetches table */ },
}
```

The dispatcher always merges the row into `payload` so the modal does not
need to refetch — type the row's columns on the addon side.

## Closing the modal and returning a result

`close()` accepts an optional `result?: unknown` that the host forwards to
the dispatcher's `onSuccess` callback. The host does **not** inspect the
value — addons use it to signal whichever post-action data the calling
context wants (e.g. the new record id, a confirmation flag, a diff).

```tsx
async function onSubmit(form: FormValues) {
  const res = await api.post(`/data/tickets/${ticketId}/action/reassign`, form)
  props.close({ ticketId, newAssigneeId: res.data.data.assignee_id })
}
```

If the user cancels (clicks outside, presses Escape, hits "Cancel"), the
host calls `close()` without arguments — there is no addon-side cleanup
required.

## See also

- [`bridge-api.md`](./bridge-api) — the full bridge contract; modals are one of four registry contribution kinds.
- [`addon-cookbook.md`](./addon-cookbook#how-do-i-create-a-custom-action-with-a-modal) — recipe for declaring a custom action in the manifest.
- [`manifest-spec.md`](./manifest-spec#72-actions--placement-federated-modals-wizards) — `contributions.actions[].modal` field reference.
- [`packages/sdk/src/registry.ts`](../packages/sdk/src/registry.ts) — `ModalProps`, `ModalContribution`, `Registry` source.
