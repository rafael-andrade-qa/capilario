// Conta: criar, recuperar a senha, confirmar links de e-mail, trocar senha/e-mail e excluir.
// Os links dos e-mails trazem um token_hash (modelos em supabase/templates) e abrem /acesso:
// funcionam em qualquer navegador, mesmo que o pedido tenha sido feito no app instalado.
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

/** Cadastro aberto ao público (o Supabase também precisa aceitar cadastros). */
export const SIGNUP_OPEN = import.meta.env.VITE_SIGNUP_OPEN === 'true'
export const MIN_PASSWORD = 8

export type LinkType = 'signup' | 'recovery' | 'email_change'
export const LINK_TYPES: readonly LinkType[] = ['signup', 'recovery', 'email_change']

/** Problema com a senha nova (null se está boa). */
export function passwordProblem(password: string, repeat?: string): string | null {
  if (password.length < MIN_PASSWORD) return `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`
  if (repeat !== undefined && password !== repeat) return 'As duas senhas não são iguais.'
  return null
}

/** Mensagem do Supabase Auth em português, do jeito que a pessoa entende. */
export function authMessage(raw: string | undefined | null): string {
  const m = raw ?? ''
  if (/invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.'
  if (/email not confirmed/i.test(m)) return 'Confirme o seu e-mail pelo link que enviamos antes de entrar.'
  if (/already (been )?registered|already exists/i.test(m)) return 'Já existe uma conta com esse e-mail. Entre ou recupere a senha.'
  if (/signups? not allowed|signup is disabled/i.test(m)) return 'O cadastro ainda não está aberto.'
  if (/rate limit|security purposes|too many/i.test(m)) return 'Muitos pedidos seguidos. Espere um minuto e tente de novo.'
  if (/should be different/i.test(m)) return 'A senha nova precisa ser diferente da atual.'
  if (/password should be at least|weak password|password is too weak/i.test(m)) return `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`
  if (/(invalid|valid) email|email address .* invalid|unable to validate email/i.test(m)) return 'Esse e-mail não parece válido.'
  if (/expired|invalid.*(token|otp|link)|otp.*(invalid|expired)|token has expired/i.test(m)) return 'Esse link expirou ou já foi usado. Peça um novo.'
  if (/fetch|network|failed to fetch/i.test(m)) return 'Sem conexão com o servidor. Verifique a internet.'
  return m || 'Algo deu errado. Tente de novo.'
}

async function run(p: Promise<{ error: { message: string } | null }>): Promise<void> {
  const { error } = await p
  if (error) throw new Error(authMessage(error.message))
}

export async function signIn(email: string, password: string): Promise<void> {
  await run(supabase.auth.signInWithPassword({ email: email.trim(), password }))
}

/** Cria a conta. Devolve true se já entrou (sem confirmação de e-mail), false se falta confirmar. */
export async function signUp(email: string, password: string): Promise<boolean> {
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password })
  if (error) throw new Error(authMessage(error.message))
  // Com a confirmação ligada, o Supabase não revela se o e-mail já existia: devolve um usuário sem
  // identidades e não manda e-mail. A tela diz o mesmo nos dois casos.
  return !!data.session
}

/** Manda o link para criar uma senha nova (não revela se o e-mail tem conta). */
export async function requestPasswordReset(email: string): Promise<void> {
  await run(supabase.auth.resetPasswordForEmail(email.trim()))
}

/** Confirma o link do e-mail; depois dele a pessoa fica conectada neste navegador. */
export async function verifyLink(tokenHash: string, type: LinkType): Promise<void> {
  await run(supabase.auth.verifyOtp({ token_hash: tokenHash, type }))
}

/** Link no formato padrão do Supabase (#access_token=…&refresh_token=…): entra com os tokens. */
export async function enterWithTokens(accessToken: string, refreshToken: string): Promise<void> {
  await run(supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }))
}

export async function setNewPassword(password: string): Promise<void> {
  await run(supabase.auth.updateUser({ password }))
}

/** Troca a senha conferindo a atual (quem pega o celular desbloqueado não troca a senha). */
export async function changePassword(email: string, current: string, next: string): Promise<void> {
  try {
    await signIn(email, current)
  } catch (e) {
    throw new Error((e as Error).message === 'E-mail ou senha incorretos.' ? 'A senha atual está errada.' : (e as Error).message)
  }
  await setNewPassword(next)
}

/** Pede a troca de e-mail: a troca só vale depois do clique nos links. */
export async function changeEmail(newEmail: string): Promise<void> {
  await run(supabase.auth.updateUser({ email: newEmail.trim() }))
}

/** Exclui a conta e tudo dela (fotos, finalizações, análises), conferindo a senha antes. */
export async function deleteAccount(email: string, password: string): Promise<void> {
  try {
    await signIn(email, password)
  } catch (e) {
    throw new Error((e as Error).message === 'E-mail ou senha incorretos.' ? 'A senha está errada.' : (e as Error).message)
  }
  const { error } = await supabase.functions.invoke('delete-account', { body: {} })
  if (error) {
    const body = error instanceof FunctionsHttpError ? await (error.context as Response).json().catch(() => ({})) : {}
    throw new Error(body?.error === 'not_authenticated' ? 'Sua sessão expirou. Entre novamente.' : 'Não consegui excluir a conta agora. Tente de novo em instantes.')
  }
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
}
