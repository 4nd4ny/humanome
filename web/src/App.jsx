import { useEffect, useMemo, useRef, useState } from 'react'
import { currentRoute, dayHash, navigate, subscribe } from './router.js'
import { getDemoMerge, getReferentiel, loadDay } from './data/load.js'
import { fetchMe } from './api/client.js'
import { isCurrentItem, navGroups } from './nav.js'
import Help from './help/Help.jsx'
import HomeView from './views/HomeView.jsx'
import MergeView from './views/MergeView.jsx'
import DayView from './views/DayView.jsx'
import ReferentielView from './views/ReferentielView.jsx'
import EssayerView from './views/EssayerView.jsx'
import PortfolioView from './views/PortfolioView.jsx'
import AccountView from './views/AccountView.jsx'
import EspaceView from './views/EspaceView.jsx'
import ShareView from './views/ShareView.jsx'
import CartographeView from './views/CartographeView.jsx'
import PromptologueView from './views/PromptologueView.jsx'
import EtablissementView from './views/EtablissementView.jsx'
import AdminView from './views/AdminView.jsx'
import ConfidentialiteView from './views/ConfidentialiteView.jsx'
import GuidesView from './views/GuidesView.jsx'
import Twin9View from './views/Twin9View.jsx'
import CreditView from './views/CreditView.jsx'

/**
 * Shell applicatif : routeur hash (ADR-009) -> vues, données de démonstration
 * embarquées + documents chargés localement par l'utilisateur (rien ne quitte
 * le navigateur, cahier §6).
 *
 * @param {{lib?: object}} props sunburst lib module (injecté dans les tests)
 */
export default function App({ lib, fetchMeFn = fetchMe }) {
  const [route, setRoute] = useState(currentRoute)
  const [userMerge, setUserMerge] = useState(null)
  const [userDays, setUserDays] = useState(() => new Map())
  // Session au niveau du shell : sert UNIQUEMENT à adapter la navigation au
  // rôle (item 3). Les vues gardent leur propre garde (défense en profondeur).
  // roles = [] pour un visiteur ou une copie statique — la nav « Découvrir »
  // reste toujours affichée.
  const [roles, setRoles] = useState([])
  const [helpOpen, setHelpOpen] = useState(false)
  // Menu « burger » : la navigation principale vit dans un panneau déroulant
  // (web + mobile) pour libérer la barre. Ouverture épinglée au clic/tap ;
  // survol (desktop) et focus clavier la révèlent de façon transitoire (CSS).
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const burgerRef = useRef(null)

  useEffect(() => subscribe(setRoute), [])

  // Rafraîchit les rôles au démarrage et à chaque changement de session
  // (événement émis par login/logout/register/suppression, api/client.js).
  useEffect(() => {
    let alive = true
    const refresh = () => {
      fetchMeFn()
        .then(({ user }) => {
          if (alive) setRoles(Array.isArray(user?.roles) ? user.roles : [])
        })
        .catch(() => {
          if (alive) setRoles([])
        })
    }
    refresh()
    window.addEventListener('humanome:auth', refresh)
    return () => {
      alive = false
      window.removeEventListener('humanome:auth', refresh)
    }
  }, [fetchMeFn])

  // L'aide et le menu se ferment quand on change de rubrique.
  useEffect(() => setHelpOpen(false), [route.name])
  useEffect(() => setMenuOpen(false), [route.name])

  // Menu épinglé : Échap ferme et redonne le focus au bouton ; un clic hors du
  // menu ferme aussi. (Le survol/focus rouvre de manière transitoire, CSS.)
  useEffect(() => {
    if (!menuOpen) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        burgerRef.current?.focus()
      }
    }
    const onPointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [menuOpen])

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
    case 'essayer':
      view = <EssayerView lib={lib} />
      break
    case 'portfolio':
      view = <PortfolioView />
      break
    case 'account':
      // #/compte/credit -> tableau de bord crédit Twin_v9 + factures ; sinon compte.
      view = route.section === 'credit' ? <CreditView lib={lib} /> : <AccountView />
      break
    case 'twin9':
      view = <Twin9View section={route.section} lib={lib} />
      break
    case 'espace':
      view = <EspaceView section={route.section} lib={lib} />
      break
    case 'share':
      view = <ShareView token={route.token} lib={lib} />
      break
    case 'cartographe':
      view = <CartographeView section={route.section} lib={lib} />
      break
    case 'promptologue':
      view = <PromptologueView section={route.section} lib={lib} />
      break
    case 'etablissement':
      view = <EtablissementView section={route.section} lib={lib} />
      break
    case 'admin':
      view = <AdminView section={route.section} lib={lib} />
      break
    case 'confidentialite':
      view = <ConfidentialiteView />
      break
    case 'guides':
      view = <GuidesView parcours={route.parcours} chapter={route.chapter} />
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
      view = <HomeView onUserDocument={handleUserDocument} roles={roles} />
  }

  const groups = navGroups({ roles })

  return (
    <div className="app">
      <header className="app-header">
        <a className="app-brand" href="#/">
          humanome.xyz
        </a>
        <div className="app-header-actions">
          <Help
            route={route.name}
            session={{ roles }}
            open={helpOpen}
            onToggle={() => setHelpOpen((v) => !v)}
            onClose={() => setHelpOpen(false)}
          />
          <div className={`app-menu${menuOpen ? ' is-open' : ''}`} ref={menuRef}>
            <button
              type="button"
              className="app-burger"
              ref={burgerRef}
              aria-expanded={menuOpen}
              aria-controls="app-nav-panel"
              aria-haspopup="menu"
              aria-label="Menu de navigation"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span className="app-burger-bars" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span className="app-burger-text">Menu</span>
            </button>
            <div className="app-nav-panel" id="app-nav-panel">
              <nav className="app-nav" aria-label="Navigation principale">
                {groups.map((family) => (
                  // role=group : un div nu n'expose pas son aria-label aux
                  // lecteurs d'écran (nommage interdit sur role générique).
                  <div className="app-nav-group" key={family.id} role="group" aria-label={family.label}>
                    <span className="app-nav-group-label" aria-hidden="true">
                      {family.label}
                    </span>
                    {family.items.map((item) => (
                      <a
                        key={`${item.href} ${item.label}`}
                        href={item.href}
                        aria-current={isCurrentItem(item, route) ? 'page' : undefined}
                      >
                        {item.label}
                        {item.badge ? <span className={`value-badge value-badge-${item.badge}`}>{item.badge}</span> : null}
                      </a>
                    ))}
                  </div>
                ))}
              </nav>
            </div>
          </div>
        </div>
      </header>
      <main className="app-main">{view}</main>
      <footer className="app-footer">
        <p>
          Cartographie de compétences humaines — écosystème RESPIRE, Harmonia Éducation ·{' '}
          <a href="#/confidentialite">Confidentialité</a> ·{' '}
          <a href="https://participer.harmonia.education" rel="noreferrer">
            participer.harmonia.education
          </a>
        </p>
      </footer>
    </div>
  )
}
