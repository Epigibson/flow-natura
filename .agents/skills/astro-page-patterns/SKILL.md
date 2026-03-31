---
name: astro-page-patterns
description: >
  Use this skill when creating or modifying Astro pages in Flow Natura.
  Covers the page structure, DashboardLayout usage, client-side data loading,
  Tailwind design system tokens, and UI component patterns.
---

# Astro Page Patterns — Flow Natura

## Crear una Nueva Página del Dashboard

### 1. Estructura Base

Toda página del dashboard sigue este patrón:

```astro
---
import DashboardLayout from '../layouts/DashboardLayout.astro';
---

<DashboardLayout>
  <!-- Encabezado de página -->
  <div class="mb-8">
    <h1 class="text-3xl font-display font-bold text-primary">Título de Página</h1>
    <p class="text-on-surface-variant text-sm mt-1">Descripción breve</p>
  </div>

  <!-- Contenido principal -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    <!-- Cards y contenido aquí -->
  </div>
</DashboardLayout>

<script>
  import { supabase } from '../lib/supabase';
  import { esc } from '../lib/security';

  // Cargar datos
  async function loadData() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data, error } = await supabase
      .from('tabla')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error:', error);
      return;
    }

    renderData(data);
  }

  function renderData(items: any[]) {
    const container = document.getElementById('data-container');
    if (!container) return;

    container.innerHTML = items.map(item => `
      <div class="surface-card p-6">
        <h3 class="font-display font-bold text-primary">${esc(item.name)}</h3>
        <p class="text-on-surface-variant text-sm">${esc(item.description)}</p>
      </div>
    `).join('');
  }

  loadData();
</script>
```

### 2. El Layout NO necesita importaciones extra

- `DashboardLayout` ya importa `Layout` (que incluye fonts, icons, global.css)
- `DashboardLayout` ya incluye `Sidebar` y auth guard
- Solo necesitas importar `DashboardLayout`

## Design System — Tokens de Tailwind

### Colores (definidos en `global.css` via `@theme`)

| Token | Valor | Uso |
|-------|-------|-----|
| `surface` | #fef7ff | Fondo principal |
| `surface-container-low` | #f9f1fd | Capas intermedias |
| `surface-container-lowest` | #ffffff | Cards (`.surface-card`) |
| `surface-container-high` | #ede6f1 | Sidebar, headers |
| `surface-container-highest` | #e7e0eb | Inputs, botones sec. |
| `primary` | #964900 | Color principal (naranja oscuro) |
| `primary-container` | #f48120 | Color primario fuerte |
| `on-primary-container` | #5a2900 | Texto sobre primary container |
| `secondary` | #3c6a00 | Verde Natura |
| `secondary-container` | #b8f47a | Verde claro |
| `error` | #ba1a1a | Errores |
| `error-container` | #ffdad6 | Fondo de error |
| `on-surface` | #1d1a22 | Texto principal |
| `on-surface-variant` | #564336 | Texto secundario |
| `outline-variant` | #ddc1b0 | Bordes sutiles |

### Tipografía

| Clase | Font | Uso |
|-------|------|-----|
| `font-display` | Plus Jakarta Sans | Headings, títulos |
| `font-body` | Inter | Texto de cuerpo |

### Clases de Componentes Utilitarios

| Clase | Propósito |
|-------|-----------|
| `.surface-card` | Card blanca con border-radius |
| `.surface-layer` | Capa de fondo intermedia |
| `.glass-panel` | Panel con glassmorphism |
| `.btn-primary` | Botón primario gradient |
| `.btn-secondary` | Botón secundario |
| `.input-editorial` | Input con estilo editorial |
| `.sidebar-link` | Link de sidebar |
| `.sidebar-link.active` | Link activo de sidebar |

### Iconos Material Symbols

Usa `<span class="material-symbols-outlined">icon_name</span>` con nombres de [Material Symbols](https://fonts.google.com/icons).

## Patrones de UI Comunes

### KPI Card
```html
<div class="surface-card p-6 flex flex-col gap-2">
  <div class="flex items-center gap-2 text-on-surface-variant">
    <span class="material-symbols-outlined text-lg">trending_up</span>
    <span class="text-xs font-semibold uppercase tracking-wider">Métrica</span>
  </div>
  <p class="text-3xl font-display font-bold text-primary">$12,500</p>
  <p class="text-xs text-on-surface-variant">+15% vs. mes anterior</p>
</div>
```

### Tabla de Datos
```html
<div class="surface-card overflow-hidden">
  <table class="w-full text-sm">
    <thead>
      <tr class="bg-surface-container-high text-on-surface-variant text-xs uppercase tracking-wider">
        <th class="px-6 py-3 text-left">Columna</th>
      </tr>
    </thead>
    <tbody id="table-body">
      <!-- Rows generados vía JS con esc() -->
    </tbody>
  </table>
</div>
```

### Modal
```html
<div id="mi-modal" class="fixed inset-0 z-50 hidden items-center justify-center bg-black/50 backdrop-blur-sm">
  <div class="surface-card p-8 w-full max-w-lg mx-4 shadow-2xl">
    <h2 class="text-xl font-display font-bold text-primary mb-4">Título</h2>
    <!-- Contenido -->
    <div class="flex justify-end gap-3 mt-6">
      <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn-primary">Confirmar</button>
    </div>
  </div>
</div>
```

### Toast/Notificación
```javascript
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `fixed top-6 right-6 z-[100] px-6 py-3 rounded-xl font-semibold text-sm shadow-lg transition-all
    ${type === 'success' ? 'bg-secondary-container text-on-surface' : 'bg-error-container text-error'}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
```

## Agregar una Nueva Ruta al Sidebar

Edita `src/components/Sidebar.astro` y agrega un nuevo link dentro de la sección apropiada:

```astro
<a href="/mi-pagina" class={linkClass(isActive('/mi-pagina'))}>
  <span class="material-symbols-outlined sidebar-icon">icon_name</span>
  <span>Mi Página</span>
</a>
```

Las secciones del sidebar son:
- **Negocio**: Dashboard, Inventario, Clientes, Ventas, Reportes
- **Experiencia**: Comunidad, Mentoría, Membresía, Logros
- **Herramientas**: Catálogo, Soporte, Ajustes

## Seguridad — Reglas Inquebrantables

1. **SIEMPRE sanitizar** datos del usuario antes de renderizar en HTML:
   ```javascript
   import { esc } from '../lib/security';
   element.innerHTML = `<p>${esc(userData)}</p>`;
   ```

2. **NUNCA** usar `innerHTML` con datos sin sanitizar
3. **NUNCA** exponer `SUPABASE_SERVICE_ROLE_KEY` en código client-side
4. Las URLs del usuario deben pasar por `sanitizeUrl()` antes de usarse

## Deploy y Build

```bash
npm run dev    # Desarrollo local (puerto 4321)
npm run build  # Build estático para Vercel
```

- El build es **estático** (`output: 'static'`)
- Vercel deploya automáticamente desde branch `main`
- Las API routes (bajo `src/pages/api/`) se ejecutan como Vercel Functions
