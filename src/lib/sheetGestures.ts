// Folhas que sobem de baixo: o fundo não rola enquanto uma está aberta, e dá para fechar
// arrastando a folha para baixo.

let locks = 0
let saved: { y: number; css: string } | null = null

/**
 * Trava a rolagem da página. No iPhone, overflow: hidden no body não basta (o Safari continua
 * rolando o fundo), então o body fica fixo no lugar e volta para a mesma posição ao destravar.
 * Conta quantas folhas pediram a trava: só destrava quando a última fecha.
 */
export function lockScroll(): () => void {
  if (locks++ === 0) {
    const y = window.scrollY
    const body = document.body.style
    saved = { y, css: body.cssText }
    body.position = 'fixed'
    body.top = `-${y}px`
    body.left = '0'
    body.right = '0'
    body.width = '100%'
    body.overflow = 'hidden'
  }
  let done = false
  return () => {
    if (done) return
    done = true
    if (--locks === 0 && saved) {
      document.body.style.cssText = saved.css
      window.scrollTo(0, saved.y)
      saved = null
    }
  }
}

/** Arrastar a folha para baixo (com ela no topo) fecha; pouco arrasto, ela volta ao lugar. */
export function swipeToClose(el: HTMLElement | null, close: () => void): () => void {
  if (!el) return () => undefined
  let startY: number | null = null
  let dy = 0
  const reset = () => {
    el.style.transition = 'transform 0.18s ease-out'
    el.style.transform = ''
  }
  const onStart = (e: TouchEvent) => {
    startY = el.scrollTop <= 0 && e.touches.length === 1 ? e.touches[0].clientY : null
    dy = 0
    el.style.transition = 'none'
  }
  const onMove = (e: TouchEvent) => {
    if (startY === null) return
    dy = e.touches[0].clientY - startY
    if (dy <= 0) {
      // Subindo: é rolagem do conteúdo da folha.
      if (el.style.transform) el.style.transform = ''
      startY = el.scrollTop <= 0 ? startY : null
      return
    }
    e.preventDefault()
    el.style.transform = `translateY(${dy}px)`
  }
  const onEnd = () => {
    if (startY !== null && dy > 90) close()
    else reset()
    startY = null
    dy = 0
  }
  el.addEventListener('touchstart', onStart, { passive: true })
  el.addEventListener('touchmove', onMove, { passive: false })
  el.addEventListener('touchend', onEnd)
  el.addEventListener('touchcancel', onEnd)
  return () => {
    el.removeEventListener('touchstart', onStart)
    el.removeEventListener('touchmove', onMove)
    el.removeEventListener('touchend', onEnd)
    el.removeEventListener('touchcancel', onEnd)
  }
}
