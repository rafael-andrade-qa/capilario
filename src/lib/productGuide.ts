// Guia dos tipos de produto: o que é cada um, pra que serve, em que etapa entra e como usar.
// Texto geral, sem marca: vale para qualquer geleia, qualquer creme de pentear... Os tipos são
// os mesmos do catálogo (scripts/catalog/normalize.mjs) e da coluna experiments.category.

/** As etapas são as mesmas da rotina e da prateleira (lib/routine.ts e routine_step_of no banco). */
import type { RoutineStep } from './routine'
export type { RoutineStep }

/** Etapas na ordem de uma rotina, com o que acontece em cada uma. Mesmos nomes de ROUTINE_STEPS. */
export const STEPS: { id: RoutineStep; label: string; text: string }[] = [
  { id: 'wash', label: 'Lavar', text: 'O começo de tudo: tira sujeira, oleosidade e resto de produto.' },
  { id: 'condition', label: 'Condicionar', text: 'Depois do shampoo: fecha a cutícula, desembaraça e devolve a maciez. Vai e sai no banho.' },
  { id: 'mask', label: 'Máscara', text: 'O tratamento mais forte: hidratação, nutrição ou reconstrução. Vai e sai no banho.' },
  { id: 'prep', label: 'Preparar', text: 'Logo depois do banho: desembaraça, protege o fio e cuida da raiz.' },
  { id: 'shape', label: 'Definir', text: 'Forma o cacho ou a onda e dá maciez.' },
  { id: 'hold', label: 'Fixar', text: 'Segura o formato até secar: definição, volume e menos frizz.' },
  { id: 'finish', label: 'Finalizar', text: 'O acabamento no fim: brilho, pontas e fios soltos. Em cabelo curto, é aqui que a pomada, a cera e a pasta montam o penteado.' },
]

export interface ProductType {
  label: string
  /** Uma linha: o essencial (vai na lista, no PDF e na mensagem). */
  short: string
  step: RoutineStep
  what: string
  how: string
  pairs: string
}

export const PRODUCT_TYPES: Record<string, ProductType> = {
  pre_shampoo: {
    label: 'Pré-shampoo',
    short: 'Protege os fios antes de lavar.',
    step: 'wash',
    what: 'Vai antes do shampoo e cria uma proteção para a lavagem não ressecar tanto o comprimento.',
    how: 'No cabelo seco ou úmido, espalhe no comprimento e nas pontas, deixe de 15 a 30 minutos e lave normalmente.',
    pairs: 'Depois: shampoo e condicionador, como sempre.',
  },
  shampoo: {
    label: 'Shampoo',
    short: 'Limpa o couro cabeludo e os fios.',
    step: 'wash',
    what: 'Tira a oleosidade, o suor e o resto de produto do couro cabeludo e dos fios.',
    how: 'Aplique no couro cabeludo molhado, massageie com a ponta dos dedos (sem unha) e deixe a espuma escorrer pelo comprimento. Enxágue bem.',
    pairs: 'Depois vem condicionador ou máscara: o shampoo abre a cutícula e eles fecham.',
  },
  shampoo_seco: {
    label: 'Shampoo a seco',
    short: 'Tira a oleosidade da raiz sem água.',
    step: 'wash',
    what: 'Pó ou spray que absorve a oleosidade da raiz e dá volume, para esticar o dia entre uma lavagem e outra.',
    how: 'Com o cabelo seco, borrife a uns 20 cm da raiz, espere um minuto e espalhe com os dedos ou a escova.',
    pairs: 'Não substitui o shampoo: a lavagem de verdade continua necessária.',
  },
  co_wash: {
    label: 'Co-wash',
    short: 'Lava de leve, sem espuma, sem ressecar.',
    step: 'wash',
    what: 'Um "condicionador de limpeza": limpa sem sulfato e sem espuma. Muito usado em cabelos cacheados e crespos, que ressecam fácil.',
    how: 'No lugar do shampoo: massageie bem o couro cabeludo com o produto e enxágue.',
    pairs: 'Use um shampoo de vez em quando para tirar o acúmulo de produto.',
  },
  condicionador: {
    label: 'Condicionador',
    short: 'Desembaraça e devolve a maciez depois do shampoo.',
    step: 'condition',
    what: 'Fecha a cutícula que o shampoo abriu, desembaraça e deixa o fio macio.',
    how: 'No comprimento e nas pontas, longe da raiz. Deixe 2 a 3 minutos, desembarace com os dedos ou um pente largo e enxágue.',
    pairs: 'Vem depois do shampoo. Nos dias de máscara, pode ser trocado por ela.',
  },
  mascara: {
    label: 'Máscara',
    short: 'Tratamento mais forte que o condicionador.',
    step: 'mask',
    what: 'Concentrada em hidratação, nutrição ou reconstrução (o rótulo diz qual). Trata o fio por dentro.',
    how: 'Depois do shampoo, no comprimento e nas pontas. Deixe o tempo do rótulo (de 5 a 20 minutos) e enxágue. Uma ou duas vezes por semana.',
    pairs: 'Entra no lugar do condicionador. Alternar os tipos ao longo das semanas é o tal cronograma capilar.',
  },
  ampola: {
    label: 'Ampola',
    short: 'Dose concentrada de tratamento.',
    step: 'mask',
    what: 'Uma dose pequena e forte de um ativo, para reforçar a máscara ou tratar algo específico.',
    how: 'Sozinha ou misturada à máscara, como o rótulo indicar. Algumas são enxaguadas, outras não.',
    pairs: 'Costuma ir junto da máscara.',
  },
  leave_in: {
    label: 'Leave-in',
    short: 'Hidrata, desembaraça e protege, sem enxágue.',
    step: 'prep',
    what: 'Creme ou spray que fica no cabelo: hidrata, desembaraça, protege e prepara o fio para o que vem depois.',
    how: 'No cabelo úmido, logo depois do banho, do comprimento às pontas.',
    pairs: 'É a base: depois vêm creme de pentear, gelatina ou mousse. Em cabelo liso ou fino, pode ser o único produto.',
  },
  creme_pentear: {
    label: 'Creme de pentear',
    short: 'Hidrata, desembaraça e começa a formar o cacho.',
    step: 'shape',
    what: 'Creme sem enxágue que dá maciez, tira o frizz e começa a formar o cacho ou a onda.',
    how: 'No cabelo molhado, por mechas. Penteie com os dedos ou a escova e amasse de baixo para cima para ativar o cacho.',
    pairs: 'Sozinho dá maciez e algum controle. Para definição forte, use um fixador por cima (gelatina, geleia ou mousse).',
  },
  ativador: {
    label: 'Ativador de cachos',
    short: 'Junta os fios em cachos definidos.',
    step: 'shape',
    what: 'Creme ou gel-creme feito para "ativar" o cacho: junta os fios em mechas definidas e com memória.',
    how: 'No cabelo bem molhado, por mechas, amassando ou enrolando no dedo. Deixe secar sem mexer.',
    pairs: 'Vem depois do leave-in. Dá para selar com gelatina se quiser mais fixação.',
  },
  gelatina: {
    label: 'Gelatina',
    short: 'Fixa o cacho com firmeza e dá volume.',
    step: 'hold',
    what: 'Gel de textura firme que segura o formato do cacho até secar: definição, volume e controle do frizz.',
    how: 'Ainda no cabelo molhado, por mechas ou amassando. Pode formar uma casquinha ao secar: com o cabelo 100% seco, amasse para soltar.',
    pairs: 'Vem depois do creme de pentear ou do ativador. Um pouco de óleo no fim ajuda a soltar a casquinha.',
  },
  geleia: {
    label: 'Geleia',
    short: 'Define e controla o frizz, com fixação média.',
    step: 'hold',
    what: 'Gel leve, de textura mais aquosa, que segura o cacho ou a onda depois que ele se forma, sem pesar.',
    how: 'No cabelo ainda molhado, espalhe por mechas ou amassando de baixo para cima e deixe secar sem mexer. A casquinha que pode formar some quando você amassa o cabelo seco.',
    pairs: 'Vem depois do creme de pentear ou do leave-in. Óleo depois, se quiser tirar a casquinha.',
  },
  gel: {
    label: 'Gel',
    short: 'Fixação forte, às vezes com efeito molhado.',
    step: 'hold',
    what: 'O fixador clássico: segura bem o formato. Alguns deixam o efeito molhado.',
    how: 'Pouca quantidade. Em cacheados, por cima do creme, no cabelo molhado. Em cabelo curto, para modelar o penteado.',
    pairs: 'Vem depois do creme de pentear. Em cabelo curto, pode ser o único produto.',
  },
  mousse: {
    label: 'Mousse',
    short: 'Dá volume e define sem pesar.',
    step: 'hold',
    what: 'Espuma leve que dá volume e define. Boa para ondulados e fios finos, que pesam fácil.',
    how: 'Agite, faça uma bola de espuma na mão e aplique no cabelo úmido amassando de baixo para cima. Seque ao natural ou com difusor.',
    pairs: 'Pode ir sozinha ou depois de um leave-in leve.',
  },
  pomada: {
    label: 'Pomada',
    short: 'Modela cabelo curto, com brilho ou efeito seco.',
    step: 'finish',
    what: 'Modelador para cabelo curto: segura o penteado. Conforme o tipo, dá brilho ou efeito seco (matte).',
    how: 'Aqueça um pouco entre as mãos e passe no cabelo seco ou levemente úmido, modelando com os dedos ou o pente.',
    pairs: 'Costuma ser o único produto do penteado.',
  },
  cera: {
    label: 'Cera',
    short: 'Modelador firme para cabelo curto.',
    step: 'finish',
    what: 'Segura o penteado com fixação média a forte e deixa remodelar ao longo do dia.',
    how: 'Aqueça um pouco entre as mãos e passe no cabelo seco, modelando com os dedos ou o pente.',
    pairs: 'Costuma ser o único produto do penteado.',
  },
  pasta: {
    label: 'Pasta modeladora',
    short: 'Textura e fixação flexível, efeito seco.',
    step: 'finish',
    what: 'Modelador de acabamento seco (sem brilho), que dá textura e deixa o penteado com cara natural.',
    how: 'Pouca quantidade, aquecida nas mãos, no cabelo seco. Bagunce com os dedos para dar textura.',
    pairs: 'Costuma ser o único produto do penteado.',
  },
  spray: {
    label: 'Spray',
    short: 'Mantém o penteado e controla fios soltos.',
    step: 'finish',
    what: 'Fixador em spray (laquê) ou spray de acabamento: segura o penteado pronto e controla os fios soltos.',
    how: 'Com o cabelo seco e já arrumado, borrife a uns 20 a 30 cm.',
    pairs: 'É o último passo, por cima de tudo.',
  },
  oleo: {
    label: 'Óleo',
    short: 'Brilho, pontas seladas e menos frizz.',
    step: 'finish',
    what: 'Dá brilho, sela as pontas e ajuda a soltar a casquinha de gelatina ou geleia.',
    how: 'Poucas gotas espalhadas nas mãos, no comprimento e nas pontas, com o cabelo seco. No úmido, use menos ainda.',
    pairs: 'Vem no fim, depois do fixador. Pouco já basta: em excesso, pesa e deixa oleoso.',
  },
  serum: {
    label: 'Sérum',
    short: 'Brilho e pontas, bem leve.',
    step: 'finish',
    what: 'Finalizador leve (geralmente com silicone) para brilho, pontas e frizz.',
    how: 'Uma ou duas gotas nas pontas, com o cabelo úmido ou seco.',
    pairs: 'Vem no fim. Parecido com o óleo, com toque mais seco.',
  },
  protetor_termico: {
    label: 'Protetor térmico',
    short: 'Protege do calor de secador e prancha.',
    step: 'prep',
    what: 'Cria uma proteção contra o calor do secador, da prancha e do babyliss.',
    how: 'Antes do calor, em todo o comprimento. Espere absorver e só então use o aparelho.',
    pairs: 'Indispensável sempre que tiver calor. Vai junto ou depois do leave-in.',
  },
  reativador: {
    label: 'Reativador',
    short: 'Revive o cacho no dia seguinte, sem lavar.',
    step: 'finish',
    what: 'Spray ou creme leve que devolve a forma ao cacho ou à onda amassados pela noite.',
    how: 'Borrife nas mechas, amasse ou passe os dedos para redefinir e deixe secar.',
    pairs: 'No dia seguinte, no lugar de lavar de novo.',
  },
  tonico: {
    label: 'Tônico',
    short: 'Trata o couro cabeludo.',
    step: 'prep',
    what: 'Loção para o couro cabeludo: queda, crescimento, oleosidade ou caspa, conforme o rótulo.',
    how: 'Direto na raiz, massageando. Geralmente não tem enxágue.',
    pairs: 'Não interfere no resto da rotina: entra antes dos finalizadores.',
  },
  acidificante: {
    label: 'Acidificante',
    short: 'Fecha a cutícula: mais brilho, menos frizz.',
    step: 'prep',
    what: 'Baixa o pH do fio depois da lavagem ou da química, fechando a cutícula.',
    how: 'Depois do shampoo, como o rótulo indicar: alguns são enxaguados, outros ficam no cabelo.',
    pairs: 'Combina com dias de tratamento e pós-química.',
  },
  manteiga: {
    label: 'Manteiga',
    short: 'Nutrição pesada para fios secos.',
    step: 'shape',
    what: 'Creme rico em manteigas vegetais, para fios muito secos e crespos.',
    how: 'Pouca quantidade, no comprimento e nas pontas, junto do creme de pentear ou para selar no fim.',
    pairs: 'Em cabelo fino ou ondulado, pesa: use com moderação.',
  },
  finalizador: {
    label: 'Finalizador',
    short: 'Nome amplo para o que define o cabelo, sem enxágue.',
    step: 'shape',
    what: 'Nome amplo para o que vai depois do leave-in e fica no cabelo: definição, brilho ou controle do frizz. Varia muito de produto para produto.',
    how: 'Siga o rótulo: ele diz se fixa (como uma gelatina) ou só dá acabamento (como um óleo).',
    pairs: 'Em geral, vem depois do leave-in ou do creme de pentear.',
  },
  tratamento: {
    label: 'Tratamento',
    short: 'Cuidado específico, como diz o rótulo.',
    step: 'mask',
    what: 'Produto para um problema específico: reconstrução, antiqueda, antirresíduo, etc.',
    how: 'Siga o rótulo. Costuma entrar no lugar do condicionador ou da máscara nos dias de tratamento.',
    pairs: 'Depende do tipo: o rótulo diz o que vem antes e depois.',
  },
}

/** "Sem finalizador": a referência do app. */
export const NO_FINISHER_GUIDE = {
  label: 'Sem finalizador',
  short: 'O cabelo só lavado, para comparar.',
  what: 'O cabelo depois de lavar (e condicionar), sem nada para definir, fixar ou finalizar.',
  why: 'É a referência: comparando com ele, dá para ver o que cada produto muda de verdade.',
}

export const productType = (category: string | null | undefined): ProductType | null =>
  (category && PRODUCT_TYPES[category]) || null

export const stepOf = (id: RoutineStep) => STEPS.find((s) => s.id === id)!

/** Tipos agrupados pelas etapas, na ordem da rotina (para o guia e o campo "Tipo"). */
export function typesByStep(): { step: (typeof STEPS)[number]; types: { id: string; type: ProductType }[] }[] {
  return STEPS.map((step) => ({
    step,
    types: Object.entries(PRODUCT_TYPES)
      .filter(([, t]) => t.step === step.id)
      .map(([id, type]) => ({ id, type })),
  })).filter((g) => g.types.length > 0)
}

/** "Geleia: define e controla o frizz, com fixação média." (mensagem e PDF). */
export function aboutLine(e: { product_mode: string; category?: string | null }): string | null {
  if (e.product_mode === 'none') return `${NO_FINISHER_GUIDE.label}: ${lower(NO_FINISHER_GUIDE.short)}`
  const t = productType(e.category)
  return t ? `${t.label}: ${lower(t.short)}` : null
}

/** Explicação do tipo para o PDF: "O que é geleia" + o que é e a etapa. */
export function pdfAbout(e: { product_mode: string; category?: string | null }): { title: string; text: string } | null {
  if (e.product_mode === 'none') return { title: 'O que é sem finalizador', text: `${NO_FINISHER_GUIDE.what} ${NO_FINISHER_GUIDE.why}` }
  const t = productType(e.category)
  if (!t) return null
  return { title: `O que é ${lower(t.label)}`, text: `${t.what} Etapa da rotina: ${lower(stepOf(t.step).label)}.` }
}

/** "Geleia · Widi Care" (marca na capa do PDF, com o tipo na frente). */
export function typeAndBrand(e: { product_mode: string; category?: string | null }, brand: string | null): string | null {
  const t = e.product_mode === 'named' ? productType(e.category) : null
  return [t?.label, brand].filter(Boolean).join(' · ') || null
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
