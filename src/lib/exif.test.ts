import { describe, expect, it } from 'vitest'
import { medianDate, takenAt, xmpDate } from './exif'

/** Bloco TIFF mínimo com IFD0 -> ExifIFD -> DateTimeOriginal (e fuso opcional). */
function tiff(date: string, le = true, offset?: string): number[] {
  const out: number[] = []
  const u16 = (v: number) => (le ? [v & 255, v >> 8] : [v >> 8, v & 255])
  const u32 = (v: number) => (le ? [v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24] : [v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255])
  const str = (s: string) => [...s].map((c) => c.charCodeAt(0)).concat([0])
  const dateBytes = str(date)
  const offBytes = offset ? str(offset) : []
  // layout: header(8) | IFD0 (2+12+4) | ExifIFD (2+12*n+4) | dados
  const ifd0 = 8
  const exifIfd = ifd0 + 2 + 12 + 4
  const n = offset ? 2 : 1
  const dataAt = exifIfd + 2 + 12 * n + 4
  out.push(...(le ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(ifd0))
  out.push(...u16(1), ...u16(0x8769), ...u16(4), ...u32(1), ...u32(exifIfd), ...u32(0))
  out.push(...u16(n), ...u16(0x9003), ...u16(2), ...u32(dateBytes.length), ...u32(dataAt))
  if (offset) out.push(...u16(0x9011), ...u16(2), ...u32(offBytes.length), ...u32(dataAt + dateBytes.length))
  out.push(...u32(0), ...dateBytes, ...offBytes)
  return out
}

function jpegWith(t: number[]): Uint8Array {
  const payload = [...'Exif\0\0'].map((c) => c.charCodeAt(0)).concat(t)
  const len = payload.length + 2
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 255, ...payload, 0xff, 0xda, 0, 2])
}

describe('takenAt', () => {
  it('JPEG: DateTimeOriginal em horário local', () => {
    const d = takenAt(jpegWith(tiff('2026:11:20 09:12:30')))!
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([2026, 11, 20, 9, 12, 30])
  })
  it('JPEG big-endian com fuso', () => {
    const d = takenAt(jpegWith(tiff('2026:11:20 09:12:30', false, '-03:00')))!
    expect(d.toISOString()).toBe('2026-11-20T12:12:30.000Z')
  })
  it('PNG com XMP (captura de tela)', () => {
    const xmp = 'XML:com.adobe.xmp\0\0\0\0\0<x:xmpmeta><rdf:Description photoshop:DateCreated="2026-11-19T22:05:10-03:00"/></x:xmpmeta>'
    const data = [...xmp].map((c) => c.charCodeAt(0))
    const chunk = [0, 0, data.length >> 8, data.length & 255, ...[...'iTXt'].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0]
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk])
    expect(takenAt(png)!.toISOString()).toBe('2026-11-20T01:05:10.000Z')
  })
  it('sem metadados, data absurda ou arquivo qualquer: null', () => {
    expect(takenAt(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBeNull()
    expect(takenAt(jpegWith(tiff('1980:01:01 00:00:00')))).toBeNull()
    expect(takenAt(new Uint8Array([1, 2, 3]))).toBeNull()
  })
})

describe('xmpDate e mediana', () => {
  it('formato de elemento', () => {
    expect(xmpDate('<exif:DateTimeOriginal>2026-11-20T08:00:00Z</exif:DateTimeOriginal>')!.toISOString()).toBe('2026-11-20T08:00:00.000Z')
  })
  it('mediana ignora um relógio fora', () => {
    const a = new Date('2026-11-20T09:00:00Z')
    const b = new Date('2026-11-20T09:01:00Z')
    const c = new Date('2026-11-23T15:00:00Z')
    expect(medianDate([c, a, b])).toEqual(b)
    expect(medianDate([])).toBeNull()
  })
})
