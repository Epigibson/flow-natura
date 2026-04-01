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
  console.log('🔑 Autenticando via Natura authentication-api...');

  // Paso 1: Encriptar password como lo hace el frontend
  const encryptedPassword = encryptPassword(password);
  console.log(`   Password encriptada: ${encryptedPassword.substring(0, 30)}...`);

  // Paso 2: Llamar a la API exactamente como el frontend
  const body = {
    clientId: CONFIG.CLIENT_ID,
    company: CONFIG.COMPANY,
    country: CONFIG.COUNTRY,
    password: encryptedPassword,
    recaptchaToken: null,
    redirectUrl: CONFIG.NATURA_BASE + '/',
    username: email,
  };

  console.log(`   → POST ${CONFIG.NATURA_API}`);
  console.log(`   → Body: ${JSON.stringify({ ...body, password: '***' })}`);

  const response = await fetch(CONFIG.NATURA_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CONFIG.NATURA_API_KEY,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
      'Accept': 'application/json',
      'Origin': 'https://natura-auth.prd.naturacloud.com',
      'Referer': 'https://natura-auth.prd.naturacloud.com/',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });

  const data = await response.json();
  console.log(`   Status: ${response.status}`);
  console.log(`   Response keys: ${JSON.stringify(Object.keys(data))}`);
  console.log(`   Response (300 chars): ${JSON.stringify(data).substring(0, 300)}`);

  // Caso exitoso: data contiene tokens
  if (data?.data?.id_token || data?.data?.IdToken) {
    console.log('   ✅ ¡Login exitoso!');
    return {
      id_token: data.data.id_token || data.data.IdToken,
      access_token: data.data.access_token || data.data.AccessToken,
      refresh_token: data.data.refresh_token || data.data.RefreshToken,
      expires_in: data.data.expires_in || data.data.ExpiresIn,
    };
  }

  // Caso: tokens en root level
  if (data?.id_token || data?.IdToken) {
    console.log('   ✅ ¡Login exitoso (flat response)!');
    return {
      id_token: data.id_token || data.IdToken,
      access_token: data.access_token || data.AccessToken,
      refresh_token: data.refresh_token || data.RefreshToken,
      expires_in: data.expires_in || data.ExpiresIn,
    };
  }

  // Caso: AuthenticationResult de Cognito directamente
  if (data?.AuthenticationResult) {
    console.log('   ✅ ¡Login exitoso (Cognito format)!');
    return {
      id_token: data.AuthenticationResult.IdToken,
      access_token: data.AuthenticationResult.AccessToken,
      refresh_token: data.AuthenticationResult.RefreshToken,
      expires_in: data.AuthenticationResult.ExpiresIn,
    };
  }

  // Caso error
  if (data?.error || data?.message) {
    throw new Error(`Natura API error: ${data.error || data.message} (status ${response.status})`);
  }

  throw new Error(`Respuesta inesperada (${response.status}): ${JSON.stringify(data).substring(0, 500)}`);
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
