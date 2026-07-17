# MiRuta


MiRuta, anteriormente **StudyTrack Pro**, es una aplicación académica para consultar el plan de estudios, seguir materias y créditos, validar prerrequisitos, registrar notas y organizar el horario universitario. La solución se distribuye como una **aplicación web progresiva (PWA)**, funciona en navegadores móviles y de escritorio y combina persistencia local con sincronización opcional mediante Firebase.

**Aplicación publicada:** [https://studytrack.erlin.do](https://studytrack.erlin.do)



## Evidencia principal

> 🖼️ **ESPACIO PARA LA IMAGEN DE PORTADA O TRANSICIÓN DE MARCA**
<img width="940" height="530" alt="image" src="https://github.com/user-attachments/assets/47460400-d7ca-47ac-8e31-9d23169ab95b" />




> 🎬 **VIDEO DE DEMOSTRACIÓN**

https://youtu.be/mExP81mml4Q

---



## Información académica

| Campo | Información |
|---|---|
| Asignatura | Programación de Dispositivos Móviles — ISW-307 |
| Facilitador | Joan Manuel Gregorio Pérez |
| Período | 2026-32 |
| NRC | 1185 |
| Proyecto | MiRuta — Sistema de seguimiento y planificación académica |
| Tipo de entrega | Proyecto práctico final |
| Modalidad de ejecución | Navegador móvil o de escritorio mediante HTTPS |
| URL | [studytrack.erlin.do](https://studytrack.erlin.do) |

## Problema y solución

Los planes de estudio universitarios suelen presentarse como documentos o tablas que no responden con claridad preguntas cotidianas del estudiante: ¿qué materias puedo inscribir?, ¿cuáles están bloqueadas?, ¿cuántos créditos he completado? o ¿existe un choque en mi horario?

MiRuta convierte el pensum en una ruta académica interactiva. La aplicación interpreta materias, créditos y prerrequisitos; presenta el progreso del estudiante; recomienda próximos pasos; y conserva la información en el dispositivo y, cuando el usuario inicia sesión, en Firebase.

## Objetivos

### Objetivo general

Desarrollar una aplicación móvil basada en tecnologías web progresivas que permita al estudiante consultar su plan de estudios, registrar su avance y organizar su trayectoria académica con persistencia local y respaldo remoto.

### Objetivos específicos

- Representar materias, créditos, períodos y prerrequisitos mediante catálogos JSON.
- Calcular progreso, asignaturas disponibles, bloqueos y recomendaciones.
- Registrar materias cursadas, inscritas, calificaciones y horario semanal.
- Mantener la información disponible localmente aun cuando la conexión sea limitada.
- Sincronizar el estado académico mediante Firebase Authentication y Cloud Firestore.
- Ofrecer una interfaz responsive y accesible en móvil y escritorio.
- Verificar la lógica académica, PWA, Firebase, NFC y QR mediante pruebas automatizadas.

## Alcance funcional

### Funcionalidades implementadas

- Selección de universidad y carrera.
- Tablero de progreso académico.
- Consulta, búsqueda y filtrado de materias.
- Evaluación de prerrequisitos y materias disponibles.
- Registro de asignaturas cursadas, inscritas y calificaciones.
- Organización del horario y detección de solapamientos.
- Perfil, meta académica e hitos.
- Persistencia mediante `localStorage`.
- PWA con manifest, iconos, caché y service worker.
- Inicio de sesión y sincronización con Firebase.
- Intercambio de carné académico mediante NFC y códigos QR.
- Funcionamiento responsive en dispositivos móviles y escritorio.

### Correspondencia con las unidades del curso

| Unidad o tema | Implementación en MiRuta | Estado |
|---|---|---:|
| Navegación | Vistas Inicio, Materias, Horario, Perfil y Más | ✅ |
| Interfaces | Tarjetas, formularios, filtros, estados y diseño responsive | ✅ |
| Conectividad | Detección `online/offline` y sincronización diferida | ✅ |
| Bluetooth/NFC | Web NFC para compartir o leer el carné académico | ✅ Según compatibilidad |
| Geolocalización | No incluida en la versión actual | ⏳ Futuro |
| Multimedia | No incluida en la versión actual | ⏳ Futuro |
| Cámara/QR | Generación e importación de información mediante QR | ✅ Según permisos |
| Almacenamiento | `localStorage`, Cache API y persistencia de Firestore | ✅ |
| Servicios web | Firebase Authentication, Firestore y carga de catálogos | ✅ |


## Tecnologías

| Tecnología | Uso |
|---|---|
| HTML5 | Estructura semántica y vistas de la aplicación |
| Tailwind CSS | Diseño responsive y sistema visual |
| JavaScript | Navegación, estado, reglas académicas y renderizado |
| PWA / Service Worker | Instalación, caché y funcionamiento resiliente |
| Local Storage | Persistencia inmediata en el dispositivo |
| Firebase Authentication | Identidad y sesión del usuario |
| Cloud Firestore | Respaldo y sincronización remota |
| JSON | Catálogos académicos por universidad y carrera |
| Web NFC | Lectura y escritura de datos compatibles con NFC |
| QRCode + jsQR | Generación y lectura de códigos QR |
| GitHub Pages | Despliegue estático mediante HTTPS |

## Arquitectura

La aplicación utiliza una arquitectura modular con prioridad local:

1. El usuario interactúa con la interfaz PWA.
2. Los módulos JavaScript procesan progreso, notas, requisitos y horario.
3. Los catálogos JSON aportan la estructura de cada carrera.
4. Los cambios se guardan primero en el dispositivo.
5. Firebase sincroniza el estado cuando existe sesión y conectividad.
6. GitHub Pages publica los archivos estáticos bajo HTTPS.

> 🖼️ **DIAGRAMA DE ARQUITECTURA**


<img width="851" height="544" alt="image" src="https://github.com/user-attachments/assets/cab21210-6f45-4cd8-9cb1-8e109ac55d48" />


### Estructura principal del repositorio

```text
StudyTrack/
├── index.html                 # Aplicación principal
├── manifest.json              # Configuración PWA
├── sw.js                      # Service worker y caché
├── dist/tailwind.css          # Estilos compilados
├── src/
│   ├── app.js                 # Estado, navegación y renderizado
│   ├── academics.js           # Reglas académicas
│   ├── progress.js            # Cálculo del progreso
│   ├── prerequisites.js       # Evaluación de prerrequisitos
│   ├── grades.js              # Calificaciones
│   ├── schedule.js            # Horario y solapamientos
│   ├── storage.js             # Persistencia local
│   ├── firebase-sync.js       # Autenticación y sincronización
│   ├── nfc.js                 # Intercambio por NFC
│   └── qr-share.js            # Generación e importación por QR
├── library/                   # Catálogos de universidades y carreras
├── icons/                     # Iconos PWA
├── tests/                     # Pruebas automatizadas
├── CNAME                      # Dominio personalizado
└── README.md
```

## Módulos

### 1. Navegación y tablero

Presenta un resumen del avance, materias faltantes, asignaturas disponibles, recomendaciones y próximo paso. La navegación inferior conecta las vistas principales sin recargar la aplicación completa.

### 2. Materias, progreso y prerrequisitos

Interpreta el catálogo académico para determinar si una materia está cursada, inscrita, disponible o bloqueada. También calcula créditos, porcentaje de avance y cadenas de prerrequisitos.

### 3. Horario

Permite asociar día y hora a las materias inscritas. La lógica compara intervalos para detectar solapamientos y muestra las asignaturas pendientes de horario.

### 4. Persistencia y PWA

Guarda los cambios localmente y conserva el shell de la aplicación en Cache API. Las navegaciones utilizan una estrategia *network-first* con una copia local como respaldo.

### 5. Firebase

Gestiona autenticación, sincronización y resolución controlada de cambios locales o remotos. El estado de sincronización se separa por usuario para evitar cruces entre cuentas.

### 6. NFC, QR y perfil

Serializa un carné académico compacto para NFC, genera enlaces mediante QR y permite importar datos validados. El perfil muestra identidad, carrera, meta, resumen e hitos.

## Capturas y evidencias

Guarde las imágenes en `docs/evidencias/` y reemplace cada bloque por la sintaxis Markdown indicada.

### Pantalla de bienvenida

> 🖼️ **CAPTURA: selección de universidad y carrera**


<img width="383" height="854" alt="image" src="https://github.com/user-attachments/assets/9f527128-b23f-4862-a07d-eb3f5d5eb15d" />


### Tablero principal

> 🖼️ **CAPTURA: progreso, próximo paso y recomendaciones**


<img width="387" height="852" alt="image" src="https://github.com/user-attachments/assets/822301a8-5b94-4212-827c-76f5ce064a1c" />

<img width="388" height="851" alt="image" src="https://github.com/user-attachments/assets/559d33d2-0c1a-48b8-9a11-16a27004e800" />

### Materias y prerrequisitos

> 🖼️ **CAPTURA: filtros, disponibilidad y bloqueos**
<img width="383" height="856" alt="image" src="https://github.com/user-attachments/assets/1bd5053b-bcb9-43a8-9e4b-386c3fcc20ef" />


<img width="383" height="863" alt="image" src="https://github.com/user-attachments/assets/1f5f8139-1821-498e-938b-d73d3cebe97a" />

### Horario

> 🖼️ **CAPTURA: asignaturas inscritas y horario semanal**

<img width="388" height="858" alt="image" src="https://github.com/user-attachments/assets/0f9a41e6-5f21-4d15-b45a-03d31e49408f" />

<img width="387" height="851" alt="image" src="https://github.com/user-attachments/assets/b3333816-963a-487d-9df0-8b6c63d05748" />
<img width="393" height="865" alt="image" src="https://github.com/user-attachments/assets/c8bdc14d-99f1-4f3f-973f-a133cf68d690" />
<img width="396" height="857" alt="image" src="https://github.com/user-attachments/assets/2e88bd4b-b4ee-4a06-988b-ebde89e426ce" />




## Persistencia y Firebase

MiRuta utiliza tres mecanismos complementarios:

- **`localStorage`:** conserva inmediatamente el estado del estudiante.
- **Cache API + service worker:** mantiene disponibles los recursos esenciales de la PWA.
- **Cloud Firestore:** respalda y sincroniza los datos asociados al usuario autenticado.

Firebase cumple la función de **servicio externo** y de **persistencia remota**. El uso básico de la aplicación no depende obligatoriamente de iniciar sesión.

## Instalación y ejecución

### Opción 1: versión publicada

Abra la aplicación directamente:

```text
https://studytrack.erlin.do
```

### Opción 2: ejecución local

Clone el repositorio y abra la carpeta del proyecto:

```bash
git clone URL_DEL_REPOSITORIO
cd StudyTrack
```

Inicie un servidor HTTP local:

```bash
python -m http.server 8080 --bind 127.0.0.1
```

Luego visite:

```text
http://127.0.0.1:8080/index.html
```

> Abrir `index.html` mediante `file://` permite una revisión básica, pero el service worker y varias capacidades web requieren `localhost` o HTTPS.

### Reconstruir los estilos

El CSS compilado se encuentra en `dist/tailwind.css`.

```bash
npx tailwindcss@3 -i src/tailwind-input.css -o dist/tailwind.css --minify
```

Modo de desarrollo:

```bash
npx tailwindcss@3 -i src/tailwind-input.css -o dist/tailwind.css --watch
```

## Pruebas

Ejecute las cinco suites incluidas:

```bash
node tests/smoke.mjs
node tests/logic.mjs
node tests/firebase-sync.mjs
node tests/nfc.mjs
node tests/qr-share.mjs
```



## Despliegue

El proyecto se publica como sitio estático mediante HTTPS. El archivo `CNAME` define el dominio:

```text
studytrack.erlin.do
```

Antes de publicar una nueva versión:

1. Ejecutar todas las pruebas.
2. Revisar la aplicación mediante `localhost`.
3. Confirmar que no existen errores en la consola.
4. Verificar las vistas principales en móvil y escritorio.
5. Comprobar manifest, service worker y funcionamiento sin conexión.
6. Publicar únicamente la versión validada.

## Limitaciones

- La aplicación es una PWA y no un proyecto Ionic/Angular/Capacitor.
- No incluye geolocalización ni mapa interactivo en la versión actual.
- No incorpora reproducción de audio o video dentro de la aplicación.
- Web NFC depende del navegador, HTTPS y hardware compatible.
- Los datos ingresados son personales y no sustituyen el sistema oficial de la universidad.
- Los catálogos deben actualizarse cuando una institución modifica su pensum.

## Equipo

| Integrante | Matrícula | Módulo o responsabilidad |
|---|---|---|
| Erlin R. Camilo Rodriguez | 100018052 | Arquitectura, lógica académica, PWA y Firebase |


> Si el proyecto es individual, elimine las filas vacías antes de entregar.

## Guion breve para el video

1. Presentar el problema y la evolución de StudyTrack Pro a MiRuta.
2. Abrir [studytrack.erlin.do](https://studytrack.erlin.do).
3. Seleccionar universidad y carrera.
4. Explicar el tablero, progreso y recomendaciones.
5. Mostrar materias, filtros y prerrequisitos.
6. Registrar una materia y demostrar el horario.
7. Abrir el perfil y mostrar los hitos.
8. Explicar persistencia local y sincronización con Firebase.
9. Mostrar NFC o QR si el dispositivo es compatible.
10. Cerrar con resultados, limitaciones y trabajo futuro.


## Licencia y uso académico

Proyecto desarrollado con fines educativos para la asignatura Programación de Dispositivos Móviles. Los catálogos y datos mostrados deben validarse contra las fuentes oficiales de cada institución antes de utilizarlos para decisiones académicas.
