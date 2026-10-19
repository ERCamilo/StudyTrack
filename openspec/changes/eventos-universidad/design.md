# Design: Eventos de la universidad

## Technical Approach

Un módulo puro `src/uni-events.js` (`StudyTrackUniEvents`) con las reglas de negocio, probado en
`tests/logic.mjs`. Un módulo de descarga que intenta `fetch` directo y, si falla por red/CORS, usa el Worker.
El enlace y los eventos importados se guardan en `localStorage` con claves que la sincronización no incluye.

## Architecture Decisions

| Area | Decision | Rationale / Tradeoff |
|------|----------|----------------------|
| Origen | Enlace guardado + botón Actualizar | Pedido del usuario. Requiere resolver CORS. |
| CORS | Directo primero; respaldo Cloudflare Worker | Gratis y sin tarjeta. El enlace pasa por el Worker, que no guarda nada. |
| Privacidad | Enlace solo en el dispositivo | Es una credencial de lectura del calendario. |
| Asociación | Código del curso en CATEGORIES (`AAAAPP-ISW201-…`) contra `subject.code`/`subject.id` sin guiones | Coincide con el pensum de la UAPA (`ISW-201`). |
| Fechas | Se guardan en UTC; el día del calendario se calcula en la zona horaria del dispositivo | Moodle exporta en UTC (`T035900Z` = 11:59 p. m. del día anterior en RD). |
| Título | Se quita el prefijo "Vencimiento de " | Más legible; el resto se conserva tal cual. |

## Data Shape

```js
{ uid: 'string', title: 'string', dueAt: '2026-10-16T03:59:00.000Z', allDay: false,
  courseCode: 'ISW201' | null, subjectId: 'ISW-201' | null }
```
