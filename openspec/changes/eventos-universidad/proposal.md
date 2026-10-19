# Proposal: Eventos de la universidad

## Intent

Que StudyTrack muestre las entregas y eventos de la plataforma de la universidad (Moodle de la UAPA) junto a
cada materia, sin copiarlos a mano. Moodle exporta el calendario del estudiante como un enlace iCalendar (.ics).

## Scope

### In Scope
- El estudiante pega una vez su enlace de exportación del calendario; la app lo guarda **solo en el dispositivo**.
- Botón **Actualizar**: la app descarga el calendario y reemplaza los eventos importados.
- Descarga directa; si el navegador la bloquea (CORS), por un intermediario Cloudflare Worker gratuito que solo
  acepta dominios permitidos.
- Cada evento se asocia a su materia por el código del curso (`202633-ISW201-…` → `ISW-201`).
- Las entregas se ven en la tarjeta de su materia, en una lista de próximas entregas en el inicio y en una
  **vista de calendario** mensual dentro de la app.
- Las entregas vencidas se muestran marcadas como vencidas durante 7 días y después se ocultan.
- Se muestran todos los eventos del calendario, incluidos los de "solo uso del facilitador".

### Out of Scope
- Escribir en Moodle o marcar entregas como hechas en la plataforma.
- Sincronizar el enlace o los eventos con Firebase (el enlace es secreto).
- Actualización automática en segundo plano.
- Exportar al calendario del teléfono (Google Calendar ya puede suscribirse al mismo enlace).

## Capabilities

### New Capabilities
- `uni-events`: importar, asociar, filtrar y mostrar eventos del calendario de la universidad.

## Approach

PR 1 (este): reglas de negocio puras en `src/uni-events.js` con tests, descarga con respaldo, Worker y
almacenamiento local. PR 2: interfaz (ajustes, tarjetas, inicio, vista de calendario) siguiendo el diseño actual.

## Risks

| Riesgo | Mitigación |
|---|---|
| El enlace contiene un token secreto | Solo en el dispositivo; nunca se sincroniza (test). El Worker no guarda nada. |
| El Worker podría usarse como proxy abierto | Lista de dominios permitidos (`eva.uapa.edu.do`) y solo rutas `/calendar/export_execute.php`. |
| Moodle devuelve una página de login en vez del calendario | Se detecta (no empieza con `BEGIN:VCALENDAR`) y se avisa sin borrar los eventos anteriores. |
| El enlace exportado con `preset_time=custom` sin fechas trae solo días pasados | La app sugiere `preset_time=recentupcoming`. |
