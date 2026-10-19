# StudyTrack: instrucciones para agentes de IA

## Reglas de negocio = tests con ejemplos

Una **regla de negocio** es cualquier decisión sobre cómo debe comportarse la app: cuándo se aprueba una
materia, cómo se calcula un promedio, qué bloquea un prerrequisito, cómo se interpreta una nota, etc.

1. **Cuando se acuerde una regla de negocio nueva o cambie una existente,** agrégala como test en
   `tests/logic.mjs`, con ejemplos concretos y este comentario encima:
   ```js
   // Regla de negocio: <la regla en palabras simples>
   ```
   Incluye siempre un ejemplo **justo en el límite** (si la regla dice "70 o más", un ejemplo con 70) y los
   casos vacíos o nulos que apliquen.
2. **Antes de cambiar lógica, busca las reglas que la cubren:** `grep -n "Regla de negocio" tests/logic.mjs`.
3. **Si un cambio que te pidieron rompe un test marcado como regla de negocio, no ajustes el test.** Detente,
   explica qué regla contradice el pedido y pregunta si la regla cambió. Solo después de una confirmación
   explícita se actualizan juntos el test y el código.
4. Al terminar cualquier cambio, corre `node tests/logic.mjs` y `node tests/smoke.mjs`.

Los cambios grandes siguen el flujo de `openspec/`.

## Convenciones del repo

- El repo mezcla saltos de línea: algunos archivos usan CRLF y otros LF. Conserva los que ya tiene cada archivo.
- Al cambiar archivos que cachea el service worker, sube la versión del caché en `sw.js`.
- Cada cambio visible para el usuario sube la versión: agrega una entrada arriba en `CHANGELOG` de `src/app-version.js`, pon el mismo número en `APP_VERSION` y sube `CACHE_NAME` en `sw.js`. La app muestra esa entrada en el modal «Novedades» al actualizar.
