import express from 'express';
import cors from 'cors';
import CryptoJS from 'crypto-js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const API_SECRET = process.env.SCRAPER_API_SECRET || 'dev-secret-key';

const NATURA_AUTH_DOMAIN = 'natura-auth.prd.naturacloud.com';
const NATURA_CLIENT_ID = '31ndsgochinbk61v3jk8dhsf2o';
const AUTH_API_BASE = 'https://authenticator-cognito-apigw.prd.naturacloud.com/authentication-api';
const NATURA_BASE_URL = 'https://minegocio.natura-avon.com.mx';

function authMiddleware(req, res, next) {
  if (req.headers['x-api-key'] !== (process.env.SCRAPER_API_SECRET || 'dev-secret-key')) {
    return res.status(401).json({ success: false, error: 'No autorizado.' });
  }
  next();
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'natura-scraper' });
});

/**
 * Extrae TODAS las variables VITE_APP_ del JS bundle
 */
async function extractViteConfig(js) {
  const config = {};
  
  // Buscar todas las asignaciones VITE_APP_*:"valor"
  const vitePattern = /VITE_APP_([A-Z_]+)\s*:\s*"([^"]+)"/g;
  let match;
  while ((match = vitePattern.exec(js)) !== null) {
    config[`VITE_APP_${match[1]}`] = match[2];
  }

  // También buscar VITE_BASE_URL y similares
  const vitePattern2 = /VITE_([A-Z_]+)\s*:\s*"([^"]+)"/g;
  while ((match = vitePattern2.exec(js)) !== null) {
    config[`VITE_${match[1]}`] = match[2];
  }

  return config;
}

app.post('/scrape', authMiddleware, async (req, res) => {
  const { natura_email, natura_password } = req.body;
  if (!natura_email || !natura_password) {
    return res.status(400).json({ success: false, error: 'Faltan credenciales.' });
  }

  console.log(`🚀 Sync para: ${natura_email.substring(0, 5)}***`);

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'es-MX,es;q=0.9',
    };

    // === PASO 1: Descargar JS y extraer config ===
    console.log('📜 Paso 1: Extrayendo configuración del JS bundle...');

    const authPageRes = await fetch(`https://${NATURA_AUTH_DOMAIN}/?client_id=${NATURA_CLIENT_ID}&country=mx&language=es&company=natura`, {
      headers, redirect: 'follow', signal: AbortSignal.timeout(15000)
    });
    const authHtml = await authPageRes.text();
    const appJsUrl = [...authHtml.matchAll(/src="([^"]+)"/g)]
      .map(m => m[1])
      .find(s => s.includes('assets/'));

    if (!appJsUrl) throw new Error('JS bundle no encontrado.');

    const jsRes = await fetch(`https://${NATURA_AUTH_DOMAIN}${appJsUrl}`, {
      headers, signal: AbortSignal.timeout(15000)
    });
    const js = await jsRes.text();
    console.log(`   JS descargado: ${js.length} bytes`);

    // Extraer TODA la config Vite
    const viteConfig = await extractViteConfig(js);
    console.log('   📋 Config Vite encontrada:');
    for (const [key, value] of Object.entries(viteConfig)) {
      console.log(`     ${key}: ${value.substring(0, 80)}`);
    }

    const apiToken = viteConfig['VITE_APP_API_TOKEN'];
    if (!apiToken) {
      // Buscar el token de otra forma - puede estar asignado de otra manera
      console.log('   ⚠️ VITE_APP_API_TOKEN no encontrado en formato estándar.');
      console.log('   🔍 Buscando API_TOKEN con patrones alternativos...');
      
      // Buscar cualquier string que se use después de x-api-key
      const apiKeyUsage = js.match(/x-api-key['"]\s*:\s*([^,}\s]+)/g);
      if (apiKeyUsage) {
        console.log(`   x-api-key usages: ${apiKeyUsage.join(' | ')}`);
      }

      // Buscar la variable que contiene el token - "V" es el objeto de env
      // Buscar la definición de V = { ... VITE_APP_API_TOKEN ... }
      const tokenDefMatch = js.match(/API_TOKEN\s*:\s*"([^"]+)"/);
      if (tokenDefMatch) {
        console.log(`   🔑 API_TOKEN encontrado: ${tokenDefMatch[1].substring(0, 20)}...`);
      }

      // Buscar el token en todo el contexto del config
      const configIdx = js.indexOf('VITE_APP_API_DOMAIN');
      if (configIdx !== -1) {
        // Extraer un gran bloque del config
        const configBlock = js.substring(Math.max(0, configIdx - 1000), configIdx + 2000);
        console.log('   📦 Bloque de config completo:');
        
        // Dividir en líneas lógicas
        const entries = configBlock.split(',').filter(e => e.includes('VITE_') || e.includes('TOKEN') || e.includes('KEY') || e.includes('SECRET'));
        entries.forEach(e => console.log(`     ${e.trim().substring(0, 120)}`));
      }

      throw new Error('API Token no encontrado. Revisa los logs.');
    }

    console.log(`\n🔑 API Token: ${apiToken.substring(0, 15)}...`);

    // === PASO 2: Autenticarnos via el authentication-api ===
    console.log('\n🔐 Paso 2: Autenticando via API...');

    // Encriptar password con AES usando el username como key
    const encryptedPassword = CryptoJS.AES.encrypt(natura_password, natura_email).toString();
    console.log(`   Password encriptada: ${encryptedPassword.substring(0, 30)}...`);

    // Determinar el client ID correcto para México
    // Del JS: "7resg001uav3j2c0fkvr40l52": ["co","pe","cl","ec","mx","ar"]
    const clientIdsForMexico = ['31ndsgochinbk61v3jk8dhsf2o', '7resg001uav3j2c0fkvr40l52'];

    for (const clientId of clientIdsForMexico) {
      console.log(`\n   Probando con clientId: ${clientId}`);

      // Probar diferentes paths del API
      const loginPaths = ['', '/login', '/v1/login', '/authenticate', '/signin'];
      
      for (const path of loginPaths) {
        try {
          const loginUrl = `${AUTH_API_BASE}${path}`;
          console.log(`   → POST ${loginUrl.split('.com')[1]}`);

          const loginRes = await fetch(loginUrl, {
            method: 'POST',
            headers: {
              ...headers,
              'Content-Type': 'application/json',
              'x-api-key': apiToken,
              'Origin': `https://${NATURA_AUTH_DOMAIN}`,
              'Referer': `https://${NATURA_AUTH_DOMAIN}/`,
            },
            body: JSON.stringify({
              clientId: clientId,
              country: 'mx',
              company: 'natura',
              username: natura_email,
              password: encryptedPassword
            }),
            signal: AbortSignal.timeout(15000)
          });

          const respText = await loginRes.text();
          console.log(`     Status: ${loginRes.status}`);
          console.log(`     Body: ${respText.substring(0, 500)}`);

          // Si obtenemos una respuesta exitosa
          if (loginRes.ok) {
            try {
              const loginData = JSON.parse(respText);
              console.log('   ✅ LOGIN EXITOSO!');
              
              // Extraer tokens
              const tokens = loginData.AuthenticationResult || loginData.tokens || loginData;
              const idToken = tokens.IdToken || tokens.idToken || tokens.id_token;
              const accessToken = tokens.AccessToken || tokens.accessToken || tokens.access_token;
              
              if (idToken || accessToken) {
                console.log('   🎫 Tokens obtenidos!');
                
                // Intentar obtener datos de crecimiento
                const growthData = await fetchGrowthDataWithSession(
                  idToken || accessToken, 
                  loginData,
                  headers
                );
                
                if (growthData) {
                  return res.json({ success: true, data: growthData });
                }
              }
              
              // Si la respuesta tiene redirect URL, seguirla
              if (loginData.redirectUrl || loginData.redirect_url || loginData.url) {
                const redirectUrl = loginData.redirectUrl || loginData.redirect_url || loginData.url;
                console.log(`   📎 Redirect: ${redirectUrl}`);
              }

              // Devolver lo que tengamos
              return res.json({ success: true, data: loginData });
            } catch (e) {
              console.log(`   Parse error: ${e.message}`);
            }
          }

          // Si es 401/403 con mensaje específico, probablemente path incorrecto
          if (loginRes.status === 403 && respText.includes('Missing Authentication Token')) {
            continue; // Path no existe
          }

          // Si hay otro error, loggearlo
          if (loginRes.status >= 400) {
            // Si el error indica credenciales malas, no seguir probando paths
            if (respText.includes('NotAuthorized') || respText.includes('invalid')) {
              console.log('   ❌ Credenciales rechazadas por este endpoint.');
            }
          }

        } catch (e) {
          console.log(`     Error: ${e.message?.substring(0, 60)}`);
        }
      }
    }

    throw new Error('No se pudo autenticar. Revisa los logs.');

  } catch (err) {
    console.error('❌', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Con un token de sesión, intenta obtener datos de crecimiento
 */
async function fetchGrowthDataWithSession(token, loginResponse, baseHeaders) {
  console.log('\n📊 Buscando datos de crecimiento...');
  
  const growthUrls = [
    `${NATURA_BASE_URL}/api/growthplan`,
    `${NATURA_BASE_URL}/bff/growthplan`,
    `${NATURA_BASE_URL}/api/consultant/growthplan`,
  ];

  for (const url of growthUrls) {
    try {
      const gRes = await fetch(url, {
        headers: {
          ...baseHeaders,
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(10000)
      });

      const ct = gRes.headers.get('content-type') || '';
      if (ct.includes('json')) {
        const data = await gRes.json();
        console.log(`   ${url} → ${gRes.status}: ${JSON.stringify(data).substring(0, 200)}`);
        if (data?.data?.consultantLevel) return data.data.consultantLevel;
        if (data?.consultantLevel) return data.consultantLevel;
      } else {
        console.log(`   ${url} → ${gRes.status} (${ct})`);
      }
    } catch (e) {
      console.log(`   ${url} → ${e.message?.substring(0, 60)}`);
    }
  }
  return null;
}

app.listen(PORT, () => {
  console.log(`🔧 Natura Scraper Service en puerto ${PORT}`);
});
