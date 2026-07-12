import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Éditeur de portfolio v1 — textarea améliorée (ADR-010, repli Sqilium) :
 * auto-agrandissement, compteurs mots/caractères, plein écran (Échap pour
 * sortir). La sauvegarde continue est portée par la vue (IndexedDB local) ;
 * l'horodatage est affiché ici via `statusText`.
 *
 * @param {{
 *   value: string,
 *   onChange: (texte: string) => void,
 *   statusText?: string | null,
 *   label?: string,
 * }} props
 */
export default function PortfolioEditor({
  value,
  onChange,
  statusText = null,
  label = 'Texte du portfolio',
}) {
  const [fullscreen, setFullscreen] = useState(false)
  const textareaRef = useRef(null)

  // Auto-agrandissement : la zone suit la hauteur du contenu (pas de double
  // ascenseur). En plein écran la hauteur est imposée par le CSS (flex).
  const resize = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea || fullscreen) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.max(textarea.scrollHeight, 180)}px`
  }, [fullscreen])

  useEffect(() => {
    resize()
  }, [value, resize])

  // Échap quitte le plein écran.
  useEffect(() => {
    if (!fullscreen) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setFullscreen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [fullscreen])

  const chars = value.length
  const words = value.trim() === '' ? 0 : value.trim().split(/\s+/).length

  return (
    <div className={`portfolio-editor${fullscreen ? ' portfolio-editor-fullscreen' : ''}`}>
      <div className="portfolio-editor-bar">
        <span className="portfolio-editor-counter" data-testid="editor-counter">
          {words.toLocaleString('fr-FR')} mots · {chars.toLocaleString('fr-FR')} caractères
        </span>
        <span className="portfolio-editor-status" role="status">
          {statusText ?? ''}
        </span>
        <button
          type="button"
          className="button portfolio-editor-expand"
          onClick={() => setFullscreen((current) => !current)}
          aria-pressed={fullscreen}
        >
          {fullscreen ? 'Quitter le plein écran (Échap)' : 'Plein écran'}
        </button>
      </div>
      <textarea
        ref={textareaRef}
        className="portfolio-editor-textarea"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={
          'Collez ou écrivez ici votre journal de bord…\n\n' +
          'Astuce : commencez chaque journée par sa date en début de ligne\n' +
          '(« 22 décembre 2025 », « 22/12/2025 », « ## 2025-12-22 »…) pour un\n' +
          'découpage automatique en journées.'
        }
        spellCheck="true"
      />
    </div>
  )
}
