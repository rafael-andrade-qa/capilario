// Utilitários dos testes de integração. Rodam contra o Supabase LOCAL (`npx supabase start`).
// A chave secreta local é a padrão do CLI e só é usada aqui, para criar contas de teste.
import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface LocalEnv {
  url: string
  publishableKey: string
  secretKey: string
}

let cached: LocalEnv | null = null

export function localEnv(): LocalEnv {
  if (cached) return cached
  if (process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY && process.env.SUPABASE_SECRET_KEY) {
    cached = {
      url: process.env.SUPABASE_URL,
      publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
      secretKey: process.env.SUPABASE_SECRET_KEY,
    }
    return cached
  }
  const raw = execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  const json = JSON.parse(raw.slice(raw.indexOf('{')))
  const url: string = json.API_URL
  if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(url)) throw new Error('Os testes de integração só rodam contra o Supabase local.')
  cached = { url, publishableKey: json.PUBLISHABLE_KEY ?? json.ANON_KEY, secretKey: json.SECRET_KEY ?? json.SERVICE_ROLE_KEY }
  return cached
}

export function anonClient(): SupabaseClient {
  const env = localEnv()
  return createClient(env.url, env.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export function adminClient(): SupabaseClient {
  const env = localEnv()
  return createClient(env.url, env.secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export interface TestUser {
  id: string
  email: string
  password: string
  client: SupabaseClient
}

/** Cria (ou recria) uma conta de teste e devolve um cliente autenticado. */
export async function testUser(label: string): Promise<TestUser> {
  const admin = adminClient()
  const email = `${label}-${randomUUID().slice(0, 8)}@teste.local`
  const password = `Teste-${randomUUID()}`
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw error ?? new Error('createUser falhou')
  const client = anonClient()
  const { error: signErr } = await client.auth.signInWithPassword({ email, password })
  if (signErr) throw signErr
  return { id: data.user.id, email, password, client }
}

/** JPEG sintético mínimo (1x1). */
export function tinyJpeg(): Blob {
  const b64 =
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='
  return new Blob([Buffer.from(b64, 'base64')], { type: 'image/jpeg' })
}

export function ids() {
  return { experimentId: randomUUID(), stageId: randomUUID() }
}

export function photoPath(userId: string, stageId: string, photoId: string, ext = 'jpg') {
  return `${userId}/${stageId}/${photoId}.${ext}`
}

/** Dá (ou tira) o Pro de uma conta, como o servidor faz. `until` no passado = Pro vencido. */
export async function setPlan(userId: string, plan: 'free' | 'pro', until: string | null = null) {
  const { error } = await adminClient().from('subscriptions').upsert({ user_id: userId, plan, pro_until: until, updated_at: new Date().toISOString() })
  if (error) throw error
}

/** Dia de hoje em Brasília (AAAA-MM-DD), deslocado em `days`. */
export function brDay(days = 0): string {
  const d = new Date(Date.now() + days * 86_400_000)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}
