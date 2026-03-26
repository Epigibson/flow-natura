-- =============================================
-- Mentorship Module Tables
-- =============================================

-- Learning Modules (categories: Ventas, Cobranza, Marketing, etc.)
CREATE TABLE IF NOT EXISTS public.mentorship_modules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'school',
  color TEXT NOT NULL DEFAULT 'primary',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Lessons within modules
CREATE TABLE IF NOT EXISTS public.mentorship_lessons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  module_id UUID NOT NULL REFERENCES public.mentorship_modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL DEFAULT 'article' CHECK (content_type IN ('article', 'video', 'checklist', 'pdf')),
  duration_minutes INT DEFAULT 10,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- User progress on lessons
CREATE TABLE IF NOT EXISTS public.mentorship_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES public.mentorship_lessons(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, lesson_id)
);

-- Mentorship sessions (1:1 scheduling)
CREATE TABLE IF NOT EXISTS public.mentorship_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  session_time TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT 'general',
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'canceled')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mentorship_lessons_module ON public.mentorship_lessons(module_id);
CREATE INDEX IF NOT EXISTS idx_mentorship_progress_user ON public.mentorship_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_mentorship_sessions_user ON public.mentorship_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_mentorship_sessions_date ON public.mentorship_sessions(session_date);

-- Enable RLS
ALTER TABLE public.mentorship_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentorship_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentorship_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentorship_sessions ENABLE ROW LEVEL SECURITY;

-- Modules & Lessons: everyone can read
CREATE POLICY "mentorship_modules_select" ON public.mentorship_modules
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "mentorship_lessons_select" ON public.mentorship_lessons
  FOR SELECT USING (auth.role() = 'authenticated');

-- Progress: users manage their own
CREATE POLICY "mentorship_progress_select" ON public.mentorship_progress
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "mentorship_progress_insert" ON public.mentorship_progress
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "mentorship_progress_delete" ON public.mentorship_progress
  FOR DELETE USING (auth.uid() = user_id);

-- Sessions: users manage their own
CREATE POLICY "mentorship_sessions_select" ON public.mentorship_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "mentorship_sessions_insert" ON public.mentorship_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "mentorship_sessions_update" ON public.mentorship_sessions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "mentorship_sessions_delete" ON public.mentorship_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- Seed: Default Learning Modules & Lessons
-- =============================================

-- Module 1: Ventas
INSERT INTO public.mentorship_modules (id, title, description, icon, color, sort_order) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Técnicas de Venta', 'Domina el arte de vender productos Natura de manera natural y efectiva.', 'storefront', 'primary', 1);

INSERT INTO public.mentorship_lessons (module_id, title, description, content, content_type, duration_minutes, sort_order) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'El Arte de la Demostración', 'Cómo hacer demos que enamoren al cliente.', '## 🎯 El Arte de la Demostración

### ¿Por qué importa?
La demostración es el momento donde el cliente **experimenta** el producto. No estás vendiendo, estás compartiendo algo que amas.

### Paso a paso:
1. **Prepara el ambiente** — Limpia tu espacio, pon música suave
2. **Conoce tu producto** — Lee la ficha técnica, prueba el producto tú primero
3. **Cuenta una historia** — "Este perfume me recuerda a..." conecta emocionalmente
4. **Deja que toquen/huelan** — El contacto sensorial vende solo
5. **Cierra con pregunta** — "¿Te gustaría llevártelo hoy?"

### 💡 Tip Pro
Siempre ten 3 productos estrella listos para demo. Los que más te gusten a TI son los que mejor vendes.', 'article', 8, 1),
  ('a1000000-0000-0000-0000-000000000001', 'Técnicas de Cierre Suave', 'Cierra ventas sin presionar, generando confianza.', '## 🤝 Cierre Suave

### La regla de oro: No presiones, **guía**

### Técnicas que funcionan:
1. **El cierre alternativo** — "¿Prefieres el de 100ml o el de 50ml?" (ambas opciones son SÍ)
2. **El cierre de urgencia suave** — "Este aroma es edición limitada, ya quedan pocos"
3. **El cierre de beneficio** — "Con este kit ahorras $150 vs comprar por separado"
4. **El cierre testimonial** — "Mi clienta Ana lo usa y siempre me pide más"

### ⚠️ Evita:
- "¿No vas a comprar nada?" (agresivo)
- Insistir más de 2 veces (respeta el NO)
- Hablar mal de la competencia', 'article', 10, 2),
  ('a1000000-0000-0000-0000-000000000001', 'Checklist del Ciclo de Ventas', 'Tu guía paso a paso para cada ciclo.', '## ✅ Checklist del Ciclo

### Semana 1 — Preparación
- [ ] Revisar catálogo nuevo
- [ ] Identificar 5 productos estrella del ciclo
- [ ] Contactar 10 clientes frecuentes por WhatsApp
- [ ] Registrar inventario inicial en Natura Flow

### Semana 2 — Acción
- [ ] Hacer mínimo 3 demos esta semana
- [ ] Publicar 2 posts en redes con productos
- [ ] Dar seguimiento a cotizaciones pendientes
- [ ] Registrar ventas diarias en la app

### Semana 3 — Cierre
- [ ] Contactar clientes que no han comprado
- [ ] Ofrecer combos de cierre de ciclo
- [ ] Revisar metas vs realidad en Dashboard
- [ ] Hacer pedido del siguiente ciclo', 'checklist', 5, 3);

-- Module 2: Cobranza
INSERT INTO public.mentorship_modules (id, title, description, icon, color, sort_order) VALUES
  ('a1000000-0000-0000-0000-000000000002', 'Gestión de Cobranza', 'Aprende a cobrar sin perder clientes ni amistades.', 'payments', 'secondary', 2);

INSERT INTO public.mentorship_lessons (module_id, title, description, content, content_type, duration_minutes, sort_order) VALUES
  ('a1000000-0000-0000-0000-000000000002', 'Cobrar sin Incomodar', 'Estrategias para cobrar manteniendo la relación.', '## 💰 Cobrar sin Incomodar

### La realidad
El 70% de las consultoras pierden dinero por no saber cobrar. **Cobrar no es malo**, es profesional.

### Frases que funcionan:
- ✅ "Hola [nombre], te paso tu estado de cuenta del mes 🙂"
- ✅ "¿Te acuerdas que quedamos en el abono del viernes? Te mando mi Banorte"
- ✅ "Paso por tu zona el jueves, ¿te parece si cobro tu abono?"

### Frases que NO funcionan:
- ❌ "Ya me debes mucho"
- ❌ "Si no me pagas no te vuelvo a vender"
- ❌ Mandar solo el número de cuenta sin contexto

### 🔑 Usa Natura Flow
Registra todos los abonos en la app. Así tienes historial y puedes mostrarle al cliente exactamente cuánto debe.', 'article', 12, 1),
  ('a1000000-0000-0000-0000-000000000002', 'Políticas de Crédito Inteligentes', 'Define reglas claras para dar fiado.', '## 📋 Políticas de Crédito

### Antes de dar fiado, pregúntate:
1. ¿Conozco a esta persona personalmente?
2. ¿Me ha pagado antes a tiempo?
3. ¿El monto es algo que puedo absorber si no paga?

### Reglas recomendadas:
- **Primer pedido**: Solo de contado
- **Segundo pedido**: Crédito hasta $500 MXN, máx 15 días
- **Cliente frecuente**: Crédito hasta $1,500 MXN, máx 30 días
- **Monto mayor**: Pedir 50% de anticipo

### Documenta todo
Registra en Natura Flow cada crédito con fecha de vencimiento. La app te recordará cuándo cobrar.', 'article', 8, 2);

-- Module 3: Crecimiento
INSERT INTO public.mentorship_modules (id, title, description, icon, color, sort_order) VALUES
  ('a1000000-0000-0000-0000-000000000003', 'Marketing y Redes', 'Cómo usar WhatsApp, Facebook e Instagram para vender más.', 'campaign', 'tertiary', 3);

INSERT INTO public.mentorship_lessons (module_id, title, description, content, content_type, duration_minutes, sort_order) VALUES
  ('a1000000-0000-0000-0000-000000000003', 'WhatsApp para Ventas', 'Convierte tu WhatsApp en tu mejor herramienta de ventas.', '## 📱 WhatsApp para Ventas

### Tu Estado es tu Vitrina
- Publica 2-3 Estados al día con productos
- Usa fotos reales (no del catálogo) — los clientes confían más
- Agrega precio y forma de pago
- Rota productos: lunes perfumes, martes skincare, etc.

### Mensajes que Venden
**Para clientes nuevos:**
> "Hola [nombre], vi que te interesó [producto]. Te cuento que esta semana tengo promoción: llévate 2 y el envío es gratis 🚚"

**Para clientes frecuentes:**
> "Hola [nombre], llegó el nuevo [producto] y me acordé de ti porque sé que te encanta [línea]. ¿Te aparto uno? 😊"

### Listas de Difusión
Crea listas por interés (perfumes, maquillaje, cuidado personal) y envía contenido relevante. NO spam.', 'article', 15, 1),
  ('a1000000-0000-0000-0000-000000000003', 'Fotos que Venden', 'Tips para tomar fotos atractivas de tus productos.', '## 📸 Fotos que Venden

### Equipo necesario:
Solo tu celular + luz natural. No necesitas nada más.

### Tips rápidos:
1. **Luz natural** — Cerca de una ventana, nunca con flash
2. **Fondo limpio** — Una sábana blanca, una mesa de madera
3. **Composición** — Pon el producto en ángulo, no centrado
4. **Escala** — Ponlo al lado de algo para dar referencia de tamaño
5. **En uso** — Fotos de ti usándolo valen 10x más que la caja

### Lo que NO hacer:
- ❌ Fotos borrosas o oscuras
- ❌ Fondo desordenado
- ❌ Muchos productos juntos sin orden
- ❌ Solo repost del catálogo oficial', 'article', 10, 2);

-- Module 4: Organización
INSERT INTO public.mentorship_modules (id, title, description, icon, color, sort_order) VALUES
  ('a1000000-0000-0000-0000-000000000004', 'Organización del Negocio', 'Lleva tu negocio como una empresa, no como un hobby.', 'inventory_2', 'primary', 4);

INSERT INTO public.mentorship_lessons (module_id, title, description, content, content_type, duration_minutes, sort_order) VALUES
  ('a1000000-0000-0000-0000-000000000004', 'Separar Finanzas Personales', 'Por qué necesitas una cuenta separada para tu negocio.', '## 💳 Separa tus Finanzas

### El error #1 de las consultoras
Mezclar el dinero de Natura con el dinero personal. Esto causa que nunca sepas cuánto realmente ganas.

### Cómo hacerlo:
1. **Abre una cuenta extra** — Banorte, Spin, Nu, cualquiera sin comisiones
2. **Todo ingreso de Natura va ahí** — Ventas, abonos, bonos
3. **Todo gasto de Natura sale de ahí** — Pedidos, envíos, demos
4. **Tu "sueldo"** — Cada quincena, transfiérete lo que quieras a tu cuenta personal

### Usa Natura Flow para rastrear
Con la sección de Reportes ves exactamente:  
- Cuánto vendiste  
- Cuánto te deben  
- Cuánto gastaste en inventario  
- **Tu ganancia real**', 'article', 8, 1),
  ('a1000000-0000-0000-0000-000000000004', 'Usando Natura Flow al Máximo', 'Saca provecho de todas las funciones de la app.', '## 🚀 Natura Flow — Guía Completa

### Dashboard
Tu centro de control. Revísalo diario para ver tus metas.

### Inventario
- Registra CADA producto que compras
- Haz ajustes cuando des demos o productos se dañen
- Usa la importación masiva para cargar todo el catálogo

### Ventas
- Registra ventas de contado y a crédito
- Los abonos se registran en la sección de cobranza
- Nunca vendas "de memoria" — siempre registra

### Clientes
- Agrega todos tus clientes con teléfono
- Registra sus favoritos y tallas
- Usa las notas para recordar detalles personales

### Reportes (Pro/Premium)
- Revisa qué productos se venden más
- Identifica clientes que compran seguido
- Ve tu ganancia real después de costos', 'article', 15, 2);
