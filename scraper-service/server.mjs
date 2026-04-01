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
          if (text.includes('username') || text.includes('password') || text.includes('sign in with your user')) {
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

    // === Caso 1: Redirect exitoso a minegocio con code ===
    if (finalUrl.includes('code=') || finalUrl.includes(CONFIG.REDIRECT_URI)) {
      const urlObj = new URL(finalUrl);
      const code = urlObj.searchParams.get('code');

      if (code) {
        console.log(`\n🎫 ¡LOGIN EXITOSO! Code: ${code.substring(0, 20)}...`);

        // Cerrar browser antes de token exchange (liberar memoria)
        await browser.close();
        browser = null;

        // Intercambiar code por tokens
        console.log('🔄 Intercambiando code por tokens...');
        const tokenRes = await fetch(`${CONFIG.COGNITO_DOMAIN}/oauth2/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: CONFIG.CLIENT_ID,
            code,
            redirect_uri: CONFIG.REDIRECT_URI,
          }).toString(),
          signal: AbortSignal.timeout(15000),
        });

        const tokenText = await tokenRes.text();
        console.log(`   Token status: ${tokenRes.status}`);

        try {
          const tokenData = JSON.parse(tokenText);

          if (tokenData.access_token || tokenData.id_token) {
            console.log('✅ ¡TOKENS OBTENIDOS!');
            const token = tokenData.access_token || tokenData.id_token;

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
          }

          console.log(`   Token response: ${tokenText.substring(0, 300)}`);
        } catch (e) {
          console.log(`   Token parse error: ${e.message}`);
          console.log(`   Raw: ${tokenText.substring(0, 300)}`);
        }
      }
    }

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
