// Validação dos arquivos escolhidos na galeria, antes de qualquer envio.

export const MAX_PHOTOS = 4
/** Limite por foto: igual ao file_size_limit do bucket (15 MiB). */
export const MAX_BYTES = 15 * 1024 * 1024
/** Acima disso usamos upload retomável (TUS); o Supabase recomenda o upload comum até 6 MB. */
export const RESUMABLE_THRESHOLD = 6 * 1024 * 1024

export const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const
export type AcceptedMime = (typeof ACCEPTED_MIME)[number]

/** `accept` do input. Listar só JPEG/PNG/WebP faz o iPhone converter HEIC para JPEG na seleção. */
export const INPUT_ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp'

export const EXT_BY_MIME: Record<AcceptedMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/** Alguns navegadores entregam type vazio; deduz pela extensão. */
export function detectMime(file: { name: string; type: string }): string {
  if (file.type) return file.type.toLowerCase()
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'heic' || ext === 'heif') return 'image/heic'
  return ''
}

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
  return `${Math.max(1, Math.round(n / 1024))} KB`
}

/** Erro de validação legível (pt-BR) ou null quando o arquivo é aceito. */
export function validateFile(file: { name: string; type: string; size: number }): string | null {
  const mime = detectMime(file)
  if (mime === 'image/heic' || mime === 'image/heif') {
    return 'Formato HEIC não é exibido pelo app. Troque por uma versão JPEG (no iPhone: Ajustes > Câmera > Formatos > Mais compatível).'
  }
  if (!(ACCEPTED_MIME as readonly string[]).includes(mime)) {
    return `Formato não aceito${mime ? ` (${mime})` : ''}. Use JPEG, PNG ou WebP.`
  }
  if (file.size <= 0) return 'Arquivo vazio.'
  if (file.size > MAX_BYTES) return `Arquivo grande demais (${formatBytes(file.size)}). O limite é ${formatBytes(MAX_BYTES)} por foto.`
  return null
}

/** Confere se o navegador consegue de fato decodificar a imagem. */
export async function canDisplay(file: Blob): Promise<boolean> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return img.naturalWidth > 0
  } catch {
    return false
  } finally {
    URL.revokeObjectURL(url)
  }
}
