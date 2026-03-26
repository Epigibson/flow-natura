# Natura Flow - Auditoría de Consistencia (Supabase vs UI)

## 1. Mapeo de Tablas y Relaciones (Supabase)

Se identificaron las siguientes tablas principales y sus relaciones:

| Tabla | Descripción | RLS Habilitado |
| :--- | :--- | :---: |
| `consultant_profiles` | Perfiles de consultoras, ligados a `auth.users`. | Sí |
| `products` | Catálogo global de productos. | Sí |
| `inventory` | Stock de productos por consultora (relaciona `consultant_profiles` y `products`). | Sí |
| `customers` | Listado de clientes de cada consultora. | Sí |
| `orders` | Registro de ventas realizadas. | Sí |
| `order_items` | Detalle de productos en cada venta. | Sí |
| `inventory_adjustments` | Bitácora de movimientos de stock (entradas, salidas, correcciones). | Sí |
| `subscriptions` | Gestión de planes SaaS (Stripe). | Sí |
| `community_posts` | Publicaciones en el foro de la comunidad. | Sí |
| `community_reactions` | Reacciones a las publicaciones. | Sí |
| `community_comments` | Comentarios en las publicaciones. | Sí |
| `mentorship_modules` | Categorías de aprendizaje. | Sí |
| `mentorship_lessons` | Lecciones dentro de los módulos. | Sí |
| `mentorship_progress` | Seguimiento de lecciones completadas por usuario. | Sí |
| `mentorship_sessions` | Agendamiento de sesiones 1:1. | Sí |

---

## 2. Escaneo de Frontend (Astro + Stitch)

Se mapearon las rutas y componentes que interactúan con Supabase:

- **/clientes**: Gestión de clientes (`customers`).
- **/inventario**: Vista general del stock (`inventory` + `products`).
- **/inventario/alta**: Entrada masiva de productos.
- **/inventario/nuevo**: Creación de productos globales y vinculación inicial al inventario.
- **/inventario/ajustes**: Gestión granular de movimientos (`inventory_adjustments`).
- **/inventario/escanear**: Búsqueda y vinculación por código de barras.
- **/ventas**: Dashboard de ventas (`orders`).
- **/ventas/nueva**: Flujo de registro de pedidos (`orders` + `order_items` + `inventory` decrement).
- **/comunidad**: Foro social (`community_posts`, `community_reactions`, `community_comments`).
- **/mentoria**: Centro de aprendizaje (`mentorship_modules`, `mentorship_lessons`, `mentorship_progress`, `mentorship_sessions`).
- **/membresia**: Gestión de suscripción (`subscriptions`).
- **/ajustes**: Configuración de perfil (`consultant_profiles`) y cuenta.

---

## 3. Tablas sin Pantalla o CRUD Asociado

Tras el análisis, se detectaron las siguientes inconsistencias:

1. **`products` (CRUD Global)**: No existe una pantalla dedicada para que un administrador gestione el catálogo global de productos de manera masiva. Actualmente, los productos se agregan individualmente desde `/inventario/nuevo` si no existen, o se importan vía JSON (visto en scripts, no en UI directa de CRUD).
2. **`consultant_profiles` (Edición Completa)**: La pantalla de `/ajustes` permite editar campos básicos, pero no todos los campos del perfil (como el `level`) son editables por el usuario (lo cual es correcto por lógica de negocio, pero debe notarse).
3. **`product_barcodes`**: Aunque se menciona en el código del escáner (`src/pages/inventario/escanear.astro`), no se encontró una migración SQL que cree explícitamente esta tabla en los archivos revisados, lo que podría causar errores en el escáner si no existe en la DB.

---

## 4. Verificación de Funciones 'Guardar/Actualizar'

Se revisó el uso del cliente de Supabase en las funciones críticas:

- **Consistencia**: El 100% de las pantallas revisadas utilizan el cliente de Supabase (`@supabase/supabase-js`) de forma asíncrona correctamente.
- **Seguridad**: Se respeta el uso de RLS. Las operaciones de escritura en el cliente utilizan la sesión del usuario (`auth.uid()`).
- **Lógica de Inventario**:
    - En `/ventas/nueva`, el decremento de stock se maneja mediante un trigger en la base de datos (`on_order_item_created`), lo cual es una práctica robusta.
    - En `/inventario/ajustes`, se actualiza tanto la tabla `inventory` como `inventory_adjustments` de forma secuencial en el cliente. *Recomendación: Mover esta lógica a una función RPC o un trigger para asegurar atomicidad.*

---

## Conclusión

La arquitectura de Natura Flow es consistente entre el backend de Supabase y la UI de Astro. La mayoría de las tablas tienen una interfaz funcional. Las principales áreas de mejora son la gestión global del catálogo de productos y la verificación de la tabla `product_barcodes` en las migraciones.
