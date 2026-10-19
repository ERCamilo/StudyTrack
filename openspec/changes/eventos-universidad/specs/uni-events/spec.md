# uni-events Specification

## Purpose

Mostrar en StudyTrack las entregas del calendario de la universidad, asociadas a cada materia.

## Requirements

### Requirement: Leer el calendario
El sistema MUST leer un archivo iCalendar de Moodle y obtener de cada evento su identificador, título, fecha
de vencimiento y curso.

#### Scenario: Calendario válido
- GIVEN un texto iCalendar con eventos de Moodle
- WHEN la app lo lee
- THEN SHALL obtener un evento por cada VEVENT, con la fecha en UTC
- AND las líneas partidas y los caracteres escapados (`\,` `\;` `\n`) SHALL leerse correctamente

#### Scenario: Respuesta que no es un calendario
- GIVEN una respuesta que no empieza con `BEGIN:VCALENDAR` (por ejemplo, una página de login)
- WHEN la app intenta leerla
- THEN MUST avisar que no es un calendario
- AND MUST conservar los eventos importados antes

### Requirement: Asociar a la materia
El sistema MUST asociar cada evento a la materia del pensum cuyo código coincide con el curso del evento,
ignorando guiones y mayúsculas.

#### Scenario: Curso sin materia en el pensum
- GIVEN un evento cuyo curso no está en el pensum
- THEN el evento SHALL mostrarse igual, sin materia asociada

### Requirement: Vencidas
Una entrega vencida MUST mostrarse marcada como vencida durante 7 días después de su fecha, y ocultarse después.

### Requirement: Actualizar reemplaza
Al actualizar, los eventos importados MUST reemplazarse por los del calendario descargado.

### Requirement: Enlace privado
El enlace del calendario MUST guardarse solo en el dispositivo y MUST NOT incluirse en la sincronización.
