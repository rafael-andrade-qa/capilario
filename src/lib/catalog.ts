// Catálogo compartilhado de produtos de cabelo (só leitura): busca, marcas e fotos prontas.
import { supabase } from './supabase'

export interface CatalogItem {
  id: string
  name: string
  brand: string
  brand_id: string
  line: string | null
  category: string
  audience: 'unissex' | 'masculino' | 'feminino'
  image_path: string | null
}

export interface CatalogBrand {
  id: string
  name: string
  audience: 'geral' | 'masculino' | 'feminino'
  product_count: number
}

/** Rótulos dos tipos (os mesmos do script que monta o catálogo). */
export const CATEGORY_LABEL: Record<string, string> = {
  shampoo: 'Shampoo',
  shampoo_seco: 'Shampoo a seco',
  co_wash: 'Co-wash',
  pre_shampoo: 'Pré-shampoo',
  condicionador: 'Condicionador',
  mascara: 'Máscara',
  ampola: 'Ampola',
  leave_in: 'Leave-in',
  creme_pentear: 'Creme de pentear',
  ativador: 'Ativador de cachos',
  gelatina: 'Gelatina',
  geleia: 'Geleia',
  gel: 'Gel',
  mousse: 'Mousse',
  pomada: 'Pomada',
  cera: 'Cera',
  pasta: 'Pasta modeladora',
  spray: 'Spray',
  oleo: 'Óleo',
  serum: 'Sérum',
  protetor_termico: 'Protetor térmico',
  reativador: 'Reativador',
  tonico: 'Tônico',
  acidificante: 'Acidificante',
  manteiga: 'Manteiga',
  finalizador: 'Finalizador',
  tratamento: 'Tratamento',
}

/** Altura de cada linha da lista (fixa no CSS: .catalog-row + a linha divisória). */
export const ROW_HEIGHT = 77
/** Paginação (botões de 36 px, -4 em cima e 8 embaixo) e a moldura da lista (8 de folga,
 * 2 de borda e 12 de margem). Valores do CSS (.pager, .catalog-list). */
const PAGER_HEIGHT = 40
const LIST_CHROME = 22

/**
 * Quantos produtos cabem na tela sem rolar: o espaço entre o começo da lista e o rodapé fixo,
 * já descontada a paginação, dividido pela altura de uma linha (no mínimo 3, no máximo 12).
 */
export function pageSizeFor(viewportHeight: number, listTop: number, footerHeight: number): number {
  const room = viewportHeight - listTop - footerHeight - PAGER_HEIGHT - LIST_CHROME
  // n linhas ocupam n * 77 - 1 (a primeira não tem a linha divisória).
  return Math.max(3, Math.min(12, Math.floor((room + 1) / ROW_HEIGHT)))
}

/** Uma página da busca; hasNext diz se existe a próxima (pede um item a mais para saber). */
export async function searchCatalog(
  query: string,
  opts: { brand?: string | null; page?: number; pageSize: number },
): Promise<{ items: CatalogItem[]; hasNext: boolean }> {
  const size = opts.pageSize
  const { data, error } = await supabase.rpc('search_catalog', {
    p_query: query,
    p_brand: opts.brand ?? null,
    p_audience: null,
    p_limit: size + 1,
    p_offset: (opts.page ?? 0) * size,
  })
  if (error) throw new Error('Não foi possível buscar no catálogo agora.')
  const rows = (data ?? []) as CatalogItem[]
  return { items: rows.slice(0, size), hasNext: rows.length > size }
}

let brandsCache: Promise<CatalogBrand[]> | null = null

/** Todas as marcas do catálogo (algumas centenas; carrega uma vez por sessão). */
export function allBrands(): Promise<CatalogBrand[]> {
  brandsCache ??= (async () => {
    const { data, error } = await supabase.from('catalog_brands').select('id, name, audience, product_count').order('name').range(0, 4999)
    if (error) {
      brandsCache = null
      return []
    }
    return (data ?? []) as CatalogBrand[]
  })()
  return brandsCache
}

export function catalogImageUrl(path: string | null): string | null {
  return path ? supabase.storage.from('catalog').getPublicUrl(path).data.publicUrl : null
}

/** A foto pronta do catálogo como arquivo, para virar a foto do produto da pessoa. */
export async function catalogPhotoFile(path: string): Promise<File> {
  const url = catalogImageUrl(path)
  if (!url) throw new Error('sem foto')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`foto ${res.status}`)
  const blob = await res.blob()
  const type = blob.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp'
  return new File([blob], type === 'image/jpeg' ? 'produto.jpg' : 'produto.webp', { type })
}
