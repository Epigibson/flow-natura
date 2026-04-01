import express from 'express';
import cors from 'cors';
import { firefox } from 'playwright';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const API_SECRET = process.env.SCRAPER_API_SECRET || 'dev-secret-key';

// Middleware de autenticación simple
function authMiddleware(req, res, next) {
  const authHeader = req.headers['x-api-key'];
  if (authHeader !== API_SECRET) {
    return res.status(401).json({ success: false, error: 'No autorizado.' });
  }
  next();
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'natura-scraper' });
});

// Endpoint principal de scraping
app.post('/scrape', authMiddleware, async (req, res) => {
  const { natura_email, natura_password } = req.body;

  if (!natura_email || !natura_password) {
    return res.status(400).json({ success: false, error: 'Faltan credenciales.' });
  }

  console.log(`🚀 Iniciando scraping para: ${natura_email.substring(0, 5)}***`);

  let browser;
  try {
    console.log('🔄 Lanzando Firefox headless...');
    browser = await firefox.launch({ headless: true });
    console.log('✅ Firefox lanzado correctamente.');

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();
    page.setDefaultTimeout(45000);
    page.setDefaultNavigationTimeout(45000);

    let extractedGrowthData = null;

    // Interceptar respuesta del API de growthplan
    page.on('response', async (response) => {
      if (response.url().includes('growthplan')) {
        try {
          const body = await response.json();
          if (body?.data?.consultantLevel) {
            extractedGrowthData = body.data.consultantLevel;
            console.log('🎯 Payload de Crecimiento Interceptado!');
          }
        } catch (err) {}
      }
    });

    console.log('🌐 Navegando a login de Natura...');
    await page.goto('https://minegocio.natura-avon.com.mx/home', { waitUntil: 'domcontentloaded' });
    console.log('✅ Página de login cargada.');
    await page.waitForTimeout(3000);

    // --- PASO 1: Cambiar dropdown MUI a E-mail si es correo ---
    if (natura_email.includes('@')) {
      console.log('   📧 Cambiando selector a E-mail...');
      const dropdown = page.locator('div[role="combobox"]').first();
      if (await dropdown.isVisible({ timeout: 5000 }).catch(() => false)) {
        await dropdown.click();
        await page.waitForTimeout(1000);
        const emailOption = page.locator('li[role="option"]', { hasText: 'E-mail' });
        if (await emailOption.isVisible({ timeout: 3000 }).catch(() => false)) {
          await emailOption.click();
          console.log('   ✅ Selector cambiado a E-mail.');
          await page.waitForTimeout(1000);
        } else {
          console.log('   ⚠️ Opción E-mail no encontrada en dropdown.');
        }
      } else {
        console.log('   ⚠️ Dropdown combobox no visible.');
      }
    }

    // --- PASO 2: Llenar usuario ---
    console.log('   🔍 Buscando campo de usuario...');
    const userField = page.locator('input[placeholder*="E-mail"], input[placeholder*="Consultora"], input[type="email"], input[type="text"]').first();
    if (await userField.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('   ✏️ Escribiendo usuario...');
      await userField.fill(natura_email);
      await page.waitForTimeout(500);

      // --- PASO 3: Llenar contraseña ---
      const pwdField = page.locator('input[type="password"]').first();
      if (await pwdField.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log('   🔑 Escribiendo contraseña...');
        await pwdField.fill(natura_password);
        await page.waitForTimeout(500);

        // --- PASO 4: INICIAR SESIÓN ---
        console.log('   🖱️ Haciendo clic en INICIAR SESIÓN...');
        const loginBtn = page.locator('button', { hasText: 'INICIAR SESIÓN' });
        if (await loginBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await loginBtn.click();
          console.log('   ✅ Botón clickeado.');
        } else {
          console.log('   ⚠️ Botón no visible, usando Enter...');
          await pwdField.press('Enter');
        }
        await page.waitForTimeout(3000);
      } else {
        console.log('   ❌ Campo de contraseña NO encontrado.');
      }
    } else {
      console.log('   ❌ Campo de usuario NO encontrado.');
    }

    // --- PASO 5: Esperar intercepción de datos (máx 60s) ---
    console.log('⏳ Esperando datos del API de crecimiento...');
    for (let i = 0; i < 60; i++) {
      if (extractedGrowthData) break;
      await page.waitForTimeout(1000);
      if (i % 10 === 0 && i > 0) console.log(`   ... ${i}s esperando...`);
    }

    if (!extractedGrowthData) {
      // Capturar URL actual para debug
      const currentUrl = page.url();
      console.error(`❌ Timeout. URL actual: ${currentUrl}`);
      throw new Error(`Timeout: No se interceptaron datos. URL final: ${currentUrl}`);
    }

    console.log('✅ Scraping exitoso!');
    res.json({ success: true, data: extractedGrowthData });

  } catch (err) {
    console.error('❌ Error de scraping:', err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
      console.log('🔒 Browser cerrado.');
    }
  }
});

app.listen(PORT, () => {
  console.log(`🔧 Natura Scraper Service corriendo en puerto ${PORT}`);
});
