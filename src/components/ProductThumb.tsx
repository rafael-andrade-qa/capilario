// Miniatura do produto: a foto da embalagem; "Sem finalizador" usa o ícone padrão;
// sem foto do produto, a capa de uma etapa (a indicada ou a mais recente).
import { ANGLES, photoByAngle, publishedStages, type Experiment, type Stage } from '../lib/domain'
import { NaturalHairIcon } from './NaturalHairIcon'
import { PhotoView } from './PhotoView'

export function coverPhoto(stage: Stage) {
  for (const a of ANGLES) {
    const p = photoByAngle(stage, a)
    if (p) return p
  }
  return undefined
}

/** Caminho da imagem da miniatura (undefined quando é o ícone de Sem finalizador). */
export function productThumbPath(exp: Experiment, stage?: Stage): string | undefined {
  if (exp.photo_path) return exp.photo_path
  if (exp.product_mode === 'none') return undefined
  const s = stage ?? publishedStages(exp).at(-1)
  return s ? coverPhoto(s)?.storage_path : undefined
}

export function ProductThumb({
  experiment,
  stage,
  urls,
  className = 'product-thumb',
}: {
  experiment: Experiment
  stage?: Stage
  urls: Record<string, string>
  className?: string
}) {
  if (experiment.product_mode === 'none' && !experiment.photo_path) return <NaturalHairIcon className={className} />
  const path = productThumbPath(experiment, stage)
  // Produto sem foto da embalagem e sem nenhuma finalização: um frasco no lugar do quadrado vazio.
  if (!path) return <BottleIcon className={className} />
  return <PhotoView className={className} url={urls[path]} alt="" />
}

function BottleIcon({ className }: { className: string }) {
  return (
    <div className={`photo-frame icon-thumb ${className}`} aria-hidden="true">
      <svg viewBox="0 0 36 48" width="100%" height="100%" focusable="false">
        <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round">
          <path d="M14 5h8v6h-8z" />
          <path d="M13 11h10l2 6v22a3 3 0 0 1-3 3H14a3 3 0 0 1-3-3V17z" />
          <path d="M15 25h6" />
        </g>
      </svg>
    </div>
  )
}
