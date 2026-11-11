# Integración de CSV y despacho para E3

Desde Movimientos se envía el archivo original como cuerpo `text/csv` a `POST /movements/import-csv`, con el mismo JWT de la sesión. Se limita a 1 MiB en cliente y servidor; el backend valida todos los campos, roles, orden de filas y stock acumulado y revierte el archivo si hay errores. El cliente conserva el manejo de sesión vencida. Después de un éxito se invalidan las consultas para actualizar historial, stock y métricas.

La interfaz enumera IDs de insumos y explica las seis columnas `insumo,cantidad,unidad,tipo,fecha,observacion`. No crea insumos ni realiza exportaciones. La fila 1 es la primera fila de datos; el encabezado no se cuenta. Se muestran todos los errores recuperables. Una carga repetida ya aplicada confirma el resultado sin duplicar movimientos.

El despacho fijo se edita en Proveedores y se muestra separado del subtotal en Precios y Órdenes. El backend decide la recomendación y congela los importes. Una modificación antes de aprobar devuelve `STALE_SHIPPING`, traducido en la interfaz.

Validación local: `npm test` (25 aprobados), `npm run build`, `npm run lint`; Chromium real contra FastAPI y PostgreSQL, sin mocks, verificó éxito 5→6,5 kg, reintento, dos errores y stock conservado; además creó un proveedor con despacho de CLP 2.990 y comprobó el importe en la tabla. A 360 px no hubo desborde horizontal en Movimientos. No se acreditaron todos los navegadores ni producción.

El snapshot JSON de OpenAPI procede de la aplicación local actual. Se conservaron los tipos generados anteriores y se extendieron sus alias para los campos de despacho, sin descargar un generador nuevo. Regenerar `schema.d.ts` completo con el script existente cuando esté disponible la herramienta; el cliente CSV tiene tipos explícitos. No se alteraron dependencias del frontend.
