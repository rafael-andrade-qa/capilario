// "Analisar finalização com IA": recorta e reduz as fotos no aparelho, manda à função
// analyze-finalization e cuida das sugestões de observação (usar nos momentos ou descartar).
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { signedUrls, updateStage } from './api'
import { mergeNote } from './analysisText'
import { ANGLES, STAGE_TYPES, type Angle, type Finalization, type StageType } from './domain'
import { coverCrop, type Crop } from './framing'
import { supabase } from './supabase'
import { limitReached, refreshPlan } from './plan'

/** Tamanho de cada foto enviada: ~600 tokens. No teste de 24/11 deu a mesma leitura que 768×1024, com um terço a menos de custo. */
export const SEND_W = 576
export const SEND_H = 768

export interface AnalysisScores {
  definition: number
  frizz_control: number
  volume: number
  day2: number | null
}
export interface AnalysisResult {
  product: string
  hair_type: string
  tendency: string
  traits: string[]
  scores: AnalysisScores
  summary: string
  notes: Record<StageType, string>
}
export interface FinalizationAnalysis {
  finalization_id: string
  created_at: string
  model: string
  result: AnalysisResult
  usage: { input_tokens?: number; output_tokens?: number; cost_usd?: number | null }
  notes_state: 'pending' | 'applied' | 'dismissed'
}

export { ANALYSIS_MARK, mergeNote, splitNote } from './analysisText'

/** Momentos da finalização que receberiam observação (têm sugestão). */
export function suggestedMoments(fin: Pick<Finalization, 'moments'>, a: Pick<FinalizationAnalysis, 'result'>): StageType[] {
  return STAGE_TYPES.filter((t) => fin.moments[t] && a.result.notes?.[t]?.trim())
}

/** Análises destas finalizações (para o PDF), por id da finalização. */
export async function fetchAnalyses(finalizationIds: string[]): Promise<Map<string, FinalizationAnalysis>> {
  if (!finalizationIds.length) return new Map()
  const { data, error } = await supabase.from('finalization_analyses').select('*').in('finalization_id', finalizationIds)
  if (error) throw new Error(error.message)
  return new Map(((data ?? []) as FinalizationAnalysis[]).map((a) => [a.finalization_id, a]))
}

export async function fetchAnalysis(finalizationId: string): Promise<FinalizationAnalysis | null> {
  const { data, error } = await supabase.from('finalization_analyses').select('*').eq('finalization_id', finalizationId).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as FinalizationAnalysis | null) ?? null
}

/** Quais destas finalizações já têm análise (para marcar na folha). */
export async function analyzedIds(finalizationIds: string[]): Promise<Set<string>> {
  if (!finalizationIds.length) return new Set()
  const { data, error } = await supabase.from('finalization_analyses').select('finalization_id').in('finalization_id', finalizationIds)
  if (error) throw new Error(error.message)
  return new Set((data ?? []).map((r: { finalization_id: string }) => r.finalization_id))
}

export async function setNotesState(finalizationId: string, state: FinalizationAnalysis['notes_state']): Promise<void> {
  const { error } = await supabase.from('finalization_analyses').update({ notes_state: state }).eq('finalization_id', finalizationId)
  if (error) throw new Error(error.message)
}

/** Fotos da finalização que vão para a análise (momento e ângulo, na ordem do app). */
export function analysisPhotos(fin: Pick<Finalization, 'moments'>): { moment: StageType; angle: Angle; path: string; crop: Crop | null | undefined }[] {
  return STAGE_TYPES.flatMap((t) => {
    const s = fin.moments[t]
    if (!s) return []
    return ANGLES.flatMap((a) => {
      const p = s.photos.find((x) => x.angle === a)
      return p ? [{ moment: t, angle: a, path: p.storage_path, crop: p.crop }] : []
    })
  })
}

/** Foto recortada como o app mostra (3:4), reduzida, em JPEG base64. */
async function croppedBase64(url: string, crop: Crop | null | undefined): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('foto')
  const bmp = await createImageBitmap(await res.blob())
  try {
    const c = crop ?? coverCrop(bmp.width, bmp.height)
    const canvas = document.createElement('canvas')
    canvas.width = SEND_W
    canvas.height = SEND_H
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, SEND_W, SEND_H)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bmp, c.x * bmp.width, c.y * bmp.height, c.w * bmp.width, c.h * bmp.height, 0, 0, SEND_W, SEND_H)
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.82))
    canvas.width = 0
    canvas.height = 0
    if (!blob) throw new Error('foto')
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return btoa(bin)
  } finally {
    bmp.close()
  }
}

const MESSAGES: Record<string, string> = {
  analyze_limit: 'Você já usou a análise do seu plano neste período.',
  analyze_app_limit: 'As análises de hoje acabaram para todo mundo. Amanhã libera de novo.',
  not_configured: 'A análise com IA ainda não foi ligada no servidor.',
  not_authenticated: 'Sua sessão expirou. Entre novamente.',
  not_found: 'Finalização não encontrada.',
  refused: 'A IA não quis analisar essas fotos. Tente de novo mais tarde.',
}
const GENERIC = 'Não consegui analisar agora. Tente de novo em instantes.'

export async function analyzeFinalization(fin: Pick<Finalization, 'id' | 'moments'>): Promise<{ analysis: FinalizationAnalysis; quotaLeft: number | null }> {
  const photos = analysisPhotos(fin)
  if (!photos.length) throw new Error('Essa finalização ainda não tem fotos.')
  const urls = await signedUrls(photos.map((p) => p.path))
  let images: { moment: StageType; angle: Angle; data: string }[]
  try {
    images = await Promise.all(
      photos.map(async (p) => {
        const url = urls[p.path]
        if (!url) throw new Error('foto')
        return { moment: p.moment, angle: p.angle, data: await croppedBase64(url, p.crop) }
      }),
    )
  } catch {
    throw new Error('Não consegui preparar as fotos. Confira a internet e tente de novo.')
  }
  const { data, error } = await supabase.functions.invoke<{ analysis: FinalizationAnalysis; quota_left: number }>('analyze-finalization', {
    body: { finalization_id: fin.id, images },
  })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = await (error.context as Response).json().catch(() => ({}))
      if (body?.error === 'analyze_limit') limitReached('analyses')
      throw new Error(MESSAGES[body?.error] ?? GENERIC)
    }
    if (error instanceof FunctionsFetchError) throw new Error('Sem conexão com o servidor. Confira a internet e tente de novo.')
    throw new Error(GENERIC)
  }
  if (!data?.analysis) throw new Error(GENERIC)
  void refreshPlan()
  return { analysis: data.analysis, quotaLeft: typeof data.quota_left === 'number' ? data.quota_left : null }
}

/** Grava as sugestões nas observações dos momentos e marca a análise como usada. */
export async function applySuggestions(
  fin: Pick<Finalization, 'id' | 'moments'>,
  a: FinalizationAnalysis,
): Promise<{ stageId: string; notes: string | null }[]> {
  const changed: { stageId: string; notes: string | null }[] = []
  for (const t of suggestedMoments(fin, a)) {
    const s = fin.moments[t]!
    const notes = mergeNote(s.notes, a.result.notes[t])
    if (notes !== (s.notes ?? null)) {
      await updateStage(s.id, { notes })
      changed.push({ stageId: s.id, notes })
    }
  }
  await setNotesState(fin.id, 'applied')
  return changed
}
