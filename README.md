# Valoración ciudadana

Aplicación React creada con Vite. Vite genera `dist`; un único Cloudflare Worker sirve esos assets, atiende `/api/*` y guarda las valoraciones directamente en D1 mediante SQL preparado.

## Requisitos e instalación

- Node.js 20 o posterior y una cuenta de Cloudflare.
- Instala las dependencias con `npm install` y autentica Wrangler con `npx wrangler login`.

## Control global de duplicados y privacidad

El Worker obtiene la cabecera `CF-Connecting-IP` únicamente durante el envío y calcula un código mediante **HMAC-SHA-256** con el secreto `IP_HASH_SECRET`. La dirección IP original no se escribe en D1 ni se incluye en respuestas, paneles o exportaciones. Es importante conservar el mismo secreto durante todo el programa: cambiarlo permitiría que una dirección ya utilizada volviera a participar.

Los códigos se guardan, con una restricción única, en `rating_ip_hashes`, que no contiene fecha, ID de valoración, `rowid` implícito ni otros campos. Las respuestas se guardan por separado en `ratings`, que no contiene el código ni una referencia a él. La unicidad se comprueba globalmente: una dirección solo puede responder una vez en total, aunque use el enlace de otra oficina.

El programa termina en el instante documentado en el Worker: **`2027-04-01T00:00:00+01:00`** (fin del 31 de marzo en la zona indicada). Desde ese momento la API rechaza nuevos envíos y elimina todos los registros de `rating_ip_hashes`, sin borrar ninguna fila de `ratings`. Su plazo de conservación se decidirá por separado.

## Instalación nueva

1. Crea la base de datos: `npx wrangler d1 create valoracion-ciudadana`.
2. Configura en `wrangler.jsonc` el `database_id` devuelto.
3. Aplica todas las migraciones: `npx wrangler d1 migrations apply valoracion-ciudadana --remote`.
4. Genera una clave HMAC larga y aleatoria y guárdala con `npx wrangler secret put IP_HASH_SECRET`. Nunca la incluyas en Git.

Para desarrollo local, aplica la migración con `npx wrangler d1 migrations apply valoracion-ciudadana --local` y crea `.dev.vars` con `IP_HASH_SECRET="una-clave-local-larga-y-aleatoria"`.

## Desarrollo y despliegue

- `npm run dev` compila Vite y arranca el Worker local, que sirve frontend y API juntos.
- `npm run build` comprueba TypeScript y genera `dist`.
- `npm run check` comprueba TypeScript y que Wrangler pueda empaquetar el Worker.
- `npx wrangler deploy` realiza el único despliegue, después de configurar D1 y el secreto.

`wrangler.jsonc` configura el disparador Cron `0 2 * * *` (diario a las 02:00 UTC). El manejador `scheduled` comprueba la fecha final y, una vez alcanzada, ejecuta un `DELETE` idempotente sobre la tabla de códigos. La ruta de envío aplica la misma comprobación, por lo que el cierre no depende del retraso del Cron. Al habilitar un entorno nuevo, comprueba en Cloudflare que el trigger aparece asociado al Worker.

## Actualización segura de producción a la migración 0003

El Worker anterior requiere `ratings.ip_hash` y el nuevo requiere `rating_ip_hashes`; no son compatibles con el esquema de la otra versión. Por ello esta actualización necesita una ventana de mantenimiento. **No se debe recrear la base de datos ni cambiar, eliminar o regenerar `IP_HASH_SECRET`.** Los nombres exactos del proyecto conectado, la regla de seguridad y el flujo automático son configuración externa a este repositorio y deben confirmarse con la persona administradora de Cloudflare antes de comenzar.

1. En la configuración de Builds/Deployments del Worker en Cloudflare, pausa el despliegue automático asociado a `main`. Comprueba con un commit sin despliegue o con el indicador de estado de la integración que el merge no podrá publicar por sí solo.
2. Crea una regla temporal de Cloudflare WAF que bloquee específicamente `POST /api/ratings` en el dominio de producción con una respuesta de mantenimiento. No bloquees las consultas de resultados. Verifica desde fuera de una sesión administrativa que un POST de prueba es rechazado y confirma en los registros de D1 que el número de filas de `ratings` no aumenta. Si el plan no dispone de WAF, la persona administradora debe definir y probar antes de la ventana un mecanismo equivalente en el proxy o balanceador; no continúes sin un bloqueo comprobable.
3. Anota los recuentos previos con `npx wrangler d1 execute valoracion-ciudadana --remote --command "SELECT COUNT(*) AS ratings_before, COUNT(DISTINCT ip_hash) AS hashes_before FROM ratings"`.
4. Exporta una copia: `npx wrangler d1 export valoracion-ciudadana --remote --output valoracion-ciudadana-pre-0003.sql`. Comprueba que el comando terminó correctamente, que el archivo no está vacío (`test -s valoracion-ciudadana-pre-0003.sql`) y guarda su suma (`sha256sum valoracion-ciudadana-pre-0003.sql`). Conserva la copia fuera del equipo de despliegue.
5. Ensaya `0003` sobre una base local o de pruebas restaurada desde esa exportación. Verifica allí los recuentos, todas las columnas de `ratings`, que `rating_ip_hashes` solo tiene `ip_hash` y que `ratings` ya no tiene `ip_hash`.
6. Aplica en la ventana la migración remota: `npx wrangler d1 migrations apply valoracion-ciudadana --remote`. No reabras aún la recepción.
7. Verifica inmediatamente: `SELECT COUNT(*) FROM ratings` debe ser `ratings_before`; `SELECT COUNT(*) FROM rating_ip_hashes` debe ser `hashes_before`; `PRAGMA table_info('rating_ip_hashes')` debe mostrar solo `ip_hash`; `PRAGMA table_info('ratings')` no debe mostrar `ip_hash`; y `PRAGMA index_list('ratings')` debe incluir `ratings_office_created_idx`.
8. Despliega exactamente el artefacto revisado con `npx wrangler deploy`, sin tocar `IP_HASH_SECRET`. Confirma que el Worker y el Cron `0 2 * * *` están activos.
9. Mientras la regla temporal sigue bloqueando al público, permite únicamente una IP de prueba autorizada y comprueba: validación del enlace, primer envío aceptado, segundo envío rechazado incluso desde otra oficina, dashboard/CSV sin hashes y ausencia de IP original en D1. Retira después cualquier dato de prueba conforme al procedimiento operativo autorizado; no manipules datos reales ad hoc.
10. Quita la regla temporal y verifica con una petición controlada que vuelve a admitirse recepción. Finalmente reactiva el despliegue automático y confirma su estado.

### Recuperación durante la ventana

- Si `0003` falla y D1 informa que no la aplicó, verifica que continúan `ratings.ip_hash`, sus filas y su índice; conserva el Worker anterior y retira el bloqueo solo tras esa comprobación.
- Si la migración se aplicó pero falla el despliegue nuevo, mantén bloqueados los POST. La opción preferida es corregir o repetir el despliegue del artefacto nuevo ya probado. Para volver al Worker anterior hay que restaurar primero el esquema y los datos completos de la copia previa (o mediante la función de restauración temporal de D1 que esté habilitada en esa cuenta), comprobar los recuentos y `ratings.ip_hash`, y solo entonces volver a publicar el Worker anterior. No ejecutes el Worker anterior contra el esquema nuevo.
- Si no puede demostrarse un estado compatible y completo, mantén cerrada la recepción y escala a la persona administradora de Cloudflare. Como los POST permanecen suspendidos desde antes de la copia, una restauración a ese punto no debería perder nuevas valoraciones.

No es necesario configurar Pages, Sites ni otro Worker. Las migraciones versionadas están en `migrations/`.

## Oficinas y QR

Cada QR debe apuntar al mismo dominio añadiendo un identificador en minúsculas, números y guiones, de hasta 64 caracteres, por ejemplo `https://tu-dominio.example/?office=sce-arenales`. Sin un parámetro válido, el formulario queda bloqueado.

## Estructura

- `src/`: interfaz React responsive.
- `worker/index.ts`: API mínima y entrega de assets.
- `migrations/`: esquema SQL de D1.
- `wrangler.jsonc`: un Worker, assets de `dist` y un binding D1.
