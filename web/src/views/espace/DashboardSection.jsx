// Tableau de bord de l'espace apprenant (P8.1) : trois blocs.
//
//  - Mes portfolios : portfolio-store existant (IndexedDB locale, P7) ;
//  - Mes cartographies : ./CartographiesPanel.jsx (chantier C) chargé via le
//    pont (module absent -> message d'attente, jamais de build cassé) ;
//  - Ma formation : progression % + lien vers #/espace/formation.

import { useEffect, useMemo, useState } from 'react'
import { createPortfolioStore } from '../../lib/portfolio-store.js'
import { createTrainingStore } from '../../lib/training-store.js'
import { listChapters } from './formation-content.js'
import { loadCartographiesPanel } from './cartographies-panel-bridge.js'
import CartographyViewer from './CartographyViewer.jsx'

/** Date ISO -> « 12/07/2026 » (affichage compact des listes). */
function frShortDate(iso) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('fr-FR')
}

/**
 * @param {object} props
 * @param {{status: string, user: object | null}} props.session
 * @param {object} [props.portfolioStore] injectable (tests)
 * @param {object} [props.trainingStore] injectable (tests)
 * @param {import('react').ComponentType | null} [props.cartographiesPanel]
 *   injectable (tests) ; sinon chargé via le pont chantier C
 * @param {object} [props.lib] module sunburst (App) — visionneuse « Voir »
 * @param {Function} [props.getReferentiel] couture de test (visionneuse)
 */
export default function DashboardSection({
  session,
  portfolioStore,
  trainingStore,
  cartographiesPanel,
  lib,
  getReferentiel,
}) {
  const connected = session.status === 'authenticated'
  const pStore = useMemo(() => portfolioStore ?? createPortfolioStore(), [portfolioStore])
  const tStore = useMemo(() => trainingStore ?? createTrainingStore(), [trainingStore])
  const chapters = useMemo(() => listChapters(), [])

  const [portfolios, setPortfolios] = useState(null) // null = chargement
  const [portfolioError, setPortfolioError] = useState(null)
  const [doneChapters, setDoneChapters] = useState(0)
  const [Panel, setPanel] = useState(() => cartographiesPanel ?? null)
  const [panelMissing, setPanelMissing] = useState(false)
  const [opened, setOpened] = useState(null) // {document, entry} | null (« Voir »)

  useEffect(() => {
    let alive = true
    pStore
      .list()
      .then((records) => alive && setPortfolios(records))
      .catch((err) => {
        if (!alive) return
        setPortfolios([])
        setPortfolioError(err?.message ?? 'Portfolios locaux illisibles.')
      })
    return () => {
      alive = false
    }
  }, [pStore])

  useEffect(() => {
    let alive = true
    tStore
      .load({ connected })
      .then(({ chapitres }) => {
        if (!alive) return
        const slugs = new Set(chapters.map((c) => c.slug))
        setDoneChapters(chapitres.filter((c) => slugs.has(c)).length)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [tStore, connected, chapters])

  useEffect(() => {
    if (cartographiesPanel) return undefined
    let alive = true
    loadCartographiesPanel().then((Component) => {
      if (!alive) return
      if (Component) setPanel(() => Component)
      else setPanelMissing(true)
    })
    return () => {
      alive = false
    }
  }, [cartographiesPanel])

  const percent =
    chapters.length > 0 ? Math.round((doneChapters / chapters.length) * 100) : 0

  // « Voir » (onOpen du CartographiesPanel, chantier C) : la visionneuse
  // remplace le tableau de bord, le bouton retour restaure les trois blocs.
  if (opened) {
    return (
      <CartographyViewer
        document={opened.document}
        entry={opened.entry}
        onClose={() => setOpened(null)}
        lib={lib}
        {...(getReferentiel ? { getReferentiel } : {})}
      />
    )
  }

  return (
    <div className="espace-dashboard">
      <section className="espace-bloc" aria-label="Mes portfolios">
        <h2>Mes portfolios</h2>
        {portfolios === null ? (
          <p>Chargement…</p>
        ) : portfolios.length === 0 ? (
          <p>
            Aucun portfolio local pour l’instant.{' '}
            <a href="#/portfolio">Créer un portfolio</a> (collage, fichier ou Google Docs —
            il ne quitte jamais votre navigateur).
          </p>
        ) : (
          <ul className="espace-portfolios" data-testid="espace-portfolios">
            {portfolios.map((p) => (
              <li key={p.id}>
                <strong>{p.titre}</strong> — {p.segments?.length ?? 0} journée(s), modifié le{' '}
                {frShortDate(p.updatedAt)}{' '}
                <a href="#/espace/nouveau-run">Lancer un run</a>
              </li>
            ))}
          </ul>
        )}
        {portfolioError ? (
          <p role="alert" className="load-error">
            {portfolioError}
          </p>
        ) : null}
        <p>
          <a className="button" href="#/portfolio">
            Gérer mes portfolios
          </a>{' '}
          <a className="button button-primary" href="#/espace/nouveau-run">
            Nouveau run de cartographie
          </a>
        </p>
      </section>

      <section className="espace-bloc" aria-label="Mes cartographies">
        <h2>Mes cartographies</h2>
        {Panel ? (
          <Panel
            session={session}
            portfolioStore={pStore}
            onOpen={(document, entry) => setOpened({ document, entry })}
          />
        ) : panelMissing ? (
          <p data-testid="carto-panel-missing">
            Le panneau des cartographies (confidentialité, partage, export) arrive avec le
            jalon M6 — vos documents restent dans ce navigateur en attendant.
          </p>
        ) : (
          <p>Chargement…</p>
        )}
      </section>

      <section className="espace-bloc" aria-label="Mes cohortes">
        <h2>Mes cohortes</h2>
        <p data-testid="dashboard-cohortes">
          Votre établissement vous a transmis un code d’invitation ? Rejoignez sa cohorte (avec
          votre consentement explicite) et déposez-y votre portfolio pour la cartographie de
          masse.
        </p>
        <p>
          <a className="button" href="#/espace/cohortes">
            Gérer mes cohortes
          </a>
        </p>
      </section>

      <section className="espace-bloc" aria-label="Ma formation">
        <h2>Ma formation</h2>
        <p data-testid="dashboard-formation">
          {doneChapters} / {chapters.length} chapitres terminés ({percent} %).
        </p>
        <p>
          <a className="button" href="#/espace/formation">
            Suivre la formation « mode expert »
          </a>
        </p>
        {!connected ? (
          <p className="privacy-note">
            Progression locale à ce navigateur — <a href="#/compte">connectez-vous</a> pour la
            rattacher à votre compte.
          </p>
        ) : null}
      </section>
    </div>
  )
}
