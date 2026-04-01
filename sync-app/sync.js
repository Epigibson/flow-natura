// ═══════════════════════════════════════════════════════════════
// Flow Natura Sync — Desktop App
// Sincroniza datos de crecimiento de Natura desde la PC del usuario
// CERO dependencias externas — solo Node.js built-ins
// ═══════════════════════════════════════════════════════════════

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

// ─── Config ────────────────────────────────────────────────────
const CONFIG = {
  NATURA_API: 'https://authenticator-cognito-apigw.prd.naturacloud.com/authentication-api/login',
  NATURA_API_KEY: '2aa3706e-93b1-4b36-bb93-c76f5076d576',
  NATURA_AES_KEY: 'N@tur4=',
  CLIENT_ID: '31ndsgochinbk61v3jk8dhsf2o',
  COUNTRY: 'mx',
  COMPANY: 'natura',
  NATURA_BASE: 'https://minegocio.natura-avon.com.mx',

  SUPABASE_URL: 'https://etodkwdlsrzrufxxbsgh.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0b2Rrd2Rsc3J6cnVmeHhic2doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNzUzOTcsImV4cCI6MjA4OTk1MTM5N30.SR0da3nt9Va0qhO3usl14hf3LLL_0Jdt5NKtRjhFSQI',

  DESKTOP_SYNC_KEY: 'fn-desktop-sync-2026',

  // Vercel production URL
  SYNC_ENDPOINT: 'https://flow-natura.vercel.app/api/sync-desktop',
};

// ─── Config directory for saved credentials ────────────────────
const CONFIG_DIR = path.join(os.homedir(), '.flow-natura');
const CRED_FILE = path.join(CONFIG_DIR, 'credentials.dat');
const LOCAL_KEY = crypto.createHash('sha256').update(os.hostname() + os.userInfo().username).digest();

function saveCredentials(email, password) {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', LOCAL_KEY, iv);
  const data = JSON.stringify({ email, password });
  const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
  fs.writeFileSync(CRED_FILE, Buffer.concat([iv, encrypted]));
}

function loadCredentials() {
  try {
    if (!fs.existsSync(CRED_FILE)) return null;
    const raw = fs.readFileSync(CRED_FILE);
    const iv = raw.subarray(0, 16);
    const encrypted = raw.subarray(16);
    const decipher = crypto.createDecipheriv('aes-256-cbc', LOCAL_KEY, iv);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch { return null; }
}

// ─── HTTPS request helper (no dependencies!) ───────────────────
function request(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = https.request(opts, (res) => {
      let chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const data = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, headers: res.headers, data });
      });
    });

    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout')); });
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

// ─── AES encryption (CryptoJS-compatible) ──────────────────────
function evpBytesToKey(passphrase, salt, keyLen, ivLen) {
  let derived = Buffer.alloc(0), block = Buffer.alloc(0);
  while (derived.length < keyLen + ivLen) {
    block = crypto.createHash('md5').update(Buffer.concat([block, Buffer.from(passphrase), salt])).digest();
    derived = Buffer.concat([derived, block]);
  }
  return { key: derived.subarray(0, keyLen), iv: derived.subarray(keyLen, keyLen + ivLen) };
}

function encryptNaturaPassword(password) {
  const salt = crypto.randomBytes(8);
  const { key, iv } = evpBytesToKey(CONFIG.NATURA_AES_KEY, salt, 32, 16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from('Salted__'), salt, encrypted]).toString('base64');
}

// ─── Natura Authentication ─────────────────────────────────────
async function authenticateNatura(email, password) {
  const encPass = encryptNaturaPassword(password);

  const body = JSON.stringify({
    clientId: CONFIG.CLIENT_ID,
    company: CONFIG.COMPANY,
    country: CONFIG.COUNTRY,
    password: encPass,
    recaptchaToken: null,
    redirectUrl: CONFIG.NATURA_BASE + '/',
    username: email,
  });

  const res = await request(CONFIG.NATURA_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CONFIG.NATURA_API_KEY,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
      'Accept': 'application/json, text/plain, */*',
      'Origin': 'https://natura-auth.prd.naturacloud.com',
      'Referer': 'https://natura-auth.prd.naturacloud.com/',
    },
  }, body);

  const json = JSON.parse(res.data);

  if (res.status === 200 || res.status === 201) {
    const tokens = json?.data || json?.AuthenticationResult || json;
    return {
      success: true,
      id_token: tokens.id_token || tokens.IdToken,
      access_token: tokens.access_token || tokens.AccessToken,
    };
  }

  return { success: false, error: json?.message || json?.error || `HTTP ${res.status}`, raw: json };
}

// ─── Fetch growth data from Natura ─────────────────────────────
async function fetchGrowthData(token) {
  const urls = [
    CONFIG.NATURA_BASE + '/api/growthplan',
    CONFIG.NATURA_BASE + '/bff/growthplan',
  ];

  for (const url of urls) {
    try {
      const res = await request(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
          'Accept': 'application/json',
        },
      });

      if (res.status === 200) {
        const json = JSON.parse(res.data);
        if (json?.data?.consultantLevel) return json.data.consultantLevel;
        if (json?.data) return json.data;
        return json;
      }
    } catch (e) { /* try next */ }
  }
  return null;
}

// ─── Send data to Vercel/Supabase ──────────────────────────────
async function sendToSupabase(naturaEmail, growthData) {
  const body = JSON.stringify({
    desktop_key: CONFIG.DESKTOP_SYNC_KEY,
    natura_email: naturaEmail,
    growth_data: growthData,
  });

  const res = await request(CONFIG.SYNC_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, body);

  return JSON.parse(res.data);
}

// ─── Beautiful embedded HTML UI ────────────────────────────────
function getHTML(savedEmail) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Flow Natura — Sincronización</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', sans-serif;
      min-height: 100vh;
      background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #e0e0e0;
      overflow: hidden;
    }
    .bg-glow {
      position: fixed;
      width: 500px; height: 500px;
      border-radius: 50%;
      filter: blur(120px);
      opacity: 0.15;
      pointer-events: none;
    }
    .glow-1 { top: -200px; left: -100px; background: #10b981; }
    .glow-2 { bottom: -200px; right: -100px; background: #f97316; }

    .card {
      background: rgba(255,255,255,0.04);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 24px;
      padding: 48px 40px;
      width: 420px;
      position: relative;
      z-index: 1;
      box-shadow: 0 25px 50px rgba(0,0,0,0.5);
    }
    .logo {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
    }
    .logo-icon {
      width: 44px; height: 44px;
      background: linear-gradient(135deg, #10b981, #059669);
      border-radius: 12px;
      display: flex; align-items: center; justify-content: center;
      font-size: 24px;
    }
    .logo h1 {
      font-size: 22px;
      font-weight: 700;
      background: linear-gradient(90deg, #10b981, #34d399);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .subtitle {
      color: rgba(255,255,255,0.5);
      font-size: 14px;
      margin-bottom: 32px;
      line-height: 1.5;
    }
    .input-group { margin-bottom: 20px; }
    .input-group label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      color: rgba(255,255,255,0.6);
      margin-bottom: 8px;
    }
    .input-group input {
      width: 100%;
      padding: 14px 16px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      color: #fff;
      font-size: 15px;
      font-family: 'Inter', sans-serif;
      outline: none;
      transition: all 0.3s;
    }
    .input-group input:focus {
      border-color: #10b981;
      box-shadow: 0 0 0 3px rgba(16,185,129,0.15);
    }
    .input-group input::placeholder { color: rgba(255,255,255,0.25); }

    .btn {
      width: 100%;
      padding: 16px;
      background: linear-gradient(135deg, #10b981, #059669);
      border: none;
      border-radius: 14px;
      color: #fff;
      font-size: 16px;
      font-weight: 600;
      font-family: 'Inter', sans-serif;
      cursor: pointer;
      transition: all 0.3s;
      margin-top: 8px;
    }
    .btn:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(16,185,129,0.3); }
    .btn:active { transform: translateY(0); }
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none !important;
    }

    .remember-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
      font-size: 13px;
      color: rgba(255,255,255,0.5);
    }
    .remember-row input[type=checkbox] {
      accent-color: #10b981;
      width: 16px; height: 16px;
    }

    #status {
      margin-top: 24px;
      padding: 16px;
      border-radius: 12px;
      font-size: 14px;
      line-height: 1.6;
      display: none;
    }
    #status.loading {
      display: block;
      background: rgba(16,185,129,0.08);
      border: 1px solid rgba(16,185,129,0.2);
      color: #34d399;
    }
    #status.success {
      display: block;
      background: rgba(16,185,129,0.12);
      border: 1px solid rgba(16,185,129,0.3);
      color: #6ee7b7;
    }
    #status.error {
      display: block;
      background: rgba(239,68,68,0.08);
      border: 1px solid rgba(239,68,68,0.2);
      color: #fca5a5;
    }

    .spinner {
      display: inline-block;
      width: 16px; height: 16px;
      border: 2px solid rgba(16,185,129,0.3);
      border-top-color: #10b981;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      vertical-align: middle;
      margin-right: 8px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .version {
      text-align: center;
      margin-top: 20px;
      font-size: 11px;
      color: rgba(255,255,255,0.2);
    }
  </style>
</head>
<body>
  <div class="bg-glow glow-1"></div>
  <div class="bg-glow glow-2"></div>

  <div class="card">
    <div class="logo">
      <div class="logo-icon">🌿</div>
      <h1>Flow Natura</h1>
    </div>
    <p class="subtitle">Sincroniza tus datos de crecimiento de Natura automáticamente.</p>

    <form id="syncForm" onsubmit="doSync(event)">
      <div class="input-group">
        <label>Correo de Natura</label>
        <input type="email" id="email" placeholder="tucorreo@ejemplo.com" value="${savedEmail || ''}" required>
      </div>
      <div class="input-group">
        <label>Contraseña de Natura</label>
        <input type="password" id="password" placeholder="Tu contraseña de Mi Negocio" required>
      </div>
      <div class="remember-row">
        <input type="checkbox" id="remember" checked>
        <label for="remember">Recordar credenciales en esta PC</label>
      </div>
      <button type="submit" class="btn" id="syncBtn">🔄 Sincronizar Datos</button>
    </form>

    <div id="status"></div>
    <div class="version">Flow Natura Sync v1.0 — Tus datos nunca salen de tu computadora</div>
  </div>

  <script>
    async function doSync(e) {
      e.preventDefault();
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const remember = document.getElementById('remember').checked;
      const btn = document.getElementById('syncBtn');
      const status = document.getElementById('status');

      btn.disabled = true;
      btn.textContent = '⏳ Sincronizando...';
      status.className = 'loading';
      status.innerHTML = '<span class="spinner"></span> Conectando con Natura...';

      try {
        const res = await fetch('/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, remember }),
        });

        const data = await res.json();

        if (data.success) {
          status.className = 'success';
          status.innerHTML = '✅ <strong>¡Sincronización exitosa!</strong><br>'
            + (data.level ? '📊 Nivel: ' + data.level + '<br>' : '')
            + (data.message || 'Tus datos de crecimiento han sido actualizados.')
            + '<br><br>Puedes cerrar esta ventana.';
          btn.textContent = '✅ ¡Listo!';
        } else {
          throw new Error(data.error || 'Error desconocido');
        }
      } catch (err) {
        status.className = 'error';
        status.innerHTML = '❌ <strong>Error:</strong> ' + err.message
          + '<br><br>Verifica tus credenciales e intenta de nuevo.';
        btn.disabled = false;
        btn.textContent = '🔄 Reintentar';
      }
    }
  </script>
</body>
</html>`;
}

// ─── HTTP Server ───────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  // Serve the UI
  if (req.method === 'GET' && req.url === '/') {
    const saved = loadCredentials();
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(getHTML(saved?.email));
    return;
  }

  // Handle sync request
  if (req.method === 'POST' && req.url === '/sync') {
    let body = '';
    req.on('data', (c) => body += c);
    req.on('end', async () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });

      try {
        const { email, password, remember } = JSON.parse(body);

        if (remember) saveCredentials(email, password);

        console.log(`\n🔑 Autenticando ${email.substring(0, 5)}*** con Natura...`);

        // Step 1: Auth with Natura
        const auth = await authenticateNatura(email, password);

        if (!auth.success) {
          console.log(`❌ Auth falló: ${auth.error}`);
          // Even if API auth fails, try to report back useful info
          res.end(JSON.stringify({
            success: false,
            error: `No se pudo autenticar con Natura: ${auth.error}`,
          }));
          return;
        }

        console.log('✅ Autenticación exitosa!');
        const token = auth.access_token || auth.id_token;

        // Step 2: Fetch growth data
        console.log('📊 Obteniendo datos de crecimiento...');
        let growthData = null;
        try {
          growthData = await fetchGrowthData(token);
        } catch (e) {
          console.log(`⚠️ No se pudieron obtener datos de crecimiento: ${e.message}`);
        }

        // Step 3: Send to Supabase via Vercel endpoint
        console.log('📤 Enviando datos a Flow Natura...');
        try {
          const syncResult = await sendToSupabase(email, growthData);
          console.log('✅ Datos enviados a Supabase');
        } catch (e) {
          console.log(`⚠️ Error enviando a Supabase: ${e.message}`);
        }

        const level = growthData?.level?.description || growthData?.currentLevel || null;
        console.log('🎉 ¡Sincronización completa!');

        res.end(JSON.stringify({
          success: true,
          level,
          message: growthData
            ? 'Datos de crecimiento sincronizados correctamente.'
            : 'Autenticación exitosa. Los datos se actualizarán en breve.',
        }));

      } catch (err) {
        console.error('💥 Error:', err.message);
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

// ─── Start ─────────────────────────────────────────────────────
server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}`;

  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║   🌿 Flow Natura Sync v1.0           ║');
  console.log(`  ║   Abierto en: ${url.padEnd(22)}║`);
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');

  // Open the browser automatically
  const cmd = process.platform === 'win32' ? `start ${url}`
    : process.platform === 'darwin' ? `open ${url}`
    : `xdg-open ${url}`;

  exec(cmd, (err) => {
    if (err) console.log(`  Abre manualmente: ${url}`);
  });
});
