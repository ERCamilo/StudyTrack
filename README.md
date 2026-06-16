# StudyTrack Pro

StudyTrack Pro es una app academica estatica para seguir materias, progreso, notas, requisitos y horario.

## Ejecutar localmente

Desde la carpeta del proyecto:

```bash
python -m http.server 8080 --bind 127.0.0.1
```

Luego abrir:

```text
http://127.0.0.1:8080/index.html
```

Abrir el archivo con `file://` funciona para uso basico, pero las pruebas PWA y service worker requieren `http://localhost` o HTTPS.

## Estilos (Tailwind)

Los estilos usan **Tailwind compilado localmente** (no el Play CDN). El CSS final vive en `dist/tailwind.css` y se enlaza desde `index.html`.

Para reconstruirlo tras cambiar clases en el HTML o en `src/*.js`:

```bash
# Binario standalone (no requiere Node):
./tailwindcss.exe -i src/tailwind-input.css -o dist/tailwind.css --minify

# o, si tenés Node:
npx tailwindcss@3 -i src/tailwind-input.css -o dist/tailwind.css --minify
```

Durante el desarrollo conviene dejarlo observando cambios:

```bash
./tailwindcss.exe -i src/tailwind-input.css -o dist/tailwind.css --watch
```

Notas:
- La configuración (colores `primary`, fuente Inter, dark mode por clase, safelist de colores de notas) está en `tailwind.config.js`.
- `dist/tailwind.css` SÍ se versiona (el deploy estático lo necesita). El binario `tailwindcss.exe` NO (cada quien lo descarga).
- Si agregás clases que se construyen dinámicamente en JS desde datos guardados, sumalas al `safelist` para que la purga no las elimine.

## Pruebas

```bash
node tests/smoke.mjs
node tests/logic.mjs
node tests/firebase-sync.mjs
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
2. Probar localmente por `http://127.0.0.1:8080/index.html`.
3. Confirmar que no hay errores de consola.
4. Confirmar visualmente las vistas principales en movil y desktop.
5. Publicar solo despues de confirmacion explicita.
