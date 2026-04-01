import express from 'express';
import cors from 'cors';
import CryptoJS from 'crypto-js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

const CONFIG = {
  API_TOKEN: '2aa3706e-93b1-4b36-bb93-c76f5076d576',
  AUTH_API: 'https://authenticator-cognito-apigw.prd.naturacloud.com/authentication-api',
  COGNITO_LATAM: 'https://natura-global-prd.auth.us-east-1.amazoncognito.com',
  COGNITO_BR: 'https://natura-global-br-prd.auth.us-east-1.amazoncognito.com',
  ENCRYPTION_KEY: 'N@tur4=',
  NATURA_BASE: 'https://minegocio.natura-avon.com.mx',
  // Todos los client IDs encontrados
  CLIENT_IDS: [
    '31ndsgochinbk61v3jk8dhsf2o',
    '7resg001uav3j2c0fkvr40l52',
    '2mclhp3ui6kf7pjrvh2kv6a6lq',
    '3u0gp4t079j9g2m249gdghfghm',
    '604b3ku8d95i7uo1s342rsauoa',
    '3jgf6penoqk510pfjebdcbig8',
    'd1ljdp0ikgk1edal2nc9e6qkn',
  ]
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

    // Variantes de redirect_uri a probar
    const redirectUris = [
      'https://minegocio.natura-avon.com.mx/natura-callback',
      'https://minegocio.natura-avon.com.mx/natura-callback?return_url=home',
      'https://minegocio.natura-avon.com.mx/',
      'https://minegocio.natura-avon.com.mx',
      'https://natura-auth.prd.naturacloud.com/callback',
      'https://natura-auth.prd.naturacloud.com',
    ];

    // Cognito domains a probar
    const cognitoDomains = [CONFIG.COGNITO_LATAM, CONFIG.COGNITO_BR];

    console.log('🔐 Probando combinaciones de Cognito Hosted UI...\n');

    for (const cognitoDomain of cognitoDomains) {
      const domainLabel = cognitoDomain.includes('-br-') ? 'BR' : 'LATAM';

      for (const clientId of CONFIG.CLIENT_IDS) {
        for (const redirectUri of redirectUris) {
          // Probar con response_type=token (implicit grant - da tokens directo)
          const loginUrl = `${cognitoDomain}/login?client_id=${clientId}&response_type=token&scope=openid+email+profile&redirect_uri=${encodeURIComponent(redirectUri)}`;

          try {
            const loginRes = await fetch(loginUrl, {
              headers,
              redirect: 'follow',
              signal: AbortSignal.timeout(8000)
            });

            const finalUrl = loginRes.url;
            const status = loginRes.status;

            // Si NO es 400, encontramos una combo válida!
            if (status !== 400) {
              console.log(`✅ ${domainLabel} | ${clientId.substring(0, 8)}... | ${redirectUri.split('.mx')[1] || redirectUri.split('.com')[1]}`);
              console.log(`   Status: ${status}, URL: ${finalUrl.substring(0, 100)}`);

              const html = await loginRes.text();
              
              // Buscar form
              const formAction = html.match(/form[^>]*action="([^"]+)"/i)?.[1];
              if (formAction) {
                console.log(`   📋 Form action: ${formAction}`);
                
                // Extraer hidden inputs
                const hiddens = {};
                const hRegex = /<input[^>]*type=['"]hidden['"][^>]*>/gi;
                let m;
                while ((m = hRegex.exec(html)) !== null) {
                  const n = m[0].match(/name=['"]([^'"]+)['"]/)?.[1];
                  const v = m[0].match(/value=['"]([^'"]*)['"]/)?.[1];
                  if (n) hiddens[n] = v || '';
                }
                console.log(`   Hidden: ${JSON.stringify(hiddens).substring(0, 200)}`);

                // Obtener cookies
                const cookies = loginRes.headers.get('set-cookie') || '';
                const cookieStr = cookies.split(',').map(c => c.split(';')[0].trim()).join('; ');

                // POST credenciales
                console.log('   📧 Enviando credenciales...');
                let postUrl = formAction.startsWith('/') ? `${cognitoDomain}${formAction}` : formAction;
                postUrl = postUrl.replace(/&amp;/g, '&');

                const formBody = new URLSearchParams();
                for (const [k, v] of Object.entries(hiddens)) formBody.append(k, v);
                formBody.append('username', natura_email);
                formBody.append('password', natura_password);

                const authRes = await fetch(postUrl, {
                  method: 'POST',
                  headers: {
                    ...headers,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Cookie': cookieStr,
                    'Origin': cognitoDomain,
                    'Referer': loginUrl,
                  },
                  body: formBody.toString(),
                  redirect: 'manual',
                  signal: AbortSignal.timeout(15000)
                });

                const location = authRes.headers.get('location') || '';
                console.log(`   → Status: ${authRes.status}`);
                console.log(`   → Location: ${location.substring(0, 150)}`);

                // Token en la URL (implicit grant usa fragment #access_token=...)
                if (location.includes('access_token') || location.includes('id_token')) {
                  // Extraer tokens del fragment
                  const fragment = location.split('#')[1] || location.split('?')[1] || '';
                  const params = new URLSearchParams(fragment);
                  const accessToken = params.get('access_token');
                  const idToken = params.get('id_token');
                  
                  console.log(`   🎫 ACCESS TOKEN: ${accessToken?.substring(0, 30)}...`);
                  console.log(`   🎫 ID TOKEN: ${idToken?.substring(0, 30)}...`);

                  const token = accessToken || idToken;
                  if (token) {
                    const growthData = await fetchGrowthData(token, headers);
                    if (growthData) {
                      return res.json({ success: true, data: growthData });
                    }
                  }
                }

                // Code en la URL (authorization code flow)
                if (location.includes('code=')) {
                  const code = new URL(location).searchParams.get('code');
                  console.log(`   🎫 AUTH CODE: ${code?.substring(0, 20)}...`);

                  // Intercambiar code por tokens
                  const tokenRes = await fetch(`${cognitoDomain}/oauth2/token`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                      grant_type: 'authorization_code',
                      client_id: clientId,
                      code,
                      redirect_uri: redirectUri
                    }).toString(),
                    signal: AbortSignal.timeout(10000)
                  });
                  const tokenData = await tokenRes.json().catch(() => null);
                  console.log(`   Token exchange: ${tokenRes.status}`);
                  console.log(`   ${JSON.stringify(tokenData)?.substring(0, 300)}`);
                  
                  const token = tokenData?.access_token || tokenData?.id_token;
                  if (token) {
                    const growthData = await fetchGrowthData(token, headers);
                    if (growthData) return res.json({ success: true, data: growthData });
                  }
                }

                // Si login falla, mostrar error
                if (authRes.status === 200 || authRes.status === 302 && !location.includes('token') && !location.includes('code')) {
                  const errHtml = await authRes.text().catch(() => '');
                  const errMsg = errHtml.match(/errorMessage['"]*[>:]\s*['"]?([^<'"]+)/i)?.[1];
                  console.log(`   ❌ Login error: ${errMsg || 'unknown'}`);
                }

                // Solo probar la primera combinación válida a fondo
                // Si llegamos aquí sin éxito, seguir probando
              }
            }
            // Si es 400 (redirect_mismatch), silenciosamente continuar
          } catch (e) {
            // timeout o error de red, continuar
          }
        }
      }
    }

    // Si también probamos response_type=code
    console.log('\n📋 También probando con response_type=code...');
    for (const clientId of CONFIG.CLIENT_IDS.slice(0, 3)) {
      for (const redirectUri of redirectUris.slice(0, 3)) {
        const url = `${CONFIG.COGNITO_LATAM}/login?client_id=${clientId}&response_type=code&scope=openid&redirect_uri=${encodeURIComponent(redirectUri)}`;
        try {
          const r = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(5000) });
          if (r.status !== 400) {
            console.log(`   ✅ code: ${clientId.substring(0,8)}... + ${redirectUri.split('.mx')[1] || redirectUri.split('.com')[1]} → ${r.status}`);
          }
        } catch {}
      }
    }

    throw new Error('Ninguna combinación de client_id + redirect_uri funcionó.');

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
        console.log(`   ${url} → ${r.status}: ${JSON.stringify(d).substring(0, 200)}`);
        if (d?.data?.consultantLevel) return d.data.consultantLevel;
      } else console.log(`   ${url} → ${r.status} (${ct})`);
    } catch (e) { console.log(`   → ${e.message?.substring(0, 50)}`); }
  }
  return null;
}

app.listen(PORT, () => console.log(`🔧 Natura Scraper en puerto ${PORT}`));
