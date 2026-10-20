# StockSmart — frontend

Frontend web de StockSmart (React + TypeScript + Vite). Cómo funciona por dentro y cómo se conecta con el
backend, pantalla por pantalla: [docs/FRONTEND.md](docs/FRONTEND.md).

El backend está en
[`Proyecto-GPTI-grupo-4-back`](https://github.com/Rvillena75/Proyecto-GPTI-grupo-4-back) y su contrato OpenAPI es
la fuente oficial de la API (`/docs` y `/openapi.json` del backend).

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
Reinicia Vite después de cambiar las variables. El backend debe permitir el origen `http://localhost:5173`
(`STOCKSMART_CORS_ORIGINS`).

El modo simulado solo se activa con `npm run dev:mock` (`--mode mock` + `VITE_USE_MOCKS=true`); un build normal
nunca inicia MSW. Tiene dos usuarios de prueba, con contraseña `stocksmart-demo`, que no sirven para el backend real:

- `admin@negocio.cl` — Administrador(a): ve todas las pantallas y aprueba órdenes.
- `bodega@negocio.cl` — Encargado(a) de bodega: solo Movimientos y Conteo y merma.

Los datos simulados reproducen los mockups: pechuga de pollo asada (9 kg, 7 kg/semana, entrega máx. 4 días → «pide
hoy» 9 kg; Jumbo a $11.900/kg, ahorro $5.310) y **vuelven al estado inicial cada vez que se recarga la página**.

## Acceso y permisos

La pantalla `/login` envía correo y contraseña a `POST /auth/login`. Después valida la cuenta con
`GET /auth/me` y agrega `Authorization: Bearer …` a las solicitudes protegidas. El token y su
caducidad se conservan en `sessionStorage` de la pestaña (se pierden al cerrarla); la contraseña no se guarda.
Al vencer la sesión o recibir un 401, vuelve al acceso. Cerrar sesión limpia la caché para que otra cuenta no vea
datos de la anterior. No hay renovación automática ni registro público.

- **ADMIN** ve todas las pantallas: configura insumos, stock seguro y proveedores, y aprueba órdenes.
- **WAREHOUSE** solo ve Movimientos y Conteo y merma.
- El backend confirma los permisos en cada operación. Un 403 muestra el error sin cerrar la sesión.
- Un login bloqueado por intentos (429) muestra el tiempo de espera; los errores 409 conservan su mensaje de negocio.

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

## Pantallas

Todas conectadas con el backend real (rama `codex/deploy-render`, API v0.2.0).

| Ruta | Pantalla | Rol |
|---|---|---|
| `/login` | Iniciar sesión (JWT) | — |
| `/` | Panel de stock: alerta, indicadores, proyección, últimos movimientos | Admin |
| `/movimientos` | Registrar entrada/salida, historial con filtros y anulación | Ambos |
| `/conteos` | Conteo físico, conteos registrados y tasa de merma | Ambos |
| `/precios` | Comparar precios por proveedor y volver a obtenerlos | Admin |
| `/ordenes` | Generar, aprobar o rechazar la orden sugerida; recepción e historial | Admin |
| `/metricas` | Métricas del negocio del período | Admin |
| `/insumos` | Crear y editar insumos y stock seguro; proveedores que lo venden | Admin |
| `/proveedores` | Proveedores, sus productos (con configuración de scraping) y registro de fallos | Admin |

## Estructura

```
openapi/openapi.json     Copia del contrato del backend (se versiona para compilar sin backend)
src/api/
  schema.d.ts            Tipos generados desde OpenAPI
  types.ts               Alias legibles (ItemState, Movement, …)
  client.ts              Cliente tipado (openapi-fetch), token Bearer y unwrap()
  errors.ts              ApiError y traducción al español por `code`
  queries.ts             Hooks de TanStack Query (lecturas y escrituras)
src/auth/                Sesión de la pestaña, roles y rutas protegidas
src/state/               Insumo seleccionado (compartido entre pantallas)
src/mocks/               Backend simulado para `dev:mock` y tests (db.ts: datos; handlers.ts: rutas)
src/lib/                 Configuración, formato (hora de Chile, CLP), textos de los enums, historial con saldo
src/pages/               Pantallas
src/components/          Barra lateral, gráfico, selector de insumo y componentes compartidos
```

## Convenciones del contrato

- **Los decimales llegan como texto** (`"25.000000"`). Se envían también como texto y solo se convierten con
  `formatQuantity()` para mostrarlos.
- **Las fechas pueden venir en UTC**: se muestran siempre con `formatDateTime()` en `America/Santiago`.
- **Los errores** tienen la forma `{"error": {"code", "message", "details"}}`. `unwrap()` lanza `ApiError` con el
  mensaje en español según `code` (`src/api/errors.ts`). Si el backend agrega un código, súmalo ahí.
- **No recalcules reglas de negocio** (alerta, cantidad sugerida, proyección): muestra lo que entrega `assessment`.

## Probar con el backend real

Al 20-10, login, sugerencias y métricas están en la rama **`codex/deploy-render`** del backend, todavía sin
fusionar en `main`. Para probar todo integrado, usa esa rama (`git checkout codex/deploy-render` en el repo del
backend) y, además de `STOCKSMART_DATABASE_URL` y `STOCKSMART_CORS_ORIGINS`:

- define `STOCKSMART_JWT_SECRET` con al menos 32 caracteres aleatorios;
- aplica las migraciones (`alembic -c alembic.ini upgrade head`, hasta `0005_e2_completion`);
- crea un usuario por rol: `python -m app.manage_users <correo> --name "<nombre>" --role ADMIN` (o
  `WAREHOUSE`); el comando pide la contraseña, de 12 a 72 caracteres.

Detalles de la integración, rutas por pantalla y diferencias con el mockup: [docs/FRONTEND.md](docs/FRONTEND.md).

## Despliegue (Vercel)

El repositorio contiene `.env.production` con la URL pública de Render y la simulación desactivada.
`vercel.json` fija instalación, compilación, salida y rutas SPA.

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
   No debe aparecer la etiqueta de datos simulados y debe verse el inventario de Render.
   Recarga una ruta interna para comprobar la redirección SPA.

Antes de publicar, ejecuta `npm test`, `npm run lint` y `npm run build`.
Las pruebas automatizadas usan MSW; la comprobación del despliegue real se realiza después de publicar en Vercel.

Referencias de configuración: [Vite en Vercel](https://vercel.com/docs/frameworks/frontend/vite),
[Node.js en Vercel](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions) y
[variables y modos de Vite](https://vite.dev/guide/env-and-mode).
