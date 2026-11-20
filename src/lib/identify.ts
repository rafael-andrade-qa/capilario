// "Identificar pela foto": manda a foto (reduzida) à função identify-product e prepara as
// fotos oficiais encontradas já padronizadas (fundo branco, retrato 3:4).
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { downscaleToBase64, toPackshot } from './packshot'
import { supabase } from './supabase'

export interface Candidate {
  file: File
  preview: string
  source: string
}

export type IdentifyOutcome =
  | { found: false }
  | { found: true; brand: string; name: string; confidence: 'high' | 'medium' | 'low'; candidates: Candidate[] }

type Wire =
  | { found: false }
  | {
      found: true
      brand: string
      name: string
      confidence: 'high' | 'medium' | 'low'
      candidates: { image: string; mime: string; source: string }[]
    }

const MESSAGES: Record<string, string> = {
  identify_limit: 'Você já usou as 20 identificações de hoje. Amanhã libera de novo; até lá, preencha à mão.',
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

export async function identifyFromPhoto(photo: Blob): Promise<IdentifyOutcome> {
  let image: string
  try {
    image = await downscaleToBase64(photo)
  } catch {
    throw new Error(MESSAGES.invalid_image)
  }
  const { data, error } = await supabase.functions.invoke<Wire>('identify-product', { body: { image, mime: 'image/jpeg' } })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = await (error.context as Response).json().catch(() => ({}))
      throw new Error(MESSAGES[body?.error] ?? GENERIC)
    }
    if (error instanceof FunctionsFetchError) throw new Error('Sem conexão com o servidor. Confira a internet e tente de novo.')
    throw new Error(GENERIC)
  }
  if (!data || !data.found) return { found: false }
  const settled = await Promise.allSettled(
    data.candidates.map(async (c) => {
      const file = await toPackshot(base64ToBlob(c.image, c.mime))
      return { file, preview: URL.createObjectURL(file), source: c.source }
    }),
  )
  const candidates = settled.flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []))
  return { found: true, brand: data.brand, name: data.name, confidence: data.confidence, candidates }
}
