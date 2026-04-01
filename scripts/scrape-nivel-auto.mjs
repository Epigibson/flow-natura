import { firefox } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Las variables de entorno NATURA_USER y NATURA_PASS ahora son inyectadas por el proceso padre (sync-natura.ts)

const LOGIN_URL = 'https://minegocio.natura-avon.com.mx/home';

const USERNAME = process.env.NATURA_USER || 'tucorreo@ejemplo.com';
const PASSWORD = process.env.NATURA_PASS || 'tucontraseña';

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
      } catch (err) {}
    }
  });

  try {
    console.log('🌐 Navegando a la página de Login...');
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });

    console.log('🤖 Tratando de auto-completar el Login...');
    
    // Esperar a que los inputs aparezcan (puede redirigir a GSP/Auth0)
    await page.waitForTimeout(3000);
    
    // Intentar ubicar el campo de correo (suele ser identifier, username, o type email)
    const emailField = page.locator('input[type="email"], input[name="identifier"], input[name="username"], input[id*="user"]').first();
    
    // Si lo encuentra, llenarlo
    if (await emailField.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('   Escribiendo email...');
      await emailField.fill(USERNAME);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000); // Esperar animación
      
      const pwdField = page.locator('input[type="password"], input[name="password"], input[id*="password"]').first();
      if (await pwdField.isVisible({ timeout: 5000 }).catch(() => false)) {
         console.log('   Escribiendo contraseña...');
         await pwdField.fill(PASSWORD);
         await page.keyboard.press('Enter');
      } else {
         console.log('   ⚠️ No se encontró el campo de contraseña.');
      }
    } else {
      console.log('   ⚠️ No se encontró el campo de correo directamente. (Posible sesión ya activa)');
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
