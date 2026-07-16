// Assistant tuteur (D9) — bouton à côté du « ? » d'aide + panneau de chat léger.
// Le tuteur (proxy Haiku côté serveur) explique, selon le profil, ce qu'on peut
// faire et par où passer. RGPD : le PORTFOLIO n'est JAMAIS envoyé (seulement la
// question + la rubrique courante) ; l'historique vit en sessionStorage (aucun
// stockage serveur). La bannière annonce clairement que c'est une IA.
import { useEffect, useRef, useState } from 'react'
import { askTuteur } from '../lib/tuteur.js'

const STORAGE_KEY = 'humanome-tuteur'

/**
 * Le panneau rend du TEXTE SIMPLE (pas de parseur Markdown → surface XSS
 * réduite). Le modèle produit parfois du Markdown léger (gras, code) : on retire
 * juste les marqueurs inline pour ne pas afficher « **gras** » ou « `#/merge` »
 * tels quels. On ne touche PAS aux marqueurs de liste ni au reste du texte.
 * @param {string} text
 */
export function stripLightMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/gs, '$1') // **gras**
    .replace(/__(.+?)__/gs, '$1') // __gras__
    .replace(/`([^`]+)`/g, '$1') // `code`
}

/** Historique de session (transitoire, jamais serveur). */
function loadHistory() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    const data = raw ? JSON.parse(raw) : []
    return Array.isArray(data) ? data.filter((m) => m && typeof m.text === 'string') : []
  } catch {
    return []
  }
}

/**
 * @param {{route?: string, ask?: typeof askTuteur}} props
 *   `route` = nom de la rubrique courante (envoyée comme contexte, pas le contenu).
 */
export default function TuteurPanel({ route = '', ask = askTuteur }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState(loadHistory)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const threadRef = useRef(null)

  // Persistance session (transitoire) + auto-scroll.
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)))
    } catch {
      /* stockage indisponible : l'historique reste en mémoire */
    }
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight
  }, [messages])

  async function send(event) {
    event.preventDefault()
    const question = draft.trim()
    if (question === '' || busy) return
    setError(null)
    setDraft('')
    setMessages((m) => [...m, { role: 'user', text: question }])
    setBusy(true)
    try {
      const { text } = await ask({ question, rubrique: route })
      setMessages((m) => [...m, { role: 'assistant', text: text || 'Je n’ai pas de réponse pour l’instant.' }])
    } catch (err) {
      setError(err?.message ?? 'L’assistant est indisponible pour le moment.')
    } finally {
      setBusy(false)
    }
  }

  function clear() {
    setMessages([])
    setError(null)
  }

  return (
    <div className="tuteur">
      <button
        type="button"
        className="app-help-btn tuteur-toggle"
        aria-expanded={open}
        aria-controls="tuteur-panel"
        aria-label="Assistant : poser une question sur le site"
        title="Assistant"
        onClick={() => setOpen((v) => !v)}
      >
        💬
      </button>
      {open ? (
        <div className="tuteur-panel" id="tuteur-panel" role="dialog" aria-label="Assistant tuteur">
          <div className="tuteur-head">
            <strong>Assistant</strong>
            <button type="button" className="tuteur-close" aria-label="Fermer l’assistant" onClick={() => setOpen(false)}>
              ×
            </button>
          </div>
          <p className="tuteur-disclaimer" role="note">
            Assistant automatique (IA) : il explique par où passer sur le site. Il ne voit pas votre
            portfolio ; ne partagez pas d’informations sensibles.
          </p>
          <div className="tuteur-thread" ref={threadRef} data-testid="tuteur-thread">
            {messages.length === 0 ? (
              <p className="tuteur-empty">
                Posez une question — par exemple « comment cartographier mon texte ? » ou « à quoi sert
                le référentiel ? ».
              </p>
            ) : (
              messages.map((m, i) => (
                <p key={i} className={`tuteur-msg tuteur-msg-${m.role}`}>
                  {m.role === 'assistant' ? stripLightMarkdown(m.text) : m.text}
                </p>
              ))
            )}
            {busy ? (
              <p className="tuteur-typing" role="status" aria-live="polite">
                L’assistant écrit…
              </p>
            ) : null}
          </div>
          {error ? (
            <p className="tuteur-error load-error" role="alert">
              {error}
            </p>
          ) : null}
          <form className="tuteur-form" onSubmit={send}>
            <input
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Votre question…"
              aria-label="Votre question à l’assistant"
              maxLength={1500}
              disabled={busy}
            />
            <button type="submit" className="button" disabled={busy || draft.trim() === ''}>
              Envoyer
            </button>
            {messages.length > 0 ? (
              <button type="button" className="button" onClick={clear} disabled={busy}>
                Effacer
              </button>
            ) : null}
          </form>
        </div>
      ) : null}
    </div>
  )
}
