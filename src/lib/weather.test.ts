import { afterEach, describe, expect, it, vi } from 'vitest'
import { airLabel, fillWeather, hourKey, humidityTag, needsWeather, pickHour, skyLabel, weatherLong, weatherShort, weatherUrl, withHumidity } from './weather'
import type { Stage } from './domain'

const NOW = Date.parse('2026-11-23T18:00:00Z')
const stage = (over: Partial<Stage>): Stage =>
  ({ id: 's1', experiment_id: 'e', finalization_id: 'f', stage_type: 'dry', captured_at: '2026-11-23T13:18:00Z', notes: null, is_favorite: false, created_at: '', photos: [], ...over }) as Stage

describe('hora e necessidade', () => {
  it('arredonda para a hora cheia, em UTC', () => {
    expect(hourKey('2026-11-23T13:18:00Z')).toBe('2026-11-23T13:00')
    expect(hourKey('2026-11-23T13:40:00-03:00')).toBe('2026-11-23T17:00')
  })
  it('pede clima quando falta ou quando o horário mudou; não para o futuro nem para fotos muito antigas', () => {
    expect(needsWeather(stage({}), NOW)).toBe(true)
    expect(needsWeather(stage({ weather_at: '2026-11-23T13:00:00Z' }), NOW)).toBe(false)
    expect(needsWeather(stage({ weather_at: '2026-11-22T13:00:00Z' }), NOW)).toBe(true)
    expect(needsWeather(stage({ captured_at: '2026-11-25T10:00:00Z' }), NOW)).toBe(false)
    expect(needsWeather(stage({ captured_at: '2024-01-01T10:00:00Z' }), NOW)).toBe(false)
  })
})

describe('consulta', () => {
  it('recente usa a previsão (com dado observado); antigo usa o arquivo; a posição vai arredondada', () => {
    const u = new URL(weatherUrl(-18.91864, -48.27722, '2026-11-20', '2026-11-23', NOW))
    expect(u.origin + u.pathname).toBe('https://api.open-meteo.com/v1/forecast')
    expect(u.searchParams.get('latitude')).toBe('-18.92')
    expect(u.searchParams.get('longitude')).toBe('-48.28')
    expect(u.searchParams.get('hourly')).toBe('temperature_2m,relative_humidity_2m,weather_code')
    expect(u.searchParams.get('timezone')).toBe('GMT')
    expect(weatherUrl(-18.9, -48.3, '2026-05-01', '2026-05-02', NOW)).toMatch(/^https:\/\/archive-api\.open-meteo\.com\/v1\/archive\?/)
  })
  it('pega a hora certa da resposta', () => {
    const hourly = {
      time: ['2026-11-23T12:00', '2026-11-23T13:00'],
      temperature_2m: [22.04, 24.36],
      relative_humidity_2m: [90, 81.6],
      weather_code: [61, 3],
    }
    expect(pickHour(hourly, '2026-11-23T13:18:00Z')).toEqual({ humidity: 82, temperature: 24.4, weather_code: 3, weather_at: '2026-11-23T13:00:00Z' })
    expect(pickHour(hourly, '2026-11-23T20:00:00Z')).toBeNull()
  })
})

describe('textos', () => {
  it('tempo e ar em palavras', () => {
    expect(skyLabel(0)).toBe('céu limpo')
    expect(skyLabel(3)).toBe('nublado')
    expect(skyLabel(63)).toBe('chuva')
    expect(skyLabel(95)).toBe('tempestade')
    expect(airLabel(30)).toBe('ar seco')
    expect(airLabel(60)).toBe('umidade normal')
    expect(airLabel(82)).toBe('ar úmido')
  })
  it('curto, longo e legenda; sem clima, nada', () => {
    const s = { humidity: 82, temperature: 24.4, weather_code: 3 }
    expect(weatherShort(s)).toBe('82% de umidade, 24°C')
    expect(weatherLong(s)).toBe('Ar úmido: 82% de umidade, 24°C, nublado.')
    expect(humidityTag(s)).toBe('umidade 82%')
    expect(withHumidity('23/11 10:18', s)).toBe('23/11 10:18 · umidade 82%')
    expect(withHumidity('23/11 10:18', { humidity: null })).toBe('23/11 10:18')
    expect(weatherShort({ humidity: null, temperature: null, weather_code: null })).toBeNull()
  })
})

describe('fillWeather', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('sem localização não consulta nada', async () => {
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: (_ok: unknown, fail: () => void) => fail() } })
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await fillWeather([stage({ id: 'sem-loc' })], async () => undefined, NOW)).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
