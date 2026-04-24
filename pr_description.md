🎯 **Qué**
Se han eliminado las importaciones `update` y `func` del módulo `sqlalchemy` en el archivo `backend/app/routers/orders.py`.

💡 **Por qué**
Estas funciones importadas no se estaban utilizando en ninguna parte del archivo. Eliminar código muerto o importaciones innecesarias mejora la mantenibilidad, reduce la carga cognitiva para los desarrolladores y mantiene el código limpio.

✅ **Verificación**
- Se realizó una búsqueda de uso de `update` y `func` mediante comandos grep dentro del archivo modificado, confirmando que no se llamaban en absoluto.
- Se verificó la sintaxis del archivo modificado con el comando `python3 -m py_compile backend/app/routers/orders.py`, asegurando que no se introdujeran errores sintácticos.
- Se solicitó revisión de código en la plataforma para confirmar la viabilidad de remover la importación adicional sin uso.

✨ **Resultado**
Un código más limpio, con importaciones ajustadas a lo estrictamente necesario.
