// Clima de cada momento: umidade, temperatura e o tempo (sol, nublado, chuva) da hora da foto.
// Automático: o app pega a localização do aparelho (só a cidade importa, então arredonda), pergunta
// ao Open-Meteo (grátis, sem cadastro) e grava só os números no momento. A localização não é guardada.
import type { Experiment, Stage } from './domain'

export interface StageWeather {
  humidity: number
  temperature: number
  weather_code: number
  /** Hora (UTC, cheia) a que o clima se refere. */
  weather_at: string
}

/** Até quantos dias para trás o app busca o clima (fotos antigas demais ficam sem). */
const MAX_DAYS = 365
const DAY = 86_400_000

/** "2026-11-23T14:00" em UTC: a hora cheia mais próxima do horário. */
export function hourKey(iso: string): string {
  const t = new Date(Math.round(Date.parse(iso) / 3_600_000) * 3_600_000)
  return t.toISOString().slice(0, 13) + ':00'
}

/** O momento ainda não tem clima, ou o horário dele mudou depois da consulta. */
export function needsWeather(s: Pick<Stage, 'captured_at' | 'weather_at'>, now = Date.now()): boolean {
  const t = Date.parse(s.captured_at)
  if (!Number.isFinite(t) || t > now + 3_600_000 || t < now - MAX_DAYS * DAY) return false
  return !s.weather_at || hourKey(s.weather_at) !== hourKey(s.captured_at)
}

/**
 * Endereço da consulta. Até ~3 meses atrás a previsão já tem o dado observado; antes disso,
 * o arquivo histórico.
 */
export function weatherUrl(lat: number, lon: number, start: string, end: string, now = Date.now()): string {
  const recent = Date.parse(start) >= now - 85 * DAY
  const base = recent ? 'https://api.open-meteo.com/v1/forecast' : 'https://archive-api.open-meteo.com/v1/archive'
  const q = new URLSearchParams({
    latitude: lat.toFixed(2),
    longitude: lon.toFixed(2),
    hourly: 'temperature_2m,relative_humidity_2m,weather_code',
    timezone: 'GMT',
    start_date: start,
    end_date: end,
  })
  return `${base}?${q}`
}

interface Hourly {
  time: string[]
  temperature_2m: (number | null)[]
  relative_humidity_2m: (number | null)[]
  weather_code: (number | null)[]
}

/** Clima da hora do momento, a partir da resposta do Open-Meteo. */
export function pickHour(hourly: Hourly, capturedAt: string): StageWeather | null {
  const key = hourKey(capturedAt)
  const i = hourly.time.indexOf(key)
  if (i < 0) return null
  const h = hourly.relative_humidity_2m[i]
  const t = hourly.temperature_2m[i]
  const c = hourly.weather_code[i]
  if (h == null || t == null || c == null) return null
  return { humidity: Math.round(h), temperature: Math.round(t * 10) / 10, weather_code: c, weather_at: `${key}:00Z` }
}

/** O tempo em palavras (códigos da OMM usados pelo Open-Meteo). */
export function skyLabel(code: number): string {
  if (code === 0) return 'céu limpo'
  if (code <= 2) return 'poucas nuvens'
  if (code === 3) return 'nublado'
  if (code === 45 || code === 48) return 'neblina'
  if (code >= 51 && code <= 57) return 'garoa'
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'chuva'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'neve'
  if (code >= 95) return 'tempestade'
  return 'tempo variado'
}

/** Ar seco, normal ou úmido: o que mais mexe com o frizz. */
export function airLabel(humidity: number): string {
  if (humidity < 40) return 'ar seco'
  if (humidity >= 75) return 'ar úmido'
  return 'umidade normal'
}

type WithWeather = Pick<Stage, 'humidity' | 'temperature' | 'weather_code'>
const has = (s: WithWeather): s is { humidity: number; temperature: number; weather_code: number } =>
  s.humidity != null && s.temperature != null && s.weather_code != null

/** "82% de umidade, 24°C" (curto, para legendas). */
export function weatherShort(s: WithWeather): string | null {
  if (!has(s)) return null
  return `${s.humidity}% de umidade, ${formatTemp(s.temperature)}`
}

/** "Ar úmido: 82% de umidade, 24°C, nublado." */
export function weatherLong(s: WithWeather): string | null {
  if (!has(s)) return null
  const air = airLabel(s.humidity)
  return `${air[0].toUpperCase()}${air.slice(1)}: ${s.humidity}% de umidade, ${formatTemp(s.temperature)}, ${skyLabel(s.weather_code)}.`
}

const formatTemp = (t: number) => `${Math.round(t)}°C`

// ---------------------------------------------------------------------------
// Preencher o clima que falta
// ---------------------------------------------------------------------------

let position: { lat: number; lon: number; at: number } | null = null

/** Localização do aparelho, arredondada (~1 km). Guardada só na memória, por 1 hora. */
export function devicePosition(): Promise<{ lat: number; lon: number } | null> {
  if (position && Date.now() - position.at < 3_600_000) return Promise.resolve(position)
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null)
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => {
        position = { lat: Math.round(p.coords.latitude * 100) / 100, lon: Math.round(p.coords.longitude * 100) / 100, at: Date.now() }
        resolve(position)
      },
      () => resolve(null),
      { enableHighAccuracy: false, maximumAge: 3_600_000, timeout: 15_000 },
    )
  })
}

/** Momentos que precisam de clima, de todos os produtos. */
export function stagesNeedingWeather(experiments: Experiment[], now = Date.now()): Stage[] {
  return experiments.flatMap((e) => e.stages.filter((s) => needsWeather(s, now)))
}

/**
 * Busca e grava o clima dos momentos que estão sem. Uma consulta por período (recente e antigo).
 * Sem localização (a pessoa não deixou) ou sem internet, não faz nada.
 */
export async function fillWeather(
  stages: Stage[],
  save: (stageId: string, w: StageWeather) => Promise<void>,
  now = Date.now(),
): Promise<number> {
  if (!stages.length) return 0
  const pos = await devicePosition()
  if (!pos) return 0
  const recent = stages.filter((s) => Date.parse(s.captured_at) >= now - 85 * DAY)
  const old = stages.filter((s) => Date.parse(s.captured_at) < now - 85 * DAY)
  let saved = 0
  for (const group of [recent, old]) {
    if (!group.length) continue
    const days = group.map((s) => hourKey(s.captured_at).slice(0, 10)).sort()
    try {
      const res = await fetch(weatherUrl(pos.lat, pos.lon, days[0], days[days.length - 1], now))
      if (!res.ok) continue
      const { hourly } = (await res.json()) as { hourly?: Hourly }
      if (!hourly) continue
      for (const s of group) {
        const w = pickHour(hourly, s.captured_at)
        if (!w) continue
        await save(s.id, w)
        saved++
      }
    } catch {
      // sem internet ou o serviço fora: tenta de novo na próxima abertura
    }
  }
  return saved
}

/** "umidade 82%" (para legendas curtas, como as colunas do PDF). */
export function humidityTag(s: Pick<Stage, 'humidity'>): string | null {
  return s.humidity != null ? `umidade ${s.humidity}%` : null
}

/** Junta o horário com a umidade: "23/11 10:18 · umidade 82%". */
export function withHumidity(text: string, s: Pick<Stage, 'humidity'>): string {
  const h = humidityTag(s)
  return h ? `${text} · ${h}` : text
}
