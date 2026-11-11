# Action errors: naming the input that failed

The generative action dialog (an action with `fields`, rendered by
`ActionModalDispatcher` → `GenericActionModal` / `WizardActionModal`) reads a
failed submit and points the person at what to fix. This page is the contract
a handler (wasm guest, interceptor, host route) answers with so that happens.

## What the dialog does on a failure

- **Keeps every value typed.** The form is seeded once per opening (and again
  only when the dialog switches to another action or record id); a re-render
  of the list that hands a new `record`/`action` object never re-seeds it. The
  values are cleared only by closing the dialog or by a successful submit.
- Paints the error banner inside the dialog and the toast (as before).
- For each field the server named: red border + `aria-invalid="true"` on the
  input, the message under it (`[data-field-error="<key>"]`), and **focus +
  scroll** to the first invalid input (DOM order = field order). Typing in the
  field clears its error.
- A client-side check (`required`, `min`/`max`, `options[].when`…) behaves the
  same way before anything is sent.

## Response shapes the dialog understands

1. A per-field `errors` map at the top of the body (the kernel's 422 shape and
   the one OPS builds from a guest's `error.fields`):

   ```json
   { "success": false, "code": "invalid_input",
     "message": "Falta un dato del origen de envío: Colonia.",
     "errors": { "neighborhood": "Falta un dato del origen de envío: Colonia." } }
   ```

   A value is a ready-to-show string, or `{ "code", "params" }` (localized by
   the SDK validation catalog), or a list of either.

2. A single input named in the error envelope, for hosts that do not build the
   map:

   ```json
   { "success": false,
     "error": { "code": "invalid_input", "message": "…", "message_key": "…", "params": {…},
                "field": "postal_code" } }
   ```

   `field` (in `error` or at the top level) must be one of the dialog's own
   field keys; the message shown under the input is the server's `message`
   (OPS renders it in the request locale from `message_key` + `params`).
   A human label in `params.field` is never taken for a key.

## What a wasm action handler returns

A refusal about one input answers the usual `{success:false, error}` envelope
with the field key twice — `field` for any host, `fields` for the map:

```json
{ "success": false,
  "error": { "code": "invalid_input",
             "message": "Falta un dato del origen de envío: Colonia / Neighborhood.",
             "message_key": "warehouse.errors.origin_field_required",
             "params": { "field": "Colonia / Neighborhood" },
             "field": "neighborhood",
             "fields": { "neighborhood": "Falta un dato del origen de envío: Colonia / Neighborhood." } } }
```

OPS copies `error.fields` to the response `errors` (`WasmActionError.Fields`)
and localizes `message` from `message_key` + `params`. Use the **form field
key** of the action (`contributions.actions[].fields[].key`), not a column
label. Errors that are not about one input (a conflict, a host failure) carry
neither key and show in the banner and toast only — with an actionable
message, never a bare "try again" when the cause is known.
