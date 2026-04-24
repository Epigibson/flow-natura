import fs from 'fs';
const content = fs.readFileSync('scripts/scrape-nivel.mjs', 'utf8');

const newContent = content.replace(
  '// Guardar TODO el arbol de datos nativo para el uso de la App',
  '// Guardar todo el arbol de datos nativo para el uso de la App'
);

fs.writeFileSync('scripts/scrape-nivel.mjs', newContent);
