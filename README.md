# Valoración ciudadana

Aplicación React creada con Vite. Vite genera `dist`; un único Cloudflare Worker sirve esos assets, atiende `/api/*` y guarda las valoraciones directamente en D1 mediante SQL preparado.

## Requisitos e instalación

- Node.js 20 o posterior y una cuenta de Cloudflare.
- Instala las dependencias con `npm install` y autentica Wrangler con `npx wrangler login`.

## Control global de duplicados y privacidad

El Worker obtiene la cabecera `CF-Connecting-IP` únicamente durante el envío y calcula un código mediante **HMAC-SHA-256** con el secreto `IP_HASH_SECRET`. La dirección IP original no se escribe en D1 ni se incluye en respuestas, paneles o exportaciones. Es importante conservar el mismo secreto durante todo el programa: cambiarlo permitiría que una dirección ya utilizada volviera a participar.

Los códigos se guardan, con una restricción única, en `rating_ip_hashes`; las respuestas se guardan por separado en `ratings`, que no contiene el código ni una referencia a él. Por ello no es posible vincular posteriormente cada código con su valoración. La unicidad se comprueba globalmente: una dirección solo puede responder una vez en total, aunque use el enlace de otra oficina.

El programa termina en el instante documentado en el Worker: **`2027-04-01T00:00:00+01:00`** (fin del 31 de marzo en la zona indicada). Desde ese momento la API rechaza nuevos envíos y elimina todos los registros de `rating_ip_hashes`, sin borrar ninguna fila de `ratings`. Su plazo de conservación se decidirá por separado.

## Configurar D1 y el secreto

1. Crea la única base de datos: `npx wrangler d1 create valoracion-ciudadana`.
2. Copia el `database_id` devuelto en `wrangler.jsonc`, sustituyendo el UUID de ceros.
3. Antes de cualquier migración remota, crea y descarga una copia de seguridad de D1. Revisa después el número de filas y aplica las migraciones primero sobre una copia/local.
4. Aplica el esquema remoto únicamente en una ventana autorizada: `npx wrangler d1 migrations apply valoracion-ciudadana --remote`.
5. Crea una clave HMAC larga y aleatoria: `npx wrangler secret put IP_HASH_SECRET`. Nunca la incluyas en Git.

Para desarrollo local, aplica la migración con `npx wrangler d1 migrations apply valoracion-ciudadana --local` y crea `.dev.vars` con `IP_HASH_SECRET="una-clave-local-larga-y-aleatoria"`.

## Desarrollo y despliegue

- `npm run dev` compila Vite y arranca el Worker local, que sirve frontend y API juntos.
- `npm run build` comprueba TypeScript y genera `dist`.
- `npm run check` comprueba TypeScript y que Wrangler pueda empaquetar el Worker.
- `npx wrangler deploy` realiza el único despliegue, después de configurar D1 y el secreto.

`wrangler.jsonc` configura el disparador Cron `0 2 * * *` (diario a las 02:00 UTC). El manejador `scheduled` comprueba la fecha final y, una vez alcanzada, ejecuta un `DELETE` idempotente sobre la tabla de códigos. La ruta de envío aplica la misma comprobación, por lo que el cierre no depende del retraso del Cron. Al habilitar un entorno nuevo, comprueba en Cloudflare que el trigger aparece asociado al Worker.

No es necesario configurar Pages, Sites ni otro Worker. Las migraciones versionadas están en `migrations/`.

## Oficinas y QR

Cada QR debe apuntar al mismo dominio añadiendo un identificador en minúsculas, números y guiones, de hasta 64 caracteres, por ejemplo `https://tu-dominio.example/?office=sce-arenales`. Sin un parámetro válido, el formulario queda bloqueado.

## Estructura

- `src/`: interfaz React responsive.
- `worker/index.ts`: API mínima y entrega de assets.
- `migrations/`: esquema SQL de D1.
- `wrangler.jsonc`: un Worker, assets de `dist` y un binding D1.
