---
name: project-overview
description: >
  Use this skill FIRST when working on any task related to the Flow Natura project.
  It provides the complete architecture overview, tech stack, conventions, and
  project structure. Read this before making any changes.
---

# Flow Natura — Panorama del Proyecto

## ¿Qué es Flow Natura?

Flow Natura es una plataforma de gestión para **consultoras de Natura** (venta directa de cosméticos). Permite gestionar:
- **Catálogo de productos** con precios, costos, puntos Natura y códigos EAN/barras
- **Inventario personal** (stock de pronta entrega) con ajustes y escaneo de barras
- **Clientes y ventas** con seguimiento de pedidos
- **Reportes** financieros y de desempeño
- **Comunidad** entre consultoras
- **Mentoría** y sistema de logros/gamificación
- **Membresía/suscripción** vía Stripe

## Stack Tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Framework | **Astro** (SSG con islands) | v6.x |
| UI Components | **Astro components** (.astro) + **React** (islands) | React 19 |
| Estilos | **Tailwind CSS v4** (via `@tailwindcss/vite` plugin) | v4.2 |
| Tipografía | Plus Jakarta Sans (headings), Inter (body) | Google Fonts |
| Iconos | Material Symbols Outlined | Google Fonts |
| Backend | **Supabase** (Auth, DB, RLS, RPC, Edge Functions) | v2.100+ |
| Pagos | **Stripe** | v20.x |
| Deploy | **Vercel** (static output con adapter) | — |
| Lenguaje | **TypeScript** | — |

## Estructura del Proyecto

```
flow-natura/
├── src/
│   ├── components/       # Componentes Astro reutilizables
│   │   ├── Sidebar.astro # Navegación lateral principal
│   │   └── Welcome.astro # Componente de bienvenida
│   ├── layouts/
│   │   ├── Layout.astro          # Layout base HTML (head, fonts, icons)
│   │   └── DashboardLayout.astro # Layout con Sidebar + auth guard
│   ├── lib/
│   │   ├── supabase.ts           # Cliente Supabase (browser, con anon key)
│   │   ├── supabase-server.ts    # Cliente Supabase (server, service_role)
│   │   ├── security.ts           # esc() y sanitizeUrl() para XSS prevention
│   │   ├── subscription.ts       # Lógica de suscripciones/membresía
│   │   ├── stripe.ts             # Integración Stripe
│   │   ├── stripe.test.ts        # Tests de Stripe
│   │   └── barcode-scanner.ts    # Scanner de códigos de barras (BarcodeDetector API)
│   ├── pages/
│   │   ├── index.astro           # Dashboard principal (KPIs)
│   │   ├── catalogo.astro        # Catálogo de productos
│   │   ├── inventario.astro      # Gestión de inventario
│   │   ├── inventario/           # Sub-páginas de inventario
│   │   │   └── ajustes.astro     # Ajustes de inventario
│   │   ├── clientes.astro        # Gestión de clientes
│   │   ├── clientes/             # Sub-páginas de clientes
│   │   ├── ventas/               # Sub-páginas de ventas
│   │   ├── reportes.astro        # Reportes y análisis
│   │   ├── comunidad.astro       # Comunidad entre consultoras
│   │   ├── mentoria.astro        # Sistema de mentoría
│   │   ├── logros.astro          # Gamificación / logros
│   │   ├── membresia.astro       # Planes de suscripción (Stripe)
│   │   ├── ajustes.astro         # Configuración del sistema
│   │   ├── soporte.astro         # Centro de soporte
│   │   ├── login.astro           # Inicio de sesión
│   │   ├── register.astro        # Registro
│   │   ├── forgot-password.astro # Recuperación de contraseña
│   │   ├── reset-password.astro  # Restablecer contraseña
│   │   ├── enlace-enviado.astro  # Confirmación de enlace
│   │   └── api/stripe/           # Endpoints API de Stripe
│   └── styles/
│       └── global.css            # CSS global + design tokens Tailwind
├── supabase/
│   └── migrations/               # Migraciones SQL ordenadas por fecha
├── scripts/                      # Scripts de scraping/datos Natura
├── public/                       # Archivos estáticos
└── package.json
```

## Patrones de Diseño Clave

### 1. Astro Pages con Script Client-Side
Cada página `.astro` sigue este patrón:
- **Frontmatter** (`---`): importa layout y define variables estáticas
- **Template HTML**: markup con clases Tailwind
- **`<script>`**: lógica client-side con Supabase queries, event handlers, DOM manipulation

### 2. Autenticación
- Todo el dashboard usa `DashboardLayout.astro` que incluye un **auth guard** automático
- El auth guard redirige a `/login` si no hay sesión activa
- Las páginas cargan datos del usuario vía `supabase.auth.getSession()`
- Cada query filtra por `consultant_id` (RLS lo refuerza en backend)

### 3. Seguridad
- **SIEMPRE** usar `esc()` de `security.ts` al renderizar datos del usuario en HTML
- **SIEMPRE** usar `sanitizeUrl()` para URLs que vienen del usuario
- **NUNCA** usar `innerHTML` con datos sin sanitizar
- El cliente browser usa `anon key`, el server usa `service_role` (solo en API routes)

### 4. Supabase Data Access
```typescript
// Browser (con RLS, filtrado automático por usuario)
import { supabase } from '../lib/supabase';
const { data } = await supabase.from('products').select('*');

// Server (bypassa RLS, para API endpoints)
import { getServiceSupabase } from '../lib/supabase-server';
const sb = getServiceSupabase();
```

### 5. Variables de Entorno
```
PUBLIC_SUPABASE_URL       → URL del proyecto Supabase
PUBLIC_SUPABASE_ANON_KEY  → Anon key (browser-safe)
SUPABASE_SERVICE_ROLE_KEY → Service role (solo server)
STRIPE_SECRET_KEY         → Stripe secret key
STRIPE_WEBHOOK_SECRET     → Stripe webhook secret
```

## Comandos Principales

```bash
npm run dev      # Servidor de desarrollo
npm run build    # Build para producción
npm run preview  # Preview del build
```

## Deploy

El proyecto se deploya en **Vercel** con el adapter `@astrojs/vercel`. El output es `static`.
El branch `main` se deploya automáticamente.
