// Textos da análise da IA, sem rede (usados no app, no PDF e nas mensagens prontas).
// Dentro da observação, o que a pessoa escreveu vem primeiro e a análise vai no fim, depois de
// "Análise: " (ver mergeNote).

/** Marca que separa o que a pessoa escreveu da análise da IA, dentro da observação. */
export const ANALYSIS_MARK = 'Análise: '

/** Separa a observação em: texto da pessoa e análise da IA (cada um pode faltar). */
export function splitNote(text: string | null | undefined): { own: string | null; analysis: string | null } {
  const base = text ?? ''
  const i = base.startsWith(ANALYSIS_MARK) ? 0 : base.indexOf(`\n\n${ANALYSIS_MARK}`)
  const own = (i < 0 ? base : base.slice(0, i)).trim()
  const analysis = i < 0 ? '' : base.slice(i).trim().slice(ANALYSIS_MARK.length).trim()
  return { own: own || null, analysis: analysis || null }
}

/**
 * Observação com a análise: o texto da pessoa fica e a análise vai no fim, depois de
 * "Análise: ". Uma análise anterior (do fim em diante) é trocada pela nova.
 */
export function mergeNote(current: string | null | undefined, suggestion: string): string | null {
  const text = suggestion.trim()
  const { own } = splitNote(current)
  if (!text) return own
  return own ? `${own}\n\n${ANALYSIS_MARK}${text}` : `${ANALYSIS_MARK}${text}`
}
