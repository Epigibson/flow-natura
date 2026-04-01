<instruction>You are an expert software engineer. You are working on a WIP branch. Please run `git status` and `git diff` to understand the changes and the current state of the code. Analyze the workspace context and complete the mission brief.</instruction>
<workspace_context>
<artifacts>
--- CURRENT TASK CHECKLIST ---
# Integración Multi-Tenant Natura (Credenciales Seguras)

## Fase 1: Base de Datos y Seguridad
- [x] Crear archivo `src/utils/crypto.ts` para cifrado AES de 256 bits basado en `VITE_ENCRYPTION_KEY`.
- [x] Crear nueva migración SQL para añadir:
  - `natura_email` (TEXT)
  - `natura_password_encrypted` (TEXT)
  - `is_natura_connected` (BOOLEAN DEFAULT false)
  a la tabla `consultant_profiles` (u otra similar del usuario).
- [-] Aplicar la migración a la BD local via Supabase CLI. *(Manual: Ejecutar `20260401000000_consultant_credentials.sql` en entorno remoto de Supabase)*

## Fase 2: Formulario de UI & Backend de Conexión
- [x] Modificar `src/pages/index.astro` para mostrar un estado de "Desconectado" en lugar del nivel actual si `is_natura_connected` es falso, con un modal/formulario para ingresar correo y clave de Natura.
- [x] Crear `src/pages/api/connect-natura.ts`: un endpoint que reciba las credenciales, las encripte mediante la utilidad crypto y actualice la BD usando el admin role.

## Fase 3: Conexión Bot-API y Frontend
- [x] Modificar `src/pages/api/sync-natura.ts` para que primero haga un GET a `consultant_profiles`, traiga la clave encriptada, la desencripte, y la envíe al script mediante el objeto `env` en `exec()`.
- [x] Adaptar el script `scrape-nivel-auto.mjs` para guardar la info resultante amarrada al ID del usuario autenticado actualizando `latest_growth_data` y `growth_sync_date` a través del token de Supabase.
- [x] Modificar el widget en `index.astro` para leer los datos del Camino de Crecimiento dinámicamente.

## Fase 4: Pruebas Funcionales
- [x] Todo el código fue actualizado de acuerdo al plan. La prueba final necesita que la BD tenga la migración aplicada (lo cual el desarrollador deberá correr con SQL) y testearlo en su navegador.

--- IMPLEMENTATION PLAN ---
# Soporte Multi-Tenant para Credenciales de Natura

Actualmente el bot lee las variables de entorno (`NATURA_USER` y `NATURA_PASS`) del archivo `.env`, lo cual limita el sistema a una sola consultora. Para que Flow Natura funcione como un verdadero SaaS y múltiples consultoras puedan automatizar su Camino de Crecimiento, necesitamos guardar sus accesos en la base de datos.

## User Review Required

> [!WARNING]
> **Seguridad de las Contraseñas:** Guardar contraseñas de terceros en texto plano en la base de datos es un riesgo de seguridad masivo. 
> 
> Te propongo **encriptar las contraseñas** desde el backend de Astro antes de mandarlas a Supabase. ¿Estás de acuerdo con añadir un `APP_ENCRYPTION_KEY` a tus variables de entorno para que encripte la contraseña en la DB y solo la desencripte al momento de inyectarla al bot invisible?

## Proposed Changes

### Supabase Migrations
#### [NEW] `supabase/migrations/xxxx_consultant_credentials.sql`
- Crear una nueva migración que agregue a `consultant_profiles` (o a una nueva tabla `consultant_credentials` unida 1:1) las columnas:
  - `natura_email` (TEXT)
  - `natura_password_encrypted` (TEXT)
  - `is_natura_connected` (BOOLEAN DEFAULT false)

### Backend (Astro API)
#### [NEW] `src/utils/crypto.ts`
- Implementar funciones sencillas `encrypt()` y `decrypt()` usando la API nativa de Node.js `crypto`, basadas en una clave maestra del `.env`.

#### [MODIFY] `src/pages/api/sync-natura.ts`
- Modificar el endpoint para que reciba el ID del usario autenticado.
- Bajar sus credenciales de Supabase, desencriptar el password, e invocar el crawler `scrape-nivel-auto.mjs` pasándole estas credenciales dinámicamente (por medio de argumentos seguros o variables de entorno inyectadas al proceso hijo `exec(...)`).

#### [MODIFY] `scripts/scrape-nivel-auto.mjs`
- Quitar la lectura por defecto del `process.env` y hacer que reciba los parámetros desde el script padre.

### Frontend (UI)
#### [MODIFY] `src/pages/index.astro` (o `ajustes.astro`)
- Crear una tarjeta/modal donde la consultora pueda vincular su cuenta ("Conectar mi cuenta de Natura").
- Ingresarán su email y contraseña, lo cual se mandará via POST a un endpoint que lo cifrará y guardará.
- Si no están vinculados, el botón "Sincronizar" del Widget abrirá el pop-up en lugar de fallar.

## Open Questions

1. **Interfaz de Captura:** ¿Dónde prefieres que el usuario ingrese sus datos? ¿Quieres que añada un modal directo en el Widget de Camino de Crecimiento que diga "Conecta tu cuenta de Natura para ver tus puntos reales", o lo ponemos dentro de la página lateral de Ajustes?
2. **Nivel Base:** En caso de que no haya ingresado credenciales aún, el Dashboard debe mostrar un "Zafiro" simulado como hasta ahora, o mostrar un estado "Desconectado" transparente?

## Verification Plan

### Manual Verification
- Ingresar credenciales reales mediante la UI.
- Validar en la consola de Supabase que el password sea texto irreconocible (encriptado).
- Presionar el botón de Sincronización y confirmar que el scraper logra descifrar y loguearse con esos datos.
</artifacts>
</workspace_context>
<mission_brief>[Describe your task here...]</mission_brief>