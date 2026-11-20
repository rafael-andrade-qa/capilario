// Regras do catálogo: o que é produto de cabelo, de que tipo, para qual público, e como fica o
// nome (sem marca e sem tamanho). Funções puras, testadas em normalize.test.ts.

export const plain = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

export const slug = (s) =>
  plain(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

// ---------- Tipos ----------

/** Tipos do catálogo, com o rótulo que aparece no app. */
export const CATEGORIES = {
  shampoo: 'Shampoo',
  shampoo_seco: 'Shampoo a seco',
  co_wash: 'Co-wash',
  pre_shampoo: 'Pré-shampoo',
  condicionador: 'Condicionador',
  mascara: 'Máscara',
  ampola: 'Ampola',
  leave_in: 'Leave-in',
  creme_pentear: 'Creme de pentear',
  ativador: 'Ativador de cachos',
  gelatina: 'Gelatina',
  geleia: 'Geleia',
  gel: 'Gel',
  mousse: 'Mousse',
  pomada: 'Pomada',
  cera: 'Cera',
  pasta: 'Pasta modeladora',
  spray: 'Spray',
  oleo: 'Óleo',
  serum: 'Sérum',
  protetor_termico: 'Protetor térmico',
  reativador: 'Reativador',
  tonico: 'Tônico',
  acidificante: 'Acidificante',
  manteiga: 'Manteiga',
  finalizador: 'Finalizador',
  tratamento: 'Tratamento',
}

// O que não entra: kits, cor, química de alisar, acessórios, aparelhos e coisas de rosto/corpo/barba.
const DROP = [
  /\bkit\b|\bcombo\b|\bleve \d|\bpague \d|\d+ ?unidades|\bcom \d+ (un|unid)/,
  /\bcolora[cç]|\btinta\b|\btonalizante|\bdescolor|\boxidante|agua oxigenada|\bhenna\b|\bmatizador em po\b|\bretoque de raiz/,
  /soft color|color mask|colour mask|tone-?on-?tone|tone on tone|\bcolor (creme|cream|gloss|touch|fresh)|preto azulado|\bcastanho|\bruivo\b|\blouro (claro|escuro|medio)|\bcolor\b.*\b\d{1,2}[.,]\d{1,3}\b/,
  /\balisa(nte|mento)|\bprogressiva|\brelaxamento|\bguanidina|\bpermanente afro|\bselagem termica\b/,
  /\btesoura|\bpente\b|\bpentes\b|\bescova (de|para) cabelo|\bescova raquete|\bescova redonda|\bescova desembaracadora|\bsecador|\bprancha|\bbabyliss|\bchapinha|\bdifusor|\btouca|\belastico|\bpresilha|\bpiranha|\bgrampo|\btiara|\bfaixa\b|\bbandana|\bcapa de corte|\bmaquina de (corte|cortar)|\baparador/,
  /\bfacial|\brosto\b|\bcorpo\b|\bcorporal|\bolhos\b|\blabial|\bunha|\bcilios|\bsobrancelha|\bmaquiagem|\bprotetor solar|\bfps\b|\bantissinais|\bclareador|\bdesodorante|\bsabonete|\bperfume|\bcolonia\b|\bbarbear\b|\bpos-?barba|\bbigode|\bpernas\b|\bpes\b|massageador|\bjoelho|\bassadura|\bcicatriz/,
  /\bvitamina|\bsuplemento|\bcapsulas|\bcomprimido|\bgomas\b|\bpet\b|\bcachorro|\bcaes\b|\bgatos\b/,
]

/** Palavras de cabelo: para categorias de loja que misturam rosto e cabelo (Sérum, Tônico...). */
const HAIR_WORDS =
  /capilar|cabelo|fios\b|cachos|cacheado|crespo|ondulado|liso\b|pontas|couro cabeludo|caspa|shampoo|condicionador|leave|pentear|finaliz|\bhair\b|pomada (modeladora|capilar|para cabelo|matte|efeito|fixa|texturiz|em po|de cabelo)|pomada modeladora|texturiz|cera (modeladora|capilar|para cabelo|em bastao|efeito|matte)|\bwax\b|\bpomade\b|\bclay\b|efeito matte|argila modeladora|pasta modeladora|gel (fixador|modelador|capilar|de cabelo)|barber/

// Ordem importa: o mais específico antes.
const TYPE_RULES = [
  ['shampoo_seco', /shampoo a seco|shampoo seco|dry shampoo/],
  ['co_wash', /co-?wash|cowash/],
  ['pre_shampoo', /pre[- ]?shampoo|pre[- ]?poo\b/],
  ['protetor_termico', /protetor termico|termoprotetor|protecao termica|thermal|heat protect|blow ?dry/],
  ['leave_in', /leave-? ?in/],
  ['ativador', /ativador de cachos|ativador cachos|ativador\b/],
  ['creme_pentear', /creme (de|para) pentear|creme p\/ pentear|creme pentear/],
  ['condicionador', /\bcondicionador|\bconditioner|\bacondicionador/],
  ['shampoo', /\bshampoo|\bxampu|\bsabonete liquido para cabelo/],
  ['ampola', /\bampola|\bampolas/],
  ['mascara', /\bmascara|\bmasque\b|\bmask\b|banho de creme|creme de tratamento|creme hidratante capilar/],
  ['gelatina', /\bgelatina/],
  ['geleia', /\bgeleia/],
  ['pomada', /\bpomada/],
  ['cera', /\bcera\b|\bwax\b/],
  ['pasta', /\bpasta modeladora|\bargila|\bclay\b|\bpasta\b/],
  ['mousse', /\bmousse|\bespuma/],
  ['gel', /\bgel\b|\bgel-|\bgel fixador|\bgel modelador|gel capilar/],
  ['spray', /\bspray|\bfixador|\blaque|\bhair ?spray|\bbruma/],
  ['reativador', /reativador|day after|umidificador|refresh|revitalizador de cachos/],
  ['tonico', /\btonico|\blocao capilar|\blocao antiqueda|\bloção/],
  ['acidificante', /acidificante|vinagre capilar|\bacv\b/],
  ['manteiga', /\bmanteiga/],
  ['serum', /\bserum|reparador de pontas|\bfluido|\bsilicone|\bselante/],
  ['oleo', /\boleo|\boil\b|\belixir|\boleos\b/],
  ['finalizador', /finalizador|modelador|creme modelador|definidor|texturizador|creme para cachos/],
  ['tratamento', /tratamento|reconstrutor|reconstrucao|cronograma|hidratacao|nutricao|booster|tonalizante/],
]

/** Tipo pelo nome; se não der, pela categoria da loja. null = não é algo que entra no catálogo. */
export function classify(name, storeCategories = []) {
  const n = plain(name)
  const cats = plain(storeCategories.join(' '))
  if (DROP.some((r) => r.test(n))) return null
  // Barba sem cabelo (óleo, balm, shampoo para barba) fica de fora; "cabelo e barba" entra.
  if (/\bbarba\b/.test(n) && !/cabelo|capilar|\bhair\b/.test(n)) return null
  if (/kits? para cabelos|kit shampoo|coloracao|escova progressiva|alisamento|escovas e acessorios|acessorios/.test(cats)) return null
  for (const [type, re] of TYPE_RULES) if (re.test(n)) return type
  // Pelo caminho da loja.
  for (const [type, re] of TYPE_RULES) if (re.test(cats)) return type
  if (/finalizadores|modeladores/.test(cats)) return 'finalizador'
  if (/tratamento|mascaras|hidratacao|nutricao|antiqueda|anticaspa|antirresiduos/.test(cats)) return 'tratamento'
  return null
}

/** Categorias de loja que misturam rosto e cabelo pedem palavra de cabelo no nome. */
export function isHairProduct(name, storeCategories = []) {
  const cats = plain(storeCategories.join(' '))
  if (/\/cabelos?\//.test(cats)) return true
  // Categorias que são de cabelo pelo nome (lojas com categorias "planas", como a Drogaria SP).
  const hairCat =
    /capilar|cabelo|shampoo|condicionador|leave-in|pentear|finalizador|gelatina|geleia|umidificador|protetor termico|reparador de pontas|pre shampoo|vinagre capilar|barbearia\/modeladores|cabelos masculinos/.test(cats)
  const mixed = /dermocosmeticos|\/serum\/|\/tonico\/|\/ampola\/|\/gel\/|\/mousse\/|\/spray|\/fixador|\/modelador\/|\/cera\/|\/locao|\/mascara\/|\/manteiga\//.test(cats)
  if (hairCat && !mixed) return true
  // Fora de categoria de cabelo (inclui o que veio de busca por texto): o nome precisa dizer.
  return HAIR_WORDS.test(plain(name))
}

// ---------- Público ----------

const MALE = /\bmen\b|\bmen's|\bmens\b|for men|masculin|\bhomem\b|\bhomens\b|\bbarber|barbearia|\bboy\b|\bman\b|\bmacho\b|\bgentleman/
const FEMALE = /\bwomen\b|\bwoman\b|feminin|\bmulher|\blady\b|\bladies\b|\bgirl/

export function audienceOf(name, storeAudience, storeCategories = []) {
  const n = plain(name)
  const a = plain([].concat(storeAudience ?? []).join(' '))
  // Departamento masculino só conta se o produto não está também na seção geral de cabelos
  // (lojas põem produtos unissex populares nas duas).
  const paths = storeCategories.map(plain)
  const menDept = (c) => /\/homens\/|cuidados masculinos|cabelos masculinos|barbearia|\/homem\//.test(c)
  const onlyMen = paths.some(menDept) && !paths.some((c) => !menDept(c) && /cabel|shampoo|condicionador|finaliz|tratamento|leave|pentear/.test(c))
  if (MALE.test(n) || /masculino/.test(a) || onlyMen) return 'masculino'
  if (FEMALE.test(n) || /feminino/.test(a)) return 'feminino'
  return 'unissex'
}

// ---------- Nome ----------

const SIZE = /\b\d+(?:[.,]\d+)?\s?(?:ml|l|lt|litros?|g|gr|gramas?|kg|mg|oz|fl\.? ?oz|un|und|unid)\b\.?/gi
const NOISE = /\b(refil|refill|sache|sachê|tamanho (familia|viagem)|travel size|edicao limitada)\b/gi
const BRAND_SUFFIX = ['cosmetics', 'cosmeticos', 'professional', 'professionals', 'professionnel', 'paris', 'care', 'hair', 'brasil', 'brazil', 'milano', 'pro', 'beauty', 'nyc', 'london']

/** Variantes de como a marca aparece dentro do nome. */
export function brandVariants(brand, aliases = []) {
  const out = new Set()
  for (const b of [brand, ...aliases]) {
    const w = plain(b).split(/[^a-z0-9.]+/).filter(Boolean)
    if (!w.length) continue
    out.add(w.join(' '))
    const core = w.filter((x) => !BRAND_SUFFIX.includes(x))
    if (core.length) out.add(core.join(' '))
    // Só a primeira palavra quando o resto é sufixo ("Wella Professionals" -> "Wella"),
    // nunca em marcas como "Head & Shoulders".
    if (core.length === 1 && core[0].length >= 3) {
      out.add(core[0])
      for (const s of BRAND_SUFFIX) out.add(`${core[0]} ${s}`)
    }
  }
  return [...out].sort((a, b) => b.split(' ').length - a.split(' ').length)
}

/** Nome sem marca, sem tamanho e sem sobras de pontuação. Mantém a grafia original das palavras. */
export function cleanName(name, brand, aliases = []) {
  let s = String(name).replace(/\s+/g, ' ').replace(SIZE, ' ').replace(NOISE, ' ')
  const words = s.split(' ').filter(Boolean)
  const keys = words.map((w) => plain(w).replace(/[^a-z0-9.]/g, ''))
  // Só as palavras com letra/número contam para casar a marca ("&" e "-" são pulados).
  const idx = keys.map((k, i) => (k ? i : -1)).filter((i) => i >= 0)
  const variants = brandVariants(brand, aliases).map((v) => v.split(' '))
  const drop = new Array(words.length).fill(false)
  for (let j = 0; j < idx.length; j++) {
    for (const v of variants) {
      if (v.every((t, k) => keys[idx[j + k]] === t)) {
        for (let k = 0; k < v.length; k++) drop[idx[j + k]] = true
        // Pontuação entre as palavras da marca ("Head & Shoulders") sai junto.
        for (let i = idx[j]; i <= idx[j + v.length - 1]; i++) drop[i] = true
        break
      }
    }
  }
  const kept = words.filter((_, i) => !drop[i])
  // Sufixo da marca que sobrou no começo ("Alfaparf Milano Professional ..." -> "Professional ...").
  while (kept.length > 1 && BRAND_SUFFIX.includes(plain(kept[0]).replace(/[^a-z]/g, ''))) kept.shift()
  s = kept.join(' ')
  s = s
    .replace(/\s*[-–|,+:]\s*(?=[-–|,+:]|$)/g, ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/^\s*[-–|,+:.]+\s*/, '')
    .replace(/\s*[-–|,+:]\s*$/, '')
    .replace(/\s+-\s+/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim()
  // Se sobrou quase nada (o nome era só a marca), volta ao original sem tamanho.
  if (s.replace(/[^a-zA-Z]/g, '').length < 3) s = String(name).replace(SIZE, ' ').replace(/\s+/g, ' ').trim()
  s = titleIfShouting(s)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const SMALL = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'com', 'para', 'a', 'o', 'em', 'no', 'na', 'and', 'of', 'the'])
/** "CONDICIONADOR PREMIUM MOIST" -> "Condicionador Premium Moist" (siglas curtas ficam). */
export function titleIfShouting(s) {
  const letters = s.replace(/[^\p{L}]/gu, '')
  const upper = letters.replace(/[^\p{Lu}]/gu, '')
  if (letters.length < 6 || upper.length / letters.length < 0.7) return s
  return s
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

/** Chave para juntar o mesmo produto de lojas diferentes. */
export function mergeKey(brandKey, name) {
  const words = plain(name)
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(' ')
    .filter((w) => w && !['de', 'da', 'do', 'das', 'dos', 'e', 'com', 'para', 'p', 'a', 'o', 'capilar', 'cabelos', 'cabelo'].includes(w))
  return `${brandKey}|${[...new Set(words)].sort().join(' ')}`
}

/** Grafia da marca: a mais comum; se vier toda em maiúsculas, em formato de título. */
export function brandDisplay(forms) {
  const count = new Map()
  for (const f of forms) count.set(f, (count.get(f) ?? 0) + 1)
  let best = [...count.entries()].sort((a, b) => b[1] - a[1] || (a[0] === a[0].toUpperCase() ? 1 : -1))[0][0]
  if (best.length > 4 && best === best.toUpperCase()) best = best.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())
  return best.trim()
}

/** Imagem VTEX num tamanho fixo (a URL aceita "ids/<id>-<largura>-<altura>/"). */
export function vtexSized(url, w = 800, h = 800) {
  return String(url).replace(/\/ids\/(\d+)(?:-\d+-\d+)?\//, `/ids/$1-${w}-${h}/`)
}
