import express from 'express';
import cors from 'cors';
import { chromium } from 'playwright';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const API_SECRET = process.env.SCRAPER_API_SECRET || 'dev-secret-key';

function authMiddleware(req, res, next) {
  const authHeader = req.headers['x-api-key'];
  if (authHeader !== API_SECRET) {
    return res.status(401).json({ success: false, error: 'No autorizado.' });
  }
  next();
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'natura-scraper' });
});

app.post('/scrape', authMiddleware, async (req, res) => {
  const { natura_email, natura_password } = req.body;

  if (!natura_email || !natura_password) {
    return res.status(400).json({ success: false, error: 'Faltan credenciales.' });
  }

  console.log(`🚀 Iniciando sync para: ${natura_email.substring(0, 5)}***`);

  let browser;
  try {
    console.log('🔄 Lanzando Chromium...');
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-http2',           // ← CLAVE: fuerza HTTP/1.1 para evadir detección WAF
        '--single-process',
        '--no-zygote',
        '--disable-blink-features=AutomationControlled'  // ocultar flag de automatización
      ]
    });
    console.log('✅ Chromium lanzado.');

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
      locale: 'es-MX',
      extraHTTPHeaders: {
        'Accept-Language': 'es-MX,es;q=0.8,en-US;q=0.5,en;q=0.3'
      }
    });
    console.log('✅ Contexto creado.');

    // Ocultar webdriver
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    const page = await context.newPage();
    page.setDefaultTimeout(45000);
    page.setDefaultNavigationTimeout(45000);
    console.log('✅ Página creada.');

    let extractedGrowthData = null;

    // Interceptar respuesta del API de growthplan
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('growthplan') || url.includes('growth-plan') || url.includes('consultantLevel')) {
        try {
          const body = await response.json();
          if (body?.data?.consultantLevel) {
            extractedGrowthData = body.data.consultantLevel;
            console.log('🎯 Payload de Crecimiento Interceptado!');
          } else if (body?.consultantLevel) {
            extractedGrowthData = body.consultantLevel;
            console.log('🎯 Payload de Crecimiento Interceptado (alt)!');
          }
        } catch {}
      }
    });

    // Navegar al login
    console.log('🌐 Navegando a Natura...');
    await page.goto('https://minegocio.natura-avon.com.mx/home', { 
      waitUntil: 'domcontentloaded',
      timeout: 45000 
    });
    console.log(`✅ Página cargada. URL: ${page.url().substring(0, 80)}...`);
    await page.waitForTimeout(3000);

    // --- PASO 1: Cambiar dropdown MUI a E-mail si es correo ---
    if (natura_email.includes('@')) {
      console.log('📧 Cambiando selector a E-mail...');
      const dropdown = page.locator('div[role="combobox"]').first();
      if (await dropdown.isVisible({ timeout: 8000 }).catch(() => false)) {
        await dropdown.click();
        await page.waitForTimeout(1500);
        const emailOption = page.locator('li[role="option"]', { hasText: 'E-mail' });
        if (await emailOption.isVisible({ timeout: 5000 }).catch(() => false)) {
          await emailOption.click();
          console.log('   ✅ Selector cambiado a E-mail.');
          await page.waitForTimeout(1500);
        } else {
          console.log('   ⚠️ Opción E-mail no encontrada.');
        }
      } else {
        console.log('   ⚠️ Dropdown no visible. Buscando alternativas...');
        // Intentar click en cualquier select visible
        const anySelect = page.locator('select, [role="listbox"]').first();
        if (await anySelect.isVisible({ timeout: 3000 }).catch(() => false)) {
          await anySelect.click();
          console.log('   → Encontrado select alternativo.');
        }
      }
    }

    // --- PASO 2: Llenar usuario ---
    console.log('✏️ Buscando campo de usuario...');
    const userField = page.locator('input[placeholder*="E-mail"], input[placeholder*="Consultora"], input[placeholder*="usuario"], input[type="email"], input[name="email"], input[name="username"]').first();
    if (await userField.isVisible({ timeout: 8000 }).catch(() => false)) {
      console.log('   ✅ Campo encontrado. Escribiendo...');
      await userField.fill(natura_email);
      await page.waitForTimeout(500);
    } else {
      // Buscar cualquier input de texto visible
      console.log('   ⚠️ Campo estándar no encontrado. Buscando cualquier input...');
      const inputs = page.locator('input[type="text"], input[type="email"], input:not([type="password"]):not([type="hidden"])');
      const count = await inputs.count();
      console.log(`   → ${count} inputs encontrados.`);
      if (count > 0) {
        await inputs.first().fill(natura_email);
        console.log('   ✅ Email escrito en primer input.');
      }
    }
    await page.waitForTimeout(500);

    // --- PASO 3: Llenar contraseña ---
    console.log('🔑 Buscando campo de contraseña...');
    const pwdField = page.locator('input[type="password"]').first();
    if (await pwdField.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('   ✅ Campo encontrado. Escribiendo...');
      await pwdField.fill(natura_password);
      await page.waitForTimeout(500);
    } else {
      console.log('   ❌ Campo de contraseña NO encontrado.');
    }

    // --- PASO 4: Click en login ---
    console.log('🖱️ Buscando botón de login...');
    const loginBtn = page.locator('button:has-text("INICIAR"), button:has-text("Iniciar"), button:has-text("Login"), button:has-text("Entrar"), button[type="submit"]').first();
    if (await loginBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('   ✅ Botón encontrado. Clickeando...');
      await loginBtn.click();
    } else {
      console.log('   ⚠️ Botón no visible, usando Enter...');
      await pwdField.press('Enter').catch(() => {});
    }
    
    console.log('⏳ Esperando navegación post-login...');
    await page.waitForTimeout(5000);
    console.log(`   URL actual: ${page.url().substring(0, 80)}...`);

    // --- PASO 5: Esperar datos ---
    console.log('⏳ Esperando datos del API de crecimiento...');
    for (let i = 0; i < 60; i++) {
      if (extractedGrowthData) break;
      await page.waitForTimeout(1000);
      if (i % 15 === 0 && i > 0) {
        console.log(`   ... ${i}s esperando. URL: ${page.url().substring(0, 60)}`);
      }
    }

    if (!extractedGrowthData) {
      const currentUrl = page.url();
      console.error(`❌ Timeout. URL final: ${currentUrl}`);
      throw new Error(`Timeout: datos no interceptados. URL: ${currentUrl}`);
    }

    console.log('✅ Sync exitoso!');
    res.json({ success: true, data: extractedGrowthData });

  } catch (err) {
    console.error('❌ Error:', err.message);
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
