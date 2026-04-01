import express from 'express';
import cors from 'cors';
import crypto from 'crypto';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const API_SECRET = process.env.SCRAPER_API_SECRET || 'dev-secret-key';

// Datos confirmados de Cognito
const NATURA_AUTH_DOMAIN = 'natura-auth.prd.naturacloud.com';
const NATURA_CLIENT_ID = '31ndsgochinbk61v3jk8dhsf2o';
const COGNITO_REGION = 'us-east-1'; // ¡Confirmado por la respuesta!
const NATURA_BASE_URL = 'https://minegocio.natura-avon.com.mx';

function authMiddleware(req, res, next) {
  const key = req.headers['x-api-key'];
  if (key !== API_SECRET) {
    return res.status(401).json({ success: false, error: 'No autorizado.' });
  }
  next();
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'natura-scraper', mode: 'cognito-direct' });
});

/**
 * Computa el SECRET_HASH requerido por Cognito
 */
function computeSecretHash(clientSecret, username, clientId) {
  return crypto
    .createHmac('sha256', clientSecret)
    .update(username + clientId)
    .digest('base64');
}

/**
 * Intenta autenticarse con Cognito usando InitiateAuth
 */
async function cognitoAuth(username, password, clientId, clientSecret) {
  const cognitoUrl = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`;
  
  const authParams = {
    USERNAME: username,
    PASSWORD: password,
  };

  if (clientSecret) {
    authParams.SECRET_HASH = computeSecretHash(clientSecret, username, clientId);
  }

  const body = JSON.stringify({
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: clientId,
    AuthParameters: authParams
  });

  const res = await fetch(cognitoUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body,
    signal: AbortSignal.timeout(15000)
  });

  const data = await res.json();
  return data;
}

app.post('/scrape', authMiddleware, async (req, res) => {
  const { natura_email, natura_password } = req.body;

  if (!natura_email || !natura_password) {
    return res.status(400).json({ success: false, error: 'Faltan credenciales.' });
  }

  console.log(`🚀 Iniciando sync para: ${natura_email.substring(0, 5)}***`);

  try {
    // === PASO 1: Descargar y analizar el JS de la página de auth ===
    console.log('📜 Paso 1: Descargando página de auth para extraer config...');
    
    const mobileHeaders = {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'es-MX,es;q=0.9',
    };

    const authPageRes = await fetch(`https://${NATURA_AUTH_DOMAIN}/?client_id=${NATURA_CLIENT_ID}&country=mx&language=es&company=natura`, {
      headers: mobileHeaders,
      redirect: 'follow',
      signal: AbortSignal.timeout(15000)
    });

    const authHtml = await authPageRes.text();
    console.log(`   Auth page status: ${authPageRes.status}, size: ${authHtml.length}`);

    // Extraer URLs de scripts
    const scriptUrls = [...authHtml.matchAll(/src="([^"]+)"/g)].map(m => m[1]);
    console.log(`   Scripts: ${scriptUrls.join(', ')}`);

    // Variables que vamos a buscar
    let foundClientSecret = null;
    let foundPoolId = null;
    let foundAltClientId = null;
    let foundApiUrls = [];

    // Descargar cada script JS y buscar configuración
    for (const scriptUrl of scriptUrls) {
      try {
        const fullUrl = scriptUrl.startsWith('http') ? scriptUrl : `https://${NATURA_AUTH_DOMAIN}${scriptUrl}`;
        console.log(`   📥 Descargando: ${fullUrl.substring(0, 80)}...`);
        
        const jsRes = await fetch(fullUrl, {
          headers: mobileHeaders,
          signal: AbortSignal.timeout(15000)
        });

        if (!jsRes.ok) {
          console.log(`   → Status ${jsRes.status}`);
          continue;
        }

        const js = await jsRes.text();
        console.log(`   → ${js.length} bytes`);

        // Buscar Client Secret (suele verse como clientSecret, client_secret, etc.)
        const secretPatterns = [
          /client[_\-]?secret['":\s]+['"]([a-zA-Z0-9]+)['"]/gi,
          /SECRET['":\s]+['"]([a-zA-Z0-9]{20,})['"]/gi,
          /clientSecret['":\s]+['"]([a-zA-Z0-9]+)['"]/gi,
          /app[_\-]?secret['":\s]+['"]([a-zA-Z0-9]+)['"]/gi,
        ];

        for (const pattern of secretPatterns) {
          const match = pattern.exec(js);
          if (match) {
            foundClientSecret = match[1];
            console.log(`   🔑 CLIENT SECRET ENCONTRADO: ${foundClientSecret.substring(0, 10)}...`);
          }
        }

        // Buscar User Pool ID (formato: us-east-1_XXXXXXXXX)
        const poolMatch = js.match(/['"]((?:us|eu|ap|sa|ca)-[a-z]+-\d+_[a-zA-Z0-9]+)['"]/);
        if (poolMatch) {
          foundPoolId = poolMatch[1];
          console.log(`   🏊 USER POOL ID: ${foundPoolId}`);
        }

        // Buscar Client IDs alternativos (formato: alphanumeric, 20-30 chars)
        const clientIds = [...new Set(js.match(/['"]([a-z0-9]{20,30})['"]/g) || [])].map(s => s.replace(/['"]/g, ''));
        const altIds = clientIds.filter(id => id !== NATURA_CLIENT_ID && id.length >= 20 && id.length <= 30);
        if (altIds.length > 0) {
          console.log(`   🆔 Client IDs alternativos: ${altIds.join(', ')}`);
          foundAltClientId = altIds[0];
        }

        // Buscar URLs de API
        const apiMatches = [...new Set(js.match(/https?:\/\/[^"'\s\)]+(?:api|bff|graphql)[^"'\s\)]*/gi) || [])];
        if (apiMatches.length > 0) {
          foundApiUrls.push(...apiMatches);
          console.log(`   🔗 API URLs:`);
          apiMatches.slice(0, 10).forEach(u => console.log(`     → ${u}`));
        }

        // Buscar menciones de growthplan
        const growthRefs = js.match(/.{0,40}growthplan.{0,60}/gi);
        if (growthRefs) {
          console.log(`   📊 Growth refs:`);
          growthRefs.slice(0, 5).forEach(g => console.log(`     → ${g}`));
        }

        // Buscar configuración general tipo { key: "value" } 
        const configPatterns = [
          /(?:config|settings|env|environment)\s*[:=]\s*(\{[^}]{10,500}\})/gi,
          /REACT_APP_[A-Z_]+\s*[:=]\s*["']([^"']+)["']/gi,
          /process\.env\.([A-Z_]+)/gi,
        ];

        for (const cp of configPatterns) {
          const matches = [...js.matchAll(cp)];
          if (matches.length > 0) {
            console.log(`   ⚙️ Config patterns:`);
            matches.slice(0, 5).forEach(m => console.log(`     → ${m[0].substring(0, 120)}`));
          }
        }

      } catch (e) {
        console.log(`   → Error: ${e.message?.substring(0, 60)}`);
      }
    }

    // === PASO 2: Intentar auth con lo que encontramos ===
    console.log('\n🔐 Paso 2: Intentando autenticación con datos encontrados...');

    // Intento 2a: Si encontramos client secret, usar el client ID original + secret
    if (foundClientSecret) {
      console.log(`   Intentando con SECRET_HASH (secret: ${foundClientSecret.substring(0, 8)}...)...`);
      const result = await cognitoAuth(natura_email, natura_password, NATURA_CLIENT_ID, foundClientSecret);
      console.log(`   → Resultado: ${JSON.stringify(result).substring(0, 300)}`);
      
      if (result.AuthenticationResult) {
        console.log('   ✅ AUTH EXITOSO!');
        return await handleAuthSuccess(result.AuthenticationResult, mobileHeaders, res);
      }
    }

    // Intento 2b: Si encontramos un client ID alternativo (posiblemente sin secret)
    if (foundAltClientId) {
      console.log(`   Intentando con client ID alternativo: ${foundAltClientId}...`);
      const result = await cognitoAuth(natura_email, natura_password, foundAltClientId, null);
      console.log(`   → Resultado: ${JSON.stringify(result).substring(0, 300)}`);
      
      if (result.AuthenticationResult) {
        console.log('   ✅ AUTH EXITOSO con client alternativo!');
        return await handleAuthSuccess(result.AuthenticationResult, mobileHeaders, res);
      }

      // Si este client ID también necesita secret, intentar con el secret encontrado
      if (result.__type?.includes('SECRET_HASH') && foundClientSecret) {
        console.log('   Reintentando alt client ID + secret...');
        const result2 = await cognitoAuth(natura_email, natura_password, foundAltClientId, foundClientSecret);
        console.log(`   → Resultado: ${JSON.stringify(result2).substring(0, 300)}`);
        
        if (result2.AuthenticationResult) {
          console.log('   ✅ AUTH EXITOSO!');
          return await handleAuthSuccess(result2.AuthenticationResult, mobileHeaders, res);
        }
      }
    }

    // Intento 2c: Probar el health endpoint accesible con cualquier token/cookie
    console.log('\n🌐 Paso 3: Explorando API accesible...');
    
    // El endpoint /api/health respondió 200 antes. Explorar qué más hay
    const explorationUrls = [
      `${NATURA_BASE_URL}/api/health`,
      `${NATURA_BASE_URL}/api/swagger`,
      `${NATURA_BASE_URL}/api/docs`,
      `${NATURA_BASE_URL}/api/v1`,
      `${NATURA_BASE_URL}/api/auth`,
      `${NATURA_BASE_URL}/api/auth/login`,
      `${NATURA_BASE_URL}/api/auth/callback`,
      `${NATURA_BASE_URL}/api/session`,
      `${NATURA_BASE_URL}/api/user`,
      `${NATURA_BASE_URL}/api/me`,
      ...foundApiUrls.slice(0, 10)
    ];

    for (const url of [...new Set(explorationUrls)]) {
      try {
        const explRes = await fetch(url, {
          headers: { ...mobileHeaders, 'Accept': 'application/json' },
          signal: AbortSignal.timeout(5000)
        });
        const contentType = explRes.headers.get('content-type') || '';
        const body = await explRes.text();
        console.log(`   ${url} → ${explRes.status} (${contentType.split(';')[0]})`);
        if (body.length < 500 && contentType.includes('json')) {
          console.log(`     ${body}`);
        }
      } catch (e) {
        console.log(`   ${url} → ${e.message?.substring(0, 40)}`);
      }
    }

    // Resumen final
    console.log('\n📋 RESUMEN DE DESCUBRIMIENTO:');
    console.log(`   Región Cognito: ${COGNITO_REGION}`);
    console.log(`   Client ID: ${NATURA_CLIENT_ID}`);
    console.log(`   Client Secret: ${foundClientSecret || 'NO ENCONTRADO'}`);
    console.log(`   Pool ID: ${foundPoolId || 'NO ENCONTRADO'}`);
    console.log(`   Alt Client IDs: ${foundAltClientId || 'NINGUNO'}`);
    console.log(`   API URLs: ${foundApiUrls.length}`);

    throw new Error('Exploración completa. Revisa los logs.');

  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Con tokens de Cognito, intenta obtener datos de crecimiento
 */
async function handleAuthSuccess(authResult, headers, res) {
  const idToken = authResult.IdToken;
  const accessToken = authResult.AccessToken;
  
  console.log('📊 Buscando datos de crecimiento con token...');

  // Primero: intentar obtener sesión en el sitio web con el token
  try {
    const callbackUrl = `${NATURA_BASE_URL}/natura-callback?return_url=home&id_token=${idToken}&access_token=${accessToken}`;
    const sessionRes = await fetch(callbackUrl, {
      headers: { ...headers },
      redirect: 'manual',
      signal: AbortSignal.timeout(10000)
    });
    console.log(`   Callback → Status: ${sessionRes.status}`);
    
    const sessionCookies = sessionRes.headers.get('set-cookie') || '';
    if (sessionCookies) {
      console.log(`   Cookies de sesión obtenidas!`);
    }
  } catch (e) {
    console.log(`   Callback error: ${e.message?.substring(0, 60)}`);
  }

  // Luego: llamar al API con Bearer token
  const growthUrls = [
    `${NATURA_BASE_URL}/api/growthplan`,
    `${NATURA_BASE_URL}/api/consultant/growthplan`,
    `${NATURA_BASE_URL}/bff/growthplan`,
  ];

  for (const url of growthUrls) {
    try {
      // Con Access Token
      const gRes = await fetch(url, {
        headers: {
          ...headers,
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        signal: AbortSignal.timeout(10000)
      });

      const contentType = gRes.headers.get('content-type') || '';
      console.log(`   ${url} → ${gRes.status} (${contentType.split(';')[0]})`);

      if (contentType.includes('json')) {
        const data = await gRes.json();
        console.log(`   → ${JSON.stringify(data).substring(0, 300)}`);
        
        if (data?.data?.consultantLevel) {
          console.log('✅ ¡Datos de crecimiento obtenidos!');
          return res.json({ success: true, data: data.data.consultantLevel });
        }
      }
    } catch (e) {
      console.log(`   → Error: ${e.message?.substring(0, 60)}`);
    }
  }

  throw new Error('Auth exitoso pero no se encontraron datos de crecimiento.');
}

app.listen(PORT, () => {
  console.log(`🔧 Natura Scraper Service corriendo en puerto ${PORT}`);
});
