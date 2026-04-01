import express from 'express';
import cors from 'cors';
import { firefox } from 'playwright-core';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

const CONFIG = {
  COGNITO_DOMAIN: 'https://natura-global-prd.auth.us-east-1.amazoncognito.com',
  CLIENT_ID: '31ndsgochinbk61v3jk8dhsf2o',
  REDIRECT_URI: 'https://minegocio.natura-avon.com.mx/',
  NATURA_BASE: 'https://minegocio.natura-avon.com.mx',
};

function authMiddleware(req, res, next) {
  if (req.headers['x-api-key'] !== (process.env.SCRAPER_API_SECRET || 'dev-secret-key')) {
    return res.status(401).json({ success: false, error: 'No autorizado.' });
  }
  next();
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.post('/scrape', authMiddleware, async (req, res) => {
  const { natura_email, natura_password } = req.body;
  if (!natura_email || !natura_password) {
    return res.status(400).json({ success: false, error: 'Faltan credenciales.' });
  }

  console.log(`🚀 Sync para: ${natura_email.substring(0, 5)}***`);

  let browser = null;

  try {
    // === PASO 1: Lanzar Firefox ===
    console.log('🔄 Lanzando Firefox para evadir Akamai...');
    browser = await firefox.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
      ignoreHTTPSErrors: true
    });
    console.log('✅ Firefox lanzado.');

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
      locale: 'es-MX',
      timezoneId: 'America/Mexico_City',
      viewport: { width: 1280, height: 720 },
      hasTouch: false,
      isMobile: false
    });
    
    // Inyectar script para evadir webdriver
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    
    const page = await context.newPage();

    // === PASO 2: Navegar al portal Auth de Natura ===
    console.log('🌐 Navegando a Auth de Natura...');
    
    // Configurar intercepción de la respuesta de la API de authenticator
    let authTimeoutId;
    let authPromise = new Promise((resolve, reject) => {
      authTimeoutId = setTimeout(() => reject(new Error('Timeout esperando token de API')), 45000);
      
      page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('authentication-api') && response.request().method() === 'POST') {
          try {
            const body = await response.json();
            if (body && body.data && body.data.id_token) {
              clearTimeout(authTimeoutId);
              console.log(`📡 ¡Interceptado token de la API! Status: ${response.status()}`);
              resolve(body.data);
            } else if (body && body.error) {
              console.log(`📡 Error de API interceptado: ${JSON.stringify(body)}`);
              // No rechazamos inmediatamente por si hay reintentos, pero lo loggeamos
            }
          } catch (e) {
            // Ignorar respuestas que no son JSON o si se cortó rápido
          }
        }
      });
    });
    // Evitar Unhandled Rejection si ocurre un error en otra parte antes de await
    authPromise.catch(() => {});

    // Navegar directamente al auth frontend de Natura (menos bloqueos usualmente que minegocio)
    // NOTA: No usamos 'networkidle' porque Natura tiene trackers/analytics que NUNCA terminan de cargar
    const NATURA_AUTH_URL = 'https://natura-auth.prd.naturacloud.com/login';
    await page.goto(NATURA_AUTH_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log(`✅ Página cargada (DOM): ${page.url().substring(0, 80)}`);

    // === PASO 3: Esperar inputs y Llenar formulario ===
    console.log('📧 Esperando formulario de login Natura...');

    // Esperar al input de email/username o código de consultora
    const usernameSelector = 'input[type="text"], input[name="username"], input[name="login"], input[id*="user"]';
    const passwordSelector = 'input[type="password"]';
    
    // Le damos más tiempo al selector visual en lugar de la red
    await page.waitForSelector(usernameSelector, { timeout: 20000 });
    await page.waitForSelector(passwordSelector, { timeout: 5000 });
    
    // Click y rellenar
    // Como puede haber múltiples inputs, usamos el primero visible
    const txtInputs = await page.$$(usernameSelector);
    for (const input of txtInputs) {
      if (await input.isVisible()) {
        await input.fill(natura_email);
        break;
      }
    }

    const pwdInputs = await page.$$(passwordSelector);
    for (const input of pwdInputs) {
      if (await input.isVisible()) {
        await input.fill(natura_password);
        break;
      }
    }

    console.log('   Credenciales ingresadas ✅');

    // === PASO 4: Click en Submit ===
    console.log('🔐 Enviando login (click en botón)...');
    
    // Buscar el botón de submit o login. Buscamos button[type="submit"] o botones con texto "entrar", "ingresar", "login"
    const btnClicked = await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      for (const btn of btns) {
        const text = btn.textContent?.toLowerCase() || '';
        if (btn.type === 'submit' || text.includes('entrar') || text.includes('ingresar') || text.includes('login') || text.includes('sign in')) {
          btn.click();
          return text.trim().substring(0, 30);
        }
      }
      return null;
    });
    
    console.log(`   Botón clickeado: ${btnClicked || 'No encontrado, intentando Enter'}`);
    
    // Si no se encontró botón obvio, presionar Enter en el password
    if (!btnClicked) {
      await page.keyboard.press('Enter');
    }

    // === PASO 5: Esperar el token interceptado de la API ===
    console.log('⏳ Esperando respuesta de la API de autenticación...');
    
    let tokenData;
    try {
      tokenData = await authPromise;
    } catch (e) {
      // Si falla la promesa, tomar una foto del DOM para debuggear
      const pageText = await page.evaluate(() => document.body.innerText?.replace(/\s+/g, ' ').substring(0, 500));
      console.log(`   Timeout interceptando API. Texto en página: ${pageText}`);
      throw e;
    }

    console.log('✅ ¡TOKENS OBTENIDOS DESDE EL PORTAL REAL!');
    const token = tokenData.access_token || tokenData.id_token;

    // Cerrar browser antes de fetch final
    await browser.close();
    browser = null;

    // Obtener datos de crecimiento
    const growthData = await fetchGrowthData(token);
    return res.json({
      success: true,
      data: growthData || { message: 'Auth OK, growth data pendiente' },
      tokens: {
        access_token: tokenData.access_token ? '***' : undefined,
        id_token: tokenData.id_token ? '***' : undefined,
        expires_in: tokenData.expires_in,
      },
    });

    // === Caso 2: Login falló - sigue en Cognito ===
    if (finalUrl.includes(CONFIG.COGNITO_DOMAIN)) {
      // Buscar mensaje de error en la página
      const errorText = await page.$eval('.errorMessage, .error, [id*="error"], .alert-danger', 
        el => el.textContent?.trim()
      ).catch(() => null);

      if (errorText) {
        console.log(`   ❌ Error de Cognito: "${errorText}"`);
        throw new Error(`Cognito: ${errorText}`);
      }

      // Si no hay error visible, tomar screenshot del estado
      const pageText = await page.evaluate(() => document.body.innerText?.substring(0, 500));
      console.log(`   Page text: ${pageText?.substring(0, 300)}`);

      throw new Error('Login no completado. Cognito no devolvió code.');
    }

    // === Caso 3: Redirigió a Natura (sesión activa) ===
    console.log(`   Redirigió a: ${finalUrl}`);
    throw new Error('Redirect inesperado.');

  } catch (err) {
    console.error('❌', err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
      console.log('🔒 Browser cerrado.');
    }
  }
});

async function fetchGrowthData(token) {
  console.log('\n📊 Obteniendo datos de crecimiento...');

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const urls = [
    `${CONFIG.NATURA_BASE}/api/growthplan`,
    `${CONFIG.NATURA_BASE}/bff/growthplan`,
  ];

  for (const url of urls) {
    try {
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
      const ct = r.headers.get('content-type') || '';
      if (ct.includes('json')) {
        const d = await r.json();
        console.log(`   ${url} → ${r.status}: ${JSON.stringify(d).substring(0, 300)}`);
        if (d?.data) return d.data;
      } else {
        console.log(`   ${url} → ${r.status} (${ct})`);
      }
    } catch (e) {
      console.log(`   → ${e.message?.substring(0, 50)}`);
    }
  }
  return null;
}

app.listen(PORT, () => console.log(`🔧 Natura Scraper en puerto ${PORT}`));
