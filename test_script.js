const code = `
    const filePrefix = isC ? 'natura-tokens.json' : 'natura-raw-sample.json';

    // Guardar TODO el arbol de datos nativo para el uso de la App
    fs.writeFileSync(filePrefix, JSON.stringify(profileData, null, 2));
    console.log(\`\n💾 Datos en crudo guardados en \${filePrefix}\`);
`;
console.log(code);
