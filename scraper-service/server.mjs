import express from 'express';
import cors from 'cors';
import { chromium } from 'playwright-core';

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
    // === PASO 1: Lanzar Chromium ultra-ligero ===
    console.log('🔄 Lanzando Chromium...');
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
        '--no-zygote',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--metrics-recording-only',
        '--no-first-run',
      ],
    });
    console.log('✅ Chromium lanzado.');

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
      locale: 'es-MX',
      timezoneId: 'America/Mexico_City',
    });
    const page = await context.newPage();

    // === PASO 2: Navegar al Cognito Hosted UI (NO pasa por Akamai) ===
    console.log('🌐 Navegando a Cognito Hosted UI...');
    const loginUrl = `${CONFIG.COGNITO_DOMAIN}/login?client_id=${CONFIG.CLIENT_ID}&response_type=code&scope=openid&redirect_uri=${encodeURIComponent(CONFIG.REDIRECT_URI)}`;

    await page.goto(loginUrl, { waitUntil: 'networkidle', timeout: 30000 });
    console.log(`✅ Página cargada: ${page.url().substring(0, 80)}`);

    // === PASO 3: Llenar formulario de login ===
    console.log('📧 Llenando formulario...');

    // Hay 2 tabs/forms en la página. El form de username/password puede estar oculto.
    // Primero intentar click en el tab "Sign in with your username and password"
    try {
      const tabClicked = await page.evaluate(() => {
        // Buscar links/tabs que activen el formulario de username/password
        const links = document.querySelectorAll('a, button, [role="tab"], .nav-link, [data-toggle]');
        for (const link of links) {
          const text = link.textContent?.toLowerCase() || '';
          const isTab = text.includes('sign in with your username') || text.includes('username and password');
          const isForgot = text.includes('forgot') || text.includes('reset');
          if (isTab && !isForgot) {
            link.click();
            return text.trim().substring(0, 50);
          }
        }
        // Buscar tab que contenga el form de username/password
        const tabs = document.querySelectorAll('.tab-pane, [role="tabpanel"]');
        for (const tab of tabs) {
          if (tab.querySelector('#signInFormUsername')) {
            tab.style.display = 'block';
            tab.classList.add('active', 'show');
            return 'tab activated manually';
          }
        }
        return null;
      });
      console.log(`   Tab switch: ${tabClicked || 'no tab needed'}`);
    } catch (e) {
      console.log(`   Tab switch: ${e.message?.substring(0, 50)}`);
    }

    // Esperar un momento para que el tab se muestre
    await page.waitForTimeout(500);

    // Llenar el formulario via JavaScript (bypass visibility checks)
    await page.evaluate(({ email, password }) => {
      // Buscar el formulario visible o el primero que tenga signInFormUsername
      const usernameInputs = document.querySelectorAll('#signInFormUsername, input[name="username"]');
      const passwordInputs = document.querySelectorAll('#signInFormPassword, input[name="password"]');
      
      // Llenar todos los inputs que coincidan (por si hay duplicados)
      usernameInputs.forEach(input => {
        input.value = email;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      passwordInputs.forEach(input => {
        input.value = password;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }, { email: natura_email, password: natura_password });

    console.log('   Username y password llenados ✅');

    // Verificar cognitoAsfData
    const asfData = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input[name="cognitoAsfData"]');
      return Array.from(inputs).map(i => i.value?.substring(0, 50) || 'VACÍO');
    });
    console.log(`   cognitoAsfData: ${JSON.stringify(asfData)}`);

    // === PASO 4: Submit via JavaScript ===
    console.log('🔐 Enviando login...');

    const [response] = await Promise.all([
      page.waitForNavigation({ waitUntil: 'commit', timeout: 30000 }),
      page.evaluate(() => {
        // Buscar el form que contiene signInFormUsername y hacer submit
        const forms = document.querySelectorAll('form');
        for (const form of forms) {
          if (form.querySelector('#signInFormUsername') || form.querySelector('input[name="username"]')) {
            // Intentar click en submit button
            const submitBtn = form.querySelector('input[type="submit"], button[type="submit"]');
            if (submitBtn) { submitBtn.click(); return; }
            // Fallback: submit directo
            form.submit();
            return;
          }
        }
      }),
    ]);

    const finalUrl = page.url();
    console.log(`   URL final: ${finalUrl.substring(0, 150)}`);

    // === PASO 2: Navegar al portal real de Natura ===
    console.log('🌐 Navegando a Mi Negocio Natura (para forzar redirect a Auth)...');
    
    // Configurar intercepción de la respuesta de la API de authenticator
    let authPromise = new Promise((resolve, reject) => {
      let timeoutId = setTimeout(() => reject(new Error('Timeout esperando token de API')), 45000);
      
      page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('authentication-api') && response.request().method() === 'POST') {
          try {
            const body = await response.json();
            if (body && body.data && body.data.id_token) {
              clearTimeout(timeoutId);
              console.log(`📡 ¡Interceptado token de la API! Status: ${response.status()}`);
              resolve(body.data);
            } else if (body && body.error) {
              console.log(`📡 Error de API interceptado: ${JSON.stringify(body)}`);
              // No rechazamos inmediatamente por si hay reintentos, pero lo loggeamos
            }
          } catch (e) {
            // Ignorar respuestas que no son JSON
          }
        }
      });
    });

    // Navegar a Mi Negocio (esto debería redirigir a natura-auth.prd.naturacloud.com o mostrar el login)
    await page.goto(CONFIG.NATURA_BASE, { waitUntil: 'networkidle', timeout: 30000 });
    console.log(`✅ Página cargada: ${page.url().substring(0, 80)}`);

    // === PASO 3: Esperar inputs y Llenar formulario ===
    console.log('📧 Esperando formulario de login Natura...');

    // Esperar al input de email/username o código de consultora (buscamos por selectores comunes)
    const usernameSelector = 'input[type="text"], input[name="username"], input[name="login"], input[id*="user"]';
    const passwordSelector = 'input[type="password"]';
    
    await page.waitForSelector(usernameSelector, { timeout: 15000 });
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
