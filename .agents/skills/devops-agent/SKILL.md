---
name: devops-agent
description: >
  Use this skill for deployment, infrastructure, CI/CD, and environment
  management tasks in Flow Natura. Covers Vercel deploys, Supabase migrations,
  environment variables, build troubleshooting, and production operations.
  Trigger on "deploy", "build fails", "migration", "environment setup", or "production issue".
---

# DevOps Agent — Flow Natura

## Stack de Infraestructura

| Servicio | Uso | Dashboard |
|----------|-----|-----------|
| **Vercel** | Hosting, deploy, SSG | vercel.com |
| **Supabase** | Auth, DB, Storage, Edge Functions | supabase.com |
| **Stripe** | Pagos y suscripciones | dashboard.stripe.com |
| **GitHub** | Repo: `Epigibson/flow-natura` | github.com |

## Proyecto Supabase

- **Project ID**: `etodkwdlsrzrufxxbsgh`
- **URL**: `https://etodkwdlsrzrufxxbsgh.supabase.co`

---

## 1. Deploy a Producción (Vercel)

### Flujo Normal
```
push a main → Vercel auto-deploy → Build estático → Live
```

### Build Local para Verificar
```bash
npm run build
```

### Problemas Comunes de Build

| Error | Causa | Solución |
|-------|-------|----------|
| `duplicate identifier` | Merge conflict mal resuelto | Buscar declaraciones duplicadas |
| `Cannot find module` | Import roto post-merge | Verificar paths de imports |
| `TS2304: Cannot find name 'esc'` | Falta import de security | Agregar `import { esc } from '../lib/security'` |
| `adapter error` | Config de Vercel | Verificar `astro.config.mjs` tiene `adapter: vercel()` |

### Verificar Build Status
```bash
# Build local completo
npm run build

# Si falla, buscar el error exacto y corregir
# Los errores más comunes son imports duplicados post-merge
```

### Variables de Entorno en Vercel
Configurar en Vercel Dashboard → Settings → Environment Variables:

```
PUBLIC_SUPABASE_URL          → Production Supabase URL
PUBLIC_SUPABASE_ANON_KEY     → Production anon key
SUPABASE_SERVICE_ROLE_KEY    → Production service role (solo server)
STRIPE_SECRET_KEY            → Stripe live key
STRIPE_WEBHOOK_SECRET        → Stripe webhook secret
```

> ⚠️ Las variables `PUBLIC_*` se exponen al browser. Las demás son solo server-side.

---

## 2. Migraciones de Base de Datos

### Ubicación
```
supabase/migrations/YYYYMMDDHHMMSS_nombre.sql
```

### Migraciones actuales (en orden)
1. `20260324000000_init.sql` — Schema inicial (profiles, products, inventory, customers, orders)
2. `20260324000001_sales_logic.sql` — Lógica de ventas
3. `20260325000000_add_brand.sql` — Campo brand en productos
4. `20260325000001_inventory_adjustments.sql` — Ajustes de inventario
5. `20260325000002_subscriptions.sql` — Suscripciones
6. `20260325000003_community.sql` — Comunidad
7. `20260325000004_mentorship.sql` — Mentoría
8. `20260326000000_product_barcodes.sql` — Códigos de barras
9. `20260326000001_adjustment_rpc.sql` — RPC de ajustes
10. `20260326000002_soft_delete_products.sql` — Soft delete

### Ejecutar una Migración Nueva

1. **Crear el archivo SQL** en `supabase/migrations/` con timestamp correcto
2. **Aplicar vía MCP de Supabase**:
   ```
   Usar tool: mcp_supabase-mcp-server_apply_migration
   project_id: etodkwdlsrzrufxxbsgh
   ```
3. **Verificar con query**:
   ```
   Usar tool: mcp_supabase-mcp-server_execute_sql
   ```
4. **Verificar advisors** post-migración:
   ```
   Usar tool: mcp_supabase-mcp-server_get_advisors (security + performance)
   ```

### Rollback de Emergencia
No hay rollback automático. Para revertir:
1. Crear una nueva migración que deshaga los cambios
2. Nombre: `YYYYMMDDHHMMSS_revert_nombre_original.sql`
3. Usar `DROP`, `ALTER TABLE DROP COLUMN`, etc. con precaución

---

## 3. Troubleshooting Producción

### Logs de Supabase
```
Usar tools MCP:
- mcp_supabase-mcp-server_get_logs (service: "postgres")    → Errores de DB
- mcp_supabase-mcp-server_get_logs (service: "auth")         → Errores de auth
- mcp_supabase-mcp-server_get_logs (service: "api")          → Errores de API/PostgREST
- mcp_supabase-mcp-server_get_logs (service: "edge-function") → Edge functions
```

### Diagnóstico Paso a Paso
1. **¿Es un error de build?** → `npm run build` local
2. **¿Es un error de datos?** → Revisar logs de Supabase (postgres)
3. **¿Es un error de auth?** → Revisar logs de auth + verificar RLS
4. **¿Es un error de pagos?** → Revisar logs de Stripe + webhook endpoint
5. **¿Es un error de deploy?** → Revisar Vercel deployment logs

### Health Check Rápido
```sql
-- Verificar tablas existen
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' ORDER BY table_name;

-- Verificar RLS habilitado
SELECT tablename, rowsecurity FROM pg_tables 
WHERE schemaname = 'public';

-- Contar registros por tabla
SELECT 'consultant_profiles' as t, count(*) FROM consultant_profiles
UNION ALL SELECT 'products', count(*) FROM products
UNION ALL SELECT 'inventory', count(*) FROM inventory
UNION ALL SELECT 'orders', count(*) FROM orders;
```

---

## 4. Setup para Desarrollo Local

```bash
# 1. Clonar e instalar
git clone https://github.com/Epigibson/flow-natura.git
cd flow-natura
npm install

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con credenciales de Supabase

# 3. Iniciar dev server
npm run dev
# → http://localhost:4321

# 4. Node version requerida
node -v  # Debe ser 22.x
```

### Astro Config Actual
```javascript
// astro.config.mjs
export default defineConfig({
  output: 'static',        // Build estático (SSG)
  adapter: vercel(),        // Deploy en Vercel
  integrations: [react()],  // React islands
  vite: {
    plugins: [tailwindcss()] // Tailwind v4 via Vite plugin
  }
});
```

---

## 5. Git Workflow

- **Branch principal**: `main` (auto-deploy a producción)
- **Convención de commits**: Descriptivos en español o inglés
- **PRs**: Revisar con skill `smart-pr-review` antes de merge
- **Conflictos de merge**: Son la causa #1 de build failures — limpiar duplicados
