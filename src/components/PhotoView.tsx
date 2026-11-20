import { useState } from 'react'
import { cropStyle, type Crop } from '../lib/framing'

/**
 * Foto privada exibida por URL assinada num quadro 3:4.
 *  - com enquadramento (crop): mostra exatamente o recorte salvo;
 *  - sem enquadramento: preenche o quadro (sem faixas), centralizado;
 *  - fit="contain": a foto inteira (usado onde a imagem não é de cabelo).
 */
export function PhotoView({
  url,
  alt,
  className = '',
  crop,
  fit = 'cover',
}: {
  url: string | undefined
  alt: string
  className?: string
  crop?: Crop | null
  fit?: 'cover' | 'contain'
}) {
  const [failed, setFailed] = useState(false)
  if (!url) return <div className={`photo-frame ${className} loading`} aria-label={`${alt} (carregando)`} />
  if (failed) return <div className={`photo-frame ${className} empty`}>Não foi possível carregar</div>
  return (
    <div className={`photo-frame ${className}${crop ? ' cropped' : ` fit-${fit}`}`}>
      <img src={url} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} style={crop ? cropStyle(crop) : undefined} />
    </div>
  )
}
