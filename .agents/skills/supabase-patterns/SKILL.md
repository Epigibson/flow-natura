---
name: supabase-patterns
description: >
  Use this skill when creating or modifying Supabase tables, RLS policies,
  RPC functions, triggers, or migrations for the Flow Natura project.
  Defines the database schema, naming conventions, and migration workflow.
---

# Supabase Patterns — Flow Natura

## Schema Overview

El proyecto Natura Flow usa **Supabase** como backend completo (Auth + Postgres + RLS + RPC).

### Tablas Principales

| Tabla | Propósito | RLS Scope |
|-------|-----------|-----------|
| `consultant_profiles` | Perfiles de consultoras (extiende auth.users) | `auth.uid() = id` |
| `products` | Catálogo de productos Natura | Authenticated (lectura), All ops para auth |
| `inventory` | Stock de pronta entrega por consultora | `auth.uid() = consultant_id` |
| `customers` | Clientes de cada consultora | `auth.uid() = consultant_id` |
| `orders` | Pedidos/ventas | `auth.uid() = consultant_id` |
| `order_items` | Detalle de cada venta | Vía JOIN a orders |
| `subscriptions` | Membresías/suscripciones | `auth.uid() = consultant_id` |
| `community_posts` | Posts de la comunidad | Authenticated |
| `community_comments` | Comentarios en posts | Authenticated |
| `community_likes` | Likes a posts | `auth.uid() = user_id` |
| `product_barcodes` | Códigos EAN/barras de productos | Authenticated |

### Campos Estándar

Toda tabla DEBE incluir:
```sql
id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
updated_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
```

Si la tabla pertenece a un usuario:
```sql
consultant_id UUID NOT NULL REFERENCES public.consultant_profiles(id) ON DELETE CASCADE
```

### Enums Existentes

```sql
-- Estado de órdenes
CREATE TYPE order_status AS ENUM ('pending', 'delivered', 'paid', 'cancelled');
```

## Convenciones de Migración

### Nomenclatura de Archivos
```
supabase/migrations/YYYYMMDDHHMMSS_nombre_descriptivo.sql
```

Ejemplo: `20260326000002_soft_delete_products.sql`

### Reglas para Migraciones
1. **Idempotente cuando sea posible**: Usa `CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`
2. **RLS siempre**: Toda tabla nueva DEBE tener RLS habilitado + políticas definidas
3. **SECURITY DEFINER** para funciones RPC que bypasan RLS:
```sql
CREATE OR REPLACE FUNCTION public.mi_funcion()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- lógica aquí
END;
$$;
```
4. **No hardcodear IDs**: Usa `auth.uid()` para el usuario actual

### Patrón RLS

```sql
-- Habilitar RLS
ALTER TABLE public.mi_tabla ENABLE ROW LEVEL SECURITY;

-- Solo datos propios
CREATE POLICY "Users manage own data"
  ON public.mi_tabla FOR ALL
  USING (auth.uid() = consultant_id);

-- O lectura pública para auth users + escritura propia
CREATE POLICY "Authenticated read"
  ON public.mi_tabla FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Owner write"
  ON public.mi_tabla FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = consultant_id);
```

### Patrón RPC (para operaciones atómicas)

Cuando una operación necesita múltiples queries o bypasear RLS:

```sql
CREATE OR REPLACE FUNCTION public.perform_inventory_adjustment(
  p_consultant_id UUID,
  p_product_id UUID,
  p_quantity_change INT,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Verificar permisos
  IF p_consultant_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  -- Lógica atómica aquí...
  
  RETURN v_result;
END;
$$;
```

### Soft Delete Pattern

Para tablas que lo soporten (como products):

```sql
-- Agregar columna
ALTER TABLE public.products ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Filtrar soft-deleted en queries normales
-- Las policies de SELECT deben incluir: AND deleted_at IS NULL
```

## Clientes Supabase

### Browser (con RLS automático)
```typescript
// src/lib/supabase.ts
import { supabase } from '../lib/supabase';

// El usuario autenticado ve solo sus datos (RLS)
const { data } = await supabase
  .from('inventory')
  .select('*, products(*)')
  .order('created_at', { ascending: false });
```

### Server (bypasa RLS — solo API routes)
```typescript
// src/lib/supabase-server.ts  
import { getServiceSupabase } from '../lib/supabase-server';

export async function POST({ request }) {
  const sb = getServiceSupabase();
  // Acceso completo sin restricciones RLS
}
```

## Proyecto Supabase

- **URL**: `https://etodkwdlsrzrufxxbsgh.supabase.co`
- **Project ID**: `etodkwdlsrzrufxxbsgh`
