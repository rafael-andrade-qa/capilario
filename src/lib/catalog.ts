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

export const PAGE_SIZE = 30

export async function searchCatalog(
  query: string,
  opts: { brand?: string | null; audience?: 'masculino' | null; offset?: number } = {},
): Promise<CatalogItem[]> {
  const { data, error } = await supabase.rpc('search_catalog', {
    p_query: query,
    p_brand: opts.brand ?? null,
    p_audience: opts.audience ?? null,
    p_limit: PAGE_SIZE,
    p_offset: opts.offset ?? 0,
  })
  if (error) throw new Error('Não foi possível buscar no catálogo agora.')
  return (data ?? []) as CatalogItem[]
}

/** Marcas com mais produtos (para os atalhos). Masculinas também, se pedido. */
export async function topBrands(limit = 14, audience?: 'masculino'): Promise<CatalogBrand[]> {
  let q = supabase.from('catalog_brands').select('id, name, audience, product_count').order('product_count', { ascending: false }).limit(limit)
  if (audience) q = q.eq('audience', audience)
  const { data, error } = await q
  if (error) return []
  return (data ?? []) as CatalogBrand[]
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
