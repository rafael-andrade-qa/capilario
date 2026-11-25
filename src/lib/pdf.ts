// Gera o PDF no próprio aparelho (jsPDF, carregado só quando usado). As fotos entram com o
// mesmo enquadramento do app (recorte 3:4). A4 em pé.
//
// Capa: o topo da primeira página é um banner com a identidade do app (é o que aparece na
// prévia do WhatsApp): marca, produto em destaque, uma etiqueta com data e momentos, a foto da
// embalagem à direita (para saber qual é o produto) e o endereço do app (também no rodapé). As fotos do rosto ficam
// na análise, logo abaixo. O conteúdo vem logo abaixo, dimensionado para caber.
import { coverCrop, type Crop } from './framing'

export interface PdfPhoto {
  label: string
  url: string
  crop?: Crop | null
}

/** Capa (banner) do PDF. */
export interface Banner {
  /** Linha pequena acima do título: "EVOLUÇÃO DA FINALIZAÇÃO". */
  kicker: string
  /** Título grande (o produto). */
  title: string
  brand?: string | null
  /** Etiqueta: "20/11 · Molhado → Seco → Dia seguinte". */
  pill: string
  /** Embalagens à direita (até 3; no comparativo, A e B). Sem foto: cartão com `placeholder`. */
  heroes: { label: string; photo: PdfPhoto | null; placeholder?: string }[]
}

type RGB = [number, number, number]
const BRAND: RGB = [122, 75, 42]
const TAN: RGB = [212, 154, 106]
const INK: RGB = [33, 25, 20]
const LIGHT: RGB = [214, 200, 188]
const MUTED: RGB = [118, 103, 92]
const TEXT: RGB = [43, 33, 27]
const LINE: RGB = [231, 221, 212]
const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 16
const BANNER_H = 70
/** Onde o conteúdo começa na primeira página (logo abaixo da capa). */
const CONTENT_Y = BANNER_H + 9
const BOTTOM = PAGE_H - 16

/** A fonte padrão do PDF não tem a seta →: troca por um sinal que ela tem. */
export const pdfSafe = (s: string) => s.replace(/\s*→\s*/g, ' › ')

/** Foto recortada (3:4) como JPEG em data URL; com cantos arredondados para a capa. */
async function prepared(p: PdfPhoto, o: { w?: number; radius?: number; bg?: string; card?: string } = {}): Promise<string | null> {
  const W = o.w ?? 600
  const H = (W * 4) / 3
  try {
    const res = await fetch(p.url)
    if (!res.ok) return null
    const bmp = await createImageBitmap(await res.blob())
    try {
      const c = p.crop ?? coverCrop(bmp.width, bmp.height)
      const canvas = document.createElement('canvas')
      canvas.width = W
      canvas.height = H
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = o.bg ?? '#ffffff'
      ctx.fillRect(0, 0, W, H)
      if (o.radius) {
        ctx.beginPath()
        ctx.roundRect(0, 0, W, H, o.radius)
        ctx.clip()
      }
      if (o.card) {
        ctx.fillStyle = o.card
        ctx.fillRect(0, 0, W, H)
      }
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(bmp, c.x * bmp.width, c.y * bmp.height, c.w * bmp.width, c.h * bmp.height, 0, 0, W, H)
      return canvas.toDataURL('image/jpeg', 0.86)
    } finally {
      bmp.close()
    }
  } catch {
    return null
  }
}

/** Ícone do app (as ondas) para a capa. */
async function appIcon(): Promise<string | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}icons/icon-192.png`)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise((resolve) => {
      const r = new FileReader()
      r.onload = () => resolve(typeof r.result === 'string' ? r.result : null)
      r.onerror = () => resolve(null)
      r.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

type JsPdf = typeof import('jspdf')
type Doc = import('jspdf').jsPDF

async function newDoc(): Promise<{ doc: Doc; lib: JsPdf }> {
  const lib = await import('jspdf')
  return { doc: new lib.jsPDF({ unit: 'mm', format: 'a4', compress: true }), lib }
}

const INK_HEX = '#211914'

/** Tudo o que a capa precisa, carregado em paralelo com as fotos do conteúdo. */
async function bannerAssets(b: Banner) {
  const [icon, heroes] = await Promise.all([
    appIcon(),
    Promise.all(b.heroes.slice(0, 3).map((h) => (h.photo ? prepared(h.photo, { w: 300, radius: 26, bg: INK_HEX, card: '#ffffff' }) : Promise.resolve(null)))),
  ])
  return { icon, heroes }
}

function drawBanner(doc: Doc, lib: JsPdf, b: Banner, a: { icon: string | null; heroes: (string | null)[] }) {
  doc.setFillColor(...INK)
  doc.rect(0, 0, PAGE_W, BANNER_H, 'F')
  // Círculos de fundo, discretos, nas cores da marca (presos dentro do banner).
  doc.saveGraphicsState()
  doc.rect(0, 0, PAGE_W, BANNER_H, null)
  doc.clip()
  doc.discardPath()
  doc.setGState(new lib.GState({ opacity: 0.45 }))
  doc.setFillColor(...BRAND)
  doc.circle(PAGE_W - 22, -4, 50, 'F')
  doc.setGState(new lib.GState({ opacity: 0.16 }))
  doc.setFillColor(...TAN)
  doc.circle(PAGE_W - 92, BANNER_H + 10, 30, 'F')
  doc.restoreGraphicsState()

  // Marca
  if (a.icon) doc.addImage(a.icon, 'PNG', MARGIN, 9, 9, 9)
  const bx = a.icon ? MARGIN + 12 : MARGIN
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...TAN)
  doc.text('CAPILÁRIO', bx, 13)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...LIGHT)
  doc.text('Diário do cabelo · finalizações lado a lado', bx, 17)

  // Fotos de destaque à direita
  const heroes = b.heroes.slice(0, 3)
  const n = heroes.length
  const hw = n >= 3 ? 25 : n === 2 ? 29 : 34
  const hh = (hw * 4) / 3
  const gap = 4
  const hx0 = PAGE_W - MARGIN - (n * hw + Math.max(0, n - 1) * gap)
  const hy = n >= 3 ? 14 : n === 2 ? 11 : 9
  heroes.forEach((h, i) => {
    const x = hx0 + i * (hw + gap)
    const img = a.heroes[i]
    if (img) doc.addImage(img, 'JPEG', x, hy, hw, hh, undefined, 'FAST')
    else {
      doc.setFillColor(58, 46, 38)
      doc.roundedRect(x, hy, hw, hh, 2.5, 2.5, 'F')
      if (h.placeholder) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.setTextColor(...LIGHT)
        const t = doc.splitTextToSize(h.placeholder, hw - 6) as string[]
        doc.text(t, x + hw / 2, hy + hh / 2 - ((t.length - 1) * 3.4) / 2, { align: 'center', baseline: 'middle' })
      }
    }
    if (h.label) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(...LIGHT)
      doc.text(h.label, x + hw / 2, hy + hh + 4, { align: 'center' })
    }
  })

  // Texto: chamada, produto (até 3 linhas, diminui se precisar), marca e etiqueta
  const textW = (n ? hx0 : PAGE_W - MARGIN) - MARGIN - 8
  let y = 27
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...TAN)
  doc.setCharSpace(0.5)
  doc.text(b.kicker.toUpperCase(), MARGIN, y)
  doc.setCharSpace(0)
  let size = 18
  let lines: string[] = []
  for (; size >= 13; size -= 1.5) {
    doc.setFontSize(size)
    lines = doc.splitTextToSize(b.title, textW) as string[]
    if (lines.length <= 2) break
  }
  lines = lines.slice(0, 3)
  const lh = size * 0.42
  y += 3 + lh
  doc.setTextColor(255, 255, 255)
  doc.text(lines, MARGIN, y, { lineHeightFactor: 1.15 })
  y += (lines.length - 1) * lh * 1.15
  if (b.brand) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(...TAN)
    y += 6
    doc.text(b.brand, MARGIN, y)
  }
  // Etiqueta
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  const pillText = (doc.splitTextToSize(pdfSafe(b.pill), textW - 8) as string[])[0]
  const pw = doc.getTextWidth(pillText) + 8
  const py = Math.max(y + 4, BANNER_H - 13)
  doc.setDrawColor(...TAN)
  doc.setLineWidth(0.35)
  doc.roundedRect(MARGIN, py, pw, 7, 3.5, 3.5, 'S')
  doc.setTextColor(255, 255, 255)
  doc.text(pillText, MARGIN + 4, py + 4.8)

  // Propaganda do app
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...LIGHT)
  siteLink(doc, `Feito com o Capilário · ${SITE}`, PAGE_W - MARGIN, BANNER_H - 7.5)
}

/** Endereço do app (fixo: o PDF nunca leva o endereço de teste). Clicável no PDF. */
export const SITE = 'capilario.com.br'

/** Texto alinhado à direita em (x, y), com o link do app por cima. */
function siteLink(doc: Doc, text: string, x: number, y: number) {
  doc.text(text, x, y, { align: 'right' })
  const w = doc.getTextWidth(text)
  doc.link(x - w, y - 3, w, 4, { url: `https://${SITE}` })
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
  if (label) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...TEXT)
    doc.text(label, x + w / 2, y + h + 5, { align: 'center' })
  }
  return y + h + (label ? 9 : 3)
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
    doc.text(`Gerado pelo Capilário em ${today}${total > 1 ? ` · ${i}/${total}` : ''}`, MARGIN, PAGE_H - 9)
    siteLink(doc, SITE, PAGE_W - MARGIN, PAGE_H - 9)
  }
}

/**
 * Bloco de texto no fim do PDF: título em negrito numa linha e, embaixo, o texto ou uma lista
 * de linhas "rótulo  texto" (a rotina: "Lavar  Shampoo X").
 */
export interface PdfNote {
  title?: string
  text?: string
  rows?: [label: string, text: string][]
}

interface WrappedNote {
  title?: string
  lines: string[]
  rows: { label: string; lines: string[] }[]
}

const NOTE_W = PAGE_W - 2 * MARGIN
const ROW_LABEL_W = 28
const LINE_H = 5
const TITLE_H = 6
const NOTE_GAP = 5
const noteHeight = (b: WrappedNote) =>
  (b.title ? TITLE_H : 0) + b.lines.length * LINE_H + b.rows.reduce((s, r) => s + r.lines.length * LINE_H + 1, 0) + NOTE_GAP

/** Desenha os blocos a partir de y (topo); devolve o y final. */
function notesBlock(doc: Doc, blocks: WrappedNote[], y: number): number {
  y += 4
  const lines = (t: string[], x: number) => doc.text(t, x, y, { lineHeightFactor: 1.4 })
  for (const b of blocks) {
    if (b.title) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(...TEXT)
      doc.text(b.title, MARGIN, y)
      y += TITLE_H
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...TEXT)
    if (b.lines.length) {
      lines(b.lines, MARGIN)
      y += b.lines.length * LINE_H
    }
    for (const r of b.rows) {
      doc.setTextColor(...MUTED)
      doc.text(r.label, MARGIN, y)
      doc.setTextColor(...TEXT)
      lines(r.lines, MARGIN + ROW_LABEL_W)
      y += r.lines.length * LINE_H + 1
    }
    y += NOTE_GAP
  }
  return y
}

function wrapNotes(doc: Doc, notes: PdfNote[]): { blocks: WrappedNote[]; height: number } {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const blocks = notes.map((n) => ({
    title: n.title,
    lines: n.text ? (doc.splitTextToSize(n.text, NOTE_W) as string[]) : [],
    rows: (n.rows ?? []).map(([label, text]) => ({ label, lines: doc.splitTextToSize(text, NOTE_W - ROW_LABEL_W) as string[] })),
  }))
  return { blocks, height: blocks.reduce((s, b) => s + noteHeight(b), 0) }
}

/** Leitura da IA no PDF da finalização: tipo, características, as 4 notas, resumo e quem fez. */
export interface PdfReading {
  /** "Ondulado 2B · tende a 2C/3A" */
  title: string
  traits: string[]
  scores: { label: string; value: number | null }[]
  summary: string
  /** "Análise feita por IA em 22/11" */
  credit: string
}

const READING_GAP = 6

function wrapReading(doc: Doc, r: PdfReading): { summary: string[]; height: number } {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const summary = r.summary ? (doc.splitTextToSize(r.summary, PAGE_W - 2 * MARGIN) as string[]) : []
  return { summary, height: 8 + 6 + (r.traits.length ? 5 : 0) + 11 + (summary.length ? summary.length * 5 + 1 : 0) + 6 }
}

/** Bloco "Leitura da IA"; devolve o y final. */
function readingBlock(doc: Doc, r: PdfReading, summary: string[], y: number): number {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...TEXT)
  doc.text('Leitura da IA', MARGIN, y + 4)
  y += 8
  doc.setFontSize(11)
  doc.setTextColor(...BRAND)
  doc.text(r.title, MARGIN, y + 4)
  y += 6
  if (r.traits.length) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text((doc.splitTextToSize(r.traits.join(' · '), PAGE_W - 2 * MARGIN) as string[])[0], MARGIN, y + 3.5)
    y += 5
  }
  const n = Math.max(1, r.scores.length)
  const colW = (PAGE_W - 2 * MARGIN - (n - 1) * READING_GAP) / n
  r.scores.forEach((s, i) => {
    const x = MARGIN + i * (colW + READING_GAP)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...MUTED)
    doc.text(s.label, x, y + 3.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...TEXT)
    doc.text(s.value == null ? '—' : `${s.value}/10`, x + colW, y + 3.5, { align: 'right' })
    doc.setFillColor(...LINE)
    doc.roundedRect(x, y + 5.5, colW, 2.2, 1.1, 1.1, 'F')
    if (s.value) {
      doc.setFillColor(...BRAND)
      doc.roundedRect(x, y + 5.5, Math.max(2.2, (colW * Math.min(10, s.value)) / 10), 2.2, 1.1, 1.1, 'F')
    }
  })
  y += 11
  if (summary.length) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...TEXT)
    doc.text(summary, MARGIN, y + 4)
    y += summary.length * 5 + 1
  }
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text(r.credit, MARGIN, y + 3.5)
  return y + 6
}

/** PDF de um momento: capa, até 4 fotos em grade 2x2 e a observação (e a da IA, com rótulo). */
export async function momentPdf(opts: { banner: Banner; photos: PdfPhoto[]; notes?: PdfNote[] }): Promise<Blob> {
  const [{ doc, lib }, assets, images] = await Promise.all([newDoc(), bannerAssets(opts.banner), Promise.all(opts.photos.map((p) => prepared(p)))])
  drawBanner(doc, lib, opts.banner, assets)
  const notes = wrapNotes(doc, opts.notes ?? [])
  const rows = Math.ceil(opts.photos.length / 2) || 1
  const room = BOTTOM - CONTENT_Y - Math.min(notes.height, 50)
  const w = Math.max(40, Math.min(80, ((room / rows - 11) * 3) / 4))
  const gap = 10
  const x0 = (PAGE_W - (2 * w + gap)) / 2
  let y = CONTENT_Y
  let rowBottom = y
  opts.photos.forEach((p, i) => {
    const col = i % 2
    if (col === 0 && i > 0) y = rowBottom + 2
    rowBottom = photoBox(doc, images[i], x0 + col * (w + gap), y, w, p.label)
  })
  y = rowBottom + 2
  if (notes.blocks.length) {
    if (y + notes.height > BOTTOM) {
      doc.addPage()
      y = MARGIN
    }
    notesBlock(doc, notes.blocks, y)
  }
  footers(doc)
  return doc.output('blob')
}

/**
 * PDF da finalização inteira: capa, uma coluna por momento (molhado → seco → dia seguinte) e uma
 * linha por ângulo, para ler a evolução da esquerda para a direita; as observações no fim.
 * O tamanho das fotos se ajusta para tudo caber numa página.
 */
export async function finalizationPdf(opts: {
  banner: Banner
  /** Subtítulo em linhas curtas (horário; umidade), para não invadir a coluna do lado. */
  columns: { title: string; subtitle: string[] }[]
  rows: { label: string; cells: (PdfPhoto | null)[] }[]
  notes: PdfNote[]
  reading?: PdfReading
}): Promise<Blob> {
  const flat = opts.rows.flatMap((r) => r.cells)
  const [{ doc, lib }, assets, images] = await Promise.all([
    newDoc(),
    bannerAssets(opts.banner),
    Promise.all(flat.map((p) => (p ? prepared(p) : Promise.resolve(null)))),
  ])
  drawBanner(doc, lib, opts.banner, assets)
  const n = Math.max(1, opts.columns.length)
  const labelW = 17
  const gap = 4
  const rowGap = 3
  const headH = 9 + 4 * Math.max(1, ...opts.columns.map((c) => c.subtitle.length))
  let y = CONTENT_Y - 2
  // Leitura da IA e observações no fim: reserva o espaço delas para caber tudo numa página (até um limite).
  const notes = wrapNotes(doc, opts.notes)
  const reading = opts.reading ? wrapReading(doc, opts.reading) : null
  const room = BOTTOM - y - headH - Math.min(notes.height + (reading ? reading.height + 3 : 0), reading ? 80 : 50)
  const byHeight = ((room / Math.max(1, opts.rows.length) - rowGap) * 3) / 4
  const byWidth = (PAGE_W - 2 * MARGIN - labelW - (n - 1) * gap) / n
  const w = Math.max(28, Math.min(48, byHeight, byWidth))
  const h = (w * 4) / 3
  const x0 = (PAGE_W - (labelW + n * w + (n - 1) * gap)) / 2 + labelW
  const colX = (i: number) => x0 + i * (w + gap)

  opts.columns.forEach((c, i) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...TEXT)
    doc.text(c.title, colX(i) + w / 2, y + 4, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...MUTED)
    c.subtitle.forEach((line, li) => doc.text(line, colX(i) + w / 2, y + 9 + li * 4, { align: 'center' }))
  })
  y += headH

  opts.rows.forEach((r, ri) => {
    if (y + h > BOTTOM) {
      doc.addPage()
      y = MARGIN
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...TEXT)
    doc.text(r.label, x0 - 3, y + h / 2, { align: 'right', baseline: 'middle' })
    r.cells.forEach((cell, ci) => {
      const img = images[ri * n + ci]
      const x = colX(ci)
      if (img) doc.addImage(img, 'JPEG', x, y, w, h, undefined, 'FAST')
      else {
        doc.setFillColor(246, 240, 234)
        doc.rect(x, y, w, h, 'F')
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(...MUTED)
        doc.text(cell ? 'Foto indisponível' : 'Sem foto', x + w / 2, y + h / 2, { align: 'center', baseline: 'middle' })
      }
      doc.setDrawColor(...LINE)
      doc.setLineWidth(0.3)
      doc.rect(x, y, w, h)
    })
    y += h + rowGap
  })

  if (opts.reading && reading) {
    y += 3
    if (y + reading.height > BOTTOM) {
      doc.addPage()
      y = MARGIN
    }
    y = readingBlock(doc, opts.reading, reading.summary, y)
  }

  if (notes.blocks.length) {
    y += 3
    if (y + notes.height - 3 > BOTTOM) {
      doc.addPage()
      y = MARGIN
    }
    notesBlock(doc, notes.blocks, y)
  }
  footers(doc)
  return doc.output('blob')
}

export interface CompareSide {
  title: string
  subtitle: string
}

/** PDF do comparativo: capa, A à esquerda, B à direita, um ângulo por linha. */
export async function comparePdf(opts: {
  banner: Banner
  a: CompareSide
  b: CompareSide
  rows: { label: string; a: PdfPhoto; b: PdfPhoto }[]
  /** O que mudou entre as duas finalizações, no fim. */
  notes?: PdfNote[]
}): Promise<Blob> {
  const flat = opts.rows.flatMap((r) => [r.a, r.b])
  const [{ doc, lib }, assets, images] = await Promise.all([newDoc(), bannerAssets(opts.banner), Promise.all(flat.map((p) => prepared(p)))])
  drawBanner(doc, lib, opts.banner, assets)
  const gap = 10
  const sidesH = 14
  // Duas linhas na primeira página (abaixo da capa); nas outras, a mesma medida.
  const w = Math.max(40, Math.min(72, (((BOTTOM - CONTENT_Y - sidesH - 4) / 2 - 11) * 3) / 4))
  const h = (w * 4) / 3
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
    return y + sidesH
  }

  let y = sides(CONTENT_Y + 3)
  opts.rows.forEach((r, i) => {
    if (i > 0 && y + h + 9 > BOTTOM) {
      doc.addPage()
      y = sides(MARGIN + 4)
    }
    photoBox(doc, images[i * 2], xA, y, w, `${r.label} · A`)
    y = photoBox(doc, images[i * 2 + 1], xB, y, w, `${r.label} · B`) + 2
  })
  const notes = wrapNotes(doc, opts.notes ?? [])
  if (notes.blocks.length) {
    if (y + notes.height > BOTTOM) {
      doc.addPage()
      y = MARGIN
    }
    notesBlock(doc, notes.blocks, y)
  }
  footers(doc)
  return doc.output('blob')
}
