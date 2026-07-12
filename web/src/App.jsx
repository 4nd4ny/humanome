import { useEffect, useMemo, useState } from 'react'
import { currentRoute, dayHash, navigate, subscribe } from './router.js'
import { getDemoMerge, getReferentiel, loadDay } from './data/load.js'
import HomeView from './views/HomeView.jsx'
import MergeView from './views/MergeView.jsx'
import DayView from './views/DayView.jsx'
import ReferentielView from './views/ReferentielView.jsx'
import AccountView from './views/AccountView.jsx'

/**
 * Shell applicatif : routeur hash (ADR-009) -> vues, données de démonstration
 * embarquées + documents chargés localement par l'utilisateur (rien ne quitte
 * le navigateur, cahier §6).
 *
 * @param {{lib?: object}} props sunburst lib module (injecté dans les tests)
 */
export default function App({ lib }) {
  const [route, setRoute] = useState(currentRoute)
  const [userMerge, setUserMerge] = useState(null)
  const [userDays, setUserDays] = useState(() => new Map())

  useEffect(() => subscribe(setRoute), [])

  // Impression : une cartographie = un document. Les navigateurs ne rendent
  // pas le contenu des <details> fermés ; on les ouvre le temps de
  // l'impression (bouton « Imprimer » comme Cmd/Ctrl+P passent par
  // beforeprint), puis on restaure l'état de lecture.
  useEffect(() => {
    const opened = []
    const onBeforePrint = () => {
      for (const details of document.querySelectorAll('details:not([open])')) {
        details.open = true
        opened.push(details)
      }
    }
    const onAfterPrint = () => {
      while (opened.length > 0) opened.pop().open = false
    }
    window.addEventListener('beforeprint', onBeforePrint)
    window.addEventListener('afterprint', onAfterPrint)
    return () => {
      window.removeEventListener('beforeprint', onBeforePrint)
      window.removeEventListener('afterprint', onAfterPrint)
    }
  }, [])

  const referentiel = getReferentiel()
  const mergeDoc = userMerge ?? getDemoMerge()
  const days = useMemo(() => {
    const set = new Set((mergeDoc?.feuilles ?? []).map((f) => f.iso ?? f.date))
    for (const iso of userDays.keys()) set.add(iso)
    return [...set].sort()
  }, [mergeDoc, userDays])

  const getDay = useMemo(
    () => (iso) => (userDays.has(iso) ? Promise.resolve(userDays.get(iso)) : loadDay(iso)),
    [userDays],
  )

  function handleUserDocument({ kind, doc }) {
    if (kind === 'cartographie-merge') {
      setUserMerge(doc)
      navigate('#/merge')
    } else {
      setUserDays((current) => new Map(current).set(doc.date, doc))
      navigate(dayHash(doc.date))
    }
  }

  let view
  switch (route.name) {
    case 'merge':
      view = <MergeView mergeDoc={mergeDoc} referentiel={referentiel} lib={lib} />
      break
    case 'day':
      view = (
        <DayView
          date={route.date}
          focus={route.focus}
          referentiel={referentiel}
          days={days}
          getDay={getDay}
          lib={lib}
        />
      )
      break
    case 'referentiel':
      view = <ReferentielView focusCode={route.code} />
      break
    case 'account':
      view = <AccountView />
      break
    case 'not-found':
      view = (
        <div className="not-found">
          <p role="alert">
            Page introuvable : <code>#{route.hash}</code>
          </p>
          <p>
            <a href="#/">Retour à l’accueil</a>
          </p>
        </div>
      )
      break
    default:
      view = <HomeView onUserDocument={handleUserDocument} />
  }

  return (
    <div className="app">
      <header className="app-header">
        <a className="app-brand" href="#/">
          humanome.xyz
        </a>
        <nav aria-label="Navigation principale">
          <a href="#/merge">Cartographie</a>
          <a href="#/referentiel">Référentiel</a>
          <a href="#/compte">Compte</a>
        </nav>
      </header>
      <main className="app-main">{view}</main>
      <footer className="app-footer">
        <p>
          Cartographie de compétences humaines — écosystème RESPIRE, Harmonia Éducation ·{' '}
          <a href="https://participer.harmonia.education" rel="noreferrer">
            participer.harmonia.education
          </a>
        </p>
      </footer>
    </div>
  )
}
