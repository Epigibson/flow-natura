---
name: cost-optimizer
description: >
  Use this skill to analyze and optimize costs across Supabase, Vercel, and Stripe
  for the Flow Natura project. Trigger on "reduce costs", "optimize usage",
  "billing analysis", "too expensive", "free tier limits", or "cost review".
---

# Cost Optimizer — Flow Natura

## Stack de Costos

| Servicio | Plan Actual | Límites Clave |
|----------|-------------|---------------|
| **Supabase** | Verificar con org | DB size, API requests, auth users, storage |
| **Vercel** | Verificar deploy | Bandwidth, serverless executions, build mins |
| **Stripe** | Pay-as-you-go | 2.9% + 30¢ por transacción |

---

## 1. Optimización de Supabase

### Verificar Estado Actual
```
Usar tools MCP:
1. mcp_supabase-mcp-server_list_organizations  → Ver plan actual
2. mcp_supabase-mcp-server_get_organization     → Detalles del plan
3. mcp_supabase-mcp-server_get_advisors (performance) → Recomendaciones
```

### Queries Costosas — Detección
```sql
-- Ver queries más lentas (si pg_stat_statements está habilitado)
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
```

### Optimizaciones de Base de Datos

#### A. Índices Faltantes
```sql
-- Índices recomendados para Flow Natura
-- (Verificar si ya existen antes de crear)

-- Inventario: búsquedas frecuentes por consultora
CREATE INDEX IF NOT EXISTS idx_inventory_consultant 
  ON inventory(consultant_id);

-- Pedidos: filtrados por consultora y status
CREATE INDEX IF NOT EXISTS idx_orders_consultant_status 
  ON orders(consultant_id, status);

-- Productos: búsqueda por código (ya tiene UNIQUE constraint)
-- Productos: filtrar soft-deleted  
CREATE INDEX IF NOT EXISTS idx_products_active 
  ON products(deleted_at) WHERE deleted_at IS NULL;

-- Clientes: por consultora
CREATE INDEX IF NOT EXISTS idx_customers_consultant 
  ON customers(consultant_id);

-- Order items: por order_id (JOIN frecuente)
CREATE INDEX IF NOT EXISTS idx_order_items_order 
  ON order_items(order_id);

-- Product barcodes: búsqueda por EAN
CREATE INDEX IF NOT EXISTS idx_barcodes_ean 
  ON product_barcodes(ean_code);
```

#### B. Reducir Tamaño de Respuestas
```typescript
// ❌ MAL: Traer todo
const { data } = await supabase.from('products').select('*');

// ✅ BIEN: Solo campos necesarios
const { data } = await supabase
  .from('products')
  .select('id, code, name, price, image_url')
  .is('deleted_at', null)
  .order('name')
  .limit(50);
```

#### C. Evitar N+1 Queries
```typescript
// ❌ MAL: Una query por cada item
for (const item of orderItems) {
  const { data: product } = await supabase
    .from('products').select('*').eq('id', item.product_id).single();
}

// ✅ BIEN: JOIN en una sola query
const { data } = await supabase
  .from('order_items')
  .select('*, products(*)')
  .eq('order_id', orderId);
```

#### D. Cachear Catálogo en Client
```typescript
// El catálogo de productos cambia poco — cachear en sessionStorage
function getCachedProducts() {
  const cached = sessionStorage.getItem('natura_products');
  if (cached) {
    const { data, timestamp } = JSON.parse(cached);
    // Cache válido por 30 minutos
    if (Date.now() - timestamp < 30 * 60 * 1000) return data;
  }
  return null;
}

async function loadProducts() {
  const cached = getCachedProducts();
  if (cached) return cached;

  const { data } = await supabase.from('products')
    .select('id, code, name, price, cost, category, image_url')
    .is('deleted_at', null);

  if (data) {
    sessionStorage.setItem('natura_products', 
      JSON.stringify({ data, timestamp: Date.now() }));
  }
  return data;
}
```

---

## 2. Optimización de Vercel

### Build Estático = Costo Mínimo
El proyecto ya usa `output: 'static'`, lo cual es óptimo:
- Las páginas se sirven desde CDN (sin serverless calls por page view)
- Solo las API routes (`src/pages/api/`) usan serverless functions

### Reducir Build Times
```bash
# El build no debería tomar más de ~1 minuto
# Si tarda más, verificar:
# - ¿Se están procesando imágenes grandes?
# - ¿Hay dependencias innecesarias en package.json?
```

### Dependencias — Auditoría
```json
// Dependencias actuales que SÍ se usan:
"@astrojs/vercel"        // ✅ Necesario para deploy
"@astrojs/react"         // ✅ React islands
"@supabase/supabase-js"  // ✅ Backend
"tailwindcss"            // ✅ Estilos
"@tailwindcss/vite"      // ✅ Vite plugin
"stripe"                 // ✅ Pagos
"astro"                  // ✅ Framework
"react" / "react-dom"    // ✅ React
"@zxing/library"         // ⚠️ ¿Se sigue usando? El barcode scanner usa BarcodeDetector API nativo

// DevDependencies:
"puppeteer"              // ⚠️ Solo para scraping — ¿necesario en CI?
```

**Acción**: Si `@zxing/library` ya no se usa (se migró a BarcodeDetector API nativo),
eliminarla reduce el bundle size significativamente.

---

## 3. Optimización de Stripe

### Reducir Fees
- Stripe cobra **2.9% + 30¢ MXN** por transacción
- Para suscripciones recurrentes, esto ya es el método más eficiente
- Si hay pagos únicos pequeños, considerar agrupar cobros

### Webhook Efficiency
- El endpoint webhook solo debe procesar eventos relevantes
- Filtrar por `event.type` al inicio para evitar procesamiento innecesario

---

## 4. Checklist de Optimización Rápida

### Impacto Alto / Esfuerzo Bajo
- [ ] Agregar `LIMIT` a queries de listados (máx 50-100 items por página)
- [ ] Agregar `.is('deleted_at', null)` a todas las queries de productos  
- [ ] Cachear catálogo en `sessionStorage` (30 min TTL)
- [ ] Verificar índices con herramienta de Supabase advisors

### Impacto Alto / Esfuerzo Medio
- [ ] Implementar paginación real (cursor-based) en tablas grandes
- [ ] Crear vistas materializadas para reportes/KPIs
- [ ] Eliminar dependencias no usadas (`@zxing/library`, `puppeteer` de prod)

### Impacto Medio / Esfuerzo Bajo
- [ ] Usar `.select()` con campos específicos en lugar de `*`
- [ ] Lazy-load imágenes con `loading="lazy"`

---

## 5. Monitoreo de Costos

### Verificar Uso Actual
```
1. Supabase Dashboard → Settings → Usage → Ver DB size, requests, bandwidth
2. Vercel Dashboard → Usage → Ver bandwidth, function invocations
3. Stripe Dashboard → Reports → Ver fees acumulados
```

### Alertas Recomendadas
- Supabase: Configurar alertas al 80% del límite del plan
- Vercel: Revisar build minutes mensuales
- Stripe: Monitorear refunds y disputas

### Estimación de Crecimiento
```sql
-- Proyección simple: crecimiento de datos por mes
SELECT 
  date_trunc('month', created_at) as mes,
  count(*) as registros_nuevos,
  pg_size_pretty(sum(pg_column_size(t.*))) as tamaño_aprox
FROM orders t
GROUP BY 1
ORDER BY 1 DESC
LIMIT 6;
```
