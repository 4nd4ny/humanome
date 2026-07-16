import { useEffect, useMemo, useRef, useState } from 'react'
import { currentRoute, dayHash, navigate, subscribe } from './router.js'
import { getDemoMerge, getReferentiel, loadDay } from './data/load.js'
import { fetchMe, logout } from './api/client.js'
import { isCurrentItem, navGroups } from './nav.js'
import { applyTheme, resolvedTheme, subscribeSystemTheme } from './lib/theme.js'
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
import EpistemiarqueView from './views/EpistemiarqueView.jsx'
import EtablissementView from './views/EtablissementView.jsx'
import AdminView from './views/AdminView.jsx'
import ConfidentialiteView from './views/ConfidentialiteView.jsx'
import GuidesView from './views/GuidesView.jsx'
import Twin9View from './views/Twin9View.jsx'
import Twin9AtelierView from './views/Twin9AtelierView.jsx'
import Twin6OuverteView from './views/Twin6OuverteView.jsx'
import CreditView from './views/CreditView.jsx'

/** Punaise : tête ronde + aiguille — bascule l'épinglage du panneau. */
function PinIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
      <circle cx="10" cy="6" r="3.2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 9.2v8.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

/** Soleil — affiché en thème CLAIR (cliquer passe au sombre). */
function SunIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="3.6" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 1.6v2.2M10 16.2v2.2M18.4 10h-2.2M3.8 10H1.6M15.9 4.1l-1.6 1.6M5.7 14.3l-1.6 1.6M15.9 15.9l-1.6-1.6M5.7 5.7 4.1 4.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Croissant de lune — affiché en thème SOMBRE (cliquer passe au clair). */
function MoonIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
      <path
        d="M16.5 11.8A6.6 6.6 0 0 1 8.2 3.5a6.6 6.6 0 1 0 8.3 8.3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Porte (cadre arrondi fermé) + flèche sortante — déconnexion. */
function LogoutIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
      <rect x="3.5" y="3.5" width="7" height="13" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M9 10h7.5M13.2 6.8l3.3 3.2-3.3 3.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

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
  // Menu « burger » : la navigation principale vit dans un panneau qui glisse
  // depuis le bord gauche de l'écran (web + mobile), pour libérer la barre.
  // `menuOpen` = ouverture transitoire (clic/tap sur le bouton, ou survol
  // desktop, ou focus clavier — ces deux derniers en CSS pur). `pinned` =
  // épinglage explicite (icône punaise DANS le panneau) : reste ouvert quel
  // que soit le survol, un clic extérieur ou un changement de route.
  const [menuOpen, setMenuOpen] = useState(false)
  // Épinglage persistant (localStorage) : le panneau « docké » survit aux
  // rechargements. Lu paresseusement pour ne pas dépendre du réseau/DOM en test.
  const [pinned, setPinned] = useState(() => {
    try {
      return localStorage.getItem('humanome-menu-pinned') === '1'
    } catch {
      return false
    }
  })
  const menuRef = useRef(null)
  const burgerRef = useRef(null)
  // Lu (pas observé) par l'effet de changement de route ci-dessous : on veut
  // la valeur la plus récente sans reprogrammer cet effet à chaque épinglage.
  const pinnedRef = useRef(false)
  useEffect(() => {
    pinnedRef.current = pinned
    try {
      if (pinned) localStorage.setItem('humanome-menu-pinned', '1')
      else localStorage.removeItem('humanome-menu-pinned')
    } catch {
      /* stockage indisponible : l'épinglage reste valable pour la session */
    }
  }, [pinned])

  // Thème clair / sombre. `theme` = thème EFFECTIF affiché ; la bascule pose un
  // choix explicite persistant. Sans choix, on suit le système (et on réagit à
  // ses changements tant que l'utilisateur n'a rien décidé).
  const [theme, setTheme] = useState(resolvedTheme)
  useEffect(() => subscribeSystemTheme(setTheme), [])
  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
  }

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

  // L'aide se ferme quand on change de rubrique. Le menu aussi, SAUF s'il est
  // épinglé (c'est tout le sens de la punaise : rester ouvert en naviguant).
  useEffect(() => setHelpOpen(false), [route.name])
  useEffect(() => {
    if (!pinnedRef.current) setMenuOpen(false)
  }, [route.name])

  // Échap ferme et désépingle dans tous les cas, et redonne le focus au
  // bouton. Un clic hors du panneau ferme la session transitoire — mais PAS
  // le panneau épinglé, qui ne se referme que par la punaise ou Échap.
  useEffect(() => {
    if (!menuOpen && !pinned) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        setPinned(false)
        burgerRef.current?.focus()
      }
    }
    const onPointerDown = (event) => {
      if (pinned) return
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [menuOpen, pinned])

  /** Fin de session : dégradation gracieuse sur copie statique (cf. AccountView). */
  async function handleLogout() {
    try {
      await logout()
    } catch {
      // logout() rafraîchit déjà la session (finally -> notifyAuthChanged) même
      // en échec réseau/API indisponible : rien de plus à faire ici.
    }
    setMenuOpen(false)
    setPinned(false)
    navigate('#/')
  }

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
    case 'activer':
      // Lien du mail de confirmation (D5) : pré-remplit l'écran d'activation.
      view = <AccountView initialActivation={{ email: route.email, code: route.code }} />
      break
    case 'account':
      // #/compte/credit -> tableau de bord crédit Twin9 + factures ; sinon compte.
      view = route.section === 'credit' ? <CreditView lib={lib} /> : <AccountView />
      break
    case 'twin9':
      view = <Twin9View section={route.section} lib={lib} />
      break
    case 'twin9atelier':
      view = <Twin9AtelierView roles={roles} />
      break
    case 'twin6ouverte':
      view = <Twin6OuverteView lib={lib} />
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
    case 'epistemiarque':
      view = <EpistemiarqueView section={route.section} lib={lib} />
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
  const authenticated = roles.length > 0

  return (
    <div className={`app${pinned ? ' is-menu-docked' : ''}`}>
      <header className="app-header">
        <div className="app-header-actions">
          <button
            type="button"
            className="app-theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'}
            title={theme === 'dark' ? 'Thème clair' : 'Thème sombre'}
          >
            {theme === 'dark' ? <MoonIcon /> : <SunIcon />}
          </button>
          <Help
            route={route.name}
            session={{ roles }}
            open={helpOpen}
            onToggle={() => setHelpOpen((v) => !v)}
            onClose={() => setHelpOpen(false)}
          />
          <div
            className={`app-menu${menuOpen ? ' is-open' : ''}${pinned ? ' is-pinned' : ''}`}
            ref={menuRef}
          >
            <button
              type="button"
              className="app-burger"
              ref={burgerRef}
              aria-expanded={menuOpen || pinned}
              aria-controls="app-nav-panel"
              aria-haspopup="menu"
              aria-label="Menu de navigation"
              onClick={() => {
                setMenuOpen((v) => !v)
                setHelpOpen(false)
              }}
            >
              <span className="app-burger-bars" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span className="app-burger-text">Menu</span>
            </button>
            <div className="app-nav-panel" id="app-nav-panel">
              <div className="app-nav-panel-head">
                <span className="app-nav-panel-title">Menu</span>
                <button
                  type="button"
                  className={`app-pin${pinned ? ' is-active' : ''}`}
                  aria-pressed={pinned}
                  aria-label={pinned ? 'Détacher le panneau' : 'Épingler le panneau ouvert'}
                  title={pinned ? 'Détacher le panneau' : 'Épingler le panneau ouvert'}
                  onClick={() => setPinned((v) => !v)}
                >
                  <PinIcon />
                </button>
              </div>
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
                {authenticated ? (
                  <div className="app-nav-logout">
                    <button type="button" className="app-logout-btn" onClick={handleLogout}>
                      <LogoutIcon />
                      Se déconnecter
                    </button>
                  </div>
                ) : null}
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
