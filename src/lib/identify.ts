// "Identificar pela foto": manda a foto (reduzida) à função identify-product e prepara as
// fotos oficiais encontradas já padronizadas (fundo branco, retrato 3:4).
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { catalogPhotoFile } from './catalog'
import { downscaleToBase64, toPackshot } from './packshot'
import { supabase } from './supabase'
import { limitReached, refreshPlan } from './plan'

export interface Candidate {
  file: File
  preview: string
  source: string
  /** Veio do catálogo do app (o produto fica ligado a este item). */
  catalogId?: string
}

/** Item do catálogo que a função reconheceu como o produto da foto. */
export interface CatalogMatch {
  id: string
  name: string
  brand: string
  image_path: string | null
}

export type IdentifyOutcome =
  | { found: false }
  | { found: true; brand: string; name: string; confidence: 'high' | 'medium' | 'low'; catalog: CatalogMatch | null; candidates: Candidate[] }

type Wire =
  | { found: false }
  | {
      found: true
      brand: string
      name: string
      confidence: 'high' | 'medium' | 'low'
      catalog?: CatalogMatch | null
      candidates: { image: string; mime: string; source: string }[]
    }

const MESSAGES: Record<string, string> = {
  identify_limit: 'Você já usou as identificações do seu plano. Até renovar, preencha à mão.',
  not_configured: 'A identificação pela foto ainda não foi ligada no servidor. Preencha à mão por enquanto.',
  not_authenticated: 'Sua sessão expirou. Entre novamente.',
  invalid_image: 'Não consegui ler essa foto. Tente outra.',
}
const GENERIC = 'Não consegui identificar agora. Tente de novo ou preencha à mão.'

function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type })
}

/** Etapas reais da identificação, para a tela mostrar o que está acontecendo. */
export type IdentifyStep = 'prepare' | 'read' | 'photo'

export async function identifyFromPhoto(photo: Blob, onStep?: (step: IdentifyStep) => void): Promise<IdentifyOutcome> {
  let image: string
  onStep?.('prepare')
  try {
    image = await downscaleToBase64(photo)
  } catch {
    throw new Error(MESSAGES.invalid_image)
  }
  onStep?.('read')
  const { data, error } = await supabase.functions.invoke<Wire>('identify-product', { body: { image, mime: 'image/jpeg' } })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = await (error.context as Response).json().catch(() => ({}))
      if (body?.error === 'identify_limit') limitReached('identify')
      throw new Error(MESSAGES[body?.error] ?? GENERIC)
    }
    if (error instanceof FunctionsFetchError) throw new Error('Sem conexão com o servidor. Confira a internet e tente de novo.')
    throw new Error(GENERIC)
  }
  void refreshPlan()
  if (!data || !data.found) return { found: false }
  onStep?.('photo')
  const settled = await Promise.allSettled(
    data.candidates.map(async (c) => {
      const file = await toPackshot(base64ToBlob(c.image, c.mime))
      return { file, preview: URL.createObjectURL(file), source: c.source }
    }),
  )
  const candidates: Candidate[] = settled.flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []))
  // No catálogo: a foto pronta (já padronizada) vem primeiro.
  const catalog = data.catalog ?? null
  if (catalog?.image_path) {
    const file = await catalogPhotoFile(catalog.image_path).catch(() => null)
    if (file) candidates.unshift({ file, preview: URL.createObjectURL(file), source: 'catálogo do app', catalogId: catalog.id })
  }
  return { found: true, brand: data.brand, name: data.name, confidence: data.confidence, catalog, candidates }
}
