# StockSmart — frontend

Frontend web de StockSmart (React + TypeScript + Vite). Cómo funciona por dentro y cómo se conecta con el
backend, pantalla por pantalla: [docs/FRONTEND.md](docs/FRONTEND.md).

El backend está en
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

En `dev:mock` hay dos usuarios de prueba (contraseña `stocksmart-demo`):

- `admin@negocio.cl` — Administrador(a): ve todas las pantallas y aprueba órdenes.
- `bodega@negocio.cl` — Encargado(a) de bodega: solo Movimientos y Conteo y merma.

Los datos simulados reproducen los mockups: pechuga de pollo asada (9 kg, 7 kg/semana, entrega máx. 4 días → «pide
hoy» 9 kg; Jumbo a $11.900/kg, ahorro $5.310) y **vuelven al estado inicial cada vez que se recarga la página**.

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
  client.ts              Cliente tipado (openapi-fetch), token Bearer, unwrap() y requestPending()
  errors.ts              ApiError y traducción al español por `code`
  queries.ts             Hooks de TanStack Query (lecturas y escrituras)
src/auth/                Sesión, roles y rutas protegidas
src/state/               Insumo seleccionado (compartido entre pantallas)
src/mocks/               Backend simulado para `dev:mock` y tests (db.ts: datos; handlers.ts: rutas)
src/lib/                 Formato (hora de Chile, CLP), textos de los enums, historial con saldo
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

1. Importa el repositorio en Vercel (preset Vite; `vercel.json` ya redirige las rutas al `index.html`).
2. Define `VITE_API_URL` con la URL pública del backend.
3. Agrega el dominio de Vercel a `STOCKSMART_CORS_ORIGINS` en el backend.
