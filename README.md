# StockSmart — frontend

Frontend web de StockSmart (React + TypeScript + Vite). El backend está en
[`Proyecto-GPTI-grupo-4-back`](../Proyecto-GPTI-grupo-4-back) y su contrato OpenAPI es la fuente oficial
de la API (`/docs` y `/openapi.json` del backend).

## Requisitos

- Node 20 o posterior.

## Primeros pasos

```bash
npm install
npm run dev:mock   # sin backend: datos simulados en memoria (MSW)
npm run dev        # contra el backend real
```

La app queda en `http://localhost:5173`.

Para usar el backend real, copia `.env.example` a `.env.local` y ajusta `VITE_API_URL`. Además, el backend tiene
que aceptar el origen del frontend: `STOCKSMART_CORS_ORIGINS=http://localhost:5173`.

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
  client.ts              Cliente tipado (openapi-fetch), token Bearer, unwrap() y requestPending()
  errors.ts              ApiError y traducción al español por `code`
  queries.ts             Hooks de TanStack Query (lecturas y escrituras)
src/mocks/handlers.ts    Backend simulado para `dev:mock` y tests
src/lib/                 Formato de cantidades/fechas (hora de Chile) y textos de los enums
src/pages/               Pantallas
src/components/          Layout y componentes compartidos
```

## Convenciones del contrato

- **Los decimales llegan como texto** (`"25.000000"`). Se envían también como texto y solo se convierten con
  `formatQuantity()` para mostrarlos.
- **Las fechas pueden venir en UTC**: se muestran siempre con `formatDateTime()` en `America/Santiago`.
- **Los errores** tienen la forma `{"error": {"code", "message", "details"}}`. `unwrap()` lanza `ApiError` con el
  mensaje en español según `code` (`src/api/errors.ts`). Si el backend agrega un código, súmalo ahí.
- **No recalcules reglas de negocio** (alerta, cantidad sugerida, proyección): muestra lo que entrega `assessment`.

## Pendiente del backend (Arquitectura.md §5.3)

- `GET /items`: sin esta ruta el panel no puede listar insumos. Mientras no exista, se llama con
  `requestPending()` y el panel ofrece abrir un insumo por ID. Cuando se publique, pásala a `api.GET`.
- `balance_after` y `created_by` en los movimientos, para las columnas Saldo y Usuario.
- Login (`POST /auth/login`, `GET /auth/me`): `setAccessToken()` en `client.ts` ya agrega el header `Authorization`.
- Precios, sugerencias, decisiones, órdenes, proveedores y métricas.

## Despliegue (Vercel)

1. Importa el repositorio en Vercel (preset Vite; `vercel.json` ya redirige las rutas al `index.html`).
2. Define `VITE_API_URL` con la URL pública del backend.
3. Agrega el dominio de Vercel a `STOCKSMART_CORS_ORIGINS` en el backend.
