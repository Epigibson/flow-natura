import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const API_SECRET = process.env.SCRAPER_API_SECRET || 'dev-secret-key';

// Datos conocidos del Cognito de Natura
const NATURA_AUTH_DOMAIN = 'natura-auth.prd.naturacloud.com';
const NATURA_CLIENT_ID = '31ndsgochinbk61v3jk8dhsf2o';
const NATURA_REDIRECT_URI = 'https://minegocio.natura-avon.com.mx/natura-callback?return_url=home';
const NATURA_BASE_URL = 'https://minegocio.natura-avon.com.mx';

function authMiddleware(req, res, next) {
  const key = req.headers['x-api-key'];
  if (key !== API_SECRET) {
    return res.status(401).json({ success: false, error: 'No autorizado.' });
  }
  next();
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'natura-scraper', mode: 'api-direct' });
});

/**
 * Estrategia Multi-Step sin navegador:
 * 1. GET la página de auth para obtener cookies de Akamai y el form real
 * 2. POST al form de Cognito para autenticarnos
 * 3. Seguir redirects para obtener cookies de sesión en minegocio
 * 4. Llamar al API de growthplan con cookies de sesión
 * 
 * La clave: usamos fetch con User-Agent de móvil (las APIs móviles
 * suelen tener menos restricciones de WAF)
 */
app.post('/scrape', authMiddleware, async (req, res) => {
  const { natura_email, natura_password } = req.body;

  if (!natura_email || !natura_password) {
    return res.status(400).json({ success: false, error: 'Faltan credenciales.' });
  }

  console.log(`🚀 Iniciando sync para: ${natura_email.substring(0, 5)}***`);

  try {
    // Headers que simulan un dispositivo móvil real
    const mobileHeaders = {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
    };

    // === PASO 1: Descubrir el flujo de autenticación ===
    console.log('🔍 Paso 1: Descubriendo flujo de autenticación...');
    
    // Primero probar si hay un API REST directo de Natura
    // Muchas apps Natura/Avon tienen APIs móviles desprotegidas
    const mobileApiEndpoints = [
      'https://api-minegocio.natura-avon.com.mx',
      'https://minegocio.natura-avon.com.mx/api',
      'https://api.natura.com.mx',
      'https://api.natura-avon.com.mx',
    ];

    console.log('📱 Probando APIs móviles...');
    for (const baseUrl of mobileApiEndpoints) {
      try {
        const testRes = await fetch(`${baseUrl}/health`, { 
          headers: mobileHeaders,
          signal: AbortSignal.timeout(5000)
        });
        console.log(`   ${baseUrl}/health → ${testRes.status}`);
      } catch (e) {
        console.log(`   ${baseUrl}/health → ${e.message?.substring(0, 50)}`);
      }
    }

    // === PASO 2: Intentar Cognito Resource Owner Flow (SRP) ===
    console.log('🔐 Paso 2: Intentando autenticación Cognito...');
    
    // Probar OAuth2 Resource Owner Password Grant (ROPC)
    // Esta es una forma estándar OAuth2 que algunas configuraciones de Cognito permiten
    console.log('   Probando OAuth2 ROPC (token endpoint)...');
    
    const tokenEndpoints = [
      `https://${NATURA_AUTH_DOMAIN}/oauth2/token`,
      `https://${NATURA_AUTH_DOMAIN}/token`,
    ];

    for (const tokenUrl of tokenEndpoints) {
      try {
        const tokenBody = new URLSearchParams({
          grant_type: 'password',
          client_id: NATURA_CLIENT_ID,
          username: natura_email,
          password: natura_password,
          scope: 'openid email profile'
        });

        const tokenRes = await fetch(tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            ...mobileHeaders
          },
          body: tokenBody.toString(),
          signal: AbortSignal.timeout(10000)
        });

        console.log(`   ${tokenUrl} → Status: ${tokenRes.status}`);
        const tokenData = await tokenRes.text();
        console.log(`   → Respuesta: ${tokenData.substring(0, 300)}`);

        // Si obtenemos un token, lo usamos
        try {
          const parsed = JSON.parse(tokenData);
          if (parsed.access_token || parsed.id_token) {
            console.log('   ✅ Token obtenido via ROPC!');
            const accessToken = parsed.access_token || parsed.id_token;
            
            // Intentar obtener datos de crecimiento con el token
            const growthData = await fetchGrowthData(accessToken, mobileHeaders);
            if (growthData) {
              return res.json({ success: true, data: growthData });
            }
          }
        } catch {}
      } catch (e) {
        console.log(`   → Error: ${e.message?.substring(0, 80)}`);
      }
    }

    // === PASO 3: Intentar Cognito InitiateAuth via AWS API ===
    console.log('🔐 Paso 3: Intentando Cognito InitiateAuth...');
    
    // Cognito tiene regiones conocidas. Natura es México → probablemente us-east-1 o us-west-2
    const regions = ['us-east-1', 'us-west-2', 'sa-east-1', 'eu-west-1'];
    
    for (const region of regions) {
      try {
        const cognitoUrl = `https://cognito-idp.${region}.amazonaws.com/`;
        
        const initiateAuthBody = JSON.stringify({
          AuthFlow: 'USER_PASSWORD_AUTH',
          ClientId: NATURA_CLIENT_ID,
          AuthParameters: {
            USERNAME: natura_email,
            PASSWORD: natura_password
          }
        });

        console.log(`   Probando región ${region}...`);
        const authRes = await fetch(cognitoUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-amz-json-1.1',
            'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
          },
          body: initiateAuthBody,
          signal: AbortSignal.timeout(10000)
        });

        console.log(`   → Status: ${authRes.status}`);
        const authData = await authRes.text();
        console.log(`   → Respuesta: ${authData.substring(0, 300)}`);

        try {
          const parsed = JSON.parse(authData);
          
          // Si hay AuthenticationResult, tenemos tokens!
          if (parsed.AuthenticationResult) {
            console.log('   ✅ Auth exitoso via Cognito!');
            const idToken = parsed.AuthenticationResult.IdToken;
            const accessToken = parsed.AuthenticationResult.AccessToken;
            
            const growthData = await fetchGrowthData(accessToken || idToken, mobileHeaders);
            if (growthData) {
              return res.json({ success: true, data: growthData });
            }
          }

          // Si obtenemos un error específico, nos dice si la región es correcta
          if (parsed.__type?.includes('ResourceNotFoundException')) {
            console.log(`   → Pool no encontrado en ${region}`);
          } else if (parsed.__type?.includes('NotAuthorizedException')) {
            console.log(`   → ¡Región correcta! Pero credenciales inválidas.`);
            throw new Error('Credenciales inválidas para Natura.');
          } else if (parsed.__type?.includes('InvalidParameterException')) {
            console.log(`   → Región encontrada pero USER_PASSWORD_AUTH no habilitado.`);
            // Esto significa que necesitamos usar SRP auth flow
            // Intentemos con SRP
          }
        } catch (e) {
          if (e.message === 'Credenciales inválidas para Natura.') throw e;
        }
      } catch (e) {
        if (e.message === 'Credenciales inválidas para Natura.') throw e;
        console.log(`   → Error ${region}: ${e.message?.substring(0, 80)}`);
      }
    }

    // === PASO 4: Intentar el flujo web con redirects (cookie-based) ===
    console.log('🌐 Paso 4: Intentando flujo web con redirects...');
    
    // Usar el Authorization Code flow de OAuth2
    const authCodeUrl = `https://${NATURA_AUTH_DOMAIN}/?client_id=${NATURA_CLIENT_ID}&country=mx&language=es&company=natura&redirect_uri=${encodeURIComponent(NATURA_REDIRECT_URI)}`;
    
    const authPageRes = await fetch(authCodeUrl, {
      headers: mobileHeaders,
      redirect: 'follow',
      signal: AbortSignal.timeout(15000)
    });
    
    console.log(`   Auth page status: ${authPageRes.status}`);
    console.log(`   Final URL: ${authPageRes.url?.substring(0, 80)}`);
    
    const authHtml = await authPageRes.text();
    
    // Buscar pistas en el HTML
    // Scripts, APIs, configuraciones
    const scriptUrls = [...authHtml.matchAll(/src="([^"]+)"/g)].map(m => m[1]);
    console.log(`   Scripts encontrados: ${scriptUrls.length}`);
    scriptUrls.forEach(s => console.log(`     → ${s}`));
    
    // Buscar en inline scripts por configuraciones de Cognito
    const inlineScripts = [...authHtml.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).filter(s => s.trim());
    for (const script of inlineScripts) {
      if (script.includes('cognito') || script.includes('pool') || script.includes('region') || script.includes('config')) {
        console.log(`   → Inline script relevante: ${script.substring(0, 300)}`);
      }
    }

    // Descargar el JS principal para buscar configuración de Cognito
    if (scriptUrls.length > 0) {
      console.log('📜 Analizando JS principal...');
      for (const scriptUrl of scriptUrls.slice(0, 3)) {
        try {
          const fullUrl = scriptUrl.startsWith('http') ? scriptUrl : `https://${NATURA_AUTH_DOMAIN}${scriptUrl}`;
          const jsRes = await fetch(fullUrl, {
            headers: mobileHeaders,
            signal: AbortSignal.timeout(10000)
          });
          
          if (jsRes.ok) {
            const jsContent = await jsRes.text();
            console.log(`   JS size: ${jsContent.length} bytes`);
            
            // Buscar User Pool ID, región, etc.
            const poolIdMatch = jsContent.match(/userPoolId['":\s]+['"]([^'"]+)['"]/i);
            const regionMatch = jsContent.match(/region['":\s]+['"]([a-z]+-[a-z]+-\d+)['"]/i);
            const clientIdMatch = jsContent.match(/clientId['":\s]+['"]([^'"]+)['"]/i);
            const apiUrlMatch = jsContent.match(/apiUrl['":\s]+['"]([^'"]+)['"]/i);
            const baseUrlMatch = jsContent.match(/baseUrl['":\s]+['"]([^'"]+)['"]/i);
            
            if (poolIdMatch) console.log(`   🎯 User Pool ID: ${poolIdMatch[1]}`);
            if (regionMatch) console.log(`   🎯 Region: ${regionMatch[1]}`);
            if (clientIdMatch) console.log(`   🎯 Client ID: ${clientIdMatch[1]}`);
            if (apiUrlMatch) console.log(`   🎯 API URL: ${apiUrlMatch[1]}`);
            if (baseUrlMatch) console.log(`   🎯 Base URL: ${baseUrlMatch[1]}`);
            
            // Buscar cualquier URL de API
            const apiUrls = [...new Set(jsContent.match(/https?:\/\/[^"'\s\)]+api[^"'\s\)]*/gi) || [])];
            if (apiUrls.length > 0) {
              console.log(`   🔗 URLs de API encontradas:`);
              apiUrls.slice(0, 15).forEach(u => console.log(`     → ${u}`));
            }
            
            // Buscar cognito pool configurations
            const cognitoMatches = jsContent.match(/.{0,50}cognito.{0,100}/gi);
            if (cognitoMatches) {
              console.log(`   🧩 Referencias a Cognito:`);
              cognitoMatches.slice(0, 5).forEach(m => console.log(`     → ${m.substring(0, 120)}`));
            }

            // Buscar growthplan endpoint
            const growthMatches = jsContent.match(/.{0,30}growth.{0,80}/gi);
            if (growthMatches) {
              console.log(`   📊 Referencias a growth:`);
              growthMatches.slice(0, 5).forEach(m => console.log(`     → ${m.substring(0, 120)}`));
            }
          }
        } catch (e) {
          console.log(`   → Error loading JS: ${e.message?.substring(0, 60)}`);
        }
      }
    }

    throw new Error('Exploración completa. Revisa los logs para encontrar las rutas de API y configuración de Cognito.');

  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Intenta obtener datos de crecimiento usando un token de acceso
 */
async function fetchGrowthData(token, headers) {
  const growthUrls = [
    `${NATURA_BASE_URL}/api/growthplan`,
    `${NATURA_BASE_URL}/api/consultant/growthplan`,
    `${NATURA_BASE_URL}/api/v1/growthplan`,
    `${NATURA_BASE_URL}/bff/growthplan`,
    `${NATURA_BASE_URL}/graphql`,
    'https://api-minegocio.natura-avon.com.mx/api/growthplan',
  ];

  for (const url of growthUrls) {
    try {
      console.log(`   📊 Probando: ${url}`);
      const gRes = await fetch(url, {
        headers: {
          ...headers,
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(10000)
      });
      
      console.log(`   → Status: ${gRes.status}`);
      const contentType = gRes.headers.get('content-type') || '';
      
      if (contentType.includes('json')) {
        const data = await gRes.json();
        console.log(`   → JSON: ${JSON.stringify(data).substring(0, 300)}`);
        
        if (data?.data?.consultantLevel) return data.data.consultantLevel;
        if (data?.consultantLevel) return data.consultantLevel;
      } else {
        const text = await gRes.text();
        console.log(`   → ${contentType}: ${text.substring(0, 100)}`);
      }
    } catch (e) {
      console.log(`   → Error: ${e.message?.substring(0, 60)}`);
    }
  }
  return null;
}

app.listen(PORT, () => {
  console.log(`🔧 Natura Scraper Service corriendo en puerto ${PORT}`);
});
