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

// URLs a intentar en orden de preferencia
const TARGET_URLS = [
  'https://minegocio.natura-avon.com.mx/',          // Portal principal → redirige a auth
  'https://natura-auth.prd.naturacloud.com/login',   // Auth frontend directo
];

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
    // === PASO 1: Lanzar Firefox (SIN args de Chrome) ===
    console.log('🔄 Lanzando Firefox...');
    browser = await firefox.launch({
      headless: true,
      // Firefox NO acepta args de Chrome como --no-sandbox
      // En la imagen oficial de Playwright ya viene configurado correctamente
    });
    console.log('✅ Firefox lanzado.');

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
      locale: 'es-MX',
      timezoneId: 'America/Mexico_City',
      viewport: { width: 1280, height: 720 },
      ignoreHTTPSErrors: true,
    });

    // Evadir detección de webdriver
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    const page = await context.newPage();

    // === PASO 2: Intentar navegar a cada URL ===
    console.log('🌐 Intentando navegar...');

    let navigated = false;
    for (const url of TARGET_URLS) {
      try {
        console.log(`   → Probando: ${url.substring(0, 60)}...`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        console.log(`   ✅ Navegación exitosa: ${page.url().substring(0, 80)}`);
        navigated = true;
        break;
      } catch (navErr) {
        console.log(`   ❌ Falló: ${navErr.message.substring(0, 80)}`);
        // Continuar con la siguiente URL
      }
    }

    if (!navigated) {
      throw new Error('No se pudo navegar a ninguna URL de Natura. Todas bloqueadas.');
    }

    // Capturar URL actual para diagnóstico (puede haber redirigido)
    const currentUrl = page.url();
    console.log(`📍 URL actual después de redirects: ${currentUrl.substring(0, 100)}`);

    // Configurar intercepción de la respuesta de la API de authenticator
    let authTimeoutId;
    let authPromise = new Promise((resolve, reject) => {
      authTimeoutId = setTimeout(() => reject(new Error('Timeout esperando token de API')), 60000);

      page.on('response', async (response) => {
        const url = response.url();
        // Interceptar cualquier respuesta que parezca de autenticación
        const isAuthApi = url.includes('authentication-api') && response.request().method() === 'POST';
        const isTokenEndpoint = url.includes('/oauth2/token') && response.request().method() === 'POST';

        if (isAuthApi || isTokenEndpoint) {
          try {
            const body = await response.json();
            console.log(`📡 Interceptada respuesta de: ${url.substring(0, 80)}`);
            console.log(`   Status: ${response.status()}, Keys: ${Object.keys(body).join(', ')}`);

            // Caso 1: authentication-api de Natura devuelve { data: { id_token, ... } }
            if (body?.data?.id_token) {
              clearTimeout(authTimeoutId);
              console.log('📡 ¡Token interceptado desde authentication-api!');
              resolve(body.data);
              return;
            }
            // Caso 2: OAuth2 token endpoint devuelve { id_token, access_token, ... }
            if (body?.id_token) {
              clearTimeout(authTimeoutId);
              console.log('📡 ¡Token interceptado desde OAuth2 token endpoint!');
              resolve(body);
              return;
            }
            // Caso 3: Error
            if (body?.error) {
              console.log(`📡 Error interceptado: ${JSON.stringify(body).substring(0, 200)}`);
            }
          } catch (e) {
            // No es JSON, ignorar
          }
        }
      });
    });
    authPromise.catch(() => {}); // Prevenir unhandled rejection

    // === PASO 3: Buscar y llenar formulario de login ===
    console.log('📧 Buscando formulario de login...');

    // Esperar a que aparezca algún input (cubrir tanto Natura auth como Cognito Hosted UI)
    const usernameSelectors = [
      'input[name="username"]',
      'input[name="login"]',
      'input[id*="user"]',
      'input[id*="email"]',
      'input[type="email"]',
      'input[type="text"]',
    ];
    const passwordSelector = 'input[type="password"]';

    // Esperar al menos un input de texto visible
    let usernameInput = null;
    for (const sel of usernameSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 3000, state: 'visible' });
        usernameInput = await page.$(sel);
        if (usernameInput) {
          console.log(`   ✅ Input encontrado: ${sel}`);
          break;
        }
      } catch {
        // Probar siguiente selector
      }
    }

    if (!usernameInput) {
      // Diagnóstico: qué hay en la página?
      const bodyText = await page.evaluate(() => document.body?.innerText?.replace(/\s+/g, ' ').substring(0, 500));
      const bodyHTML = await page.evaluate(() => document.body?.innerHTML?.substring(0, 500));
      console.log(`   ❌ No se encontró input de usuario`);
      console.log(`   Texto visible: ${bodyText}`);
      console.log(`   HTML (500 chars): ${bodyHTML}`);
      throw new Error('No se encontró formulario de login en la página.');
    }

    // Esperar password input
    await page.waitForSelector(passwordSelector, { timeout: 5000, state: 'visible' });

    // Llenar credenciales
    await usernameInput.fill(natura_email);
    const pwdInput = await page.$(passwordSelector);
    await pwdInput.fill(natura_password);
    console.log('   Credenciales ingresadas ✅');

    // === PASO 4: Click en Submit ===
    console.log('🔐 Enviando login...');

    // Buscar botón de submit
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Entrar")',
      'button:has-text("Ingresar")',
      'button:has-text("Login")',
      'button:has-text("Sign in")',
    ];

    let submitted = false;
    for (const sel of submitSelectors) {
      try {
        const btn = await page.$(sel);
        if (btn && await btn.isVisible()) {
          await btn.click();
          console.log(`   ✅ Botón clickeado: ${sel}`);
          submitted = true;
          break;
        }
      } catch {
        // Siguiente
      }
    }

    if (!submitted) {
      // Fallback: buscar por texto del botón
      const btnClicked = await page.evaluate(() => {
        const btns = document.querySelectorAll('button, input[type="submit"]');
        for (const btn of btns) {
          const text = (btn.textContent || btn.value || '').toLowerCase();
          if (text.includes('entrar') || text.includes('ingresar') || text.includes('login') || text.includes('sign in') || btn.type === 'submit') {
            btn.click();
            return text.trim().substring(0, 30);
          }
        }
        return null;
      });

      if (btnClicked) {
        console.log(`   ✅ Botón clickeado (por texto): "${btnClicked}"`);
        submitted = true;
      } else {
        console.log('   ⚠️ No se encontró botón, presionando Enter...');
        await page.keyboard.press('Enter');
        submitted = true;
      }
    }

    // === PASO 5: Esperar el token interceptado ===
    console.log('⏳ Esperando respuesta de autenticación (hasta 60s)...');

    let tokenData;
    try {
      tokenData = await authPromise;
    } catch (e) {
      // Diagnóstico final
      const finalUrl = page.url();
      const pageText = await page.evaluate(() => document.body?.innerText?.replace(/\s+/g, ' ').substring(0, 500));
      console.log(`   URL final: ${finalUrl}`);
      console.log(`   Texto en página: ${pageText}`);
      throw new Error(`No se pudo obtener token. ${e.message}. URL: ${finalUrl.substring(0, 80)}`);
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
