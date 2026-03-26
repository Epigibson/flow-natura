Tarea: Realizar una auditoría de consistencia entre Supabase y la UI de Natura Flow.

Contexto:
- Backend: Supabase (usar MCP server conectado).
- Frontend: Astro + Stitch (usar MCP server conectado).

Instrucciones:
1. Mapear tablas y relaciones en Supabase.
2. Escanear /src/pages y /src/components para encontrar componentes de Stitch o rutas de Astro.
3. Reportar tablas que NO tengan una pantalla o CRUD asociado.
4. Verificar que las funciones de 'Guardar/Actualizar' en Astro usen correctamente el cliente de Supabase.

Resultado: Generar un reporte en un archivo llamado AUDIT_REPORT.md.
