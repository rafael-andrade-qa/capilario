import { createClient } from '@supabase/supabase-js'

// Só a URL do projeto e a chave publicável chegam ao navegador.
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? ''
export const SUPABASE_KEY: string = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''
export const BUCKET = 'capilar-photos'

export const configError =
  !SUPABASE_URL || !SUPABASE_KEY
    ? 'Configuração ausente: defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (veja .env.example).'
    : null

export const supabase = createClient(SUPABASE_URL || 'http://localhost', SUPABASE_KEY || 'missing-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: 'capilar-auth',
  },
})
