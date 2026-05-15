import { firefox } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Las variables de entorno NATURA_USER y NATURA_PASS ahora son inyectadas por el proceso padre (sync-natura.ts)

const LOGIN_URL = 'https://minegocio.natura-avon.com.mx/home';

const USERNAME = process.env.NATURA_USER || 'april97iruy18@gmail.com';
const PASSWORD = process.env.NATURA_PASS || 'Yuri183c97@bril';

(async () => {
  console.log('🚀 Iniciando Auto-Sincronización Silenciosa (Headless)...');

  // Usa Firefox en headless para evitar los fuertes bloqueos WAF de Akamai/Cloudflare que afectan a Chromium
  const browser = await firefox.launch({
    headless: true
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  // 60s max per action in silent mode to avoid hanging forever
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(60000);

  let extractedGrowthData = null;

  page.on('response', async (response) => {
    if (response.url().includes('growthplan')) {
      try {
        const body = await response.json();
        if (body?.data?.consultantLevel) {
          extractedGrowthData = body.data.consultantLevel;
          console.log('🎯 Payload Crecimiento Interceptado Automáticamente!');
        }
      } catch (err) { }
    }
  });

  try {
    console.log('🌐 Navegando a la página de Login...');
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });

    console.log('🤖 Tratando de auto-completar el Login...');

    // Esperar a que el formulario cargue completamente
    await page.waitForTimeout(3000);

    // --- PASO 1: Cambiar el dropdown MUI de "Código" a "E-mail" si el usuario usa correo ---
    if (USERNAME.includes('@')) {
      console.log('   📧 Detectado email. Cambiando selector a E-mail...');
      const dropdown = page.locator('div[role="combobox"]').first();
      if (await dropdown.isVisible({ timeout: 5000 }).catch(() => false)) {
        await dropdown.click();
        await page.waitForTimeout(1000);
        // Seleccionar la opción "E-mail" del menú desplegable MUI
        const emailOption = page.locator('li[role="option"]', { hasText: 'E-mail' });
        if (await emailOption.isVisible({ timeout: 3000 }).catch(() => false)) {
          await emailOption.click();
          console.log('   ✅ Selector cambiado a E-mail.');
          await page.waitForTimeout(1000);
        } else {
          console.log('   ⚠️ No se encontró la opción E-mail en el dropdown.');
        }
      }
    }

    // --- PASO 2: Llenar el campo de usuario ---
    const userField = page.locator('input[placeholder*="E-mail"], input[placeholder*="Consultora"], input[type="email"], input[type="text"]').first();
    if (await userField.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('   Escribiendo usuario...');
      await userField.fill(USERNAME);
      await page.waitForTimeout(500);

      // --- PASO 3: Llenar contraseña ---
      const pwdField = page.locator('input[type="password"]').first();
      if (await pwdField.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log('   Escribiendo contraseña...');
        await pwdField.fill(PASSWORD);
        await page.waitForTimeout(500);

        // --- PASO 4: Hacer clic en INICIAR SESIÓN ---
        console.log('   Haciendo clic en INICIAR SESIÓN...');
        const loginBtn = page.locator('button', { hasText: 'INICIAR SESIÓN' });
        if (await loginBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await loginBtn.click();
        } else {
          // Fallback: presionar Enter en el campo de contraseña
          await pwdField.press('Enter');
        }
        await page.waitForTimeout(3000);
      } else {
        console.log('   ⚠️ No se encontró el campo de contraseña.');
      }
    } else {
      console.log('   ⚠️ No se encontró el campo de usuario. (Posible sesión ya activa)');
    }

    console.log('⏳ Esperando datos del API...');

    // Esperar la intercepción un minuto máximo.
    for (let i = 0; i < 60; i++) {
      if (extractedGrowthData) break;
      await page.waitForTimeout(1000);
    }

    if (!extractedGrowthData) {
      throw new Error("Timeout: No se logró iniciar sesión o interceptar el paquete de datos.");
    }

    console.log('✅ Sincronización Exitosa.');

    const outPath = process.env.OUT_FILE || path.join(__dirname, '..', 'full_growth_data.json');
    fs.writeFileSync(outPath, JSON.stringify(extractedGrowthData, null, 2), 'utf-8');

    if (!process.env.OUT_FILE) {
      // Mantenemos el progreso simplificado solo para retrocompatibilidad local si ejecutamos a mano
      const simpleOutPath = path.join(__dirname, '..', 'consultant_progress.json');
      const simpleResult = {
        timestamp: new Date().toISOString(),
        user: USERNAME,
        extractedLevel: extractedGrowthData.level?.description || 'NO_DETECTADO',
        accumulatedSales: 0,
        currentPoints: extractedGrowthData.nextLevelProgress?.currentValue || 0,
        note: "Extraido limpiamente desde API interna por bot silencioso."
      };
      fs.writeFileSync(simpleOutPath, JSON.stringify(simpleResult, null, 2), 'utf-8');
    }

    // ─── SINCRONIZACIÓN AUTOMÁTICA CON SUPABASE ───
    dotenv.config({ path: path.join(__dirname, '..', '.env') });
    const { PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

    if (PUBLIC_SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      console.log('☁️ Subiendo datos de crecimiento a Supabase...');
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      
      const { error } = await supabase
        .from('consultant_profiles')
        .update({
          latest_growth_data: extractedGrowthData,
          growth_sync_date: new Date().toISOString()
        })
        .eq('natura_email', USERNAME);
        
      if (error) {
        console.error('❌ Error guardando en Supabase:', error.message);
      } else {
        console.log('🚀 ¡El panel web de Flow Natura ha sido actualizado!');
      }
    } else {
      console.log('⚠️ Variables de entorno de Supabase no detectadas, se guardó solo localmente.');
    }

  } catch (err) {
    console.error('❌ Error de Auto-Sync:', err.message);
    // Tomar captura para debugear
    await page.screenshot({ path: path.join(__dirname, '..', 'auto_sync_error.png') });
    console.log('   📸 Screenshot de error guardado en auto_sync_error.png');
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
