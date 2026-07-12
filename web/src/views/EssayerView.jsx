import { useEffect, useMemo, useRef, useState } from 'react'
import { extractDay } from '@engine/pipeline/extract.js'
import DayView from './DayView.jsx'
import { loadPublishedReferentiel } from '../data/referentiel.js'
import {
  DEMO_MAX_TOKENS,
  DEMO_MODEL,
  DEMO_TEXT_MAX_CHARS,
  DEMO_TEXT_MIN_CHARS,
  createDemoProvider,
  describeDemoError,
  isAbortError,
  localIsoToday,
} from '../lib/demo-llm.js'

/** Groups thousands with a narrow space: 12000 -> « 12 000 ». */
function formatInt(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

const PHASE_LABELS = {
  challenge: 'obtention du défi anti-robot…',
  pow: 'résolution du défi anti-robot…',
  llm: 'analyse par le modèle de langage…',
}

/**
 * Page publique « Essayer » (P6, cahier §3.1) : coller un texte libre,
 * le cartographier EN DIRECT comme une journée unique avec le moteur réel
 * (engine extractDay, 7 appels pôle + 1 kairos via le proxy plateforme),
 * puis afficher le résultat avec la vue journée existante.
 *
 * AUCUNE persistance d'aucune sorte (ni localStorage ni IndexedDB) : le texte
 * et le résultat ne vivent que dans l'état React — un rechargement efface tout,
 * et l'interface le dit explicitement.
 *
 * @param {{lib?: object, fetchFn?: typeof fetch}} props sunburst lib et fetch
 *   injectables (tests, même motif que data/load.js)
 */
export default function EssayerView({ lib, fetchFn }) {
  const [text, setText] = useState('')
  const [phase, setPhase] = useState('edit') // 'edit' | 'running' | 'done'
  const [error, setError] = useState(null) // {kind, message, canRetry} | null
  const [notice, setNotice] = useState(null)
  const [doneCalls, setDoneCalls] = useState(0)
  const [callPhase, setCallPhase] = useState(null) // 'challenge'|'pow'|'llm'|null
  const [result, setResult] = useState(null)
  const [runDate, setRunDate] = useState(null)
  const [referentiel, setReferentiel] = useState(null)
  const controllerRef = useRef(null)

  // Référentiel courant (dernière version publiée, repli embarqué garanti).
  useEffect(() => {
    let active = true
    loadPublishedReferentiel().then(({ doc }) => active && setReferentiel(doc))
    return () => {
      active = false
    }
  }, [])

  // Une navigation qui démonte la vue annule l'analyse en cours.
  useEffect(() => () => controllerRef.current?.abort(), [])

  const trimmedLength = text.trim().length
  const tooShort = trimmedLength > 0 && trimmedLength < DEMO_TEXT_MIN_CHARS
  const tooLong = text.length > DEMO_TEXT_MAX_CHARS
  const ready = referentiel !== null && trimmedLength >= DEMO_TEXT_MIN_CHARS && !tooLong

  const steps = useMemo(() => {
    const poles = [...(referentiel?.poles ?? [])].sort((a, b) => a.num - b.num)
    return [
      ...poles.map((p) => ({ key: `pole-${p.num}`, label: p.nom, couleur: p.couleur })),
      { key: 'kairos', label: 'Synthèse kairos (lecture transversale)', couleur: null },
    ]
  }, [referentiel])

  const getDay = useMemo(() => (result ? () => Promise.resolve(result) : null), [result])

  async function run() {
    if (!ready || phase === 'running') return
    const controller = new AbortController()
    controllerRef.current = controller
    const date = localIsoToday()
    setPhase('running')
    setError(null)
    setNotice(null)
    setResult(null)
    setDoneCalls(0)
    setCallPhase(null)
    setRunDate(date)
    try {
      const { provider, prime } = createDemoProvider({ fetchFn, onPhase: setCallPhase })
      // La première preuve de travail est résolue AVANT le premier appel LLM.
      await prime(controller.signal)
      const doc = await extractDay({
        dayText: text.trim(),
        date,
        referentiel,
        provider,
        model: DEMO_MODEL,
        maxTokens: DEMO_MAX_TOKENS,
        signal: controller.signal,
        onProgress: ({ done }) => setDoneCalls(done),
      })
      setResult(doc)
      setPhase('done')
    } catch (err) {
      setPhase('edit')
      if (controller.signal.aborted || isAbortError(err)) {
        setNotice('Analyse annulée. Votre texte est toujours là, rien n’a été conservé.')
      } else {
        setError(describeDemoError(err))
      }
    } finally {
      controllerRef.current = null
    }
  }

  function cancel() {
    controllerRef.current?.abort()
  }

  function restart() {
    setResult(null)
    setRunDate(null)
    setNotice(null)
    setError(null)
    setPhase('edit')
  }

  if (phase === 'done' && result && getDay) {
    return (
      <div className="essayer">
        <div className="demo-banner" role="status" data-testid="demo-banner">
          <p>
            <strong>Démo :</strong> ce résultat n’est pas conservé — il disparaîtra si vous
            rechargez ou quittez la page. Vous pouvez le générer en PDF via « Imprimer ».
          </p>
          <p className="demo-banner-actions">
            <button type="button" className="button" onClick={() => window.print()}>
              Imprimer
            </button>
            <button type="button" className="button" onClick={restart}>
              Cartographier un autre texte
            </button>
          </p>
        </div>
        <DayView
          date={runDate}
          referentiel={referentiel}
          days={[runDate]}
          getDay={getDay}
          lib={lib}
        />
      </div>
    )
  }

  if (phase === 'running') {
    const current = Math.min(doneCalls, steps.length - 1)
    return (
      <div className="essayer">
        <h1>Essayer avec votre propre texte</h1>
        <p role="status" className="essayer-progress" data-testid="essayer-progress">
          Cartographie en cours — appel {Math.min(doneCalls + 1, steps.length)} sur{' '}
          {steps.length}. Chaque pôle du référentiel est instruit séparément, puis une synthèse
          transversale est produite.
        </p>
        <ol className="essayer-steps" data-testid="essayer-steps">
          {steps.map((step, index) => {
            const state = index < doneCalls ? 'done' : index === current ? 'active' : 'pending'
            return (
              <li key={step.key} className={`essayer-step essayer-step-${state}`}>
                <span
                  className="essayer-step-chip"
                  style={step.couleur ? { backgroundColor: step.couleur } : undefined}
                  aria-hidden="true"
                />
                <span className="essayer-step-label">{step.label}</span>
                {state === 'done' ? <span aria-label="terminé"> ✓</span> : null}
                {state === 'active' && callPhase ? (
                  <span className="essayer-step-phase"> — {PHASE_LABELS[callPhase]}</span>
                ) : null}
              </li>
            )
          })}
        </ol>
        <p>
          <button type="button" className="button" onClick={cancel}>
            Annuler l’analyse
          </button>
        </p>
        <p className="privacy-note">
          Rien n’est conservé : ni votre texte, ni le résultat. Le serveur ne journalise que des
          compteurs anti-abus, jamais le contenu.
        </p>
      </div>
    )
  }

  return (
    <div className="essayer">
      <h1>Essayer avec votre propre texte</h1>
      <p className="essayer-lead">
        Collez une page de journal de bord, un extrait de portfolio réflexif ou tout texte
        personnel : la plateforme le cartographie en direct sur le référentiel RESPIRE
        (7 pôles instruits un par un, puis une synthèse transversale), avec un modèle de
        langage fourni par la plateforme.
      </p>
      <p className="privacy-note">
        Démonstration sans compte et sans aucune conservation : votre texte et le résultat ne
        sont stockés nulle part — ni sur nos serveurs (compteurs anti-abus uniquement, jamais le
        contenu), ni dans votre navigateur. Si vous rechargez la page, il faudra recoller le
        texte.
      </p>

      {notice ? (
        <p role="status" className="essayer-notice">
          {notice}
        </p>
      ) : null}

      {error ? (
        <div role="alert" className="load-error essayer-error">
          <p>{error.message}</p>
          {error.canRetry ? (
            <p>
              <button type="button" className="button" onClick={run} disabled={!ready}>
                Réessayer
              </button>
            </p>
          ) : null}
        </div>
      ) : null}

      <textarea
        className="essayer-textarea"
        aria-label="Texte à cartographier"
        placeholder="Collez ici votre texte (par exemple une journée de journal de bord)…"
        value={text}
        maxLength={DEMO_TEXT_MAX_CHARS * 2}
        onChange={(event) => setText(event.target.value)}
        rows={12}
      />
      <p className={`char-counter${tooLong ? ' char-counter-over' : ''}`} data-testid="char-counter">
        {formatInt(text.length)} / {formatInt(DEMO_TEXT_MAX_CHARS)} caractères
      </p>
      {tooShort ? (
        <p className="essayer-hint" data-testid="text-too-short">
          Texte trop court pour une cartographie : ajoutez encore quelques phrases (au moins{' '}
          {formatInt(DEMO_TEXT_MIN_CHARS)} caractères).
        </p>
      ) : null}
      {tooLong ? (
        <p className="essayer-hint" data-testid="text-too-long">
          Texte trop long pour la démo : réduisez-le à {formatInt(DEMO_TEXT_MAX_CHARS)} caractères
          maximum (retirez {formatInt(text.length - DEMO_TEXT_MAX_CHARS)} caractères).
        </p>
      ) : null}
      <p>
        <button
          type="button"
          className="button button-primary"
          onClick={run}
          disabled={!ready}
        >
          Cartographier ce texte
        </button>
      </p>
    </div>
  )
}
