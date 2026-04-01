import express from 'express';
import cors from 'cors';

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

/** Extrae cookies del header set-cookie de forma robusta */
function extractCookies(response) {
  const cookies = [];
  const raw = response.headers.get('set-cookie');
  if (raw) {
    // set-cookie puede tener múltiples valores separados por comas
    // pero cuidado con expires que también usa comas
    const parts = raw.split(/,(?=[^ ])/);
    for (const part of parts) {
      const kv = part.split(';')[0].trim();
      if (kv.includes('=')) cookies.push(kv);
    }
  }
  // También intentar getSetCookie si existe
  try {
    const multi = response.headers.getSetCookie?.() || [];
    for (const c of multi) {
      const kv = c.split(';')[0].trim();
      if (kv.includes('=') && !cookies.some(x => x.startsWith(kv.split('=')[0]))) {
        cookies.push(kv);
      }
    }
  } catch {}
  return cookies;
}

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

  try {
    const baseHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-MX,es;q=0.9',
    };

    // === PASO 1: Obtener formulario de login ===
    console.log('📋 Paso 1: Obteniendo formulario de login...');
    
    const loginPageUrl = `${CONFIG.COGNITO_DOMAIN}/login?client_id=${CONFIG.CLIENT_ID}&response_type=code&scope=openid&redirect_uri=${encodeURIComponent(CONFIG.REDIRECT_URI)}`;
    
    const loginPageRes = await fetch(loginPageUrl, {
      headers: baseHeaders,
      redirect: 'follow',
      signal: AbortSignal.timeout(15000)
    });

    console.log(`   Status: ${loginPageRes.status}`);
    const loginHtml = await loginPageRes.text();

    // Cookies
    const cookies = extractCookies(loginPageRes);
    const cookieStr = cookies.join('; ');
    console.log(`   Cookies: ${cookieStr.substring(0, 120)}`);

    // Form action
    const formAction = loginHtml.match(/form[^>]*action="([^"]+)"/i)?.[1];
    console.log(`   Form action: ${formAction?.substring(0, 80) || 'NO'}`);
    if (!formAction) throw new Error('Form no encontrado');

    // Hidden inputs
    const hiddens = {};
    const hRegex = /<input[^>]*type=['"]hidden['"][^>]*>/gi;
    let m;
    while ((m = hRegex.exec(loginHtml)) !== null) {
      const name = m[0].match(/name=['"]([^'"]+)['"]/)?.[1];
      const value = m[0].match(/value=['"]([^'"]*)['"]/)?.[1];
      if (name) hiddens[name] = value || '';
    }
    console.log(`   Hiddens: ${Object.keys(hiddens).join(', ')}`);

    // === PASO 2: Enviar credenciales ===
    console.log('\n📧 Paso 2: Enviando credenciales...');
    
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
    const allCookies = [...cookies, ...authCookies].join('; ');
    
    console.log(`   Status: ${authRes.status}`);
    console.log(`   Location: ${location.substring(0, 150)}`);
    console.log(`   Auth cookies: ${authCookies.join(', ').substring(0, 100)}`);

    // === Caso: Redirect con code (LOGIN EXITOSO!) ===
    if (location.includes('code=')) {
      console.log('\n🎫 ¡LOGIN EXITOSO! Intercambiando code por tokens...');
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
      console.log(`   Token error: ${JSON.stringify(tokenData).substring(0, 300)}`);
    }

    // === Caso: Redirect de vuelta al login (CREDENCIALES MALAS o cognitoAsfData) ===
    if (authRes.status === 302 && location.includes('/login')) {
      console.log('\n🔄 Redirect a login. Siguiendo para ver error...');
      
      const errorPageRes = await fetch(location, {
        headers: {
          ...baseHeaders,
          'Cookie': allCookies,
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(10000)
      });
      
      const errorHtml = await errorPageRes.text();
      console.log(`   Error page status: ${errorPageRes.status}, size: ${errorHtml.length}`);
      
      // Buscar mensaje de error (Cognito lo muestra en un div/p con clase error/alert)
      const errorPatterns = [
        /<p[^>]*class="[^"]*errorMessage[^"]*"[^>]*>([^<]+)/i,
        /<div[^>]*class="[^"]*errorMessage[^"]*"[^>]*>([^<]+)/i,
        /<p[^>]*class="[^"]*error[^"]*"[^>]*>([^<]+)/i,
        /<div[^>]*class="[^"]*alert[^"]*"[^>]*>([^<]+)/i,
        /<span[^>]*class="[^"]*error[^"]*"[^>]*>([^<]+)/i,
        /id="loginErrorMessage"[^>]*>([^<]+)/i,
        /errorMessage['"]\s*>([^<]+)/i,
      ];
      
      let errorMsg = null;
      for (const p of errorPatterns) {
        const match = errorHtml.match(p);
        if (match) { errorMsg = match[1].trim(); break; }
      }
      
      if (errorMsg) {
        console.log(`   ❌ Error de Cognito: "${errorMsg}"`);
      } else {
        // Buscar cualquier texto de error visible
        const visibleText = errorHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        console.log(`   Page text: ${visibleText.substring(0, 500)}`);
      }
      
      // Verificar si es un problema de cognitoAsfData
      console.log(`\n   ℹ️ cognitoAsfData fue enviado como: "${hiddens.cognitoAsfData || 'VACÍO'}"`);
      console.log('   ℹ️ Si el error es por dispositivo no reconocido, cognitoAsfData es requerido.');
    }
    
    // === Caso: 200 con HTML de error ===
    if (authRes.status === 200) {
      const html = await authRes.text();
      console.log(`   Direct response HTML: ${html.substring(0, 300).replace(/\s+/g, ' ')}`);
    }

    throw new Error('Login no completado. Revisa error arriba.');

  } catch (err) {
    console.error('❌', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

async function fetchGrowthData(token, baseHeaders) {
  console.log('\n📊 Obteniendo datos de crecimiento...');
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
      } else console.log(`   ${url} → ${r.status} (${ct})`);
    } catch (e) { console.log(`   → ${e.message?.substring(0, 50)}`); }
  }
  return null;
}

app.listen(PORT, () => console.log(`🔧 Natura Scraper en puerto ${PORT}`));
