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
    browser = await firefox.launch({ headless: true });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    page.setDefaultNavigationTimeout(60000);

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
        }
      }
    }

    // --- PASO 2: Llenar usuario ---
    const userField = page.locator('input[placeholder*="E-mail"], input[placeholder*="Consultora"], input[type="email"], input[type="text"]').first();
    if (await userField.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('   Escribiendo usuario...');
      await userField.fill(natura_email);
      await page.waitForTimeout(500);

      // --- PASO 3: Llenar contraseña ---
      const pwdField = page.locator('input[type="password"]').first();
      if (await pwdField.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log('   Escribiendo contraseña...');
        await pwdField.fill(natura_password);
        await page.waitForTimeout(500);

        // --- PASO 4: INICIAR SESIÓN ---
        console.log('   Haciendo clic en INICIAR SESIÓN...');
        const loginBtn = page.locator('button', { hasText: 'INICIAR SESIÓN' });
        if (await loginBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await loginBtn.click();
        } else {
          await pwdField.press('Enter');
        }
        await page.waitForTimeout(3000);
      }
    }

    // --- PASO 5: Esperar intercepción de datos ---
    console.log('⏳ Esperando datos del API...');
    for (let i = 0; i < 90; i++) {
      if (extractedGrowthData) break;
      await page.waitForTimeout(1000);
    }

    if (!extractedGrowthData) {
      throw new Error('Timeout: No se logró interceptar los datos de crecimiento.');
    }

    console.log('✅ Scraping exitoso!');
    res.json({ success: true, data: extractedGrowthData });

  } catch (err) {
    console.error('❌ Error de scraping:', err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => {
  console.log(`🔧 Natura Scraper Service corriendo en puerto ${PORT}`);
});
