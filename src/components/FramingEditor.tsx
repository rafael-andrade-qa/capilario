// Ajustar o enquadramento de uma foto: arrastar para mover, pinça (ou + e −) para aproximar.
// "Rosto" enquadra sozinho pelo rosto; "Preencher" volta ao quadro cheio centralizado. A oval
// mostra onde o rosto fica no enquadramento automático, para manter as fotos parecidas.
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type SyntheticEvent, type WheelEvent } from 'react'
import { analyzeUrl } from '../lib/faces'
import { FACE_CENTER_Y, FACE_HEIGHT, FRAME, coverCrop, cropStyle, faceCrop, panCrop, zoomCrop, type Crop } from '../lib/framing'

export function FramingEditor({
  url,
  title,
  initial,
  onCancel,
  onSave,
}: {
  url: string
  title: string
  initial: Crop | null | undefined
  onCancel: () => void
  onSave: (crop: Crop) => Promise<void> | void
}) {
  const [size, setSize] = useState<{ W: number; H: number } | null>(null)
  const [crop, setCrop] = useState<Crop | null>(initial ?? null)
  const [finding, setFinding] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const frame = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number } | null>(null)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  function onLoaded(e: SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget
    const s = { W: img.naturalWidth, H: img.naturalHeight }
    setSize(s)
    setCrop((c) => c ?? coverCrop(s.W, s.H))
  }

  const rect = () => frame.current!.getBoundingClientRect()

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) }
    }
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!size || !crop || !pointers.current.has(e.pointerId)) return
    const prev = pointers.current.get(e.pointerId)!
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const r = rect()
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const at = { x: ((a.x + b.x) / 2 - r.left) / r.width, y: ((a.y + b.y) / 2 - r.top) / r.height }
      if (pinch.current.dist > 0) setCrop(zoomCrop(crop, dist / pinch.current.dist, size.W, size.H, at))
      pinch.current = { dist }
      return
    }
    setCrop(panCrop(crop, (e.clientX - prev.x) / r.width, (e.clientY - prev.y) / r.height, size.W, size.H))
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
  }

  function onWheel(e: WheelEvent<HTMLDivElement>) {
    if (!size || !crop) return
    const r = rect()
    const at = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
    setCrop(zoomCrop(crop, e.deltaY < 0 ? 1.08 : 1 / 1.08, size.W, size.H, at))
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (!size || !crop) return
    const step = 0.04
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }
    const m = moves[e.key]
    if (m) {
      e.preventDefault()
      setCrop(panCrop(crop, m[0], m[1], size.W, size.H))
    } else if (e.key === '+' || e.key === '=') setCrop(zoomCrop(crop, 1.15, size.W, size.H))
    else if (e.key === '-') setCrop(zoomCrop(crop, 1 / 1.15, size.W, size.H))
  }

  async function byFace() {
    if (!size) return
    setFinding(true)
    setNote(null)
    const a = await analyzeUrl(url)
    setFinding(false)
    if (a?.face) setCrop(faceCrop(a.W, a.H, a.face))
    else setNote('Não achei o rosto nesta foto. Ajuste à mão.')
  }

  async function save() {
    if (!crop || saving) return
    setSaving(true)
    try {
      await onSave(crop)
    } finally {
      setSaving(false)
    }
  }

  // Oval-guia: tamanho e posição do rosto no enquadramento automático.
  const guide = { height: `${FACE_HEIGHT * 100}%`, width: `${((FACE_HEIGHT * 0.78) / FRAME) * 100}%`, top: `${(FACE_CENTER_Y - FACE_HEIGHT / 2) * 100}%` }

  return (
    <div className="framing-backdrop" role="dialog" aria-modal="true" aria-label={`Ajustar enquadramento: ${title}`}>
      <div className="framing-sheet">
        <p className="framing-title">Ajustar: {title}</p>
        <div
          ref={frame}
          className="framing-frame"
          tabIndex={0}
          aria-label="Enquadramento. Arraste para mover; pinça ou + e − para aproximar."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
          onKeyDown={onKey}
          data-testid="framing-frame"
        >
          <img src={url} alt="" draggable={false} onLoad={onLoaded} style={crop ? cropStyle(crop) : { opacity: 0 }} />
          <span className="framing-guide" style={guide} aria-hidden="true" />
        </div>
        <p className="muted small framing-help">Arraste para mover e use dois dedos (ou + e −) para aproximar. A oval mostra onde fica o rosto.</p>
        {note && <p className="small framing-note" role="status">{note}</p>}
        <div className="framing-tools">
          <button type="button" className="btn btn-small" onClick={() => size && crop && setCrop(zoomCrop(crop, 1 / 1.15, size.W, size.H))} disabled={!size} aria-label="Afastar">
            −
          </button>
          <button type="button" className="btn btn-small" onClick={() => size && crop && setCrop(zoomCrop(crop, 1.15, size.W, size.H))} disabled={!size} aria-label="Aproximar">
            +
          </button>
          <button type="button" className="btn btn-small" onClick={() => void byFace()} disabled={!size || finding}>
            {finding ? 'Procurando…' : 'Rosto'}
          </button>
          <button type="button" className="btn btn-small" onClick={() => size && setCrop(coverCrop(size.W, size.H))} disabled={!size}>
            Preencher
          </button>
        </div>
        <div className="framing-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={!crop || saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
