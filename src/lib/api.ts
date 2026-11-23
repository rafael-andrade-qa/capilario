// Acesso a dados. Toda chamada usa a sessão do usuário; o RLS do banco é a proteção real.
import { BUCKET, supabase } from './supabase'
import type { Angle, Experiment, ProductMode, StageType } from './domain'
import type { Crop } from './framing'
import { EXT_BY_MIME, type AcceptedMime } from './files'
import { uploadPhoto } from './upload'
import { prepareImage, thumbPath } from './images'
import { uuid } from './uuid'

const HISTORY_SELECT =
  'id, product_mode, product_name, brand, photo_path, created_at, stages(id, experiment_id, finalization_id, stage_type, captured_at, notes, is_favorite, created_at, photos(id, stage_id, angle, storage_path, mime_type, created_at, crop))'

export async function fetchHistory(): Promise<Experiment[]> {
  const { data, error } = await supabase.from('experiments').select(HISTORY_SELECT).order('created_at', { ascending: false })
  if (error) throw new Error(`Não foi possível carregar o histórico: ${error.message}`)
  return (data ?? []) as unknown as Experiment[]
}

export async function updateStage(stageId: string, patch: { notes?: string | null; is_favorite?: boolean; captured_at?: string }): Promise<void> {
  const { data, error } = await supabase.from('stages').update(patch).eq('id', stageId).select('id')
  if (error) throw new Error(`Não foi possível salvar: ${error.message}`)
  if (!data?.length) throw new Error('Momento não encontrado.')
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
  /** finalization_id: uma nova (começar finalização) ou a existente (registrar o próximo momento). */
  newStage?: { stage_type: StageType; captured_at: string; notes: string | null; finalization_id: string } | null
}

export interface FinalizeResult {
  experiment_id: string
  stage_id: string
  photos: { id: string; angle: Angle; storage_path: string }[]
}

/** Erro que pode ter acontecido depois de o servidor gravar (resposta perdida). */
export class AmbiguousError extends Error {}

const FRIENDLY: Record<string, string> = {
  angle_taken: 'Esse ângulo já tem uma foto publicada neste momento.',
  moment_taken: 'Essa finalização já tem esse momento registrado.',
  finalization_not_found: 'Finalização não encontrada.',
  object_missing: 'Uma das imagens não chegou ao armazenamento. Tente enviar de novo.',
  photos_required: 'Escolha ao menos uma foto.',
  experiment_not_found: 'Produto não encontrado.',
  stage_not_found: 'Momento não encontrado.',
  not_authenticated: 'Sua sessão expirou. Entre novamente.',
  product_exists: 'Já existe um produto com esse nome e essa marca no seu histórico.',
  product_name_required: 'Informe o nome do produto.',
  product_not_editable: 'Este produto não tem nome para editar.',
  last_photo: 'Esta é a única foto do momento. Para apagar tudo, exclua o momento.',
  photo_not_found: 'Foto não encontrada.',
  invalid_angle: 'Ângulo inválido.',
  invalid_storage_path: 'Não foi possível salvar a foto. Tente de novo.',
  photo_limit: 'Você chegou ao limite de 1.000 fotos. Apague fotos antigas para guardar novas.',
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
  const { data: result, error } = await supabase.rpc('delete_stage', { p_stage_id: stageId })
  if (error) {
    if (error.code) throw new Error(FRIENDLY[error.message] ?? `Não foi possível excluir: ${error.message}`)
    const { data, error: checkErr } = await supabase.from('stages').select('id').eq('id', stageId)
    if (checkErr || data?.length) throw new Error('Não foi possível excluir. Verifique a conexão e tente de novo.')
  }
  // O servidor devolve também a foto do produto quando o produto inteiro saiu.
  paths = [...new Set([...paths, ...(((result as { paths?: string[] } | null)?.paths) ?? [])])]
  // Arquivo que sobrar aqui (rede caiu) vira órfão e sai com scripts/clean-orphans.mjs.
  await removeFiles(paths)
}

/** Exclui uma finalização inteira (momentos, fotos e análise); o produto fica. Depois, os arquivos. */
export async function deleteFinalization(finalizationId: string, paths: string[]): Promise<void> {
  const { data: result, error } = await supabase.rpc('delete_finalization', { p_finalization_id: finalizationId })
  if (error) {
    if (error.code) throw new Error(`Não foi possível excluir: ${error.message}`)
    const { data, error: checkErr } = await supabase.from('stages').select('id').eq('finalization_id', finalizationId)
    if (checkErr || data?.length) throw new Error('Não foi possível excluir. Verifique a conexão e tente de novo.')
  }
  paths = [...new Set([...paths, ...(((result as { paths?: string[] } | null)?.paths) ?? [])])]
  await removeFiles(paths)
}

/** Exclui o produto inteiro (todas as etapas e fotos) e depois os arquivos. */
export async function deleteExperiment(experimentId: string, paths: string[]): Promise<void> {
  const { data: result, error } = await supabase.rpc('delete_experiment', { p_experiment_id: experimentId })
  if (error) {
    if (error.code) throw new Error(`Não foi possível excluir: ${error.message}`)
    const { data, error: checkErr } = await supabase.from('experiments').select('id').eq('id', experimentId)
    if (checkErr || data?.length) throw new Error('Não foi possível excluir. Verifique a conexão e tente de novo.')
  }
  paths = [...new Set([...paths, ...(((result as { paths?: string[] } | null)?.paths) ?? [])])]
  await removeFiles(paths)
}

/**
 * Envia a foto do produto e a liga ao experimento. A foto anterior (se houver) é apagada
 * depois que deixa de estar em uso. Devolve o novo caminho.
 */
export async function setProductPhoto(userId: string, experimentId: string, file: Blob, mime: string): Promise<string> {
  if (!EXT_BY_MIME[mime as AcceptedMime]) throw new Error('Formato não aceito. Use JPEG, PNG ou WebP.')
  const ready = await prepareImage(file, mime)
  const path = `${userId}/produto-${experimentId}/${uuid()}.${EXT_BY_MIME[ready.mime as AcceptedMime]}`
  await uploadPhoto({ path, file: ready.file, contentType: ready.mime })
  await uploadThumb(path, ready.thumb)
  const { data, error } = await supabase.rpc('set_experiment_photo', { p_experiment_id: experimentId, p_path: path })
  if (error) {
    await removeFiles([path])
    throw new Error(FRIENDLY[error.message] ?? `Não foi possível salvar a foto do produto: ${error.message}`)
  }
  const old = (data as { old_path?: string | null } | null)?.old_path
  if (old) await removeFiles([old])
  return path
}

/** Guarda o enquadramento (recorte 3:4) de fotos já salvas. */
export async function setPhotoCrops(crops: { photoId: string; crop: Crop | null }[]): Promise<void> {
  for (const { photoId, crop } of crops) {
    const { data, error } = await supabase.from('photos').update({ crop }).eq('id', photoId).select('id')
    if (error) throw new Error(`Não foi possível salvar o enquadramento: ${error.message}`)
    if (!data?.length) throw new Error('Foto não encontrada.')
  }
}

/** Cadastra um produto (nome e marca), sem fotos. Repetir com o mesmo id não duplica. */
export async function createProduct(experimentId: string, name: string, brand: string, catalogId?: string | null): Promise<void> {
  const { error } = await supabase.rpc('create_product', {
    p_experiment_id: experimentId,
    p_name: name,
    p_brand: brand,
    p_catalog_id: catalogId ?? null,
  })
  if (error) throw new Error(FRIENDLY[error.message] ?? `Não foi possível cadastrar o produto: ${error.message}`)
}

/** Corrige nome e marca do produto (vale para todas as finalizações dele). */
export async function updateExperiment(experimentId: string, name: string, brand: string): Promise<void> {
  const { error } = await supabase.rpc('update_experiment', { p_experiment_id: experimentId, p_name: name, p_brand: brand })
  if (error) throw new Error(FRIENDLY[error.message] ?? `Não foi possível salvar o produto: ${error.message}`)
}

/** Remove a foto da embalagem do produto e apaga o arquivo. */
export async function removeProductPhoto(experimentId: string): Promise<void> {
  const { data, error } = await supabase.rpc('set_experiment_photo', { p_experiment_id: experimentId, p_path: null })
  if (error) throw new Error(FRIENDLY[error.message] ?? `Não foi possível remover a foto: ${error.message}`)
  const old = (data as { old_path?: string | null } | null)?.old_path
  if (old) await removeFiles([old])
}

/**
 * Troca a foto de um ângulo do momento (ou põe num ângulo vazio): envia o arquivo novo,
 * liga no banco numa transação e só então apaga o arquivo antigo.
 */
export async function replacePhoto(userId: string, stageId: string, angle: Angle, file: Blob, mime: string, onProgress?: (f: number) => void): Promise<void> {
  if (!EXT_BY_MIME[mime as AcceptedMime]) throw new Error('Formato não aceito. Use JPEG, PNG ou WebP.')
  const ready = await prepareImage(file, mime)
  const id = uuid()
  const path = `${userId}/${stageId}/${id}.${EXT_BY_MIME[ready.mime as AcceptedMime]}`
  await uploadPhoto({ path, file: ready.file, contentType: ready.mime, onProgress })
  await uploadThumb(path, ready.thumb)
  const { data, error } = await supabase.rpc('replace_photo', {
    p_stage_id: stageId,
    p_angle: angle,
    p_photo: { id, storage_path: path, mime_type: ready.mime, size_bytes: ready.file.size },
  })
  if (error) {
    await removeFiles([path])
    throw new Error(FRIENDLY[error.message] ?? `Não foi possível trocar a foto: ${error.message}`)
  }
  const old = (data as { old_path?: string | null } | null)?.old_path
  if (old) await removeFiles([old])
}

/** Leva a foto para outro ângulo; se ele tiver foto, as duas trocam de lugar. */
export async function movePhoto(photoId: string, angle: Angle): Promise<{ swappedWith: string | null }> {
  const { data, error } = await supabase.rpc('move_photo', { p_photo_id: photoId, p_angle: angle })
  if (error) throw new Error(FRIENDLY[error.message] ?? `Não foi possível trocar o ângulo: ${error.message}`)
  return { swappedWith: (data as { swapped_with?: string | null } | null)?.swapped_with ?? null }
}

/** Remove uma foto do momento (a última não sai) e apaga o arquivo. */
export async function deletePhoto(photoId: string): Promise<void> {
  const { data, error } = await supabase.rpc('delete_photo', { p_photo_id: photoId })
  if (error) throw new Error(FRIENDLY[error.message] ?? `Não foi possível remover a foto: ${error.message}`)
  const path = (data as { path?: string | null } | null)?.path
  if (path) await removeFiles([path])
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
  const paths = items.filter((i) => !linked.has(i.photoId)).flatMap((i) => [i.path, thumbPath(i.path)])
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
}

// ---------------------------------------------------------------------------
// Arquivos: miniaturas e remoção
// ---------------------------------------------------------------------------

/** Envia a miniatura ao lado da foto. Se falhar, segue: a lista mostra a foto no lugar. */
export async function uploadThumb(path: string, thumb: Blob | null): Promise<void> {
  if (!thumb) return
  await uploadPhoto({ path: thumbPath(path), file: thumb, contentType: 'image/jpeg' }).catch(() => undefined)
}

/** Apaga fotos do armazenamento, com as miniaturas, e esquece os endereços delas. */
async function removeFiles(paths: string[]): Promise<void> {
  const all = [...new Set(paths.flatMap((p) => [p, thumbPath(p)]))]
  if (!all.length) return
  forgetSignedUrls(all)
  await supabase.storage.from(BUCKET).remove(all).catch(() => undefined)
}

// ---------------------------------------------------------------------------
// URLs assinadas (endereços temporários das fotos privadas)
//
// Cada endereço vale 1 hora e fica guardado no aparelho (apagado ao sair da conta). Assim, ao
// reabrir o app, as fotos usam o MESMO endereço e o navegador mostra a cópia que já baixou, em vez
// de baixar tudo de novo. Um endereço só é reaproveitado se ainda tiver 10 minutos de validade,
// para a foto na tela nunca ficar com endereço vencido.
// Também guarda quais arquivos não existem (miniatura que não foi gerada), para a lista usar a foto.
// ---------------------------------------------------------------------------
export const SIGNED_TTL = 3600 // segundos
const REUSE_MARGIN = 10 * 60 * 1000
const URLS_KEY = 'capilar:fotos:v1'

interface SignedEntry {
  /** null = o arquivo não existe. */
  url: string | null
  expiresAt: number
}
let signedCache: Map<string, SignedEntry> | null = null
const inFlight = new Map<string, Promise<void>>()

function cache(): Map<string, SignedEntry> {
  if (signedCache) return signedCache
  signedCache = new Map()
  try {
    const saved = JSON.parse(localStorage.getItem(URLS_KEY) ?? 'null') as Record<string, SignedEntry> | null
    const now = Date.now()
    for (const [p, e] of Object.entries(saved ?? {})) if (e && e.expiresAt - now > REUSE_MARGIN) signedCache.set(p, e)
  } catch {
    // sem armazenamento: só em memória
  }
  return signedCache
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
function persist() {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    try {
      const now = Date.now()
      const out: Record<string, SignedEntry> = {}
      for (const [p, e] of cache()) if (e.expiresAt > now) out[p] = e
      if (Object.keys(out).length) localStorage.setItem(URLS_KEY, JSON.stringify(out))
      else localStorage.removeItem(URLS_KEY)
    } catch {
      // sem espaço ou bloqueado: segue só em memória
    }
  }, 200)
}

function fresh(e: SignedEntry | undefined, now: number): e is SignedEntry {
  return !!e && e.expiresAt - now > REUSE_MARGIN
}

/** Endereços já guardados e ainda bons (sem ir ao servidor), para a tela abrir com as fotos. */
export function cachedSignedUrls(paths: string[]): Record<string, string> {
  const now = Date.now()
  const out: Record<string, string> = {}
  for (const p of paths) {
    const e = cache().get(p)
    if (fresh(e, now) && e.url) out[p] = e.url
  }
  return out
}

/** O servidor já disse que este arquivo não existe? */
export function isMissingFile(path: string): boolean {
  const e = cache().get(path)
  return fresh(e, Date.now()) && e.url === null
}

export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  const now = Date.now()
  const missing: string[] = []
  const waiting: Promise<void>[] = []
  for (const p of new Set(paths)) {
    if (fresh(cache().get(p), now)) continue
    const pending = inFlight.get(p)
    if (pending) waiting.push(pending)
    else missing.push(p)
  }
  if (missing.length) {
    const job = (async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(missing, SIGNED_TTL)
      if (error) throw new Error(`Não foi possível carregar as fotos: ${error.message}`)
      const at = Date.now()
      for (const item of data ?? []) {
        if (!item.path) continue
        // Sem endereço = o arquivo não existe (ou não é seu): lembrado só por alguns minutos.
        cache().set(item.path, item.signedUrl ? { url: item.signedUrl, expiresAt: at + SIGNED_TTL * 1000 } : { url: null, expiresAt: at + REUSE_MARGIN + 5 * 60 * 1000 })
      }
      persist()
    })()
    for (const p of missing) inFlight.set(p, job)
    waiting.push(job)
    job
      .finally(() => {
        for (const p of missing) if (inFlight.get(p) === job) inFlight.delete(p)
      })
      .catch(() => undefined)
  }
  await Promise.all(waiting)
  return cachedSignedUrls(paths)
}

function forgetSignedUrls(paths: string[]) {
  for (const p of paths) cache().delete(p)
  persist()
}

/** Ao sair da conta: nenhum endereço fica no aparelho. */
export function clearSignedUrlCache(): void {
  cache().clear()
  inFlight.clear()
  try {
    localStorage.removeItem(URLS_KEY)
  } catch {
    // ignora
  }
}
