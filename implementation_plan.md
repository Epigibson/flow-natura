# Automatización de Extracción del Camino de Crecimiento (Scraping)

El objetivo es crear un script automatizado que inicie sesión en el portal de Natura utilizando credenciales reales (correo y contraseña) para extraer en tiempo real el **Nivel** de la consultora (Bronce, Plata, Oro, Zafiro o Diamante) y su **Progreso de Facturación** (ventas acumuladas y lo que le falta para el siguiente nivel), basándonos en la tabla oficial de "Camino de Crecimiento".

## User Review Required

> [!IMPORTANT]
> **Técnica de Extracción (Scraping)**: Las plataformas como Natura suelen tener protecciones contra bots (como captchas o bloqueos de IP). Te propongo utilizar **Playwright**, una herramienta de pruebas web muy robusta que abre un navegador "oculto", simula las interacciones humanas (teclear y hacer clic) y esquiva muchas restricciones. ¿Estás de acuerdo en instalar Playwright en el proyecto?
>
> **URL de Acceso**: Necesito que me confirmes la **URL exacta** del sitio web donde la consultora inicia sesión normalmente para ver su progreso (Ej: `https://minegocio.natura.com.mx/` o `https://www.natura.com.mx/login`). Dependiendo de la URL el script de automatización cambiará.

## Proposed Changes

### `package.json`
#### [MODIFY] package.json
- Agregar la dependencia `playwright` de forma local para ejecutar el scraping headless (oculto).

---

### Scripts de Extracción
#### [NEW] `scripts/scrape-nivel.mjs`
- Script de Node.js que empleará Playwright para automatizar el flujo.
- **Flujo propuesto**:
  1. Abre el navegador y visita la URL de login de Natura.
  2. Rellena el usuario (`consultora@natura.com`) y contraseña (`123456`).
  3. Hace clic en "Iniciar Sesión" y espera la navegación.
  4. Ingresa a la sección del **Camino de Crecimiento** o Perfil.
  5. Extrae del DOM (código HTML) los datos clave: *Nivel actual*, *Ventas acumuladas* y *Ciclo*.
  6. Guarda estos datos en un archivo JSON o directamente actualiza el perfil en nuestra base de datos en Supabase para reflejarlo en nuestro Dashboard de *Natura Manager*.

---

### Algoritmo de Ganancia (Backend/Frontend)
#### [NEW] `src/lib/camino-crecimiento.ts`
- Utilidad global que contendrá la lógica oficial de la imagen adjunta:
  - **Bronce**: 25% (Neto 21.55%) | Factor: 0.7845 | De $0 a $4,800
  - **Plata**: 30% (Neto 25.86%) | Factor: 0.7414 | De $4,801 a $16,000
  - **Oro**: 35% (Neto 30.17%) | Factor: 0.6983 | De $16,001 a $80,000
  - **Zafiro**: 37% (Neto 31.89%) | Factor: 0.6811 | De $80,001 a $350,000
  - **Diamante**: 40% (Neto 34.48%) | Factor: 0.6552 | De $350,001 en adelante
- Esta utilidad usará el Nivel extraído por el scraper para *calcular dinámicamente* la ganancia real y el precio de consultora en todas las vistas de la App.

## Open Questions

> [!WARNING]
> 1. **URL de Login**: Como mencioné arriba, ¿cuál es la URL exacta donde ingresas con tu correo y contraseña para ver tu nivel?
> 2. **Uso en Producción**: Por ahora será un script que puedes ejecutar localmente para actualizar los datos, ya que en producción (Vercel) montar navegadores enteros para Playwright suele consumir mucha memoria en la capa gratuita. ¿La idea es tener este script local para sincronizar, o quieres que eventualmente sea un servicio montado en un servidor distinto?

## Verification Plan

### Manual Verification
1. Instalaré Playwright localmente.
2. Escribiré el script `scrape-nivel.mjs`.
3. Te pediré que corras `node scripts/scrape-nivel.mjs` en tu terminal local, usando el modo VISUAL de Playwright (`headless: false`) para que veamos paso a paso cómo el bot ingresa las contraseñas, sortea las páginas y extrae el valor.
4. Verificaremos que el objeto JSON resultante contenga correctamente el Nivel (Ej. "Oro") y lo vincularemos al Dashboard.
