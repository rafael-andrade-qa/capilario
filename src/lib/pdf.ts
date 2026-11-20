// Gera o PDF no próprio aparelho (jsPDF, carregado só quando usado). As fotos entram com o
// mesmo enquadramento do app (recorte 3:4). A4 em pé; até 4 fotos por página.
import { coverCrop, type Crop } from './framing'

export interface PdfPhoto {
  label: string
  url: string
  crop?: Crop | null
}

const BRAND: [number, number, number] = [122, 75, 42]
const MUTED: [number, number, number] = [118, 103, 92]
const TEXT: [number, number, number] = [43, 33, 27]
const LINE: [number, number, number] = [231, 221, 212]
const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 16

/** Foto recortada (3:4) como JPEG em data URL, pronta para o PDF. */
async function prepared(p: PdfPhoto): Promise<string | null> {
  try {
    const res = await fetch(p.url)
    if (!res.ok) return null
    const bmp = await createImageBitmap(await res.blob())
    try {
      const c = p.crop ?? coverCrop(bmp.width, bmp.height)
      const canvas = document.createElement('canvas')
      canvas.width = 600
      canvas.height = 800
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, 600, 800)
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(bmp, c.x * bmp.width, c.y * bmp.height, c.w * bmp.width, c.h * bmp.height, 0, 0, 600, 800)
      return canvas.toDataURL('image/jpeg', 0.86)
    } finally {
      bmp.close()
    }
  } catch {
    return null
  }
}

type Doc = import('jspdf').jsPDF

async function newDoc(): Promise<Doc> {
  const { jsPDF } = await import('jspdf')
  return new jsPDF({ unit: 'mm', format: 'a4', compress: true })
}

/** Cabeçalho: marca do app, título (pode quebrar) e subtítulo. Devolve onde o conteúdo começa. */
function header(doc: Doc, title: string, subtitle: string): number {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...BRAND)
  doc.text('PROJETO CAPILAR', MARGIN, MARGIN)
  doc.setFontSize(17)
  doc.setTextColor(...TEXT)
  const lines = doc.splitTextToSize(title, PAGE_W - 2 * MARGIN) as string[]
  doc.text(lines, MARGIN, MARGIN + 9)
  let y = MARGIN + 9 + (lines.length - 1) * 7
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(...MUTED)
  y += 7
  doc.text(subtitle, MARGIN, y)
  return y + 7
}

function photoBox(doc: Doc, img: string | null, x: number, y: number, w: number, label: string) {
  const h = (w * 4) / 3
  if (img) doc.addImage(img, 'JPEG', x, y, w, h, undefined, 'FAST')
  else {
    doc.setFillColor(243, 231, 220)
    doc.rect(x, y, w, h, 'F')
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text('Foto indisponível', x + w / 2, y + h / 2, { align: 'center' })
  }
  doc.setDrawColor(...LINE)
  doc.setLineWidth(0.3)
  doc.rect(x, y, w, h)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...TEXT)
  doc.text(label, x + w / 2, y + h + 5, { align: 'center' })
  return y + h + 9
}

function footers(doc: Doc) {
  const total = doc.getNumberOfPages()
  const d = new Date()
  const today = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...MUTED)
    doc.text(`Gerado pelo Projeto Capilar em ${today}`, MARGIN, PAGE_H - 9)
    if (total > 1) doc.text(`${i}/${total}`, PAGE_W - MARGIN, PAGE_H - 9, { align: 'right' })
  }
}

/** PDF de um momento: título, quando, até 4 fotos em grade 2x2 e a observação. */
export async function momentPdf(opts: { title: string; subtitle: string; photos: PdfPhoto[]; notes?: string | null }): Promise<Blob> {
  const [doc, images] = await Promise.all([newDoc(), Promise.all(opts.photos.map(prepared))])
  let y = header(doc, opts.title, opts.subtitle) + 2
  const w = 80
  const gap = 10
  const x0 = (PAGE_W - (2 * w + gap)) / 2
  let rowBottom = y
  opts.photos.forEach((p, i) => {
    const col = i % 2
    if (col === 0 && i > 0) y = rowBottom + 2
    rowBottom = photoBox(doc, images[i], x0 + col * (w + gap), y, w, p.label)
  })
  y = rowBottom + 2
  const notes = opts.notes?.trim()
  if (notes) {
    const lines = doc.splitTextToSize(notes, PAGE_W - 2 * MARGIN) as string[]
    if (y + 8 + lines.length * 5 > PAGE_H - 16) {
      doc.addPage()
      y = MARGIN
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...TEXT)
    doc.text('Observação', MARGIN, y + 4)
    doc.setFont('helvetica', 'normal')
    doc.text(lines, MARGIN, y + 10)
  }
  footers(doc)
  return doc.output('blob')
}

export interface CompareSide {
  title: string
  subtitle: string
}

/** PDF do comparativo: A à esquerda, B à direita, um ângulo por linha (2 por página). */
export async function comparePdf(opts: {
  title: string
  subtitle: string
  a: CompareSide
  b: CompareSide
  rows: { label: string; a: PdfPhoto; b: PdfPhoto }[]
}): Promise<Blob> {
  const flat = opts.rows.flatMap((r) => [r.a, r.b])
  const [doc, images] = await Promise.all([newDoc(), Promise.all(flat.map(prepared))])
  const w = 72
  const gap = 10
  const xA = (PAGE_W - (2 * w + gap)) / 2
  const xB = xA + w + gap

  const sides = (y: number) => {
    for (const [side, x, letter] of [
      [opts.a, xA, 'A'],
      [opts.b, xB, 'B'],
    ] as const) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(...TEXT)
      const t = (doc.splitTextToSize(`${letter} · ${side.title}`, w) as string[]).slice(0, 2)
      doc.text(t, x, y)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...MUTED)
      doc.text(side.subtitle, x, y + t.length * 4.6 + 0.5)
    }
    return y + 14
  }

  let y = sides(header(doc, opts.title, opts.subtitle) + 3)
  opts.rows.forEach((r, i) => {
    if (i > 0 && i % 2 === 0) {
      doc.addPage()
      y = sides(MARGIN + 4)
    }
    photoBox(doc, images[i * 2], xA, y, w, `${r.label} · A`)
    y = photoBox(doc, images[i * 2 + 1], xB, y, w, `${r.label} · B`) + 2
  })
  footers(doc)
  return doc.output('blob')
}
