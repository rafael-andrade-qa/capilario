import { describe, expect, it } from 'vitest'
import { authMessage, passwordProblem } from './account'

describe('senha nova', () => {
  it('pede pelo menos 8 caracteres e as duas iguais', () => {
    expect(passwordProblem('1234567')).toBe('A senha precisa ter pelo menos 8 caracteres.')
    expect(passwordProblem('12345678')).toBeNull()
    expect(passwordProblem('12345678', '12345679')).toBe('As duas senhas não são iguais.')
    expect(passwordProblem('12345678', '12345678')).toBeNull()
  })
})

describe('mensagens do login em português', () => {
  it('traduz os erros mais comuns do Supabase', () => {
    expect(authMessage('Invalid login credentials')).toBe('E-mail ou senha incorretos.')
    expect(authMessage('Email not confirmed')).toMatch(/Confirme o seu e-mail/)
    expect(authMessage('User already registered')).toMatch(/Já existe uma conta/)
    expect(authMessage('Signups not allowed for this instance')).toBe('O cadastro ainda não está aberto.')
    expect(authMessage('For security purposes, you can only request this after 42 seconds.')).toMatch(/Espere um minuto/)
    expect(authMessage('Email rate limit exceeded')).toMatch(/Espere um minuto/)
    expect(authMessage('New password should be different from the old password.')).toBe('A senha nova precisa ser diferente da atual.')
    expect(authMessage('Password should be at least 6 characters.')).toMatch(/pelo menos 8/)
    expect(authMessage('Email address "x@y" is invalid')).toBe('Esse e-mail não parece válido.')
    expect(authMessage('Email link is invalid or has expired')).toMatch(/expirou ou já foi usado/)
    expect(authMessage('Token has expired or is invalid')).toMatch(/expirou ou já foi usado/)
    expect(authMessage('Failed to fetch')).toMatch(/Sem conexão/)
    expect(authMessage('')).toBe('Algo deu errado. Tente de novo.')
  })
})
