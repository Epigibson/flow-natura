import express from 'express';
import cors from 'cors';
import crypto from 'crypto';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const API_SECRET = process.env.SCRAPER_API_SECRET || 'dev-secret-key';

const NATURA_AUTH_DOMAIN = 'natura-auth.prd.naturacloud.com';
const NATURA_CLIENT_ID = '31ndsgochinbk61v3jk8dhsf2o';
const COGNITO_REGION = 'us-east-1';
const AUTH_API_BASE = 'https://authenticator-cognito-apigw.prd.naturacloud.com/authentication-api';

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
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'es-MX,es;q=0.9',
    };

    // === PASO 1: Descargar JS de la auth page y analizar a fondo ===
    console.log('📜 Paso 1: Analizando JS de la página de auth...');

    const authPageRes = await fetch(`https://${NATURA_AUTH_DOMAIN}/?client_id=${NATURA_CLIENT_ID}&country=mx&language=es&company=natura`, {
      headers, redirect: 'follow', signal: AbortSignal.timeout(15000)
    });
    const authHtml = await authPageRes.text();
    const scriptUrls = [...authHtml.matchAll(/src="([^"]+)"/g)].map(m => m[1]);

    // Solo descargar el JS de la app (no el de Akamai)
    const appJsUrl = scriptUrls.find(s => s.includes('assets/'));
    if (!appJsUrl) {
      throw new Error('No se encontró el JS de la app.');
    }

    const fullJsUrl = `https://${NATURA_AUTH_DOMAIN}${appJsUrl}`;
    console.log(`   📥 Descargando: ${fullJsUrl}`);
    const jsRes = await fetch(fullJsUrl, { headers, signal: AbortSignal.timeout(15000) });
    const js = await jsRes.text();
    console.log(`   → ${js.length} bytes`);

    // Buscar TODOS los contextos donde se usa authentication-api
    console.log('\n🔍 Analizando uso de authentication-api...');
    const authApiContexts = [];
    let idx = 0;
    while (true) {
      idx = js.indexOf('authentication-api', idx);
      if (idx === -1) break;
      const context = js.substring(Math.max(0, idx - 200), Math.min(js.length, idx + 200));
      authApiContexts.push(context);
      idx += 20;
    }
    console.log(`   ${authApiContexts.length} referencias encontradas:`);
    authApiContexts.forEach((ctx, i) => {
      console.log(`   [${i}] ...${ctx.replace(/\s+/g, ' ')}...`);
    });

    // Buscar x-api-key, apiKey, api_key en todo el JS
    console.log('\n🔑 Buscando API keys...');
    const apiKeyPatterns = [
      /x-api-key['":\s]*['"]([^'"]+)['"]/gi,
      /apiKey['":\s]*['"]([^'"]+)['"]/gi,
      /api[_-]key['":\s]*['"]([^'"]+)['"]/gi,
      /Authorization['":\s]*['"]([^'"]+)['"]/gi,
    ];
    for (const pattern of apiKeyPatterns) {
      let match;
      while ((match = pattern.exec(js)) !== null) {
        console.log(`   🔑 ${match[0].substring(0, 80)}`);
      }
    }

    // Buscar fetch/axios/http calls cerca de la auth URL
    console.log('\n📡 Buscando patrones de llamadas HTTP...');
    const fetchPatterns = [
      /fetch\s*\([^)]{0,500}\)/g,
      /\.post\s*\([^)]{0,500}\)/g,
      /\.get\s*\([^)]{0,500}\)/g,
      /axios[^;]{0,300}/g,
      /headers\s*:\s*\{[^}]{0,500}\}/g,
    ];
    for (const pattern of fetchPatterns) {
      const matches = [...js.matchAll(pattern)];
      if (matches.length > 0) {
        console.log(`   Pattern ${pattern.source.substring(0, 20)}...:`);
        matches.slice(0, 8).forEach(m => {
          const text = m[0].replace(/\s+/g, ' ').substring(0, 150);
          console.log(`     → ${text}`);
        });
      }
    }

    // Buscar constantes importantes (cualquier string que parezca un secret/key)
    console.log('\n🔤 Buscando constantes importantes...');
    // Strings largoas alfanuméricas que podrían ser secrets
    const longStrings = [...new Set(js.match(/['"][a-zA-Z0-9]{30,}['"]/g) || [])];
    if (longStrings.length > 0) {
      console.log(`   Strings largos (posibles secrets):`);
      longStrings.slice(0, 15).forEach(s => console.log(`     → ${s}`));
    }

    // Buscar SRP o secret hash patterns
    console.log('\n🔐 Buscando patrones de autenticación...');
    const authPatterns = [
      /SRP/g, /SECRET/g, /HASH/g, /PASSWORD/g, 
      /signIn/g, /login/g, /authenticate/g,
      /initiateAuth/g, /respondToAuth/g,
      /CognitoUser/g, /AuthenticationDetails/g,
      /USER_SRP_AUTH/g, /USER_PASSWORD_AUTH/g,
    ];
    for (const ap of authPatterns) {
      const matches = [...js.matchAll(ap)];
      if (matches.length > 0) {
        // Get context around first match
        const firstIdx = matches[0].index;
        const context = js.substring(Math.max(0, firstIdx - 100), Math.min(js.length, firstIdx + 100)).replace(/\s+/g, ' ');
        console.log(`   ${ap.source} (${matches.length}x): ...${context.substring(0, 150)}...`);
      }
    }

    // === PASO 2: Probar el authentication-api con varios enfoques ===
    console.log('\n📡 Paso 2: Probando authentication-api...');

    const authApiPaths = [
      '/login', '/signin', '/authenticate', '/auth',
      '/v1/login', '/v1/authenticate', '/token',
      '/cognito/login', '/users/login',
      '', // root
    ];

    for (const path of authApiPaths) {
      const url = `${AUTH_API_BASE}${path}`;
      try {
        // POST con credenciales
        const authRes = await fetch(url, {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/json',
            'Origin': `https://${NATURA_AUTH_DOMAIN}`,
            'Referer': `https://${NATURA_AUTH_DOMAIN}/`,
          },
          body: JSON.stringify({
            email: natura_email,
            password: natura_password,
            username: natura_email,
            clientId: NATURA_CLIENT_ID,
            country: 'mx',
            company: 'natura'
          }),
          signal: AbortSignal.timeout(8000)
        });

        const contentType = authRes.headers.get('content-type') || '';
        const body = await authRes.text();
        console.log(`   POST ${path || '/'} → ${authRes.status}`);
        if (body.length < 500) console.log(`     ${body}`);
      } catch (e) {
        console.log(`   POST ${path || '/'} → ${e.message?.substring(0, 50)}`);
      }
    }

    // También probar GET endpoints
    for (const path of ['/config', '/settings', '/health', '/.well-known/openid-configuration']) {
      const url = `${AUTH_API_BASE}${path}`;
      try {
        const gRes = await fetch(url, {
          headers: { ...headers, 'Accept': 'application/json' },
          signal: AbortSignal.timeout(5000)
        });
        const body = await gRes.text();
        console.log(`   GET ${path} → ${gRes.status}: ${body.substring(0, 200)}`);
      } catch (e) {
        console.log(`   GET ${path} → ${e.message?.substring(0, 50)}`);
      }
    }

    // Probar el dominio de Cognito directamente
    console.log('\n🌐 Probando Cognito hosted UI endpoints...');
    const cognitoEndpoints = [
      `https://${NATURA_AUTH_DOMAIN}/.well-known/openid-configuration`,
      `https://${NATURA_AUTH_DOMAIN}/.well-known/jwks.json`,
    ];
    for (const url of cognitoEndpoints) {
      try {
        const gRes = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
        const body = await gRes.text();
        console.log(`   ${url.split('.com')[1]} → ${gRes.status}`);
        if (body.length < 1000) console.log(`     ${body.substring(0, 500)}`);
      } catch (e) {
        console.log(`   → ${e.message?.substring(0, 60)}`);
      }
    }

    throw new Error('Análisis completo. Revisa los logs.');

  } catch (err) {
    console.error('❌', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🔧 Natura Scraper Service en puerto ${PORT}`);
});
