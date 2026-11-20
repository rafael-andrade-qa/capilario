import { describe, expect, it } from 'vitest'
import { ROW_HEIGHT, pageSizeFor } from './catalog'

describe('pageSizeFor', () => {
  it('quantos produtos cabem entre o começo da lista e o rodapé', () => {
    // Medido no navegador a 390x664 (iPhone com a barra do Safari): lista em 195, rodapé de 97
    expect(pageSizeFor(664, 195, 97)).toBe(4)
    // app instalado na tela inicial (mais alto)
    expect(pageSizeFor(800, 195, 97)).toBe(5)
    expect(pageSizeFor(932, 195, 97)).toBe(7)
  })
  it('a conta usa a altura fixa da linha', () => {
    const room = 1000 - 200 - 120 - 40 - 22
    expect(pageSizeFor(1000, 200, 120)).toBe(Math.floor((room + 1) / ROW_HEIGHT))
  })
  it('limites: pelo menos 3, no máximo 12', () => {
    expect(pageSizeFor(300, 230, 130)).toBe(3)
    expect(pageSizeFor(3000, 100, 100)).toBe(12)
  })
})
