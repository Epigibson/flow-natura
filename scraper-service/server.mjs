import express from 'express';
import cors from 'cors';
import vm from 'vm';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

const CONFIG = {
  COGNITO_DOMAIN: 'https://natura-global-prd.auth.us-east-1.amazoncognito.com',
  CLIENT_ID: '31ndsgochinbk61v3jk8dhsf2o',
  REDIRECT_URI: 'https://minegocio.natura-avon.com.mx/',
  NATURA_BASE: 'https://minegocio.natura-avon.com.mx',
  ASF_SCRIPT_URL: 'https://d3oia8etllorh5.cloudfront.net/20240614193835/js/amazon-cognito-advanced-security-data.min.js',
};

function extractCookies(response) {
  const cookies = [];
  try {
    const multi = response.headers.getSetCookie?.() || [];
    for (const c of multi) {
      const kv = c.split(';')[0].trim();
      if (kv.includes('=')) cookies.push(kv);
    }
  } catch {}
  if (cookies.length === 0) {
    const raw = response.headers.get('set-cookie') || '';
    if (raw) {
      // Parse carefully
      raw.split(/,(?=[A-Za-z])/).forEach(part => {
        const kv = part.split(';')[0].trim();
        if (kv.includes('=')) cookies.push(kv);
      });
    }
  }
  return cookies;
}

function authMiddleware(req, res, next) {
  if (req.headers['x-api-key'] !== (process.env.SCRAPER_API_SECRET || 'dev-secret-key')) {
    return res.status(401).json({ success: false, error: 'No autorizado.' });
  }
  next();
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));

/**
 * Genera cognitoAsfData simulando un entorno de browser mínimo
 * para ejecutar el script de Amazon Cognito ASF
 */
async function generateAsfData(userPoolId) {
  console.log('🔐 Generando cognitoAsfData...');
  
  try {
    // Descargar el script ASF de Amazon
    const asfRes = await fetch(CONFIG.ASF_SCRIPT_URL, { signal: AbortSignal.timeout(10000) });
    const asfScript = await asfRes.text();
    console.log(`   ASF script: ${asfScript.length} bytes`);

    // Crear un entorno de browser simulado
    const browserEnv = {
      window: {
        addEventListener: () => {},
        removeEventListener: () => {},
        location: { href: `${CONFIG.COGNITO_DOMAIN}/login`, hostname: 'natura-global-prd.auth.us-east-1.amazoncognito.com', protocol: 'https:' },
        navigator: {
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
          language: 'es-MX',
          languages: ['es-MX', 'es'],
          platform: 'Win32',
          hardwareConcurrency: 8,
          maxTouchPoints: 0,
          cookieEnabled: true,
          plugins: [],
          mimeTypes: [],
        },
        screen: { width: 1920, height: 1080, colorDepth: 24 },
        devicePixelRatio: 1,
        innerWidth: 1920,
        innerHeight: 1080,
        crypto: { getRandomValues: (arr) => { for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256); return arr; } },
        setTimeout: (fn) => { try { fn(); } catch {} },
        setInterval: () => {},
        clearTimeout: () => {},
        clearInterval: () => {},
        performance: { now: () => Date.now(), timing: { navigationStart: Date.now() } },
        history: { length: 1 },
        atob: (str) => Buffer.from(str, 'base64').toString('binary'),
        btoa: (str) => Buffer.from(str, 'binary').toString('base64'),
      },
      document: {
        createElement: (tag) => ({
          tagName: tag.toUpperCase(),
          style: {},
          getContext: () => ({
            fillText: () => {},
            measureText: () => ({ width: 100 }),
            canvas: { toDataURL: () => 'data:image/png;base64,fake' },
          }),
          toDataURL: () => 'data:image/png;base64,fake',
          setAttribute: () => {},
          appendChild: () => {},
          width: 200, height: 200,
        }),
        documentElement: { style: {} },
        cookie: '',
        addEventListener: () => {},
        getElementsByTagName: () => [],
        getElementById: () => null,
        querySelector: () => null,
        body: { appendChild: () => {} },
      },
      navigator: {},
      screen: {},
      self: {},
      console: { log: () => {}, error: () => {}, warn: () => {} },
      XMLHttpRequest: function() {
        this.open = () => {};
        this.send = () => {};
        this.setRequestHeader = () => {};
      },
    };

    // Aliases
    browserEnv.navigator = browserEnv.window.navigator;
    browserEnv.screen = browserEnv.window.screen;
    browserEnv.self = browserEnv.window;
    browserEnv.top = browserEnv.window;
    browserEnv.parent = browserEnv.window;
    browserEnv.frames = browserEnv.window;
    browserEnv.globalThis = browserEnv.window;

    // Ejecutar el script en sandbox
    const context = vm.createContext(browserEnv);
    
    try {
      vm.runInContext(asfScript, context, { timeout: 5000 });
    } catch (e) {
      console.log(`   ASF script execution: ${e.message?.substring(0, 80)}`);
    }

    // Intentar obtener los datos
    let asfData = '';
    
    // El script generalmente expone AmazonCognitoAdvancedSecurityData
    if (context.AmazonCognitoAdvancedSecurityData) {
      console.log('   ✅ AmazonCognitoAdvancedSecurityData disponible!');
      try {
        asfData = context.AmazonCognitoAdvancedSecurityData.getData(
          natura_email || 'user', 
          userPoolId || 'us-east-1_dummy',
          CONFIG.CLIENT_ID
        );
        console.log(`   ASF data generated: ${asfData?.substring(0, 50)}...`);
      } catch (e) {
        console.log(`   getData error: ${e.message?.substring(0, 80)}`);
      }
    }

    // Verificar en window también
    if (!asfData && context.window?.AmazonCognitoAdvancedSecurityData) {
      try {
        asfData = context.window.AmazonCognitoAdvancedSecurityData.getData('user', 'us-east-1_dummy', CONFIG.CLIENT_ID);
        console.log(`   ASF data (from window): ${asfData?.substring(0, 50)}...`);
      } catch (e) {
        console.log(`   window.getData error: ${e.message}`);
      }
    }

    if (asfData) return asfData;

    // Fallback: generar datos mínimos manualmente
    console.log('   ⚠️ Generando ASF data manual...');
    const deviceData = {
      payload: {
        contextData: {
          UserAgent: browserEnv.window.navigator.userAgent,
          DeviceId: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36)}`,
          DeviceLanguage: 'es-MX',
          DeviceFingerprint: `mozilla/5.0_${Date.now()}`,
          DevicePlatform: 'Windows',
          ClientTimezone: '-06:00',
          ThirdPartyTracking: 'false',
          ScreenHeight: '1080',
          ScreenWidth: '1920',
          ColorDepth: '24',
        },
        username: '',
        userPoolId: '',
        signInMethod: 'PASSWORD',
      }
    };
    return Buffer.from(JSON.stringify(deviceData)).toString('base64');

  } catch (e) {
    console.log(`   ASF generation failed: ${e.message}`);
    return '';
  }
}

app.post('/scrape', authMiddleware, async (req, res) => {
  const { natura_email, natura_password } = req.body;
  if (!natura_email || !natura_password) {
    return res.status(400).json({ success: false, error: 'Faltan credenciales.' });
  }

  console.log(`🚀 Sync para: ${natura_email.substring(0, 5)}***`);

  try {
    const baseHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-MX,es;q=0.9',
    };

    // === PASO 1: Generar ASF Data ===
    const asfData = await generateAsfData();

    // === PASO 2: Obtener formulario ===
    console.log('\n📋 Paso 2: Obteniendo formulario de login...');
    const loginPageUrl = `${CONFIG.COGNITO_DOMAIN}/login?client_id=${CONFIG.CLIENT_ID}&response_type=code&scope=openid&redirect_uri=${encodeURIComponent(CONFIG.REDIRECT_URI)}`;
    
    const loginPageRes = await fetch(loginPageUrl, {
      headers: baseHeaders,
      redirect: 'follow',
      signal: AbortSignal.timeout(15000)
    });

    const loginHtml = await loginPageRes.text();
    const cookies = extractCookies(loginPageRes);
    const cookieStr = cookies.join('; ');
    console.log(`   Cookies: ${cookieStr.substring(0, 100)}`);

    const formAction = loginHtml.match(/form[^>]*action="([^"]+)"/i)?.[1];
    if (!formAction) throw new Error('Form no encontrado');

    // Hidden inputs
    const hiddens = {};
    let m;
    const hRegex = /<input[^>]*type=['"]hidden['"][^>]*>/gi;
    while ((m = hRegex.exec(loginHtml)) !== null) {
      const name = m[0].match(/name=['"]([^'"]+)['"]/)?.[1];
      const value = m[0].match(/value=['"]([^'"]*)['"]/)?.[1];
      if (name) hiddens[name] = value || '';
    }

    // Inyectar nuestro ASF data
    if (asfData) {
      hiddens['cognitoAsfData'] = asfData;
      console.log(`   cognitoAsfData: ${asfData.substring(0, 50)}...`);
    }

    // === PASO 3: Enviar credenciales ===
    console.log('\n📧 Paso 3: Enviando credenciales...');
    let postUrl = formAction.startsWith('http') ? formAction : `${CONFIG.COGNITO_DOMAIN}${formAction}`;
    postUrl = postUrl.replace(/&amp;/g, '&');

    const formBody = new URLSearchParams();
    for (const [k, v] of Object.entries(hiddens)) formBody.append(k, v);
    formBody.append('username', natura_email);
    formBody.append('password', natura_password);

    const authRes = await fetch(postUrl, {
      method: 'POST',
      headers: {
        ...baseHeaders,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookieStr,
        'Origin': CONFIG.COGNITO_DOMAIN,
        'Referer': loginPageUrl,
      },
      body: formBody.toString(),
      redirect: 'manual',
      signal: AbortSignal.timeout(15000)
    });

    const location = authRes.headers.get('location') || '';
    const authCookies = extractCookies(authRes);
    console.log(`   Status: ${authRes.status}`);
    console.log(`   Location: ${location.substring(0, 150)}`);
    console.log(`   New cookies: ${authCookies.length} → ${authCookies.join(', ').substring(0, 100)}`);

    // LOGIN EXITOSO - redirect con code
    if (location.includes('code=')) {
      console.log('\n🎫 ¡LOGIN EXITOSO!');
      const code = new URL(location).searchParams.get('code');
      
      const tokenRes = await fetch(`${CONFIG.COGNITO_DOMAIN}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: CONFIG.CLIENT_ID,
          code,
          redirect_uri: CONFIG.REDIRECT_URI
        }).toString(),
        signal: AbortSignal.timeout(15000)
      });

      const tokenData = await tokenRes.json().catch(() => ({}));
      console.log(`   Token status: ${tokenRes.status}`);
      
      if (tokenData.access_token || tokenData.id_token) {
        console.log('   ✅ ¡TOKENS OBTENIDOS!');
        const growthData = await fetchGrowthData(tokenData.access_token || tokenData.id_token, baseHeaders);
        return res.json({ success: true, data: growthData || tokenData });
      }
      console.log(`   Token resp: ${JSON.stringify(tokenData).substring(0, 300)}`);
    }

    // LOGIN FALLIDO - redirect a login page
    if (authRes.status === 302 && location.includes('/login')) {
      console.log('\n🔄 Login fallido. Analizando...');
      
      const allCookies = [...cookies, ...authCookies].join('; ');
      const errRes = await fetch(location, {
        headers: { ...baseHeaders, Cookie: allCookies },
        signal: AbortSignal.timeout(10000)
      });
      const errHtml = await errRes.text();
      
      // Extraer todo el texto visible
      const text = errHtml.replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Buscar diferencias con el login original (error messages)
      const originalText = loginHtml.replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Encontrar texto nuevo que no estaba en la página original
      if (text !== originalText) {
        // Buscar la diferencia
        const newParts = text.split(' ').filter(w => !originalText.includes(w));
        if (newParts.length > 0) {
          console.log(`   ❌ Nuevo texto (error): ${newParts.join(' ').substring(0, 200)}`);
        }
      }
      console.log(`   Page text: ${text.substring(0, 300)}`);
    }

    throw new Error('Login no completado.');

  } catch (err) {
    console.error('❌', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

async function fetchGrowthData(token, baseHeaders) {
  console.log('\n📊 Obteniendo datos...');
  const urls = [`${CONFIG.NATURA_BASE}/api/growthplan`, `${CONFIG.NATURA_BASE}/bff/growthplan`];
  for (const url of urls) {
    try {
      const r = await fetch(url, {
        headers: { ...baseHeaders, Accept: 'application/json', Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000)
      });
      const ct = r.headers.get('content-type') || '';
      if (ct.includes('json')) {
        const d = await r.json();
        console.log(`   ${url} → ${r.status}: ${JSON.stringify(d).substring(0, 300)}`);
        if (d?.data) return d.data;
      }
    } catch (e) { console.log(`   → ${e.message?.substring(0, 50)}`); }
  }
  return null;
}

app.listen(PORT, () => console.log(`🔧 Natura Scraper en puerto ${PORT}`));
