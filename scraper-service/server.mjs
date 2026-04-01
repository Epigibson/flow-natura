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
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-MX,es;q=0.9',
    };

    // === PASO 1: Obtener formulario de login de Cognito ===
    console.log('📋 Paso 1: Obteniendo formulario de login...');
    
    const loginPageUrl = `${CONFIG.COGNITO_DOMAIN}/login?client_id=${CONFIG.CLIENT_ID}&response_type=code&scope=openid&redirect_uri=${encodeURIComponent(CONFIG.REDIRECT_URI)}`;
    
    const loginPageRes = await fetch(loginPageUrl, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(15000)
    });

    console.log(`   Status: ${loginPageRes.status}`);
    const loginHtml = await loginPageRes.text();
    console.log(`   HTML size: ${loginHtml.length}`);

    // Extraer cookies (XSRF-TOKEN especialmente)
    const setCookies = loginPageRes.headers.getSetCookie?.() || [];
    const cookieStr = setCookies.map(c => c.split(';')[0]).join('; ');
    console.log(`   Cookies: ${cookieStr.substring(0, 100)}`);

    // Extraer form action
    const formAction = loginHtml.match(/form[^>]*action="([^"]+)"/i)?.[1];
    console.log(`   Form action: ${formAction || 'NO ENCONTRADO'}`);

    if (!formAction) {
      // Log más HTML para debugging
      console.log(`   HTML preview: ${loginHtml.substring(0, 500).replace(/\s+/g, ' ')}`);
      
      // Buscar cualquier tag form
      const formTag = loginHtml.match(/<form[^>]*>/gi);
      console.log(`   Forms encontrados: ${formTag?.length || 0}`);
      formTag?.forEach(f => console.log(`     ${f}`));
      
      // Buscar inputs
      const inputs = loginHtml.match(/<input[^>]*>/gi);
      console.log(`   Inputs: ${inputs?.length || 0}`);
      inputs?.forEach(i => console.log(`     ${i.substring(0, 100)}`));

      // Buscar links y buttons
      const buttons = loginHtml.match(/<button[^>]*>[^<]*<\/button>/gi);
      console.log(`   Buttons: ${buttons?.length || 0}`);
      buttons?.forEach(b => console.log(`     ${b}`));

      // Buscar cualquier URL de acción
      const actions = loginHtml.match(/action=['"]([^'"]+)['"]/gi);
      console.log(`   Actions: ${actions?.join(', ') || 'NONE'}`);

      throw new Error('Form no encontrado. Revisa HTML.');
    }

    // Extraer hidden inputs
    const hiddens = {};
    const hRegex = /<input[^>]*type=['"]hidden['"][^>]*>/gi;
    let m;
    while ((m = hRegex.exec(loginHtml)) !== null) {
      const name = m[0].match(/name=['"]([^'"]+)['"]/)?.[1];
      const value = m[0].match(/value=['"]([^'"]*)['"]/)?.[1];
      if (name) hiddens[name] = value || '';
    }
    console.log(`   Hidden inputs: ${JSON.stringify(hiddens)}`);

    // === PASO 2: Enviar credenciales ===
    console.log('\n📧 Paso 2: Enviando credenciales...');
    
    let postUrl = formAction.startsWith('http') ? formAction : `${CONFIG.COGNITO_DOMAIN}${formAction}`;
    postUrl = postUrl.replace(/&amp;/g, '&');
    console.log(`   POST ${postUrl.substring(0, 80)}...`);

    const formBody = new URLSearchParams();
    for (const [k, v] of Object.entries(hiddens)) formBody.append(k, v);
    formBody.append('username', natura_email);
    formBody.append('password', natura_password);
    
    console.log(`   Form data keys: ${[...formBody.keys()].join(', ')}`);

    const authRes = await fetch(postUrl, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookieStr,
        'Origin': CONFIG.COGNITO_DOMAIN,
        'Referer': loginPageUrl,
      },
      body: formBody.toString(),
      redirect: 'manual',
      signal: AbortSignal.timeout(15000)
    });

    console.log(`   Response status: ${authRes.status}`);
    
    // Extraer headers importantes
    const location = authRes.headers.get('location') || '';
    const newCookies = authRes.headers.getSetCookie?.() || [];
    console.log(`   Location: ${location.substring(0, 150)}`);
    console.log(`   New cookies: ${newCookies.length}`);

    // === Caso 1: Redirect con authorization code ===
    if (location.includes('code=')) {
      const url = new URL(location);
      const code = url.searchParams.get('code');
      console.log(`\n🎫 Paso 3: ¡Authorization code obtenido! ${code?.substring(0, 20)}...`);

      // Intercambiar code por tokens
      console.log('   Intercambiando code por tokens...');
      const tokenRes = await fetch(`${CONFIG.COGNITO_DOMAIN}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: CONFIG.CLIENT_ID,
          code: code,
          redirect_uri: CONFIG.REDIRECT_URI
        }).toString(),
        signal: AbortSignal.timeout(15000)
      });

      const tokenText = await tokenRes.text();
      console.log(`   Token status: ${tokenRes.status}`);
      console.log(`   Token response: ${tokenText.substring(0, 500)}`);

      try {
        const tokenData = JSON.parse(tokenText);
        if (tokenData.access_token || tokenData.id_token) {
          console.log('   ✅ ¡TOKENS OBTENIDOS!');
          
          const token = tokenData.access_token || tokenData.id_token;
          
          // Obtener datos de crecimiento
          const growthData = await fetchGrowthData(token, headers);
          if (growthData) {
            return res.json({ success: true, data: growthData });
          }
          
          // Si no se obtienen growth data, devolver los tokens
          return res.json({ success: true, tokens: tokenData, message: 'Auth OK pero growth data no disponible' });
        }
      } catch (e) {
        console.log(`   Parse error: ${e.message}`);
      }
    }

    // === Caso 2: Redirect con tokens (implicit) ===
    if (location.includes('access_token') || location.includes('id_token')) {
      const fragment = location.split('#')[1] || '';
      const params = new URLSearchParams(fragment);
      const token = params.get('access_token') || params.get('id_token');
      console.log(`\n🎫 ¡Token obtenido via implicit grant!`);
      
      const growthData = await fetchGrowthData(token, headers);
      if (growthData) return res.json({ success: true, data: growthData });
      return res.json({ success: true, message: 'Auth OK' });
    }

    // === Caso 3: Login fallido ===
    if (authRes.status === 200 || authRes.status === 302) {
      const errHtml = await authRes.text().catch(() => '');
      
      // Buscar mensaje de error
      const errorPatterns = [
        /errorMessage['"]*[>:]\s*['"]?([^<'"]+)/i,
        /class="[^"]*error[^"]*"[^>]*>([^<]+)/i,
        /id="[^"]*error[^"]*"[^>]*>([^<]+)/i,
        /"message"\s*:\s*"([^"]+)"/i,
      ];
      
      let errorMsg = 'Unknown error';
      for (const pattern of errorPatterns) {
        const match = errHtml.match(pattern);
        if (match) { errorMsg = match[1].trim(); break; }
      }
      
      console.log(`   ❌ Login error: ${errorMsg}`);
      console.log(`   Response HTML snippet: ${errHtml.substring(0, 500).replace(/\s+/g, ' ')}`);
      
      // Si es redirect a error
      if (location) {
        console.log(`   Redirect to: ${location}`);
      }
    }

    throw new Error('No se pudo completar el login.');

  } catch (err) {
    console.error('❌', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

async function fetchGrowthData(token, baseHeaders) {
  console.log('\n📊 Obteniendo datos de crecimiento...');
  
  // Primero obtener sesión en minegocio
  try {
    const sessionRes = await fetch(`${CONFIG.NATURA_BASE}/natura-callback?return_url=home&code=placeholder`, {
      headers: { ...baseHeaders, 'Authorization': `Bearer ${token}` },
      redirect: 'manual',
      signal: AbortSignal.timeout(10000)
    });
    console.log(`   Session: ${sessionRes.status}`);
  } catch {}

  const urls = [
    `${CONFIG.NATURA_BASE}/api/growthplan`,
    `${CONFIG.NATURA_BASE}/bff/growthplan`,
  ];
  
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
