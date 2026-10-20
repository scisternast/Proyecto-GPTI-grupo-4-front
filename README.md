# StockSmart — frontend

Frontend web de StockSmart (React + TypeScript + Vite). El backend está en
[`Proyecto-GPTI-grupo-4-back`](https://github.com/Rvillena75/Proyecto-GPTI-grupo-4-back) y su contrato OpenAPI es la fuente oficial
de la API (`/docs` y `/openapi.json` del backend).

## Requisitos

- Node 24.x y npm (la versión también está fijada en `package.json` para Vercel).

## Primeros pasos

```bash
npm ci
npm run dev:mock   # sin backend: datos simulados en memoria (MSW)
npm run dev        # contra el backend real
```

La app queda en `http://localhost:5173`.

Para usar Render en desarrollo, copia `.env.example` a `.env.local` y ejecuta `npm run dev`.
Para un backend local, cambia `VITE_API_URL` a su dirección (por ejemplo, `http://127.0.0.1:8000`).
Reinicia Vite después de cambiar las variables. El backend debe permitir el origen `http://localhost:5173`.

El modo simulado requiere `npm run dev:mock`. Tiene dos cuentas públicas de demostración:
`admin@stocksmart.test` (ADMIN) y `bodega@stocksmart.test` (WAREHOUSE), ambas con contraseña
`stocksmart-demo`. Son exclusivas de MSW y no permiten entrar al backend de Render.

## Acceso y permisos

La pantalla `/login` envía correo y contraseña a `POST /auth/login`. Después valida la cuenta con
`GET /auth/me` y agrega `Authorization: Bearer …` a las solicitudes protegidas. El token y su
caducidad se conservan en `sessionStorage` de la pestaña; la contraseña no se persiste.
Al vencer la sesión o recibir un 401, vuelve al acceso. Cerrar sesión cancela consultas y limpia
la caché para que otra cuenta no vea datos de la anterior. No hay renovación automática ni registro público.

- ADMIN puede crear insumos y configurar stock seguro, además de operar inventario.
- WAREHOUSE consulta inventario y registra movimientos/conteos; no ve los controles de configuración.
- El backend confirma los permisos en cada operación. Un 403 muestra el error sin cerrar la sesión.
- Login bloqueado por intentos (429) muestra el tiempo de espera; los errores 409 conservan su mensaje de negocio.

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` / `npm run dev:mock` | Servidor de desarrollo, contra el backend real o simulado. |
| `npm run build` | Revisa tipos y genera `dist/`. |
| `npm test` | Tests (Vitest) del cliente de la API contra el backend simulado. |
| `npm run lint` | Linter (oxlint). |
| `npm run api:pull` | Descarga `openapi.json` del backend en ejecución y regenera los tipos. |
| `npm run api:types` | Regenera `src/api/schema.d.ts` desde `openapi/openapi.json`. |

**Cuando el backend cambie el contrato**, ejecuta `npm run api:pull` y luego `npm run build`: TypeScript marca
cada lugar que haya que ajustar. No edites `src/api/schema.d.ts` a mano.

## Estructura

```
openapi/openapi.json     Copia del contrato del backend (se versiona para compilar sin backend)
src/api/
  schema.d.ts            Tipos generados desde OpenAPI
  types.ts               Alias legibles (ItemState, Movement, …)
  client.ts              Cliente tipado (openapi-fetch), token Bearer y unwrap()
  errors.ts              ApiError y traducción al español por `code`
  queries.ts             Hooks de TanStack Query (lecturas y escrituras)
src/mocks/handlers.ts    Backend simulado para `dev:mock` y tests
src/lib/                 Formato de cantidades/fechas (hora de Chile) y textos de los enums
src/pages/               Pantallas
src/components/          Layout y componentes compartidos
src/auth/                Sesión de la pestaña, cuenta actual y protección de rutas
```

## Convenciones del contrato

- **Los decimales llegan como texto** (`"25.000000"`). Se envían también como texto y solo se convierten con
  `formatQuantity()` para mostrarlos.
- **Las fechas pueden venir en UTC**: se muestran siempre con `formatDateTime()` en `America/Santiago`.
- **Los errores** tienen la forma `{"error": {"code", "message", "details"}}`. `unwrap()` lanza `ApiError` con el
  mensaje en español según `code` (`src/api/errors.ts`). Si el backend agrega un código, súmalo ahí.
- **No recalcules reglas de negocio** (alerta, cantidad sugerida, proyección): muestra lo que entrega `assessment`.

## Alcance de esta integración

El contrato versionado se actualizó desde Render. El panel usa `GET /items` tipado; el historial
muestra el saldo y autor devueltos por el backend. Insumos, stock seguro, movimientos, reversas,
conteos, merma y alertas consumen las rutas actuales. Se admite el estado `IN_TRANSIT`.

Las pantallas de proveedores, precios, sugerencias, decisiones, órdenes y métricas todavía no
forman parte de este frontend, aunque sus endpoints ya existen en el backend.

## Despliegue (Vercel)

El repositorio contiene `.env.production` con la URL pública de Render y la simulación desactivada.
El build normal no inicia MSW. `vercel.json` fija instalación, compilación, salida y rutas SPA.

1. Incorpora estos cambios a la rama que Vercel despliega como Production (habitualmente `main`).
2. En el proyecto de Vercel, revisa:

   | Campo | Valor |
   |---|---|
   | Framework Preset | Vite |
   | Root Directory | Raíz de este repositorio (vacío o `.`) |
   | Install Command | `npm ci` |
   | Build Command | `npm run build` |
   | Output Directory | `dist` |
   | Node.js | 24.x |

3. En **Settings → Environment Variables**, configura estos valores si ya existen variables
   del despliegue anterior (las variables de Vercel prevalecen sobre `.env.production`):

   ```dotenv
   VITE_API_URL=https://proyecto-gpti-grupo-4-back.onrender.com
   VITE_USE_MOCKS=false
   ```

   Son valores públicos del frontend. La URL de PostgreSQL y el secreto de firma JWT permanecen en Render.
4. En el backend, `STOCKSMART_CORS_ORIGINS` debe incluir los orígenes exactos, sin `/` final:

   ```text
   https://stocksmart-nine.vercel.app,http://localhost:5173
   ```

   Si pruebas un dominio Preview diferente, agrega también ese origen exacto al backend.
5. Ejecuta **Redeploy** después de cambiar variables: Vite las incorpora al compilar.
6. Abre `https://stocksmart-nine.vercel.app/login` e ingresa con una cuenta existente del backend.
   Debe desaparecer la etiqueta de datos simulados y verse el inventario de Render.
   Recarga una ruta interna para comprobar la redirección SPA.

Antes de publicar, ejecuta `npm test`, `npm run lint` y `npm run build`.
Las pruebas automatizadas usan MSW; la comprobación del despliegue real se realiza después de publicar en Vercel.

Referencias de configuración: [Vite en Vercel](https://vercel.com/docs/frameworks/frontend/vite),
[Node.js en Vercel](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions) y
[variables y modos de Vite](https://vite.dev/guide/env-and-mode).
