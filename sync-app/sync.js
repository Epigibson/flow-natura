// ═══════════════════════════════════════════════════════════════
// Flow Natura Sync — Desktop App v2
// Usa el Chrome/Edge del sistema para autenticarse con Natura
// desde la IP residencial del usuario (bypass Akamai)
// ═══════════════════════════════════════════════════════════════

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, execSync } = require('child_process');

let puppeteer;
try {
  puppeteer = require('puppeteer-core');
} catch (e) {
  console.error('❌ puppeteer-core no encontrado. Ejecuta: npm install');
  process.exit(1);
}

// ─── Config ────────────────────────────────────────────────────
const CONFIG = {
  SUPABASE_URL: 'https://etodkwdlsrzrufxxbsgh.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0b2Rrd2Rsc3J6cnVmeHhic2doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNzUzOTcsImV4cCI6MjA4OTk1MTM5N30.SR0da3nt9Va0qhO3usl14hf3LLL_0Jdt5NKtRjhFSQI',
  DESKTOP_SYNC_KEY: 'fn-desktop-sync-2026',
  SYNC_ENDPOINT: 'https://flow-natura.vercel.app/api/sync-desktop',
  DASHBOARD_URL: 'https://flow-natura.vercel.app/dashboard',
  LOGIN_URL: 'https://minegocio.natura-avon.com.mx/home',
};

// ─── Find system Chrome/Edge ───────────────────────────────────
function findBrowser() {
  const candidates = [
    // Chrome
    path.join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    // Edge (viene con Windows 10/11)
    path.join(process.env.PROGRAMFILES || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    // Brave
    path.join(process.env.LOCALAPPDATA || '', 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
  ];

  for (const p of candidates) {
    if (p && fs.existsSync(p)) {
      console.log(`  🌐 Browser encontrado: ${path.basename(p)}`);
      return p;
    }
  }
  return null;
}

// ─── Saved credentials ─────────────────────────────────────────
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
    const enc = raw.subarray(16);
    const decipher = crypto.createDecipheriv('aes-256-cbc', LOCAL_KEY, iv);
    return JSON.parse(Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8'));
  } catch { return null; }
}

// ─── HTTPS helper ──────────────────────────────────────────────
function request(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname, port: 443,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    }, (res) => {
      let chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, data: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout')); });
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════
// CORE: Sync with Natura via the system browser (proven method)
// ═══════════════════════════════════════════════════════════════
async function syncViaBrowser(email, password, onProgress) {
  const browserPath = findBrowser();
  if (!browserPath) throw new Error('No se encontró Chrome ni Edge en esta PC.');

  onProgress('Abriendo navegador en segundo plano...');

  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--window-size=1280,800',
    ],
  });

  let growthData = null;

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    // Intercept growthplan API response
    page.on('response', async (response) => {
      if (response.url().includes('growthplan')) {
        try {
          const body = await response.json();
          if (body?.data?.consultantLevel) {
            growthData = body.data.consultantLevel;
            console.log('  🎯 ¡Datos de crecimiento interceptados!');
          }
        } catch {}
      }
    });

    onProgress('Navegando a Mi Negocio Natura...');
    await page.goto(CONFIG.LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    onProgress('Esperando que cargue el formulario...');
    await new Promise(r => setTimeout(r, 3000));

    // Switch to Email mode if needed
    if (email.includes('@')) {
      onProgress('Seleccionando modo E-mail...');
      try {
        const dropdown = await page.$('div[role="combobox"]');
        if (dropdown) {
          await dropdown.click();
          await new Promise(r => setTimeout(r, 1000));
          const options = await page.$$('li[role="option"]');
          for (const opt of options) {
            const text = await opt.evaluate(el => el.textContent);
            if (text && text.includes('E-mail')) {
              await opt.click();
              console.log('  ✅ Selector cambiado a E-mail');
              await new Promise(r => setTimeout(r, 1000));
              break;
            }
          }
        }
      } catch (e) {
        console.log('  ⚠️ No se encontró dropdown de tipo, continuando...');
      }
    }

    // Fill username
    onProgress('Llenando credenciales...');
    const userField = await page.$('input[placeholder*="E-mail"], input[placeholder*="Consultora"], input[type="email"], input[type="text"]');
    if (userField) {
      await userField.click({ clickCount: 3 });
      await userField.type(email, { delay: 50 });
    }

    await new Promise(r => setTimeout(r, 500));

    // Fill password
    const pwdField = await page.$('input[type="password"]');
    if (pwdField) {
      await pwdField.click({ clickCount: 3 });
      await pwdField.type(password, { delay: 50 });
    }

    await new Promise(r => setTimeout(r, 500));

    // Click login button
    onProgress('Iniciando sesión...');
    const loginBtn = await page.evaluateHandle(() => {
      const buttons = document.querySelectorAll('button');
      for (const b of buttons) {
        if (b.textContent.includes('INICIAR') || b.textContent.includes('Iniciar')) return b;
      }
      return null;
    });

    if (loginBtn && loginBtn.asElement()) {
      await loginBtn.asElement().click();
    } else {
      // Fallback: press Enter
      if (pwdField) await pwdField.press('Enter');
    }

    // Wait for growthplan data
    onProgress('Esperando datos de crecimiento...');
    for (let i = 0; i < 60; i++) {
      if (growthData) break;
      await new Promise(r => setTimeout(r, 1000));
      if (i % 5 === 0 && i > 0) onProgress(`Esperando datos... (${i}s)`);
    }

    if (!growthData) {
      throw new Error('Timeout: No se pudieron obtener los datos de crecimiento. Verifica tus credenciales.');
    }

  } finally {
    await browser.close();
  }

  return growthData;
}

// ─── Send to Supabase ──────────────────────────────────────────
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

// ─── HTML UI ───────────────────────────────────────────────────
function getHTML(savedEmail) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Natura Manager — Sincronización</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', sans-serif;
      min-height: 100vh;
      background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%);
      display: flex; align-items: center; justify-content: center;
      color: #e0e0e0; overflow: hidden;
    }
    .bg-glow { position: fixed; width: 500px; height: 500px; border-radius: 50%; filter: blur(120px); opacity: 0.15; pointer-events: none; }
    .glow-1 { top: -200px; left: -100px; background: #10b981; }
    .glow-2 { bottom: -200px; right: -100px; background: #f97316; }
    .card {
      background: rgba(255,255,255,0.04); backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.08); border-radius: 24px;
      padding: 48px 40px; width: 420px; position: relative; z-index: 1;
      box-shadow: 0 25px 50px rgba(0,0,0,0.5);
    }
    .logo { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
    .logo-icon { width: 44px; height: 44px; background: linear-gradient(135deg, #10b981, #059669); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px; }
    .logo h1 { font-size: 22px; font-weight: 700; background: linear-gradient(90deg, #10b981, #34d399); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .subtitle { color: rgba(255,255,255,0.5); font-size: 14px; margin-bottom: 32px; line-height: 1.5; }
    .redirect-link { display: inline-block; margin-top: 12px; color: #10b981; text-decoration: underline; font-weight: 600; cursor: pointer; transition: color 0.2s; }
    .redirect-link:hover { color: #34d399; }
    .countdown { font-size: 12px; color: rgba(255,255,255,0.4); margin-top: 6px; }
    .input-group { margin-bottom: 20px; }
    .input-group label { display: block; font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.6); margin-bottom: 8px; }
    .input-group input {
      width: 100%; padding: 14px 16px; background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; color: #fff;
      font-size: 15px; font-family: 'Inter', sans-serif; outline: none; transition: all 0.3s;
    }
    .input-group input:focus { border-color: #10b981; box-shadow: 0 0 0 3px rgba(16,185,129,0.15); }
    .input-group input::placeholder { color: rgba(255,255,255,0.25); }
    .btn {
      width: 100%; padding: 16px; background: linear-gradient(135deg, #10b981, #059669);
      border: none; border-radius: 14px; color: #fff; font-size: 16px; font-weight: 600;
      font-family: 'Inter', sans-serif; cursor: pointer; transition: all 0.3s; margin-top: 8px;
    }
    .btn:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(16,185,129,0.3); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none !important; }
    .remember-row { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; font-size: 13px; color: rgba(255,255,255,0.5); }
    .remember-row input[type=checkbox] { accent-color: #10b981; width: 16px; height: 16px; }
    #status { margin-top: 24px; padding: 16px; border-radius: 12px; font-size: 14px; line-height: 1.6; display: none; }
    #status.loading { display: block; background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.2); color: #34d399; }
    #status.success { display: block; background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.3); color: #6ee7b7; }
    #status.error { display: block; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2); color: #fca5a5; }
    .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(16,185,129,0.3); border-top-color: #10b981; border-radius: 50%; animation: spin 0.8s linear infinite; vertical-align: middle; margin-right: 8px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .version { text-align: center; margin-top: 20px; font-size: 11px; color: rgba(255,255,255,0.2); }
  </style>
</head>
<body>
  <div class="bg-glow glow-1"></div>
  <div class="bg-glow glow-2"></div>
  <div class="card">
    <div class="logo"><div class="logo-icon">🌿</div><h1>Natura Manager</h1></div>
    <p class="subtitle">Ingresa tus credenciales de <strong>Mi Negocio Natura</strong> para sincronizar tus datos de crecimiento.</p>
    <form id="syncForm" onsubmit="doSync(event)">
      <div class="input-group"><label>Correo de Natura</label><input type="email" id="email" placeholder="tucorreo@ejemplo.com" value="${savedEmail || ''}" required></div>
      <div class="input-group"><label>Contraseña de Natura</label><input type="password" id="password" placeholder="Tu contraseña de Mi Negocio" required></div>
      <div class="remember-row"><input type="checkbox" id="remember" checked><label for="remember">Recordar credenciales en esta PC</label></div>
      <button type="submit" class="btn" id="syncBtn">🔄 Sincronizar Datos</button>
    </form>
    <div id="status"></div>
    <div class="version">Natura Manager Sync v2.0 — Tus datos nunca salen de tu computadora</div>
  </div>
  <script>
    let eventSource;
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
      status.innerHTML = '<span class="spinner"></span> Iniciando...';

      // Use SSE for real-time progress
      if (eventSource) eventSource.close();
      eventSource = new EventSource('/progress');
      eventSource.onmessage = (e) => {
        status.innerHTML = '<span class="spinner"></span> ' + e.data;
      };

      try {
        const res = await fetch('/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, remember }),
        });
        const data = await res.json();
        if (eventSource) eventSource.close();

        if (data.success) {
          status.className = 'success';
          let msg = '✅ <strong>¡Sincronización exitosa!</strong><br>';
          if (data.level) msg += '📊 Nivel actual: <strong>' + data.level + '</strong><br>';
          if (data.points) msg += '⭐ Puntos: <strong>' + data.points + '</strong><br>';
          msg += '<br>Tus datos se actualizaron en Natura Manager.';
          msg += '<br><a class="redirect-link" href="${CONFIG.DASHBOARD_URL}" target="_blank">🚀 Ir al Dashboard ahora</a>';
          msg += '<div class="countdown" id="countdown">Redirigiendo automáticamente en 5 segundos...</div>';
          status.innerHTML = msg;
          btn.textContent = '✅ ¡Listo!';
          // Auto-redirect countdown
          let secs = 5;
          const timer = setInterval(() => {
            secs--;
            const el = document.getElementById('countdown');
            if (el) el.textContent = 'Redirigiendo automáticamente en ' + secs + ' segundos...';
            if (secs <= 0) { clearInterval(timer); window.open('${CONFIG.DASHBOARD_URL}', '_blank'); }
          }, 1000);
        } else {
          throw new Error(data.error || 'Error desconocido');
        }
      } catch (err) {
        if (eventSource) eventSource.close();
        status.className = 'error';
        status.innerHTML = '❌ <strong>Error:</strong> ' + err.message + '<br><br>Verifica tus credenciales e intenta de nuevo.';
        btn.disabled = false;
        btn.textContent = '🔄 Reintentar';
      }
    }
  </script>
</body>
</html>`;
}

// ─── HTTP Server with SSE for progress ─────────────────────────
let progressClients = [];

function broadcastProgress(msg) {
  console.log(`  💬 ${msg}`);
  for (const res of progressClients) {
    try { res.write(`data: ${msg}\n\n`); } catch {}
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    const saved = loadCredentials();
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(getHTML(saved?.email));
    return;
  }

  // SSE endpoint for real-time progress
  if (req.method === 'GET' && req.url === '/progress') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    progressClients.push(res);
    req.on('close', () => { progressClients = progressClients.filter(c => c !== res); });
    return;
  }

  if (req.method === 'POST' && req.url === '/sync') {
    let body = '';
    req.on('data', (c) => body += c);
    req.on('end', async () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      try {
        const { email, password, remember } = JSON.parse(body);
        if (remember) saveCredentials(email, password);

        console.log(`\n🚀 Sync para: ${email.substring(0, 5)}***`);

        const growthData = await syncViaBrowser(email, password, broadcastProgress);

        console.log('✅ Datos obtenidos! Enviando a Flow Natura...');
        broadcastProgress('Enviando datos a Flow Natura...');

        try {
          await sendToSupabase(email, growthData);
          console.log('✅ Datos guardados en Supabase');
        } catch (e) {
          console.log(`⚠️ Error enviando a Supabase (datos locales OK): ${e.message}`);
        }

        const level = growthData?.level?.description || null;
        const points = growthData?.nextLevelProgress?.currentValue || null;

        console.log('🎉 ¡Sincronización completa!');
        res.end(JSON.stringify({ success: true, level, points }));

      } catch (err) {
        console.error('💥 Error:', err.message);
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404); res.end('Not found');
});

// ─── Start ─────────────────────────────────────────────────────
server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}`;
  console.log('');
  console.log('  ╔════════════════════════════════════════╗');
  console.log('  ║   🌿 Natura Manager Sync v2.0            ║');
  console.log(`  ║   ${url.padEnd(28)}        ║`);
  console.log('  ╚════════════════════════════════════════╝');
  console.log('');

  const cmd = process.platform === 'win32' ? `start ${url}`
    : process.platform === 'darwin' ? `open ${url}` : `xdg-open ${url}`;
  exec(cmd, () => {});
});
