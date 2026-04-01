import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const API_SECRET = process.env.SCRAPER_API_SECRET || 'dev-secret-key';

function authMiddleware(req, res, next) {
  const authHeader = req.headers['x-api-key'];
  if (authHeader !== API_SECRET) {
    return res.status(401).json({ success: false, error: 'No autorizado.' });
  }
  next();
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'natura-scraper' });
});

/**
 * Helper: Extrae cookies de respuestas fetch y las acumula
 */
function extractCookies(response, existingCookies = '') {
  const newCookies = [];
  // getSetCookie puede no existir en todas las implementaciones
  const raw = response.headers.raw?.()?.['set-cookie'] || [];
  for (const c of raw) {
    newCookies.push(c.split(';')[0]);
  }
  
  // Fallback: leer header manual
  if (newCookies.length === 0) {
    const sc = response.headers.get('set-cookie');
    if (sc) {
      // Puede haber múltiples cookies separadas por coma (no es estándar pero pasa)
      newCookies.push(sc.split(';')[0]);
    }
  }

  if (existingCookies && newCookies.length > 0) {
    return existingCookies + '; ' + newCookies.join('; ');
  }
  return newCookies.length > 0 ? newCookies.join('; ') : existingCookies;
}

/**
 * Flujo OAuth de Natura via Cognito:
 * 1. GET /home → redirect a natura-auth.prd.naturacloud.com (página de login)
 * 2. Extraer form action + campos hidden (CSRF, _fid, etc.)
 * 3. POST credenciales al form de Cognito
 * 4. Seguir redirects de vuelta a minegocio con cookies de sesión
 * 5. Llamar al API de growthplan con sesión activa
 */
app.post('/scrape', authMiddleware, async (req, res) => {
  const { natura_email, natura_password } = req.body;

  if (!natura_email || !natura_password) {
    return res.status(400).json({ success: false, error: 'Faltan credenciales.' });
  }

  console.log(`🚀 Iniciando sync para: ${natura_email.substring(0, 5)}***`);

  try {
    // === PASO 1: Ir a la página de login de Natura (sin seguir redirects) ===
    console.log('🔑 Paso 1: Navegando a Natura login...');
    const homeRes = await fetch('https://minegocio.natura-avon.com.mx/home', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-MX,es;q=0.8,en-US;q=0.5,en;q=0.3',
      },
      redirect: 'follow'
    });
    
    const authPageUrl = homeRes.url;
    console.log(`   → Redirigido a: ${authPageUrl.substring(0, 80)}...`);
    
    const authPageHtml = await homeRes.text();
    let cookies = extractCookies(homeRes);
    console.log(`   → Cookies: ${cookies.substring(0, 60)}...`);

    // === PASO 2: Extraer el form de login (action URL + campos hidden) ===
    console.log('🔑 Paso 2: Extrayendo formulario de login...');
    
    // Buscar <form action="...">
    const formActionMatch = authPageHtml.match(/form[^>]*action="([^"]+)"/i);
    const formAction = formActionMatch ? formActionMatch[1] : null;
    console.log(`   → Form action: ${formAction || 'NO ENCONTRADO'}`);
    
    // Buscar todos los inputs hidden
    const hiddenInputs = {};
    const inputRegex = /<input[^>]*type="hidden"[^>]*>/gi;
    let inputMatch;
    while ((inputMatch = inputRegex.exec(authPageHtml)) !== null) {
      const nameMatch = inputMatch[0].match(/name="([^"]+)"/);
      const valueMatch = inputMatch[0].match(/value="([^"]*)"/);
      if (nameMatch) {
        hiddenInputs[nameMatch[1]] = valueMatch ? valueMatch[1] : '';
      }
    }
    console.log(`   → Campos hidden: ${Object.keys(hiddenInputs).join(', ') || 'NINGUNO'}`);

    // Detectar si es formulario con campos de email/password o si usa otro método
    const hasEmailField = authPageHtml.includes('email') || authPageHtml.includes('username') || authPageHtml.includes('login');
    const hasPasswordField = authPageHtml.includes('password') || authPageHtml.includes('contraseña');
    console.log(`   → Tiene campo email: ${hasEmailField}, password: ${hasPasswordField}`);

    // Log un snippet del HTML para debug
    const bodyStart = authPageHtml.indexOf('<body');
    const snippet = authPageHtml.substring(bodyStart, bodyStart + 1000).replace(/\s+/g, ' ');
    console.log(`   → HTML snippet: ${snippet.substring(0, 500)}`);

    if (!formAction) {
      // Intentar buscar otros patterns
      console.log('   ⚠️ No se encontró form action. Buscando patrones alternativos...');
      
      // Buscar API endpoints en el JS
      const apiMatch = authPageHtml.match(/["'](https?:\/\/[^"']*(?:auth|login|signin)[^"']*)["']/gi);
      if (apiMatch) {
        console.log(`   → APIs encontradas: ${apiMatch.slice(0, 5).join(', ')}`);
      }

      // Buscar data attributes o configuración
      const configMatch = authPageHtml.match(/window\.__CONFIG__\s*=\s*({[^}]+})/);
      if (configMatch) {
        console.log(`   → Config encontrada: ${configMatch[1].substring(0, 300)}`);
      }
    }

    // === PASO 3: Enviar credenciales al formulario ===
    if (formAction) {
      console.log('🔑 Paso 3: Enviando credenciales...');
      
      // Construir la URL completa del form action
      let loginUrl = formAction;
      if (formAction.startsWith('/')) {
        const authOrigin = new URL(authPageUrl).origin;
        loginUrl = authOrigin + formAction;
      } else if (!formAction.startsWith('http')) {
        loginUrl = new URL(formAction, authPageUrl).href;
      }
      // Decode HTML entities
      loginUrl = loginUrl.replace(/&amp;/g, '&');
      console.log(`   → Login URL: ${loginUrl.substring(0, 100)}...`);

      // Construir form data
      const formData = new URLSearchParams();
      // Agregar campos hidden
      for (const [key, value] of Object.entries(hiddenInputs)) {
        formData.append(key, value);
      }
      // Agregar credenciales (probar varios nombres de campo)
      formData.append('email', natura_email);
      formData.append('username', natura_email);
      formData.append('password', natura_password);

      const loginRes = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': new URL(authPageUrl).origin,
          'Referer': authPageUrl,
          'Cookie': cookies,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        body: formData.toString(),
        redirect: 'follow'
      });

      console.log(`   → Status: ${loginRes.status}`);
      console.log(`   → URL final: ${loginRes.url}`);
      cookies = extractCookies(loginRes, cookies);
      
      const loginResponseText = await loginRes.text();
      const isBackOnNatura = loginRes.url.includes('minegocio.natura-avon.com.mx');
      console.log(`   → De vuelta en Natura: ${isBackOnNatura}`);

      if (isBackOnNatura) {
        // === PASO 4: Ya autenticados, buscar el API de growthplan ===
        console.log('📊 Paso 4: Obteniendo datos de crecimiento...');

        // Probar varias URLs del API de growthplan
        const growthUrls = [
          'https://minegocio.natura-avon.com.mx/api/growthplan',
          'https://minegocio.natura-avon.com.mx/api/consultant/growthplan',
          'https://minegocio.natura-avon.com.mx/api/v1/growthplan',
          'https://minegocio.natura-avon.com.mx/api/consultant-level',
        ];

        for (const url of growthUrls) {
          try {
            console.log(`   Probando: ${url}`);
            const gRes = await fetch(url, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
                'Accept': 'application/json',
                'Cookie': cookies,
                'Referer': 'https://minegocio.natura-avon.com.mx/home'
              }
            });
            console.log(`   → Status: ${gRes.status}`);
            
            const contentType = gRes.headers.get('content-type') || '';
            if (contentType.includes('json')) {
              const data = await gRes.json();
              console.log(`   → JSON: ${JSON.stringify(data).substring(0, 300)}`);
              
              if (data?.data?.consultantLevel) {
                console.log('✅ ¡Datos de crecimiento obtenidos!');
                return res.json({ success: true, data: data.data.consultantLevel });
              }
            } else {
              const text = await gRes.text();
              console.log(`   → No es JSON (${contentType}): ${text.substring(0, 100)}`);
            }
          } catch (e) {
            console.log(`   → Error: ${e.message}`);
          }
        }
        
        // Si llegamos aquí, buscar en el HTML de la página las URLs del API
        console.log('🔍 Buscando URLs de API en el HTML...');
        const apiUrls = loginResponseText.match(/https?:\/\/[^"'\s]+growthplan[^"'\s]*/gi);
        if (apiUrls) {
          console.log(`   → URLs de growthplan en HTML: ${apiUrls.join(', ')}`);
        }
        
        // Buscar cualquier endpoint de API
        const allApiUrls = loginResponseText.match(/https?:\/\/[^"'\s]*api[^"'\s]*/gi);
        if (allApiUrls) {
          const unique = [...new Set(allApiUrls)].slice(0, 10);
          console.log(`   → URLs de API encontradas: ${unique.join('\n     ')}`);
        }
      } else {
        // Login falló - estamos todavía en la página de auth
        console.log('❌ Login falló. Analizando respuesta...');
        const errorSnippet = loginResponseText.substring(0, 500).replace(/\s+/g, ' ');
        console.log(`   → Respuesta: ${errorSnippet}`);
      }
    }

    throw new Error('No se pudieron obtener los datos. Revisa los logs para más detalles.');

  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🔧 Natura Scraper Service corriendo en puerto ${PORT}`);
});
