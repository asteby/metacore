# Soporte: estados y tickets que ve el cliente

Un solo modelo para tres superficies: el chat de equipo (y su widget flotante), el embed
(`@asteby/metacore-support-embed`, flotante o incrustado) y la vista del ticket del addon `soporte`.
Todo vive en `@asteby/metacore-support-ui`; los textos en `supportThread.*` de `@asteby/metacore-i18n` (es/en).

## Estados

| Estado (clave) | Texto para el cliente | Que puede hacer | Donde aparece |
|---|---|---|---|
| `new` Nuevo | Recibimos tu ticket. Soporte lo tomara pronto; mientras tanto puedes agregar mas detalles. | Responder, Finalizar | insignia en lista, encabezado y hilo; tarjeta «Ticket abierto» |
| `in_progress` En atencion | Soporte esta trabajando en tu ticket. Te avisaremos aqui en cuanto respondan. | Responder, Finalizar | insignia |
| `waiting` Esperando tu respuesta | Soporte necesita algo de ti para continuar. Responde en este ticket. | Responder, Finalizar | insignia; grupo «Esperando tu respuesta» de la lista; no leidos |
| `resolved` Resuelto | Soporte marco el ticket como resuelto. Si funcion, finalizalo; si no, reabrelo. | Reabrir (dentro de la ventana), Finalizar, Abrir otro | insignia; tarjeta «Ticket resuelto»; pie «¿Se resolvio?» |
| `reopened` Reabierto | Reabriste este ticket. Soporte lo retomara pronto. | Responder, Finalizar | insignia; tarjeta «Ticket reabierto» |
| `closed` Finalizado | Este ticket esta finalizado y ya no admite mensajes. Si lo necesitas, abre otro ticket. | Abrir otro | insignia; tarjeta «Ticket finalizado»; grupo «Finalizados» (paginado) |

La fuente es `lifecycle.state` de la API de casos de OPS (`/api/support/cases`). Sin el (widget del Hub) se deduce
con `clientStateOf({status, lastAuthor, ...})`: resuelto/cerrado por `status`; abierto con ultimo mensaje de la mesa o de Aby =
`waiting`; reabierto; si no, `new` / `in_progress`. La API y la UI usan las mismas seis claves.
Grupos de la lista: `waiting`, `open` (nuevo, en atencion, reabierto), `resolved`, `closed`.

## Componentes (support-ui)

`SupportStatusBadge` (icono + texto + tooltip), `SupportEventCard`, `SupportTicketList`, `SupportTicketHeader` (volver y
selector), `SupportNewTicketForm` (aviso de ticket abierto), `SupportResolvedPrompt`, `SupportDuplicateNotice`,
`SupportActionBar`. El chat y el embed solo cambian en de donde vienen los datos.

## Chat de equipo y widget flotante

- El contacto «Soporte» declara `sub_threads: true`. Al abrirlo se ve la lista de tickets (`GET /internal-chat/channels/:id/threads`,
  paginada para finalizados); cada ticket es su propio canal (`thread_id`) para mensajes, envio y lectura.
- Los mensajes en vivo llegan por el canal del contacto con `thread_id` y `ticket`: se senala el ticket correcto en la lista y la fila
  «Soporte» suma no leidos.
- «Nuevo ticket» (`POST .../messages {body, new_thread:true}`) siempre abre uno aparte; si hay uno abierto se avisa con su folio.
- Eventos: adjunto `support_case` con `event` (`opened|resolved|reopened|closed`), `state` actual, `at` y `actions`
  (`view` con href; `reopen` / `finalize` con `request` declarado por el servidor). Se pintan como tarjetas de sistema; solo la mas reciente
  conserva Reabrir / Finalizar.
- Sin `sub_threads` ni `event` el chat se ve como siempre (hilo unico, tarjeta simple).

## Embed

Al abrir: lista de tickets del visitante (estado, ultimo mensaje, no leido por ticket) y «Nuevo ticket» siempre visible; sin tickets va
directo al formulario. En el hilo: encabezado con folio, asunto, estado y su explicacion, volver y cambiar de ticket; al resolverse,
«¿Se resolvio?» con Reabrir (solo con `embed_policy.reopen`) y Abrir otro. Finalizar solo aparece si el transporte tiene `close`.
No leidos del embed: el Hub no manda ultimo autor ni no leidos en la lista; el embed consulta el ultimo mensaje de los
10 tickets abiertos mas recientes y compara con la ultima visita guardada en `localStorage` (por canal).

## Seguimiento (Hub, no incluido)

- Ultimo autor, ultimo mensaje y no leidos en `GET /v1/support/embed/cases`, y `POST /cases/:id/close` (Finalizar) en el widget.
- Estado «Reabierto» en la vista de caso del Hub (hoy solo open/resolved).
