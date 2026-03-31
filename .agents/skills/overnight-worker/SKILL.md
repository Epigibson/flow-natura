---
name: overnight-worker
description: >
  Use this skill for batch processing, data maintenance, catalog updates,
  and long-running tasks that can be executed during low-traffic hours.
  Trigger on "update catalog", "batch process", "clean up data", "import products",
  "sync data", "maintenance task", or "run overnight".
---

# Overnight Worker — Flow Natura

## Propósito

Tareas de mantenimiento, importación de datos, y procesamiento por lotes que se
ejecutan fuera de horas pico. Estas tareas son típicamente intensivas en I/O o
requieren múltiples pasos coordinados.

---

## 1. Importación de Catálogo Natura

### Contexto
Natura actualiza su catálogo por ciclos (cada ~3 semanas). El proyecto tiene scripts
de scraping en `scripts/` para extraer productos.

### Scripts Disponibles

| Script | Propósito |
|--------|-----------|
| `scripts/scrape-natura.mjs` | Scraping principal del catálogo Natura |
| `scripts/fetch-ean-codes.mjs` | Obtener códigos EAN/barras |
| `scripts/fetch-ean-v2.mjs` | V2 del fetcher de EAN codes |
| `scripts/check-sku-fields.mjs` | Validar campos SKU |
| `scripts/scrape-console.js` | Script auxiliar de consola |

### Flujo de Importación de Catálogo

```
1. Ejecutar scraping → natura-ciclo-YYYYMM.json
2. Procesar y mapear campos → productos normalizados
3. Buscar/asignar códigos EAN → natura-ean-matches.json
4. Upsert en Supabase → tabla products
5. Verificar integridad → check-sku-fields
```

### Ejecutar Importación
```bash
# Paso 1: Scrape del catálogo actual
node scripts/scrape-natura.mjs

# Paso 2: Mapear EAN codes
node scripts/fetch-ean-v2.mjs

# Paso 3: Verificar datos
node scripts/check-sku-fields.mjs
```

### Upsert de Productos en Supabase
```sql
-- Patrón para upsert masivo de productos
INSERT INTO public.products (code, name, category, price, cost, points)
VALUES 
  ('NAT001', 'Producto 1', 'Perfumería', 150.00, 100.00, 10),
  ('NAT002', 'Producto 2', 'Rostro', 200.00, 140.00, 15)
ON CONFLICT (code) 
DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  cost = EXCLUDED.cost,
  points = EXCLUDED.points,
  updated_at = timezone('utc', now());
```

---

## 2. Limpieza y Mantenimiento de Datos

### Productos Huérfanos (soft-deleted sin inventario)
```sql
-- Encontrar productos soft-deleted que ya no tienen inventario
SELECT p.id, p.code, p.name, p.deleted_at
FROM products p
LEFT JOIN inventory i ON i.product_id = p.id
WHERE p.deleted_at IS NOT NULL
  AND i.id IS NULL;
```

### Inventario con Stock Cero
```sql
-- Limpiar registros de inventario con quantity = 0
DELETE FROM inventory WHERE quantity = 0;
```

### Sesiones Expiradas
```sql
-- Verificar usuarios inactivos (sin login en 90 días)
SELECT cp.id, cp.full_name, cp.natura_code, u.last_sign_in_at
FROM consultant_profiles cp
JOIN auth.users u ON u.id = cp.id
WHERE u.last_sign_in_at < now() - interval '90 days'
ORDER BY u.last_sign_in_at;
```

### Pedidos Antiguos Pending
```sql
-- Encontrar pedidos pending de más de 30 días
SELECT o.id, o.total_amount, o.created_at, cp.full_name
FROM orders o
JOIN consultant_profiles cp ON cp.id = o.consultant_id
WHERE o.status = 'pending'
  AND o.created_at < now() - interval '30 days'
ORDER BY o.created_at;
```

---

## 3. Reportes de Integridad

### Auditoría Completa de Base de Datos
```sql
-- Resumen de estado del sistema
SELECT 'Consultoras activas' as metric, count(*)::text as value 
  FROM consultant_profiles
UNION ALL
SELECT 'Productos activos', count(*)::text 
  FROM products WHERE deleted_at IS NULL
UNION ALL
SELECT 'Productos eliminados', count(*)::text 
  FROM products WHERE deleted_at IS NOT NULL
UNION ALL
SELECT 'Items en inventario', sum(quantity)::text 
  FROM inventory
UNION ALL
SELECT 'Clientes totales', count(*)::text 
  FROM customers
UNION ALL
SELECT 'Pedidos pendientes', count(*)::text 
  FROM orders WHERE status = 'pending'
UNION ALL
SELECT 'Pedidos entregados', count(*)::text 
  FROM orders WHERE status = 'delivered'
UNION ALL
SELECT 'Ventas totales ($)', coalesce(sum(total_amount), 0)::text 
  FROM orders WHERE status IN ('delivered', 'paid');
```

### Verificar Consistencia RLS
```sql
-- Asegurar que todas las tablas públicas tienen RLS
SELECT tablename, 
       CASE WHEN rowsecurity THEN '✅ Habilitado' ELSE '❌ FALTA' END as rls_status
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;
```

---

## 4. Backup de Datos Críticos

### Exportar Datos de Consultora
```sql
-- Para generar backup de una consultora específica
-- Sustituir el UUID del consultant_id
SELECT json_build_object(
  'profile', (SELECT row_to_json(cp) FROM consultant_profiles cp WHERE cp.id = '<consultant_id>'),
  'customers', (SELECT json_agg(row_to_json(c)) FROM customers c WHERE c.consultant_id = '<consultant_id>'),
  'inventory', (SELECT json_agg(row_to_json(i)) FROM inventory i WHERE i.consultant_id = '<consultant_id>'),
  'orders', (SELECT json_agg(row_to_json(o)) FROM orders o WHERE o.consultant_id = '<consultant_id>')
) as backup;
```

---

## 5. Checklist Pre-Ejecución

Antes de ejecutar cualquier tarea overnight:

- [ ] ¿Es horario de bajo tráfico? (idealmente después de 11 PM CST)
- [ ] ¿Se tiene backup o se puede revertir la operación?
- [ ] ¿Se probó el query/script en staging o con `LIMIT` primero?
- [ ] ¿Se notificará al usuario de cualquier downtime?
- [ ] ¿Las operaciones destructivas usan transacciones (`BEGIN; ... COMMIT;`)?

## 6. Archivos de Datos del Proyecto

| Archivo | Descripción |
|---------|-------------|
| `natura-ciclo-202605.json` | Catálogo del ciclo actual (~782KB) |
| `natura-ean-database.json` | Base de datos EAN v1 |
| `natura-ean-database-v2.json` | Base de datos EAN v2 |
| `natura-ean-matches.json` | Matches de EAN a productos |
| `natura-ean-matches-v2.json` | Matches de EAN v2 |
| `natura-tokens.json` | Tokens/auth de Natura |
| `natura-raw-sample.json` | Muestra de datos crudos |
