import express from 'express';
import cors from 'cors';
import crypto from 'crypto';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

const CONFIG = {
  // Credenciales extraídas del JS de Natura Auth frontend
  CLIENT_ID: '31ndsgochinbk61v3jk8dhsf2o',
  NATURA_API: 'https://authenticator-cognito-apigw.prd.naturacloud.com/authentication-api/login',
  NATURA_API_KEY: '2aa3706e-93b1-4b36-bb93-c76f5076d576',
  AES_KEY: 'N@tur4=',
  NATURA_BASE: 'https://minegocio.natura-avon.com.mx',
  COUNTRY: 'mx',
  COMPANY: 'natura',
};

// === Encriptar password con AES (mismo método que el frontend de Natura) ===
// Natura usa CryptoJS.AES.encrypt(password, key).toString()
// CryptoJS con passphrase usa: PBKDF2-like KDF (OpenSSL EVP_BytesToKey) para derivar key+iv
function encryptPassword(password) {
  const key = CONFIG.AES_KEY;

  // CryptoJS.AES.encrypt con una string como key usa OpenSSL's EVP_BytesToKey
  // Genera un salt random de 8 bytes, luego:
  // key_iv = MD5(key + salt) + MD5(MD5(key + salt) + key + salt) + ...
  const salt = crypto.randomBytes(8);
  const keyAndIV = evpBytesToKey(key, salt, 32, 16); // AES-256: 32 bytes key, 16 bytes IV

  const cipher = crypto.createCipheriv('aes-256-cbc', keyAndIV.key, keyAndIV.iv);
  let encrypted = cipher.update(password, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  // CryptoJS output format: "Salted__" + salt + encrypted, all base64
  const result = Buffer.concat([
    Buffer.from('Salted__', 'ascii'),
    salt,
    encrypted,
  ]);

  return result.toString('base64');
}

// OpenSSL EVP_BytesToKey - compatible con CryptoJS passphrase mode
function evpBytesToKey(passphrase, salt, keyLen, ivLen) {
  const totalLen = keyLen + ivLen;
  let derivedBytes = Buffer.alloc(0);
  let block = Buffer.alloc(0);

  while (derivedBytes.length < totalLen) {
    const data = Buffer.concat([
      block,
      Buffer.from(passphrase, 'utf8'),
      salt,
    ]);
    block = crypto.createHash('md5').update(data).digest();
    derivedBytes = Buffer.concat([derivedBytes, block]);
  }

  return {
    key: derivedBytes.subarray(0, keyLen),
    iv: derivedBytes.subarray(keyLen, keyLen + ivLen),
  };
}

function authMiddleware(req, res, next) {
  if (req.headers['x-api-key'] !== (process.env.SCRAPER_API_SECRET || 'dev-secret-key')) {
    return res.status(401).json({ success: false, error: 'No autorizado.' });
  }
  next();
}

app.get('/health', (req, res) => res.json({ status: 'ok', method: 'natura-api-direct' }));

// =====================================================
// ESTRATEGIA: Llamar a la API proxy de Natura directamente
// Exactamente como lo hace su frontend React
// SIN navegador, SIN Akamai, SIN Playwright
// =====================================================

async function authenticateViaNatura(email, password) {
  console.log('🔑 Intentando múltiples métodos de autenticación...\n');

  // ====================================================================
  // MÉTODO 1: Natura authentication-api (como lo hace el frontend React)
  // ====================================================================
  try {
    console.log('📡 [1/3] Natura authentication-api...');
    const encryptedPassword = encryptPassword(password);
    console.log(`   Password encriptada: ${encryptedPassword.substring(0, 30)}...`);

    const body = {
      clientId: CONFIG.CLIENT_ID,
      company: CONFIG.COMPANY,
      country: CONFIG.COUNTRY,
      password: encryptedPassword,
      recaptchaToken: null,
      redirectUrl: CONFIG.NATURA_BASE + '/',
      username: email,
    };

    const response = await fetch(CONFIG.NATURA_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CONFIG.NATURA_API_KEY,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://natura-auth.prd.naturacloud.com',
        'Referer': 'https://natura-auth.prd.naturacloud.com/',
        'Accept-Language': 'es-MX,es;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });

    const data = await response.json();
    console.log(`   Status: ${response.status}`);
    console.log(`   Response: ${JSON.stringify(data).substring(0, 400)}`);

    if (response.ok && (data?.data?.id_token || data?.data?.IdToken || data?.id_token || data?.AuthenticationResult)) {
      console.log('   ✅ ¡Login exitoso via Natura API!');
      const tokens = data?.data || data?.AuthenticationResult || data;
      return {
        id_token: tokens.id_token || tokens.IdToken,
        access_token: tokens.access_token || tokens.AccessToken,
        refresh_token: tokens.refresh_token || tokens.RefreshToken,
        expires_in: tokens.expires_in || tokens.ExpiresIn,
      };
    }
    console.log(`   ❌ Natura API falló (${response.status})`);
  } catch (err) {
    console.log(`   ❌ Natura API error: ${err.message}`);
  }

  // ====================================================================
  // MÉTODO 2: Cognito InitiateAuth con Android Client ID (sin SECRET)
  // ====================================================================
  const ANDROID_CLIENT_ID = '2mclhp3ui6kf7pjrvh2kv6a6lq';
  try {
    console.log(`\n📡 [2/3] Cognito directo (Android client: ${ANDROID_CLIENT_ID})...`);
    const cognitoUrl = `https://cognito-idp.${CONFIG.COGNITO_REGION}.amazonaws.com/`;

    const response = await fetch(cognitoUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
      },
      body: JSON.stringify({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: ANDROID_CLIENT_ID,
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password, // Sin encriptar - Cognito espera plain text
        },
      }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await response.json();
    console.log(`   Status: ${response.status}`);
    console.log(`   Response: ${JSON.stringify(data).substring(0, 400)}`);

    if (data?.AuthenticationResult) {
      console.log('   ✅ ¡Login exitoso via Cognito Android!');
      return {
        id_token: data.AuthenticationResult.IdToken,
        access_token: data.AuthenticationResult.AccessToken,
        refresh_token: data.AuthenticationResult.RefreshToken,
        expires_in: data.AuthenticationResult.ExpiresIn,
      };
    }
    if (data?.ChallengeName) {
      console.log(`   ⚠️ Challenge: ${data.ChallengeName}`);
    }
    console.log(`   ❌ Cognito Android falló: ${data?.__type?.split('#').pop()} - ${data?.message}`);
  } catch (err) {
    console.log(`   ❌ Cognito Android error: ${err.message}`);
  }

  // ====================================================================
  // MÉTODO 3: Cognito InitiateAuth con iOS Client ID (sin SECRET)
  // ====================================================================
  const IOS_CLIENT_ID = '3u0gp4t079j9g2m249gdghfghm';
  try {
    console.log(`\n📡 [3/3] Cognito directo (iOS client: ${IOS_CLIENT_ID})...`);
    const cognitoUrl = `https://cognito-idp.${CONFIG.COGNITO_REGION}.amazonaws.com/`;

    const response = await fetch(cognitoUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
      },
      body: JSON.stringify({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: IOS_CLIENT_ID,
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
        },
      }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await response.json();
    console.log(`   Status: ${response.status}`);
    console.log(`   Response: ${JSON.stringify(data).substring(0, 400)}`);

    if (data?.AuthenticationResult) {
      console.log('   ✅ ¡Login exitoso via Cognito iOS!');
      return {
        id_token: data.AuthenticationResult.IdToken,
        access_token: data.AuthenticationResult.AccessToken,
        refresh_token: data.AuthenticationResult.RefreshToken,
        expires_in: data.AuthenticationResult.ExpiresIn,
      };
    }
    if (data?.ChallengeName) {
      console.log(`   ⚠️ Challenge: ${data.ChallengeName}`);
    }
    console.log(`   ❌ Cognito iOS falló: ${data?.__type?.split('#').pop()} - ${data?.message}`);
  } catch (err) {
    console.log(`   ❌ Cognito iOS error: ${err.message}`);
  }

  throw new Error('Todos los métodos de autenticación fallaron. Ver logs para detalles.');
}

app.post('/scrape', authMiddleware, async (req, res) => {
  const { natura_email, natura_password } = req.body;
  if (!natura_email || !natura_password) {
    return res.status(400).json({ success: false, error: 'Faltan credenciales.' });
  }

  console.log(`🚀 Sync para: ${natura_email.substring(0, 5)}***`);

  try {
    const tokenData = await authenticateViaNatura(natura_email, natura_password);

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

app.listen(PORT, () => console.log(`🔧 Natura Scraper en puerto ${PORT} (modo: API directa con AES)`));
