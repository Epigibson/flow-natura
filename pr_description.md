🧪 [pruebas para utilidades crypto] Añadir suite de pruebas con node:test

🎯 **Qué**
Se han añadido pruebas unitarias para el archivo `src/utils/crypto.ts` usando la utilidad nativa de pruebas en Node.js (`node:test` y `node:assert`). No se alteró el código original dado que el mismo proveía una implementación con fallback a clave dummy necesaria para ambientes de desarrollo, y su función en la codificación con iv estaba trabajando correctamente.

📊 **Cobertura**
- Cifrado y descifrado correcto (roundtrip) y validación del formato resultante (`iv:encrypted`).
- Verificación de creación de diferentes textos cifrados para el mismo texto base (debido al Vector de Inicialización aleatorio).
- Manejo de formato de datos no válidos (errores durante el descifrado si falta el `:` o tiene estructura errónea).

✨ **Resultado**
Aumentamos la cobertura de pruebas de nuestros utilitarios criptográficos. Esto nos permite un mayor nivel de confiabilidad para iteraciones futuras donde decidamos actualizar el algoritmo o implementar controles más estrictos para los ambientes.
