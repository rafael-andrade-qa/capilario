import { describe, expect, it } from 'vitest'
import { formatLocal, friendlyLocal, isFutureDay, monthGrid, parseLocal } from './dates'

describe('datas do seletor', () => {
  it('lê e escreve o formato local', () => {
    const p = parseLocal('2026-11-19T18:01')!
    expect(p).toEqual({ year: 2026, month: 10, day: 19, hour: 18, minute: 1 })
    expect(formatLocal(p)).toBe('2026-11-19T18:01')
    expect(parseLocal('lixo')).toBeNull()
  })

  it('monta o mês em semanas começando no domingo', () => {
    const nov = monthGrid(2026, 10) // 1/11/2026 é domingo
    expect(nov[0]).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(nov[nov.length - 1]).toEqual([29, 30, null, null, null, null, null])
    const dez = monthGrid(2026, 11) // 1/12/2026 é terça
    expect(dez[0]).toEqual([null, null, 1, 2, 3, 4, 5])
  })

  it('texto amigável e dias futuros', () => {
    const now = new Date(2026, 10, 19, 18, 1)
    expect(friendlyLocal('2026-11-19T18:01', now)).toBe('Hoje, 18:01')
    expect(friendlyLocal('2026-11-18T09:48', now)).toBe('Ontem, 09:48')
    expect(friendlyLocal('2026-11-10T07:05', now)).toBe('10/11/2026, 07:05')
    expect(isFutureDay(2026, 10, 20, now)).toBe(true)
    expect(isFutureDay(2026, 10, 19, now)).toBe(false)
  })
})
