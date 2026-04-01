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
};

function authMiddleware(req, res, next) {
  if (req.headers['x-api-key'] !== (process.env.SCRAPER_API_SECRET || 'dev-secret-key')) {
    return res.status(401).json({ success: false, error: 'No autorizado.' });
  }
  next();
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));

/**
 * Hace un intento de login completo y devuelve diagnóstico detallado
 */
async function attemptLogin(email, password, label) {
  console.log(`\n🔑 [${label}] Intentando login...`);
  
  const baseHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'es-MX,es;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-User': '?1',
  };

  // GET login page
  const loginUrl = `${CONFIG.COGNITO_DOMAIN}/login?client_id=${CONFIG.CLIENT_ID}&response_type=code&scope=openid&redirect_uri=${encodeURIComponent(CONFIG.REDIRECT_URI)}`;
  
  const pageRes = await fetch(loginUrl, {
    headers: { ...baseHeaders, 'Sec-Fetch-Site': 'none' },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000)
  });

  const html = await pageRes.text();

  // Log ALL raw headers
  console.log(`   GET Response Headers:`);
  for (const [key, value] of pageRes.headers.entries()) {
    if (key.toLowerCase().includes('cookie') || key.toLowerCase().includes('set-cookie')) {
      console.log(`     ${key}: ${value.substring(0, 200)}`);
    }
  }

  // Usar getSetCookie para obtener cookies individualmente
  let cookies = [];
  try {
    const rawCookies = pageRes.headers.getSetCookie();
    console.log(`   getSetCookie count: ${rawCookies?.length}`);
    rawCookies?.forEach((c, i) => {
      console.log(`     [${i}]: ${c.substring(0, 150)}`);
      const kv = c.split(';')[0].trim();
      cookies.push(kv);
    });
  } catch (e) {
    console.log(`   getSetCookie error: ${e.message}`);
    // Fallback
    const raw = pageRes.headers.get('set-cookie') || '';
    console.log(`   Raw set-cookie: ${raw.substring(0, 300)}`);
    const parts = raw.split(/,(?=[A-Z])/);
    parts.forEach(p => {
      const kv = p.split(';')[0].trim();
      if (kv.includes('=')) cookies.push(kv);
    });
  }
  
  const cookieStr = cookies.join('; ');
  console.log(`   Cookie header will be: ${cookieStr}`);

  // Parse form
  const formAction = html.match(/form[^>]*action="([^"]+)"/i)?.[1];
  const hiddens = {};
  let m;
  const hRegex = /<input[^>]*type=['"]hidden['"][^>]*>/gi;
  while ((m = hRegex.exec(html)) !== null) {
    const name = m[0].match(/name=['"]([^'"]+)['"]/)?.[1];
    const value = m[0].match(/value=['"]([^'"]*)['"]/)?.[1];
    if (name) hiddens[name] = value || '';
  }

  if (!formAction) {
    console.log(`   ❌ Form no encontrado`);
    return null;
  }

  // Build POST
  let postUrl = `${CONFIG.COGNITO_DOMAIN}${formAction}`.replace(/&amp;/g, '&');
  
  const formBody = new URLSearchParams();
  for (const [k, v] of Object.entries(hiddens)) formBody.append(k, v);
  formBody.append('username', email);
  formBody.append('password', password);

  console.log(`   POST URL: ${postUrl.substring(0, 100)}...`);
  console.log(`   Form body: ${formBody.toString().substring(0, 200)}...`);

  const postRes = await fetch(postUrl, {
    method: 'POST',
    headers: {
      ...baseHeaders,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookieStr,
      'Origin': CONFIG.COGNITO_DOMAIN,
      'Referer': loginUrl,
      'Sec-Fetch-Site': 'same-origin',
    },
    body: formBody.toString(),
    redirect: 'manual',
    signal: AbortSignal.timeout(15000)
  });

  const location = postRes.headers.get('location') || '';
  
  // Log ALL response headers
  console.log(`   POST Response:`);
  console.log(`     Status: ${postRes.status}`);
  console.log(`     Location: ${location.substring(0, 200)}`);
  for (const [key, value] of postRes.headers.entries()) {
    if (key !== 'location') {
      console.log(`     ${key}: ${value.substring(0, 150)}`);
    }
  }

  // Check set-cookie del POST
  try {
    const postCookies = postRes.headers.getSetCookie();
    console.log(`   POST cookies: ${postCookies?.length}`);
    postCookies?.forEach((c, i) => console.log(`     [${i}]: ${c.substring(0, 150)}`));
  } catch {}

  // Si hay redirect con code = LOGIN EXITOSO
  if (location.includes('code=')) {
    console.log(`   ✅ ¡LOGIN EXITOSO! Code en redirect.`);
    return { success: true, location };
  }

  // Si redirect a /login = fallo, seguir para ver error
  if (location.includes('/login')) {
    const allCookies = cookies.join('; ');
    const errRes = await fetch(location, {
      headers: { ...baseHeaders, Cookie: allCookies },
      signal: AbortSignal.timeout(10000)
    });
    const errHtml = await errRes.text();
    
    // Comparar HTML con original para encontrar mensajes de error
    const errLen = errHtml.length;
    const origLen = html.length;
    console.log(`   Error page size: ${errLen} (original: ${origLen}, diff: ${errLen - origLen})`);
    
    // Si el HTML es diferente en longitud, hay un error que se muestra
    if (errLen !== origLen) {
      // Encontrar las secciones diferentes
      const errLines = errHtml.split('\n');
      const origLines = html.split('\n');
      for (let i = 0; i < errLines.length; i++) {
        if (errLines[i] !== origLines[i]) {
          console.log(`   DIFF at line ${i}: ${errLines[i]?.substring(0, 150)}`);
          break;
        }
      }
    }
  }

  // Si es 200 directo, leer body
  if (postRes.status === 200) {
    const body = await postRes.text();
    console.log(`   Direct body: ${body.substring(0, 300).replace(/\s+/g, ' ')}`);
  }

  return { success: false, status: postRes.status, location };
}

app.post('/scrape', authMiddleware, async (req, res) => {
  const { natura_email, natura_password } = req.body;
  if (!natura_email || !natura_password) {
    return res.status(400).json({ success: false, error: 'Faltan credenciales.' });
  }

  console.log(`🚀 Sync para: ${natura_email.substring(0, 5)}***`);
  console.log('📊 Diagnóstico: comparando login real vs falso\n');

  try {
    // Test 1: Credenciales reales
    const realResult = await attemptLogin(natura_email, natura_password, 'REAL');

    // Test 2: Contraseña falsa
    const fakeResult = await attemptLogin(natura_email, 'WrongPassword123!', 'FAKE');

    // Comparar resultados
    console.log('\n📋 COMPARACIÓN:');
    console.log(`   Real: status=${realResult?.status}, success=${realResult?.success}`);
    console.log(`   Fake: status=${fakeResult?.status}, success=${fakeResult?.success}`);

    if (realResult?.success) {
      // Login exitoso! Intercambiar code por tokens
      const code = new URL(realResult.location).searchParams.get('code');
      console.log(`\n🎫 Intercambiando code: ${code?.substring(0, 20)}...`);
      
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
      console.log(`   ${JSON.stringify(tokenData).substring(0, 300)}`);
      return res.json({ success: true, data: tokenData });
    }

    throw new Error('Login no completado. Revisa diagnóstico.');

  } catch (err) {
    console.error('❌', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => console.log(`🔧 Natura Scraper en puerto ${PORT}`));
