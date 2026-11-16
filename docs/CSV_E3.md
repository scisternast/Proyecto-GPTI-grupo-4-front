# Integración de CSV y despacho para E3

## Importación CSV de movimientos (REQ-18, RN-19)

En Movimientos, la tarjeta «Importar desde CSV» (`src/components/CsvImport.tsx`) lee el archivo en el navegador y muestra una vista previa antes de enviarlo:

- Exige UTF-8 (con BOM opcional). Un archivo en otra codificación —p. ej. el «CSV (delimitado por comas)» de Excel en Windows-1252— se rechaza con instrucciones para guardarlo como «CSV UTF-8». Máximo 1 MiB y 1000 filas, como el backend.
- Verifica el encabezado `insumo,cantidad,unidad,tipo,fecha,observacion` (separador coma o punto y coma) y muestra cada fila con el nombre del insumo según su ID. Las reglas de cada fila las valida solo el backend.
- Ofrece una plantilla con el ID del insumo seleccionado y lista los IDs de todos los insumos.

Al importar se envía el texto a `POST /movements/import-csv` con `Content-Type: text/csv` y el JWT de la sesión (`useImportMovementsCsv` en `src/api/queries.ts`). La importación es de todo o nada: si el backend responde `CSV_REJECTED`, se listan las filas con error (la fila 1 es la primera de datos; la fila 0 es el archivo) con su contenido y el motivo traducido, y se marcan en la vista previa (`csvRowErrors` en `src/api/errors.ts`). Una carga repetida ya aplicada informa que no se registraron movimientos nuevos. Tras un éxito se invalidan las consultas de inventario, por lo que se actualizan historial, stock, alertas y métricas.

Cada intento muestra una notificación flotante (`src/components/Toasts.tsx`): éxito, archivo ya importado o error. Los errores quedan visibles hasta cerrarlos.

Una fecha `AAAA-MM-DD` se registra a las 00:00 de Chile: si el insumo se registró ese mismo día, el backend la rechaza por ser anterior al stock inicial; en ese caso hay que usar fecha y hora con zona.

## Despacho fijo por proveedor (RN-10)

El despacho se edita en Proveedores (0 = gratis). Precios muestra por separado formatos, despacho y total de cada proveedor; la orden sugerida, formatos, despacho y total. El backend calcula la recomendación con el total y congela los importes en la sugerencia. Si el despacho cambia antes de aprobar, el backend responde `STALE_SHIPPING` y la interfaz pide generar una sugerencia nueva. Las sugerencias y órdenes anteriores al despacho no lo traen y se muestran como «No incluido».

## Contrato y validación

`openapi/openapi.json` y `src/api/schema.d.ts` se regeneraron con `npm run api:types` desde el contrato del backend desplegado, que ya incluye despacho e importación CSV.

Pruebas en `src/api/client.test.ts` (despacho, `STALE_SHIPPING`, importación todo o nada, reintento, encabezado) y `src/lib/csv.test.ts` (lectura del CSV, UTF-8, plantilla), contra el backend simulado con MSW. Está pendiente la verificación contra el backend real en Render.
