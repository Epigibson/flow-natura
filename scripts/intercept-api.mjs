import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outPath = path.join(__dirname, '..', 'natura_api_logs.json');

const LOGIN_URL = 'https://minegocio.natura-avon.com.mx/home';

const apiLogs = [];

(async () => {
  console.log('🕵️ Iniciando Interceptor de APIs de Natura...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  page.setDefaultTimeout(120000);
  page.setDefaultNavigationTimeout(120000);

  // Escuchar todas las respuestas de red
  page.on('response', async (response) => {
    const url = response.url();
    // Filtrar recursos estáticos y enfocarnos en APIs, GraphQL y endpoints internos
    if (
      url.includes('/api/') || 
      url.includes('graphql') || 
      url.includes('/v1/') || 
      url.includes('/v2/') || 
      url.includes('growth') ||
      url.includes('consultant')
    ) {
      try {
        const contentType = response.headers()['content-type'] || '';
        if (contentType.includes('application/json')) {
          const body = await response.json();
          apiLogs.push({
            url: url,
            method: response.request().method(),
            status: response.status(),
            responseBody: body
          });
          console.log(`📡 Interceptado: [${response.request().method()}] ${url}`);
        }
      } catch (err) {
        // Ignorar errores de parseo (e.g. CORS preflight o body no parseable)
      }
    }
  });

  try {
    console.log('🌐 Navegando a la página...');
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
    
    console.log('🔑 Por favor, inicia sesión manualmente en la ventana abierta.');
    console.log('⏳ El interceptor escaneando silenciosamente todo el tráfico en segundo plano...');
    
    // Esperamos a que cargue el dashboard
    await page.waitForFunction(() => document.body && document.body.innerText.includes('Nivel'), { timeout: 120000 });
    
    console.log('✅ Dashboard detectado. Dejando pasar 8 segundos para capturar las peticiones lentas o secundarias...');
    await page.waitForTimeout(8000);

    fs.writeFileSync(outPath, JSON.stringify(apiLogs, null, 2), 'utf-8');
    console.log(`\n💾 ¡Éxito! Se guardaron ${apiLogs.length} respuestas API en natura_api_logs.json`);
    
  } catch (err) {
    console.error('❌ Error en el interceptor:', err.message);
  } finally {
    console.log('Cerrando navegador...');
    await browser.close();
  }
})();
