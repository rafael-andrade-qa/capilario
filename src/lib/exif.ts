// Quando a foto foi tirada, lido de dentro do arquivo: EXIF (JPEG, WebP, PNG eXIf) ou XMP
// (PNG/WebP, comum em capturas de tela e quadros exportados). Sem dado: null.
// Horário do EXIF sem fuso é tratado como horário local do aparelho (o mesmo do formulário).

const EXIF_DATE = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/
const ISO_DATE = /(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?/

function sane(d: Date | null): Date | null {
  if (!d || Number.isNaN(d.getTime())) return null
  if (d.getFullYear() < 2000 || d.getTime() > Date.now() + 24 * 3600 * 1000) return null
  return d
}

function fromParts(y: string, mo: string, d: string, h: string, mi: string, s: string | undefined, zone?: string | null): Date | null {
  if (zone) {
    const z = zone === 'Z' ? 'Z' : zone.length === 5 ? `${zone.slice(0, 3)}:${zone.slice(3)}` : zone
    return sane(new Date(`${y}-${mo}-${d}T${h}:${mi}:${s ?? '00'}${z}`))
  }
  return sane(new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0)))
}

/** Lê DateTimeOriginal (ou DateTimeDigitized/DateTime) de um bloco TIFF/EXIF. */
export function tiffDate(b: Uint8Array, start: number): Date | null {
  if (start + 8 > b.length) return null
  const le = b[start] === 0x49 && b[start + 1] === 0x49
  const be = b[start] === 0x4d && b[start + 1] === 0x4d
  if (!le && !be) return null
  const u16 = (o: number) => (le ? b[start + o] | (b[start + o + 1] << 8) : (b[start + o] << 8) | b[start + o + 1])
  const u32 = (o: number) =>
    le
      ? (b[start + o] | (b[start + o + 1] << 8) | (b[start + o + 2] << 16) | (b[start + o + 3] << 24)) >>> 0
      : ((b[start + o] << 24) | (b[start + o + 1] << 16) | (b[start + o + 2] << 8) | b[start + o + 3]) >>> 0
  const ascii = (entry: number) => {
    const count = u32(entry + 4)
    const at = count <= 4 ? entry + 8 : u32(entry + 8)
    if (start + at + count > b.length) return null
    let s = ''
    for (let i = 0; i < count; i++) {
      const c = b[start + at + i]
      if (!c) break
      s += String.fromCharCode(c)
    }
    return s
  }
  const readIfd = (off: number) => {
    const tags = new Map<number, number>()
    if (start + off + 2 > b.length) return tags
    const n = u16(off)
    for (let i = 0; i < n && start + off + 2 + i * 12 + 12 <= b.length; i++) {
      const e = off + 2 + i * 12
      tags.set(u16(e), e)
    }
    return tags
  }
  const ifd0 = readIfd(u32(4))
  let exif = new Map<number, number>()
  const exifPtr = ifd0.get(0x8769)
  if (exifPtr !== undefined) exif = readIfd(u32(exifPtr + 8))
  const pick = (tag: number, map: Map<number, number>) => {
    const e = map.get(tag)
    return e === undefined ? null : ascii(e)
  }
  const raw = pick(0x9003, exif) ?? pick(0x9004, exif) ?? pick(0x0132, ifd0)
  const zone = pick(0x9011, exif) ?? pick(0x9010, exif)
  const m = raw?.match(EXIF_DATE)
  if (!m) return null
  return fromParts(m[1], m[2], m[3], m[4], m[5], m[6], zone && /^[+-]\d{2}:\d{2}$/.test(zone) ? zone : null)
}

/** Data dentro de um pacote XMP (texto). */
export function xmpDate(xml: string): Date | null {
  for (const key of ['exif:DateTimeOriginal', 'photoshop:DateCreated', 'xmp:CreateDate', 'exif:DateTimeDigitized']) {
    const m = xml.match(new RegExp(`${key}(?:="([^"]+)"|>([^<]+)<)`))
    const v = m?.[1] ?? m?.[2]
    const d = v?.match(ISO_DATE)
    if (d) return fromParts(d[1], d[2], d[3], d[4], d[5], d[6], d[7] ?? null)
  }
  return null
}

const latin1 = (b: Uint8Array, from: number, to: number) => {
  let s = ''
  for (let i = from; i < Math.min(to, b.length); i++) s += String.fromCharCode(b[i])
  return s
}
const be32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0
const le32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0

/** Quando a foto foi tirada (JPEG, PNG ou WebP). */
export function takenAt(b: Uint8Array): Date | null {
  // JPEG: segmentos APP1 "Exif" (e XMP).
  if (b[0] === 0xff && b[1] === 0xd8) {
    let o = 2
    let xmp: string | null = null
    while (o + 4 <= b.length && b[o] === 0xff) {
      const marker = b[o + 1]
      if (marker === 0xda || marker === 0xd9) break
      const len = (b[o + 2] << 8) | b[o + 3]
      if (marker === 0xe1) {
        const head = latin1(b, o + 4, o + 10)
        if (head === 'Exif\0\0') {
          const d = tiffDate(b, o + 10)
          if (d) return d
        } else if (head.startsWith('http')) xmp = latin1(b, o + 4, o + 2 + len)
      }
      o += 2 + len
    }
    return xmp ? xmpDate(xmp) : null
  }
  // PNG: eXIf ou XMP em iTXt/tEXt.
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    let o = 8
    while (o + 8 <= b.length) {
      const len = be32(b, o)
      const type = latin1(b, o + 4, o + 8)
      const data = o + 8
      if (type === 'eXIf') {
        const d = tiffDate(b, data)
        if (d) return d
      } else if ((type === 'iTXt' || type === 'tEXt') && latin1(b, data, data + 17) === 'XML:com.adobe.xmp') {
        const d = xmpDate(latin1(b, data, data + len))
        if (d) return d
      } else if (type === 'IEND') break
      o = data + len + 4
    }
    return null
  }
  // WebP: chunks EXIF e XMP.
  if (latin1(b, 0, 4) === 'RIFF' && latin1(b, 8, 12) === 'WEBP') {
    let o = 12
    while (o + 8 <= b.length) {
      const type = latin1(b, o, o + 4)
      const len = le32(b, o + 4)
      const data = o + 8
      if (type === 'EXIF') {
        const skip = latin1(b, data, data + 6) === 'Exif\0\0' ? 6 : 0
        const d = tiffDate(b, data + skip)
        if (d) return d
      } else if (type === 'XMP ') {
        const d = xmpDate(latin1(b, data, data + len))
        if (d) return d
      }
      o = data + len + (len % 2)
    }
  }
  return null
}

/** Lê só o começo do arquivo (os metadados ficam lá). */
export async function photoTakenAt(file: Blob): Promise<Date | null> {
  try {
    const head = new Uint8Array(await file.slice(0, 2 * 1024 * 1024).arrayBuffer())
    return takenAt(head)
  } catch {
    return null
  }
}

/** Horário "do conjunto": a mediana (uma foto com relógio estranho não puxa o resto). */
export function medianDate(dates: Date[]): Date | null {
  if (!dates.length) return null
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime())
  return sorted[Math.floor((sorted.length - 1) / 2)]
}
