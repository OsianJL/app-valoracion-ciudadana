# Valoración ciudadana

Aplicación React creada con Vite. Vite genera `dist`; un único Cloudflare Worker sirve esos assets, atiende `/api/*` y guarda las valoraciones directamente en D1 mediante SQL preparado.

## Requisitos e instalación

- Node.js 20 o posterior y una cuenta de Cloudflare.
- Instala las dependencias con `npm install` y autentica Wrangler con `npx wrangler login`.

## Configurar D1 y el secreto

1. Crea la única base de datos: `npx wrangler d1 create valoracion-ciudadana`.
2. Copia el `database_id` devuelto en `wrangler.jsonc`, sustituyendo el UUID de ceros.
3. Aplica el esquema remoto: `npx wrangler d1 migrations apply valoracion-ciudadana --remote`.
4. Crea una clave HMAC larga y aleatoria: `npx wrangler secret put IP_HASH_SECRET`. Nunca la incluyas en Git.

Para desarrollo local, aplica la migración con `npx wrangler d1 migrations apply valoracion-ciudadana --local` y crea `.dev.vars` con `IP_HASH_SECRET="una-clave-local-larga-y-aleatoria"`.

## Desarrollo y despliegue

- `npm run dev` compila Vite y arranca el Worker local, que sirve frontend y API juntos.
- `npm run build` comprueba TypeScript y genera `dist`.
- `npm run check` comprueba TypeScript y que Wrangler pueda empaquetar el Worker.
- `npx wrangler deploy` realiza el único despliegue, después de configurar D1 y el secreto.

No es necesario configurar Pages, Sites ni otro Worker. Las migraciones versionadas están en `migrations/`.

## Oficinas y QR

Cada QR debe apuntar al mismo dominio añadiendo un identificador en minúsculas, números y guiones, de hasta 64 caracteres, por ejemplo `https://tu-dominio.example/?office=sce-arenales`. Sin un parámetro válido, el formulario queda bloqueado.

## Estructura

- `src/`: interfaz React responsive.
- `worker/index.ts`: API mínima y entrega de assets.
- `migrations/`: esquema SQL de D1.
- `wrangler.jsonc`: un Worker, assets de `dist` y un binding D1.
