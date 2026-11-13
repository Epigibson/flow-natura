"""Generate enriched product descriptions from verified research (knowledge_*.json).
Rules: only researched facts + literal product attributes (size/pieces/name). No invented claims.
"""
import json, re, unicodedata, os, sys

BASE = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))

def norm(s):
    s = (s or '').lower()
    s = ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')
    return re.sub(r'\s+', ' ', s)

def clean(v):
    t = (v or '').strip()
    t = re.sub(r'\s*\((?:ficha|fuente|avon[^)]*|natura[^)]*|página[^)]*|según|descripción oficial|nombres de cat)[^)]*\)', '', t, flags=re.I)
    if re.search(r'según|nombres con C \d|lista de deseos', t, re.I):
        return ''
    return t.strip(' .;')

def size_of(name):
    m = re.findall(r'(\d+[.,]?\d*)\s?(ml|g|gr|l)\b', name or '', flags=re.I)
    if not m: return ''
    v, u = m[-1]
    return f'{v} {u.lower().replace("gr", "g")}'

def pieces_of(name):
    m = re.search(r'\b(\d+)\s*(piezas|pzas|pza|pzs)\b', name or '', flags=re.I)
    return f'{m.group(1)} piezas' if m else ''

def longest_match(name, entries):
    n = norm(name)
    best, best_len = None, 0
    for key, entry in (entries or {}).items():
        for phrase in (entry.get('match') or []):
            p = norm(phrase)
            if p and p in n and len(p) > best_len:
                best, best_len = entry, len(p)
    return best

def src_of(fam, ov):
    return {**fam, **{k: v for k, v in (ov or {}).items() if clean(v)}}

def compose_perfume(p, fam, ov):
    src = src_of(fam, ov)
    kind = 'Eau de Parfum' if re.search(r'parfum|edp', norm(p['name'])) else ('Eau de Toilette' if re.search(r'toilette|edt|colonia|body splash|splash', norm(p['name'])) else 'Fragancia')
    pub = clean(src.get('publico'))
    adj = {'masculino': 'masculina', 'femenino': 'femenina'}.get(pub, pub) if kind == 'Fragancia' else pub
    head = f"{clean(src.get('line')) or p['name'].split(' ')[0].title()} — {kind}" + (f" {adj}" if adj else '')
    fam_o = clean(src.get('family_olfativa'))
    if fam_o: head += f" de familia {fam_o}"
    parts = [head + '.']
    notes = []
    if clean(src.get('notas_salida')): notes.append(f"salida: {clean(src.get('notas_salida'))}")
    if clean(src.get('notas_corazon')): notes.append(f"corazón: {clean(src.get('notas_corazon'))}")
    if clean(src.get('notas_fondo')): notes.append(f"fondo: {clean(src.get('notas_fondo'))}")
    if notes: parts.append('Notas de ' + '; '.join(notes) + '.')
    if clean(src.get('estilo_ocasion')): parts.append('Estilo: ' + clean(src.get('estilo_ocasion')) + '.')
    if clean(src.get('sensacion')): parts.append('Sensación: ' + clean(src.get('sensacion')) + '.')
    sz = size_of(p['name'])
    if sz: parts.append('Presentación ' + sz + '.')
    return ' '.join(parts)

def compose_care(p, fam, ov):
    src = src_of(fam, ov)
    parts = []
    head = f"{clean(src.get('line')) or p['brand'] or 'Producto'}" + (f" ({clean(src.get('category'))})" if clean(src.get('category')) else '')
    parts.append(head + ': ' + (clean(src.get('beneficio_principal')) or 'cuidado diario') + '.')
    if clean(src.get('ingredientes_clave')): parts.append('Con ' + clean(src.get('ingredientes_clave')) + '.')
    if clean(src.get('sensacion_textura')): parts.append(clean(src.get('sensacion_textura')) + '.')
    if clean(src.get('resultado')): parts.append('Resultado: ' + clean(src.get('resultado')) + '.')
    if clean(src.get('como_usar')): parts.append('Uso: ' + clean(src.get('como_usar')) + '.')
    sz = size_of(p['name'])
    if sz: parts.append('Presentación ' + sz + '.')
    return ' '.join(parts)

def compose_home(p, types, licenses):
    t = longest_match(p['name'], types)
    lic = longest_match(p['name'], licenses)
    parts = []
    if t:
        typ = clean(t.get('type')) or 'Producto para el hogar'
        if '/' in typ: typ = 'Set del hogar'
        parts.append(typ + ': ' + (clean(t.get('uso_principal')) or 'uso diario') + '.')
    elif not lic:
        return ''
    if t and clean(t.get('material_sugerido')): parts.append('Material: ' + clean(t['material_sugerido']) + '.')
    if t and clean(t.get('highlight')): parts.append(clean(t['highlight']) + '.')
    if lic and clean(lic.get('note')): parts.append(clean(lic['note']) + '.')
    if t and clean(t.get('cuidado')): parts.append('Cuidado: ' + clean(t['cuidado']) + '.')
    spec = ' '.join(x for x in (size_of(p['name']), pieces_of(p['name'])) if x)
    if spec: parts.append('Presentación ' + spec + '.')
    return ' '.join(parts)

# ---- Name-derived factual description (no claims) for leftovers ----
TYPE_KEYWORDS = [
    'desmaquillante', 'agua micelar', 'contorno de ojos', 'acondicionador', 'shampoo', 'mascarilla',
    'exfoliante', 'protector solar', 'desodorante antitranspirante', 'desodorante', 'antitranspirante',
    'roll on', 'balsamo labial', 'balsamo', 'labial', 'corrector', 'rimmel', 'mascara de pestanas',
    'delineador', 'sombra', 'polvo compacto', 'polvo suelto', 'base liquida', 'base', 'rubor', 'gloss',
    'esmalte', 'crema para el cuerpo', 'crema corporal', 'crema facial', 'crema de manos',
    'crema hidratante', 'crema', 'serum', 'sérum', 'aceite', 'gel', 'jabon liquido', 'jabón liquido',
    'jabon', 'jabón', 'loion', 'locion', 'bruma', 'colonia', 'body splash', 'perfume',
    'eau de parfum', 'eau de toilette', 'toilette', 'edt', 'edp', 'cera', 'tinte', 'tratamiento',
    'tonico', 'suavizante', 'crema de pies', 'spray', 'crema de afeitar', 'after shave',
    'crema para manos'
]
LINE_TOKENS = ['kaiak', 'essencial', 'humor', 'kriska', 'ekos', 'tododia', 'lumina', 'una', 'luna', 'homem',
               'ilia', 'anew', 'clearskin', 'foot works', 'avon care', 'advance techniques', 'adv tech',
               'black suede', '300 km/h', '300km', 'far away', 'imari', 'musk', 'attraction', 'wild country',
               'oslo', 'sensus', 'nature', 'chronos', 'faces', 'sweet honesty', 'secret fantasy', 'night magic',
               'perceive', 'incandessence', 'rare flowers', 'charisma']

def compose_from_name(p):
    n = norm(p['name'])
    tp = next((t for t in sorted(TYPE_KEYWORDS, key=len, reverse=True) if re.search(r'\b' + re.escape(t) + r'\b', n)), None)
    if not tp:
        return ''
    parts = [tp.capitalize()]
    m = re.search(r'(con color\s+\w+|tono\s+\w+)', n)
    if m: parts.append('(' + m.group(1).strip() + ')')
    line = next((t for t in LINE_TOKENS if re.search(r'\b' + re.escape(t) + r'\b', n)), None)
    if line: parts.append('de la línea ' + line.title())
    spec = ' '.join(x for x in (size_of(p['name']), pieces_of(p['name'])) if x)
    return ' '.join(parts) + '.' + (f' Presentación {spec}.' if spec else '')

# ---- Kits: components visible in the name + researched line facts ----
KIT_RE = r'\b(kit|duo|dúo|combo|set|estuche|caja|pack|trio|trío)\b'
COMP_SPLIT = re.compile(r'(?:\s+\+\s+|\s+mas\s+|\s+\by\b\s+|\s+con\s+|,|\s+\d+\s+(?=[A-ZÁÉÍÓÚÑa-z]))')
COMP_TYPES = [
    'eau de parfum', 'eau de toilette', 'body splash', 'desodorante roll on', 'desodorante antitranspirante',
    'desodorante', 'roll on', 'shampoo', 'acondicionador', 'crema para el cuerpo', 'crema corporal',
    'crema de manos', 'crema facial', 'crema hidratante', 'crema', 'gel de baño', 'gel', 'jabón líquido',
    'jabon liquido', 'jabón en barra', 'jabón', 'jabon', 'aceite', 'bálsamo labial', 'balsamo labial',
    'bálsamo', 'balsamo', 'sérum', 'serum', 'exfoliante', 'mascarilla', 'agua micelar', 'desmaquillante',
    'loción', 'locion', 'bruma', 'perfume', 'colonia', 'spray', 'bolso', 'bolsa de viaje', 'bolsa',
    'neceser', 'repuesto', 'refill', 'crema de afeitar'
]

def kit_components(name):
    n = norm(name)
    raw = re.sub(r'\b(kit|duo|dúo|combo|set|estuche|caja|pack|trio|trío|de|basico|básico|femenin\w*|masculin\w*|unisex|clasico|clásico|nueva fragancia)\b', ' ', n)
    pieces = [x.strip(' .') for x in COMP_SPLIT.split(' ' + raw + ' ') if x and len(x.strip(' .')) > 3]
    comps = []
    for piece in pieces:
        tp = next((t for t in sorted(COMP_TYPES, key=len, reverse=True) if re.search(r'\b' + re.escape(t) + r'\b', piece)), None)
        if tp and tp not in comps:
            comps.append(tp)
    return comps

def kit_facts_text(src, seg):
    def good(v):
        v = clean(v)
        return '' if re.search(r'regalo|set de la línea|según', v, re.I) else v
    bits = []
    if 'perfumes' in seg:
        fo = good(src.get('family_olfativa'))
        if fo: bits.append('familia ' + fo)
        notes = []
        if good(src.get('notas_salida')): notes.append('salida ' + good(src.get('notas_salida')))
        if good(src.get('notas_corazon')): notes.append('corazón ' + good(src.get('notas_corazon')))
        if good(src.get('notas_fondo')): notes.append('fondo ' + good(src.get('notas_fondo')))
        if notes: bits.append('notas de ' + ', '.join(notes))
        if good(src.get('estilo_ocasion')): bits.append('estilo ' + good(src.get('estilo_ocasion')))
        if good(src.get('sensacion')): bits.append('sensación ' + good(src.get('sensacion')))
        if not notes and not fo:
            return ''
    else:
        if clean(src.get('beneficio_principal')): bits.append(clean(src['beneficio_principal']))
        if clean(src.get('ingredientes_clave')): bits.append('con ' + clean(src['ingredientes_clave']))
        if clean(src.get('resultado')): bits.append('resultado: ' + clean(src['resultado']))
    return '; '.join(bits)

def compose_kit(p, seg, fams, prods):
    n = norm(p['name'])
    if not re.search(KIT_RE, n):
        return ''
    ov = (prods or {}).get(p['name'])
    line = next((t.title() for t in LINE_TOKENS if re.search(r'\b' + re.escape(t) + r'\b', n)), None)
    fam = longest_match(p['name'], fams or {})
    if fam and line:
        fl = clean(fam.get('line')).lower()
        if line.lower() not in fl and not any(w in fl for w in line.lower().split()):
            fam = longest_match(p['name'], {k: v for k, v in (fams or {}).items() if line.lower() in clean(v.get('line')).lower()})
    if not fam and not ov:
        return ''
    comps = kit_components(p['name'])
    parts = [f"Kit {line}" if line else f"Kit {clean(p.get('brand')) or 'del catálogo'}"]
    parts[0] += (' que incluye ' + '; '.join(comps) + '.' if comps else '.')
    facts = kit_facts_text(src_of(fam or {}, ov), seg)
    if facts:
        parts.append(('De la línea ' + line + ': ' if line else '') + facts + '.')
    if not comps and not facts:
        return ''
    spec = ' '.join(x for x in (size_of(p['name']), pieces_of(p['name'])) if x)
    if spec: parts.append('Presentación ' + spec + '.')
    return ' '.join(parts)

# ================= RUN =================
def load(f):
    return json.load(open(os.path.join(BASE, f'knowledge_{f}.json')))

kp, kc, ap, ac, cs = load('natura_perfumes'), load('natura_cuidado'), load('avon_perfumes'), load('avon_cuidado'), load('casa_estilo')

out = []
stats = {'total': 0, 'enriched': 0, 'kits': 0, 'unchanged': 0}

def emit(seg, composer, fams, prods):
    for p in json.load(open(os.path.join(BASE, f'desc_{seg}.json'))):
        stats['total'] += 1
        desc = compose_kit(p, seg, fams, prods)
        if desc:
            stats['kits'] += 1
        else:
            ov = (prods or {}).get(p['name'])
            fam = longest_match(p['name'], fams or {})
            if not fam and not ov:
                stats['unchanged'] += 1
                continue
            desc = composer(p, fam or {}, ov)
            if len(desc) < 30:
                stats['unchanged'] += 1
                continue
        if re.search(r'repuesto|refill|refil', norm(p['name'])):
            desc = 'Repuesto (para rellenar). ' + desc
        stats['enriched'] += 1
        out.append({'id': p['id'], 'description': desc})

emit('natura_perfumes', compose_perfume, kp.get('families', {}), kp.get('products', {}))
emit('avon_perfumes', compose_perfume, ap.get('families', {}), ap.get('products', {}))
emit('natura_cuidado', compose_care, kc.get('families', {}), kc.get('products', {}))
emit('avon_cuidado', compose_care, ac.get('families', {}), ac.get('products', {}))

for p in json.load(open('/tmp/desc_casa_estilo.json')):
    stats['total'] += 1
    desc = compose_home(p, cs.get('product_types', {}), cs.get('licensed_designs', {}))
    if len(desc) >= 30:
        stats['enriched'] += 1
        out.append({'id': p['id'], 'description': desc})
    else:
        stats['unchanged'] += 1

# pass 2: factual name-derived for leftovers
gen_ids = {g['id'] for g in out}
extra = 0
for seg in ('natura_perfumes', 'natura_cuidado', 'avon_perfumes', 'avon_cuidado'):
    for p in json.load(open(os.path.join(BASE, f'desc_{seg}.json'))):
        if p['id'] in gen_ids:
            continue
        d = compose_from_name(p)
        if d:
            if re.search(r'repuesto|refill|refil', norm(p['name'])):
                d = 'Repuesto (para rellenar). ' + d
            out.append({'id': p['id'], 'description': d})
            gen_ids.add(p['id'])
            extra += 1
stats['enriched'] += extra
stats['unchanged'] -= extra

json.dump(out, open(os.path.join(BASE, 'generated.json'), 'w'), ensure_ascii=False)
print(stats)
print('--- MUESTRAS KITS ---')
import random
random.seed(3)
kits = [g for g in out if g['description'].startswith('Kit ') or '— set' in g['description'][:30]]
for s in random.sample(kits, min(6, len(kits))):
    print('•', s['description'][:240], '\n')
