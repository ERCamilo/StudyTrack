# StudyTrack Pro

StudyTrack Pro es una app academica estatica para seguir materias, progreso, notas, requisitos y horario.

## Ejecutar localmente

Desde la carpeta del proyecto:

```bash
python -m http.server 4173 --bind 127.0.0.1
```

Luego abrir:

```text
http://127.0.0.1:4173/index.html
```

Abrir el archivo con `file://` funciona para uso basico, pero las pruebas PWA y service worker requieren `http://localhost` o HTTPS.

## Pruebas

```bash
node tests/smoke.mjs
node tests/logic.mjs
```

Las pruebas cubren:

- Sintaxis de scripts y modulos.
- Manifest PWA e iconos.
- Service worker y cache del shell.
- Logica academica, notas, prerrequisitos, requisitos y horario.
- Escapes de HTML en render dinamico.

## PWA

La app incluye:

- `manifest.json`
- `sw.js`
- Iconos SVG en `icons/`
- Registro de service worker solo en `http` o `https`

El service worker usa network-first para navegaciones, para evitar servir un `index.html` viejo despues de una actualizacion.

## Despliegue

El proyecto esta preparado para despliegue estatico. El archivo `CNAME` apunta a:

```text
studytrack.erlin.do
```

Antes de publicar:

1. Ejecutar las pruebas.
2. Probar localmente por `http://127.0.0.1:4173/index.html`.
3. Confirmar que no hay errores de consola.
4. Confirmar visualmente las vistas principales en movil y desktop.
5. Publicar solo despues de confirmacion explicita.
