import { describe, expect, it } from 'vitest'
import { edgeResist, lockAxis, swipeOutcome } from './swipe'

const base = { dx: 0, dy: 0, ms: 400, width: 400, height: 700, axis: null as 'x' | 'y' | null }

describe('gestos do visualizador', () => {
  it('trava o eixo só depois de um pequeno movimento', () => {
    expect(lockAxis(3, 4)).toBeNull()
    expect(lockAxis(-20, 5)).toBe('x')
    expect(lockAxis(4, 30)).toBe('y')
  })

  it('arrastar para a esquerda vai para a próxima; para a direita, a anterior', () => {
    expect(swipeOutcome({ ...base, axis: 'x', dx: -120 }, true, true)).toBe('next')
    expect(swipeOutcome({ ...base, axis: 'x', dx: 120 }, true, true)).toBe('prev')
  })

  it('arrasto curto e lento volta para a mesma foto; gesto rápido troca', () => {
    expect(swipeOutcome({ ...base, axis: 'x', dx: -50 }, true, true)).toBe('stay')
    expect(swipeOutcome({ ...base, axis: 'x', dx: -50, ms: 80 }, true, true)).toBe('next')
  })

  it('não passa da primeira nem da última', () => {
    expect(swipeOutcome({ ...base, axis: 'x', dx: 200 }, false, true)).toBe('stay')
    expect(swipeOutcome({ ...base, axis: 'x', dx: -200 }, true, false)).toBe('stay')
    expect(edgeResist(100, false, true)).toBe(30)
    expect(edgeResist(100, true, true)).toBe(100)
  })

  it('puxar para baixo fecha; para cima, não', () => {
    expect(swipeOutcome({ ...base, axis: 'y', dy: 160 }, true, true)).toBe('close')
    expect(swipeOutcome({ ...base, axis: 'y', dy: -300 }, true, true)).toBe('stay')
    expect(swipeOutcome({ ...base, axis: 'y', dy: 30 }, true, true)).toBe('stay')
  })
})
