// Acesso a dados. Toda chamada usa a sessão do usuário; o RLS do banco é a proteção real.
import { BUCKET, supabase } from './supabase'
import type { Angle, Experiment, ProductMode, StageType } from './domain'

const HISTORY_SELECT =
  'id, product_mode, product_name, brand, created_at, stages(id, experiment_id, stage_type, captured_at, notes, is_favorite, created_at, photos(id, stage_id, angle, storage_path, mime_type, created_at))'

export async function fetchHistory(): Promise<Experiment[]> {
  const { data, error } = await supabase.from('experiments').select(HISTORY_SELECT).order('created_at', { ascending: false })
  if (error) throw new Error(`Não foi possível carregar o histórico: ${error.message}`)
  return (data ?? []) as unknown as Experiment[]
}

export async function updateStage(stageId: string, patch: { notes?: string | null; is_favorite?: boolean }): Promise<void> {
  const { data, error } = await supabase.from('stages').update(patch).eq('id', stageId).select('id')
  if (error) throw new Error(`Não foi possível salvar: ${error.message}`)
  if (!data?.length) throw new Error('Etapa não encontrada.')
}

export interface FinalizePhoto {
  id: string
  angle: Angle
  storage_path: string
  mime_type: string
  size_bytes: number
}

export interface FinalizeArgs {
  experimentId: string
  stageId: string
  photos: FinalizePhoto[]
  newExperiment?: { product_mode: ProductMode; product_name: string | null; brand: string | null } | null
  newStage?: { stage_type: StageType; captured_at: string; notes: string | null } | null
}

export interface FinalizeResult {
  experiment_id: string
  stage_id: string
  photos: { id: string; angle: Angle; storage_path: string }[]
}

/** Erro que pode ter acontecido depois de o servidor gravar (resposta perdida). */
export class AmbiguousError extends Error {}

const FRIENDLY: Record<string, string> = {
  angle_taken: 'Esse ângulo já tem uma foto publicada nesta etapa.',
  object_missing: 'Uma das imagens não chegou ao armazenamento. Tente enviar de novo.',
  photos_required: 'Escolha ao menos uma foto.',
  experiment_not_found: 'Experimento não encontrado.',
  stage_not_found: 'Etapa não encontrada.',
  not_authenticated: 'Sua sessão expirou. Entre novamente.',
}

export async function finalizeStage(args: FinalizeArgs): Promise<FinalizeResult> {
  const { data, error } = await supabase.rpc('finalize_stage', {
    p_experiment_id: args.experimentId,
    p_stage_id: args.stageId,
    p_photos: args.photos,
    p_new_experiment: args.newExperiment ?? null,
    p_new_stage: args.newStage ?? null,
  })
  if (error) {
    // Sem código do Postgres = falha de rede: o servidor pode ter gravado.
    if (!error.code) throw new AmbiguousError(error.message || 'Falha de conexão')
    throw new Error(FRIENDLY[error.message] ?? `Não foi possível salvar: ${error.message}`)
  }
  return data as FinalizeResult
}

/**
 * Exclui uma etapa (e o experimento, se era a última). Depois remove os arquivos:
 * a política do Storage só libera objetos que já não estão ligados a uma foto.
 * Se a resposta se perde, confere no banco se a etapa sumiu antes de declarar falha.
 */
export async function deleteStage(stageId: string, paths: string[]): Promise<void> {
  const { error } = await supabase.rpc('delete_stage', { p_stage_id: stageId })
  if (error) {
    if (error.code) throw new Error(FRIENDLY[error.message] ?? `Não foi possível excluir: ${error.message}`)
    const { data, error: checkErr } = await supabase.from('stages').select('id').eq('id', stageId)
    if (checkErr || data?.length) throw new Error('Não foi possível excluir. Verifique a conexão e tente de novo.')
  }
  for (const p of paths) signedCache.delete(p)
  // Arquivo que sobrar aqui (rede caiu) vira órfão e sai com scripts/clean-orphans.mjs.
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths).catch(() => undefined)
}

/** Quais destas fotos já estão registradas no banco (para respostas perdidas e limpeza). */
export async function linkedPhotoIds(photoIds: string[]): Promise<Set<string>> {
  if (!photoIds.length) return new Set()
  const { data, error } = await supabase.from('photos').select('id').in('id', photoIds)
  if (error) throw error
  return new Set((data ?? []).map((r) => r.id as string))
}

/**
 * Remove arquivos de tentativas descartadas, só depois de confirmar no banco que
 * não foram associados a uma foto salva. (A política do Storage também impede.)
 */
export async function removeUnlinkedObjects(items: { photoId: string; path: string }[]): Promise<void> {
  if (!items.length) return
  let linked: Set<string>
  try {
    linked = await linkedPhotoIds(items.map((i) => i.photoId))
  } catch {
    return // sem confirmação do banco, não apaga nada
  }
  const paths = items.filter((i) => !linked.has(i.photoId)).map((i) => i.path)
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
}

// ---------------------------------------------------------------------------
// URLs assinadas de curta duração, em memória (limpas ao sair).
// ---------------------------------------------------------------------------
const SIGNED_TTL = 600 // segundos
const signedCache = new Map<string, { url: string; expiresAt: number }>()

export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  const now = Date.now()
  const out: Record<string, string> = {}
  const missing: string[] = []
  for (const p of new Set(paths)) {
    const hit = signedCache.get(p)
    if (hit && hit.expiresAt - now > 60_000) out[p] = hit.url
    else missing.push(p)
  }
  if (missing.length) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(missing, SIGNED_TTL)
    if (error) throw new Error(`Não foi possível carregar as fotos: ${error.message}`)
    for (const item of data ?? []) {
      if (item.signedUrl && item.path) {
        signedCache.set(item.path, { url: item.signedUrl, expiresAt: now + SIGNED_TTL * 1000 })
        out[item.path] = item.signedUrl
      }
    }
  }
  return out
}

export function clearSignedUrlCache(): void {
  signedCache.clear()
}
