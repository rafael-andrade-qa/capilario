// Datas no horário local do aparelho, no formato do <input type="datetime-local"> ("2026-11-19T18:01").

const pad = (n: number) => String(n).padStart(2, '0')

export interface LocalParts {
  year: number
  month: number // 0-11
  day: number
  hour: number
  minute: number
}

export function parseLocal(value: string): LocalParts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value)
  if (!m) return null
  return { year: +m[1], month: +m[2] - 1, day: +m[3], hour: +m[4], minute: +m[5] }
}

export function formatLocal(p: LocalParts): string {
  return `${p.year}-${pad(p.month + 1)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`
}

export function sameDay(a: { year: number; month: number; day: number }, b: { year: number; month: number; day: number }) {
  return a.year === b.year && a.month === b.month && a.day === b.day
}

export function partsOf(d: Date): LocalParts {
  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), hour: d.getHours(), minute: d.getMinutes() }
}

/** Dias do mês em semanas (domingo primeiro); null nos espaços antes do dia 1 e depois do último. */
export function monthGrid(year: number, month: number): (number | null)[][] {
  const first = new Date(year, month, 1).getDay()
  const days = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  while (cells.length % 7) cells.push(null)
  const weeks: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

export function monthTitle(year: number, month: number): string {
  return `${MONTHS[month]} de ${year}`
}

/** Texto amigável para o campo: "Hoje, 18:01", "Ontem, 09:48" ou "18/11/2026, 09:48". */
export function friendlyLocal(value: string, now = new Date()): string {
  const p = parseLocal(value)
  if (!p) return 'Escolha a data'
  const time = `${pad(p.hour)}:${pad(p.minute)}`
  const today = partsOf(now)
  const yesterday = partsOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
  if (sameDay(p, today)) return `Hoje, ${time}`
  if (sameDay(p, yesterday)) return `Ontem, ${time}`
  return `${pad(p.day)}/${pad(p.month + 1)}/${p.year}, ${time}`
}

/** O dia é depois de hoje? (registro é sempre de algo que já aconteceu) */
export function isFutureDay(year: number, month: number, day: number, now = new Date()): boolean {
  return new Date(year, month, day).getTime() > new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
}
