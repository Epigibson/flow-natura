import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOGIN_URL = 'https://minegocio.natura-avon.com.mx/home';

(async () => {
  console.log('🚀 Iniciando Rastreador del API de Camino de Crecimiento (Natura)...');

  const browser = await chromium.launch({ 
    headless: false,
    args: ['--start-maximized'] 
  });
  
  const context = await browser.newContext({
    viewport: null
  });
  
  const page = await context.newPage();
  
  // 120s timeouts for stability
  page.setDefaultTimeout(120000);
  page.setDefaultNavigationTimeout(120000);

  let extractedGrowthData = null;

  // Escuchar secretamente la red hasta capturar el GraphQL de crecimiento
  page.on('response', async (response) => {
    if (response.url().includes('growthplan')) {
      try {
        const body = await response.json();
        if (body?.data?.consultantLevel) {
          extractedGrowthData = body.data.consultantLevel;
          console.log('🎯 ¡Payload interceptado exitosamente desde los servidores de Natura!');
        }
      } catch (err) {}
    }
  });

  try {
    console.log('🌐 Navegando a la página de Login de Natura...');
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });

    console.log('🔑 Por favor, ingresa tu correo y contraseña manualmente.');
    console.log('⏳ El bot está escaneando el tráfico en silencio...');
    
    // Esperar a que detectemos el Payload o pasen los 2 minutos máximos (loop checking memory)
    for (let i = 0; i < 120; i++) {
        if (extractedGrowthData) break;
        await page.waitForTimeout(1000);
    }
    
    if (!extractedGrowthData) {
        throw new Error("No se pudo interceptar el paquete de datos del Camino de Crecimiento.");
    }

    console.log('✅ ¡Perfecto! Se absorbió toda tu información estructural.');
    
    // Guardar TODO el arbol de datos nativo para el uso de la App
    const fullOutPath = path.join(__dirname, '..', 'full_growth_data.json');
    fs.writeFileSync(fullOutPath, JSON.stringify(extractedGrowthData, null, 2), 'utf-8');
    
    // Guardar también una versión ligera compatible con el frontend modificado
    const simpleOutPath = path.join(__dirname, '..', 'consultant_progress.json');
    const simpleResult = {
      timestamp: new Date().toISOString(),
      user: "consultora",
      extractedLevel: extractedGrowthData.level?.description || 'NO_DETECTADO',
      accumulatedSales: 0,
      currentPoints: extractedGrowthData.nextLevelProgress?.currentValue || 0,
      note: "Extraido limpiamente desde la API interna."
    };
    fs.writeFileSync(simpleOutPath, JSON.stringify(simpleResult, null, 2), 'utf-8');

    console.log(`\n💾 ¡Datos clonados masivamente en full_growth_data.json y consultant_progress.json!`);

  } catch (err) {
    console.error('❌ Error durante la intercepción:', err.message);
  } finally {
    console.log('Cerrando el navegador...');
    await browser.close();
  }
})();
