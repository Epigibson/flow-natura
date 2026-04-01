import express from 'express';
import cors from 'cors';
import CryptoJS from 'crypto-js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const API_SECRET = process.env.SCRAPER_API_SECRET || 'dev-secret-key';

// Config extraída del JS bundle de Natura
const CONFIG = {
  API_TOKEN: '2aa3706e-93b1-4b36-bb93-c76f5076d576',
  AUTH_API: 'https://authenticator-cognito-apigw.prd.naturacloud.com/authentication-api',
  COGNITO_LATAM: 'https://natura-global-prd.auth.us-east-1.amazoncognito.com',
  COGNITO_REGION: 'us-east-1',
  ENCRYPTION_KEY: 'N@tur4=',
  CLIENT_ID_MX: '31ndsgochinbk61v3jk8dhsf2o',
  CLIENT_ID_LATAM: '7resg001uav3j2c0fkvr40l52',
  NATURA_BASE: 'https://minegocio.natura-avon.com.mx',
};

function authMiddleware(req, res, next) {
  if (req.headers['x-api-key'] !== (process.env.SCRAPER_API_SECRET || 'dev-secret-key')) {
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

  console.log(`🚀 Sync para: ${natura_email.substring(0, 5)}***`);

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-MX,es;q=0.9',
    };

    // ============================================================
    // ESTRATEGIA A: Cognito Hosted UI Login (no pasa por Akamai)
    // ============================================================
    console.log('🔐 Estrategia A: Cognito Hosted UI directo...');

    // Paso 1: Obtener la página de login del Cognito Hosted UI
    const loginPageUrl = `${CONFIG.COGNITO_LATAM}/login?client_id=${CONFIG.CLIENT_ID_MX}&response_type=code&scope=openid+email+profile&redirect_uri=${encodeURIComponent(CONFIG.NATURA_BASE + '/natura-callback?return_url=home')}`;
    
    console.log(`   GET ${loginPageUrl.substring(0, 80)}...`);
    const loginPageRes = await fetch(loginPageUrl, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(15000)
    });
    
    console.log(`   Status: ${loginPageRes.status}, URL: ${loginPageRes.url?.substring(0, 80)}`);
    const loginHtml = await loginPageRes.text();
    console.log(`   HTML size: ${loginHtml.length}`);
    
    // Extraer cookies
    const loginCookies = loginPageRes.headers.get('set-cookie') || '';
    const cookieStr = loginCookies.split(',').map(c => c.split(';')[0].trim()).join('; ');
    console.log(`   Cookies: ${cookieStr.substring(0, 80)}`);

    // Buscar form action y campos hidden
    const formAction = loginHtml.match(/form[^>]*action="([^"]+)"/i)?.[1];
    const csrfToken = loginHtml.match(/name="_csrf"[^>]*value="([^"]+)"/i)?.[1] 
                   || loginHtml.match(/csrf['":\s]+['"]([^'"]+)['"]/i)?.[1];
    const cognitoState = loginHtml.match(/name="cognitoAsfData"[^>]*value="([^"]+)"/i)?.[1];
    
    console.log(`   Form action: ${formAction || 'NO ENCONTRADO'}`);
    console.log(`   CSRF: ${csrfToken?.substring(0, 30) || 'NO'}`);
    console.log(`   Cognito ASF: ${cognitoState ? 'SÍ' : 'NO'}`);

    // Extractar todos los hidden inputs
    const hiddenInputs = {};
    const hiddenRegex = /<input[^>]*type=['"]hidden['"][^>]*>/gi;
    let hMatch;
    while ((hMatch = hiddenRegex.exec(loginHtml)) !== null) {
      const name = hMatch[0].match(/name=['"]([^'"]+)['"]/)?.[1];
      const value = hMatch[0].match(/value=['"]([^'"]*)['"]/)?.[1];
      if (name) hiddenInputs[name] = value || '';
    }
    console.log(`   Hidden inputs: ${JSON.stringify(hiddenInputs).substring(0, 200)}`);

    // Si encontramos form, hacer POST con credenciales
    if (formAction) {
      console.log('\n📧 Enviando credenciales al Cognito Hosted UI...');
      
      let postUrl = formAction;
      if (formAction.startsWith('/')) {
        postUrl = `${CONFIG.COGNITO_LATAM}${formAction}`;
      }
      postUrl = postUrl.replace(/&amp;/g, '&');
      console.log(`   POST ${postUrl.substring(0, 80)}...`);

      const formBody = new URLSearchParams();
      for (const [key, value] of Object.entries(hiddenInputs)) {
        formBody.append(key, value);
      }
      formBody.append('username', natura_email);
      formBody.append('password', natura_password);

      const loginRes = await fetch(postUrl, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': cookieStr,
          'Origin': CONFIG.COGNITO_LATAM,
          'Referer': loginPageUrl,
        },
        body: formBody.toString(),
        redirect: 'manual', // No seguir redirect para capturar el code
        signal: AbortSignal.timeout(15000)
      });

      console.log(`   Status: ${loginRes.status}`);
      const location = loginRes.headers.get('location');
      console.log(`   Location: ${location?.substring(0, 120) || 'NONE'}`);
      
      // Si hay redirect con code, extraerlo
      if (location && location.includes('code=')) {
        const code = new URL(location).searchParams.get('code');
        console.log(`   ✅ Authorization code obtenido: ${code?.substring(0, 20)}...`);

        // Intercambiar code por tokens
        console.log('\n🎫 Intercambiando code por tokens...');
        const tokenRes = await fetch(`${CONFIG.COGNITO_LATAM}/oauth2/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: CONFIG.CLIENT_ID_MX,
            code: code,
            redirect_uri: `${CONFIG.NATURA_BASE}/natura-callback?return_url=home`
          }).toString(),
          signal: AbortSignal.timeout(15000)
        });

        const tokenData = await tokenRes.json().catch(() => null);
        console.log(`   Token status: ${tokenRes.status}`);
        console.log(`   Token data: ${JSON.stringify(tokenData)?.substring(0, 300)}`);

        if (tokenData?.access_token || tokenData?.id_token) {
          console.log('   ✅ Tokens obtenidos!');
          const growthData = await fetchGrowthData(tokenData.access_token || tokenData.id_token, headers);
          if (growthData) {
            return res.json({ success: true, data: growthData });
          }
        }
      } else if (loginRes.status === 200) {
        // Login falló, mostrar error
        const respHtml = await loginRes.text();
        const errorMsg = respHtml.match(/class="[^"]*error[^"]*"[^>]*>([^<]+)/i)?.[1];
        console.log(`   ❌ Error de login: ${errorMsg || 'desconocido'}`);
        console.log(`   Response snippet: ${respHtml.substring(0, 300).replace(/\s+/g, ' ')}`);
      }
    } else {
      // No es Cognito Hosted UI estándar, mostrar snippet del HTML
      console.log(`   HTML snippet: ${loginHtml.substring(0, 500).replace(/\s+/g, ' ')}`);
    }

    // ============================================================
    // ESTRATEGIA B: Llamar al authentication-api con encryption key
    // ============================================================
    console.log('\n🔐 Estrategia B: authentication-api con encryption key...');
    
    // Probar encriptar con N@tur4= en vez del username
    const pwdWithEncKey = CryptoJS.AES.encrypt(natura_password, CONFIG.ENCRYPTION_KEY).toString();
    const pwdWithUsername = CryptoJS.AES.encrypt(natura_password, natura_email).toString();
    
    console.log(`   Password con N@tur4=: ${pwdWithEncKey.substring(0, 30)}...`);
    console.log(`   Password con username: ${pwdWithUsername.substring(0, 30)}...`);

    // Probar POST con ambas variantes de encripción y más paths
    const attempts = [
      { path: '/signIn', pwd: pwdWithUsername, label: 'signIn+username' },
      { path: '/signIn', pwd: pwdWithEncKey, label: 'signIn+encKey' },
      { path: '/sign-in', pwd: pwdWithUsername, label: 'sign-in+username' },
      { path: '/sign-in', pwd: pwdWithEncKey, label: 'sign-in+encKey' },
      { path: '/v1/signIn', pwd: pwdWithUsername, label: 'v1/signIn+username' },
      { path: '/v1/sign-in', pwd: pwdWithEncKey, label: 'v1/sign-in+encKey' },
      { path: '/users/sign-in', pwd: pwdWithEncKey, label: 'users/sign-in+encKey' },
    ];

    for (const { path, pwd, label } of attempts) {
      try {
        const url = `${CONFIG.AUTH_API}${path}`;
        const authRes = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': CONFIG.API_TOKEN,
            'Origin': 'https://natura-auth.prd.naturacloud.com',
            'Referer': 'https://natura-auth.prd.naturacloud.com/',
            ...headers,
          },
          body: JSON.stringify({
            clientId: CONFIG.CLIENT_ID_MX,
            country: 'mx',
            company: 'natura',
            username: natura_email,
            password: pwd
          }),
          signal: AbortSignal.timeout(10000)
        });

        const body = await authRes.text();
        const isApiGw403 = body.includes('Missing Authentication Token');
        const isAkamai = body.includes('Access Denied');
        
        if (!isApiGw403 && !isAkamai) {
          console.log(`   ✅ ${label} → ${authRes.status}: ${body.substring(0, 300)}`);
          
          if (authRes.ok) {
            try {
              const data = JSON.parse(body);
              const tokens = data.AuthenticationResult || data;
              const token = tokens.AccessToken || tokens.IdToken || tokens.access_token || tokens.id_token;
              if (token) {
                console.log('   🎫 TOKEN OBTENIDO!');
                const growthData = await fetchGrowthData(token, headers);
                if (growthData) return res.json({ success: true, data: growthData });
              }
              return res.json({ success: true, data });
            } catch {}
          }
        } else {
          console.log(`   ${label} → ${isAkamai ? 'AKAMAI BLOCK' : 'PATH NOT FOUND'}`);
        }
      } catch (e) {
        console.log(`   ${label} → ${e.message?.substring(0, 50)}`);
      }
    }

    throw new Error('No se pudo autenticar con ninguna estrategia.');

  } catch (err) {
    console.error('❌', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

async function fetchGrowthData(token, baseHeaders) {
  console.log('\n📊 Obteniendo datos de crecimiento...');
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
        console.log(`   ${url} → ${r.status}: ${JSON.stringify(d).substring(0, 200)}`);
        if (d?.data?.consultantLevel) return d.data.consultantLevel;
      } else {
        console.log(`   ${url} → ${r.status} (${ct})`);
      }
    } catch (e) {
      console.log(`   ${url} → ${e.message?.substring(0, 50)}`);
    }
  }
  return null;
}

app.listen(PORT, () => {
  console.log(`🔧 Natura Scraper Service en puerto ${PORT}`);
});
