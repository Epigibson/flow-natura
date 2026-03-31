---
name: smart-pr-review
description: >
  Use this skill when reviewing Pull Requests for the Flow Natura project.
  Provides a comprehensive checklist for code quality, security, Supabase patterns,
  Astro conventions, and design system compliance. Trigger when the user asks to
  "review a PR", "check my changes", or "what could go wrong".
---

# Smart PR Review — Flow Natura

## Proceso de Revisión

Cuando se pida revisar un PR, ejecuta esta checklist en orden de prioridad:

### 🔴 Paso 1: Seguridad (BLOQUEANTE)

Estos issues detienen el merge. Buscar en TODOS los archivos modificados:

1. **XSS Prevention**
   - ¿Se usa `esc()` de `src/lib/security.ts` para todo dato del usuario renderizado en HTML?
   - ¿Se usa `sanitizeUrl()` para URLs que vienen del usuario o la DB?
   - ¿Hay uso de `innerHTML` sin sanitización? → **RECHAZAR**
   - Pattern a buscar: `innerHTML =` sin `esc()` envolviendo variables

2. **Supabase Keys**
   - ¿Se expone `SUPABASE_SERVICE_ROLE_KEY` en código client-side (archivos `.astro` script tags, componentes React)?
   - El `service_role` solo debe usarse en `src/pages/api/**` y `src/lib/supabase-server.ts`
   - ¿Se usa `getServiceSupabase()` fuera de API routes? → **RECHAZAR**

3. **RLS Policies**
   - ¿Toda tabla nueva tiene RLS habilitado?
   - ¿Las funciones RPC usan `SECURITY DEFINER SET search_path = ''`?
   - ¿Las policies verifican `auth.uid()`?

4. **Stripe Webhooks**
   - ¿Se valida la firma del webhook con `STRIPE_WEBHOOK_SECRET`?
   - ¿Se manejan errores sin exponer información sensible?

### 🟡 Paso 2: Patrones de Arquitectura

5. **Astro Page Structure**
   - ¿Las páginas del dashboard usan `DashboardLayout`?
   - ¿La lógica client-side está en `<script>` tags (no en frontmatter)?
   - ¿Los imports de Supabase están dentro de `<script>`, no del frontmatter?

6. **Supabase Queries**
   - ¿Se maneja el `error` de las queries? No solo `data`
   - ¿Se usa `.select()` con campos específicos en lugar de `*` cuando es posible?
   - ¿Las queries de listados tienen `.order()` y paginación?

7. **Migraciones SQL**
   - ¿Siguen el formato `YYYYMMDDHHMMSS_nombre.sql`?
   - ¿Son idempotentes donde es posible (`IF NOT EXISTS`, `CREATE OR REPLACE`)?
   - ¿Incluyen RLS policies para tablas nuevas?
   - ¿Las funciones RPC validan permisos internamente?

### 🟢 Paso 3: Design System y UX

8. **Tailwind Tokens**
   - ¿Se usan los tokens del design system (`primary`, `surface-card`, etc.)?
   - ¿Se evitan colores hardcodeados como `bg-red-500`? Usar `bg-error` en su lugar
   - ¿Se usan las clases utilitarias existentes (`.btn-primary`, `.input-editorial`, `.surface-card`)?

9. **Tipografía**
   - ¿Headings usan `font-display` (Plus Jakarta Sans)?
   - ¿Body text usa `font-body` (Inter)?
   - ¿Los headings de primera clase usan `text-primary`?

10. **Iconos**
    - ¿Se usa Material Symbols Outlined consistentemente?
    - Formato: `<span class="material-symbols-outlined">icon_name</span>`
    - ¿No se mezclan con otros icon systems (Font Awesome, Heroicons, etc.)?

11. **Responsive**
    - ¿El sidebar (272px / `md:ml-72`) se considera en el layout?
    - ¿Se usan breakpoints `md:` y `lg:` para grids?

### 🔵 Paso 4: Calidad de Código

12. **TypeScript**
    - ¿Hay `any` types que podrían tipificarse mejor?
    - ¿Se manejan estados de null/undefined?

13. **Error Handling**
    - ¿Hay try/catch o manejo de `.error` en operations async?
    - ¿Se muestran mensajes amigables al usuario (no stack traces)?

14. **Performance**
    - ¿Las queries incluyen solo los campos necesarios?
    - ¿Se evitan N+1 queries? Usar JOINs con `.select('*, relation(*)')`
    - ¿Los event listeners se agregan una sola vez?

## Formato de Output

Al reportar la revisión, usar este formato:

```markdown
## 📋 PR Review: [título del PR]

### 🔴 Bloqueantes (N issues)
- **[archivo:línea]**: [descripción del issue]

### 🟡 Mejoras Recomendadas (N items)
- **[archivo:línea]**: [sugerencia]

### 🟢 Nits / Estilo (N items)  
- **[archivo:línea]**: [observación menor]

### ✅ Lo que está bien
- [aspectos positivos del PR]

### Veredicto: ✅ APROBAR / 🔄 CAMBIOS REQUERIDOS / ❌ RECHAZAR
```
