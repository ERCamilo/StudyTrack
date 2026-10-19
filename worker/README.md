# Intermediario del calendario de la universidad (Cloudflare Worker)

StudyTrack intenta descargar el calendario de Moodle directamente. Si el navegador lo bloquea (CORS), usa este
intermediario. Solo acepta pedidos desde StudyTrack y solo descarga enlaces
`https://eva.uapa.edu.do/calendar/export_execute.php…`. No guarda nada ni registra el enlace, que contiene un
token secreto.

## Desplegarlo (plan gratuito de Cloudflare, sin tarjeta)

1. Crea una cuenta en https://dash.cloudflare.com si no tienes.
2. En esta carpeta: `npx wrangler login` y luego `npx wrangler deploy`.
3. Wrangler muestra la dirección, por ejemplo `https://studytrack-ics-proxy.<tu-subdominio>.workers.dev`.
   Esa es la `proxyUrl` que usa la app.

Sin terminal: en el panel de Cloudflare → Workers & Pages → Create → Worker, pega `ics-proxy.js` y agrega las
variables `ALLOWED_ORIGINS` y `ALLOWED_HOSTS` de `wrangler.toml`.

## Otra universidad u otro dominio

Agrega el dominio a `ALLOWED_HOSTS` (o el origen a `ALLOWED_ORIGINS`), separados por comas, y vuelve a desplegar.

## Pruebas

`node tests/uni-events-worker.mjs` desde la raíz del repo.
