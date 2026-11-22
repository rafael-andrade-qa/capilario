// Upload direto do navegador para o Storage privado, usando a sessão autenticada.
// Até 6 MB: upload comum. Acima: upload retomável (TUS), em blocos de 6 MB. A biblioteca do TUS
// só é baixada quando precisa (com as fotos reduzidas no aparelho, quase nunca).
import type { DetailedError } from 'tus-js-client'
import { BUCKET, SUPABASE_KEY, SUPABASE_URL, supabase } from './supabase'
import { RESUMABLE_THRESHOLD } from './files'

export interface UploadOptions {
  path: string
  file: Blob
  contentType: string
  onProgress?: (fraction: number) => void
}

async function objectExists(path: string): Promise<boolean> {
  const { data, error } = await supabase.storage.from(BUCKET).exists(path)
  return !error && data === true
}

function isDuplicate(err: { message?: string; statusCode?: string; status?: number } | null | undefined): boolean {
  if (!err) return false
  return err.statusCode === '409' || err.status === 409 || /already exists|duplicate/i.test(err.message ?? '')
}

/**
 * Envia um arquivo. Idempotente para o mesmo caminho: se o objeto já existe
 * (tentativa anterior cuja resposta se perdeu), confirma no servidor e segue.
 */
export async function uploadPhoto(opts: UploadOptions): Promise<void> {
  if (opts.file.size > RESUMABLE_THRESHOLD) return uploadResumable(opts)

  opts.onProgress?.(0)
  const { error } = await supabase.storage.from(BUCKET).upload(opts.path, opts.file, {
    contentType: opts.contentType,
    upsert: false,
    cacheControl: '3600',
  })
  if (error) {
    if (isDuplicate(error as never) && (await objectExists(opts.path))) {
      opts.onProgress?.(1)
      return
    }
    // Resposta pode ter se perdido depois de gravar.
    if (await objectExists(opts.path).catch(() => false)) {
      opts.onProgress?.(1)
      return
    }
    throw new Error(error.message || 'Falha no envio')
  }
  opts.onProgress?.(1)
}

async function uploadResumable(opts: UploadOptions): Promise<void> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sessão expirada. Entre novamente.')
  const tus = await import('tus-js-client')

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(opts.file, {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 1000, 3000, 5000],
      headers: {
        authorization: `Bearer ${token}`,
        apikey: SUPABASE_KEY,
        'x-upsert': 'false',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: BUCKET,
        objectName: opts.path,
        contentType: opts.contentType,
        cacheControl: '3600',
      },
      chunkSize: 6 * 1024 * 1024, // exigido pelo Supabase
      onProgress: (sent, total) => opts.onProgress?.(total ? sent / total : 0),
      onSuccess: () => resolve(),
      onError: async (err) => {
        const status = (err as DetailedError).originalResponse?.getStatus?.()
        if ((status === 409 || /already exists/i.test(err.message)) && (await objectExists(opts.path))) {
          resolve()
          return
        }
        reject(new Error(err.message || 'Falha no envio'))
      },
    })
    upload
      .findPreviousUploads()
      .then((previous) => {
        if (previous.length) upload.resumeFromPreviousUpload(previous[0])
        upload.start()
      })
      .catch(reject)
  })
  opts.onProgress?.(1)
}
