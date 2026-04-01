import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

const CONFIG = {
  COGNITO_REGION: 'us-east-1',
  CLIENT_ID: '31ndsgochinbk61v3jk8dhsf2o',
  NATURA_BASE: 'https://minegocio.natura-avon.com.mx',
};

function authMiddleware(req, res, next) {
  if (req.headers['x-api-key'] !== (process.env.SCRAPER_API_SECRET || 'dev-secret-key')) {
    return res.status(401).json({ success: false, error: 'No autorizado.' });
  }
  next();
}

app.get('/health', (req, res) => res.json({ status: 'ok', method: 'cognito-direct' }));

// =====================================================
// ESTRATEGIA: Llamar directamente a la API de Cognito
// SIN navegador, SIN Akamai, SIN Playwright
// AWS Cognito expone InitiateAuth como API REST pública
// =====================================================

async function authenticateViaCognito(email, password) {
  console.log('🔑 Intentando auth directo con Cognito API...');

  const cognitoUrl = `https://cognito-idp.${CONFIG.COGNITO_REGION}.amazonaws.com/`;

  // Intento 1: USER_PASSWORD_AUTH (el más simple)
  try {
    console.log('   → Probando USER_PASSWORD_AUTH...');
    const response = await fetch(cognitoUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
      },
      body: JSON.stringify({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: CONFIG.CLIENT_ID,
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
        },
      }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await response.json();
    console.log(`   Status: ${response.status}`);
    console.log(`   Response keys: ${Object.keys(data).join(', ')}`);

    if (data.AuthenticationResult) {
      console.log('   ✅ USER_PASSWORD_AUTH exitoso!');
      return {
        id_token: data.AuthenticationResult.IdToken,
        access_token: data.AuthenticationResult.AccessToken,
        refresh_token: data.AuthenticationResult.RefreshToken,
        expires_in: data.AuthenticationResult.ExpiresIn,
        token_type: data.AuthenticationResult.TokenType,
      };
    }

    if (data.ChallengeName) {
      console.log(`   ⚠️ Challenge requerido: ${data.ChallengeName}`);
      // Si requiere NEW_PASSWORD_REQUIRED u otro challenge
      return { challenge: data.ChallengeName, session: data.Session };
    }

    if (data.__type) {
      const errorType = data.__type.split('#').pop();
      console.log(`   ❌ Error Cognito: ${errorType} - ${data.message}`);

      // Si USER_PASSWORD_AUTH no está habilitado, intentar USER_SRP_AUTH
      if (errorType === 'InvalidParameterException' || errorType === 'NotAuthorizedException') {
        // Podría ser credenciales incorrectas vs flujo no disponible
        // InvalidParameterException = flujo no disponible
        // NotAuthorizedException = credenciales incorrectas
        if (errorType === 'NotAuthorizedException') {
          throw new Error(`Credenciales incorrectas: ${data.message}`);
        }
      }
      // Cualquier otro error, lo propagamos
      throw new Error(`Cognito ${errorType}: ${data.message}`);
    }

    throw new Error(`Respuesta inesperada de Cognito: ${JSON.stringify(data).substring(0, 300)}`);

  } catch (err) {
    if (err.message.includes('Credenciales incorrectas')) throw err;
    console.log(`   ❌ USER_PASSWORD_AUTH falló: ${err.message}`);
    // Continuar con SRP si el error indica que el flujo no está disponible
  }

  // Intento 2: Llamar a la authentication-api de Natura directamente (sin browser)
  try {
    console.log('   → Probando authentication-api de Natura directo...');
    const naturaAuthUrl = 'https://authenticator-cognito-apigw.prd.naturacloud.com/authentication-api';

    const response = await fetch(naturaAuthUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
        'Accept': 'application/json',
        'Origin': 'https://natura-auth.prd.naturacloud.com',
        'Referer': 'https://natura-auth.prd.naturacloud.com/',
      },
      body: JSON.stringify({
        username: email,
        password: password,
        clientId: CONFIG.CLIENT_ID,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await response.json();
    console.log(`   Status: ${response.status}`);
    console.log(`   Response keys: ${Object.keys(data).join(', ')}`);
    console.log(`   Data preview: ${JSON.stringify(data).substring(0, 300)}`);

    if (data?.data?.id_token) {
      console.log('   ✅ authentication-api exitoso!');
      return data.data;
    }
    if (data?.id_token) {
      console.log('   ✅ authentication-api exitoso (flat)!');
      return data;
    }

    console.log(`   ❌ authentication-api no devolvió token: ${JSON.stringify(data).substring(0, 300)}`);
  } catch (err) {
    console.log(`   ❌ authentication-api falló: ${err.message}`);
  }

  // Intento 3: Probar variaciones del body de authentication-api
  try {
    console.log('   → Probando authentication-api con formato alternativo...');
    const naturaAuthUrl = 'https://authenticator-cognito-apigw.prd.naturacloud.com/authentication-api';

    const response = await fetch(naturaAuthUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
        'Accept': 'application/json',
        'Origin': 'https://minegocio.natura-avon.com.mx',
        'Referer': 'https://minegocio.natura-avon.com.mx/',
      },
      body: JSON.stringify({
        login: email,
        password: password,
        client_id: CONFIG.CLIENT_ID,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await response.json();
    console.log(`   Status: ${response.status}`);
    console.log(`   Response: ${JSON.stringify(data).substring(0, 500)}`);

    if (data?.data?.id_token || data?.id_token) {
      console.log('   ✅ authentication-api (alt) exitoso!');
      return data?.data || data;
    }
  } catch (err) {
    console.log(`   ❌ authentication-api (alt) falló: ${err.message}`);
  }

  throw new Error('Todos los métodos de autenticación fallaron.');
}

app.post('/scrape', authMiddleware, async (req, res) => {
  const { natura_email, natura_password } = req.body;
  if (!natura_email || !natura_password) {
    return res.status(400).json({ success: false, error: 'Faltan credenciales.' });
  }

  console.log(`🚀 Sync para: ${natura_email.substring(0, 5)}***`);

  try {
    const tokenData = await authenticateViaCognito(natura_email, natura_password);

    if (tokenData.challenge) {
      return res.json({
        success: false,
        error: `Se requiere challenge: ${tokenData.challenge}`,
        challenge: tokenData.challenge,
      });
    }

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

  } catch (err) {
    console.error('❌', err.message);
    res.status(500).json({ success: false, error: err.message });
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

app.listen(PORT, () => console.log(`🔧 Natura Scraper en puerto ${PORT} (modo: Cognito directo, sin browser)`));
