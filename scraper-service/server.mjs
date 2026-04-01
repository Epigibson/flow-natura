import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const API_SECRET = process.env.SCRAPER_API_SECRET || 'dev-secret-key';

// Middleware de autenticación
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

/**
 * Estrategia: Llamar directamente al API de Natura sin navegador.
 * 1. Hacer login via POST al endpoint de auth de Natura
 * 2. Obtener token/cookies de sesión
 * 3. Llamar al API de growthplan con esas credenciales
 */
app.post('/scrape', authMiddleware, async (req, res) => {
  const { natura_email, natura_password } = req.body;

  if (!natura_email || !natura_password) {
    return res.status(400).json({ success: false, error: 'Faltan credenciales.' });
  }

  console.log(`🚀 Iniciando sync para: ${natura_email.substring(0, 5)}***`);

  try {
    // === PASO 1: Obtener la página de login para extraer cookies/tokens iniciales ===
    console.log('🔑 Paso 1: Obteniendo página de login...');
    const loginPageRes = await fetch('https://minegocio.natura-avon.com.mx/home', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-MX,es;q=0.8,en-US;q=0.5,en;q=0.3',
      },
      redirect: 'follow'
    });
    
    console.log(`   Status: ${loginPageRes.status}, URL final: ${loginPageRes.url}`);
    
    // Extraer cookies de la respuesta
    const setCookies = loginPageRes.headers.getSetCookie?.() || [];
    const cookieString = setCookies.map(c => c.split(';')[0]).join('; ');
    console.log(`   Cookies obtenidas: ${setCookies.length}`);

    // === PASO 2: Intentar login via API ===
    console.log('🔑 Paso 2: Intentando login via API...');
    
    // Probar endpoints comunes de Natura
    const loginEndpoints = [
      'https://minegocio.natura-avon.com.mx/api/auth/login',
      'https://minegocio.natura-avon.com.mx/api/login',
      'https://minegocio.natura-avon.com.mx/auth/login',
      'https://api-minegocio.natura-avon.com.mx/api/auth/login',
    ];

    let authToken = null;
    let authCookies = cookieString;
    let loginSuccess = false;

    for (const endpoint of loginEndpoints) {
      try {
        console.log(`   Probando: ${endpoint}`);
        const loginRes = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
            'Origin': 'https://minegocio.natura-avon.com.mx',
            'Referer': 'https://minegocio.natura-avon.com.mx/home',
            'Cookie': cookieString
          },
          body: JSON.stringify({
            email: natura_email,
            password: natura_password,
            username: natura_email,
            login: natura_email
          })
        });

        console.log(`   → Status: ${loginRes.status}`);
        
        if (loginRes.ok) {
          const loginData = await loginRes.json().catch(() => null);
          console.log(`   → Respuesta: ${JSON.stringify(loginData)?.substring(0, 200)}`);
          
          if (loginData?.token || loginData?.access_token || loginData?.data?.token) {
            authToken = loginData.token || loginData.access_token || loginData.data?.token;
            loginSuccess = true;
            console.log('   ✅ Login exitoso con token!');
            break;
          }

          // Recoger cookies del login
          const loginCookies = loginRes.headers.getSetCookie?.() || [];
          if (loginCookies.length > 0) {
            authCookies = [...setCookies, ...loginCookies].map(c => c.split(';')[0]).join('; ');
            loginSuccess = true;
            console.log('   ✅ Login exitoso con cookies!');
            break;
          }
        }
      } catch (e) {
        console.log(`   → Error: ${e.message}`);
      }
    }

    // === PASO 2b: Si no encontramos API directa, usar Playwright como fallback ===
    if (!loginSuccess) {
      console.log('⚠️ No se encontró API directa. Usando Playwright fallback...');
      const growthData = await playwrightFallback(natura_email, natura_password);
      if (growthData) {
        return res.json({ success: true, data: growthData });
      }
      throw new Error('No se pudo autenticar con ningún método.');
    }

    // === PASO 3: Llamar al API de growthplan ===
    console.log('📊 Paso 3: Obteniendo datos de crecimiento...');
    
    const growthEndpoints = [
      'https://minegocio.natura-avon.com.mx/api/growthplan',
      'https://api-minegocio.natura-avon.com.mx/api/growthplan',
      'https://minegocio.natura-avon.com.mx/api/consultant/growthplan',
    ];

    const authHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
      'Accept': 'application/json',
      'Origin': 'https://minegocio.natura-avon.com.mx',
      'Referer': 'https://minegocio.natura-avon.com.mx/home',
      'Cookie': authCookies,
      ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
    };

    for (const endpoint of growthEndpoints) {
      try {
        console.log(`   Probando: ${endpoint}`);
        const growthRes = await fetch(endpoint, { headers: authHeaders });
        console.log(`   → Status: ${growthRes.status}`);
        
        if (growthRes.ok) {
          const growthData = await growthRes.json();
          if (growthData?.data?.consultantLevel) {
            console.log('✅ Datos de crecimiento obtenidos!');
            return res.json({ success: true, data: growthData.data.consultantLevel });
          }
          console.log(`   → Data: ${JSON.stringify(growthData)?.substring(0, 200)}`);
        }
      } catch (e) {
        console.log(`   → Error: ${e.message}`);
      }
    }

    throw new Error('No se pudieron obtener los datos de crecimiento.');

  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Fallback: Usa Playwright solo si el API directo no funciona.
 * Intenta importar Playwright dinámicamente.
 */
async function playwrightFallback(email, password) {
  try {
    const { firefox } = await import('playwright');
    console.log('🦊 Lanzando Firefox (fallback)...');
    
    const browser = await firefox.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0'
    });
    const page = await context.newPage();
    page.setDefaultTimeout(45000);

    let extractedData = null;

    page.on('response', async (response) => {
      if (response.url().includes('growthplan')) {
        try {
          const body = await response.json();
          if (body?.data?.consultantLevel) {
            extractedData = body.data.consultantLevel;
            console.log('🎯 Datos interceptados!');
          }
        } catch {}
      }
    });

    await page.goto('https://minegocio.natura-avon.com.mx/home', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Login flow
    if (email.includes('@')) {
      const dropdown = page.locator('div[role="combobox"]').first();
      if (await dropdown.isVisible({ timeout: 5000 }).catch(() => false)) {
        await dropdown.click();
        await page.waitForTimeout(1000);
        const emailOpt = page.locator('li[role="option"]', { hasText: 'E-mail' });
        if (await emailOpt.isVisible({ timeout: 3000 }).catch(() => false)) {
          await emailOpt.click();
          await page.waitForTimeout(1000);
        }
      }
    }

    const userField = page.locator('input[placeholder*="E-mail"], input[placeholder*="Consultora"], input[type="email"], input[type="text"]').first();
    if (await userField.isVisible({ timeout: 5000 }).catch(() => false)) {
      await userField.fill(email);
      await page.waitForTimeout(500);
      const pwdField = page.locator('input[type="password"]').first();
      if (await pwdField.isVisible({ timeout: 5000 }).catch(() => false)) {
        await pwdField.fill(password);
        await page.waitForTimeout(500);
        const loginBtn = page.locator('button', { hasText: 'INICIAR SESIÓN' });
        if (await loginBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await loginBtn.click();
        } else {
          await pwdField.press('Enter');
        }
        await page.waitForTimeout(3000);
      }
    }

    for (let i = 0; i < 60; i++) {
      if (extractedData) break;
      await page.waitForTimeout(1000);
    }

    await browser.close();
    return extractedData;
  } catch (err) {
    console.error('❌ Playwright fallback error:', err.message);
    return null;
  }
}

app.listen(PORT, () => {
  console.log(`🔧 Natura Scraper Service corriendo en puerto ${PORT}`);
});
