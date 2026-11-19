import { useState } from 'react'

/** Foto privada exibida por URL assinada, preservando proporção e enquadramento. */
export function PhotoView({ url, alt, className = '' }: { url: string | undefined; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (!url) return <div className={`photo-frame ${className} loading`} aria-label={`${alt} (carregando)`} />
  if (failed) return <div className={`photo-frame ${className} empty`}>Não foi possível carregar</div>
  return (
    <div className={`photo-frame ${className}`}>
      <img src={url} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />
    </div>
  )
}
