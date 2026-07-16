import { useMemo, useState } from 'react'
import Sunburst from '../components/Sunburst.jsx'
import DetailsPanel from '../components/DetailsPanel.jsx'
import HeatmapCalendar from '../components/HeatmapCalendar.jsx'
import StatBadges from '../components/StatBadges.jsx'
import TimelinePlayer from '../components/TimelinePlayer.jsx'
import ViewToolbar from '../components/ViewToolbar.jsx'
import { finalThresholds, mergeDocAsOf } from '../lib/sunburst/as-of.js'
import { NIVEAU_LABELS, useDiagramSize, useSunburstLib } from './view-helpers.js'

/** Resolves a sector meta against the merge document. */
export function findMergeNode(mergeDoc, meta) {
  if (!mergeDoc || !meta) return null
  const domains = mergeDoc.domains ?? []
  if (meta.kind === 'pole') {
    const domain = domains.find((d) => d.id === meta.id || d.id === meta.domainId)
    return domain ? { kind: 'pole', domain } : null
  }
  if (meta.kind === 'competence') {
    for (const domain of domains) {
      const competence = (domain.competences ?? []).find(
        (c) => (meta.code && c.code === meta.code) || c.id === meta.id,
      )
      if (competence) return { kind: 'competence', domain, competence }
    }
  }
  return null
}

function ProfileSummary({ profilMeta, totalCompetences }) {
  if (!profilMeta) return null
  const lines = [
    ['Compétences établies', `${profilMeta.competences_etablies} / ${totalCompetences}`],
    ['En renvoi (entretien)', String(profilMeta.competences_renvoyees ?? 0)],
    ['Compétences émergentes', String(profilMeta.competences_orphelines ?? 0)],
    ['Score total', String(Math.round(profilMeta.score_total ?? 0))],
  ]
  if (profilMeta.ponderation_temporelle) {
    lines.push([
      'Pondération temporelle',
      `-${Math.round(profilMeta.ponderation_temporelle.decote_annuelle * 100)} %/an`,
    ])
  }
  return (
    <dl className="profile-summary">
      {lines.map(([label, value]) => (
        <div key={label} className="stat-line">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Vue chronologique (merge) : sunburst cumulé + panneau détails, heatmap de
 * navigation sous le diagramme.
 *
 * @param {{
 *   mergeDoc: object,
 *   referentiel?: object,
 *   lib?: object,  // sunburst lib module (injected in tests)
 * }} props
 */
export default function MergeView({ mergeDoc, referentiel, lib: injectedLib }) {
  const { lib, error: libError } = useSunburstLib(injectedLib)
  const size = useDiagramSize()
  const [selectedMeta, setSelectedMeta] = useState(null)
  const [hoveredMeta, setHoveredMeta] = useState(null)
  // Onglet actif sous 768px (CSS seule masque la zone inactive : les deux
  // zones restent dans le DOM, pour le desktop et pour l'impression).
  const [activeTab, setActiveTab] = useState('diagramme')

  // Timeline (chantier C) : une trame par feuille (0..N-1), vue finale par
  // défaut (dernière trame = document publié tel quel, parité garantie).
  const feuilles = mergeDoc?.feuilles ?? []
  const lastFrame = Math.max(0, feuilles.length - 1)
  const [frameIndex, setFrameIndex] = useState(lastFrame)
  const frame = Math.min(Math.max(0, frameIndex), lastFrame)

  function handleSelect(meta) {
    setSelectedMeta(meta)
    if (meta) setActiveTab('details') // tap = sélection -> détail lisible à une main
  }

  // Seuils de niveau FIXES, calculés une seule fois sur le document final
  // (la dernière trame reproduit exactement le merge publié, et les niveaux
  // ne scintillent pas au fil des trames).
  const thresholds = useMemo(() => (mergeDoc ? finalThresholds(mergeDoc) : []), [mergeDoc])

  // Les N documents cumulés (cascade de useMemo : docs -> arbres -> layout).
  // La DERNIÈRE trame est le document d'origine lui-même : trame 58 == vue
  // actuelle, à l'identique (parité 331).
  const frameDocs = useMemo(() => {
    if (!mergeDoc || feuilles.length === 0) return null
    return feuilles.map((f, i) =>
      i === feuilles.length - 1 ? mergeDoc : mergeDocAsOf(mergeDoc, f.iso ?? f.date, { thresholds }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mergeDoc, thresholds])

  const trees = useMemo(() => {
    if (!lib || !mergeDoc) return null
    if (!frameDocs) return [lib.buildMergeTree(mergeDoc)]
    return frameDocs.map((doc) => lib.buildMergeTree(doc))
  }, [lib, mergeDoc, frameDocs])

  const layout = useMemo(() => {
    if (!trees) return null
    const tree = trees[Math.min(frame, trees.length - 1)]
    return tree ? lib.layoutSunburst(tree, { size }) : null
  }, [lib, trees, frame, size])

  // Nb de compétences SUR LA CARTE par trame (cumul monotone 11 -> 54) : le
  // compteur qui accompagne la construction du diagramme, compté sur les
  // documents de trame déjà précalculés (coût nul, indépendant de la lib).
  const cumulativeCounts = useMemo(() => {
    if (!frameDocs) return []
    return frameDocs.map((doc) =>
      (doc?.domains ?? []).reduce((n, domain) => n + (domain.competences?.length ?? 0), 0),
    )
  }, [frameDocs])

  const totalCompetences = referentiel?.competences?.length ?? 61
  // Quand frameIndex < dernière trame, la sélection se résout dans le document
  // de la trame courante (agrégats cumulés à cette date), sinon dans le final.
  const frameDoc = frameDocs ? frameDocs[frame] : mergeDoc
  const selection = useMemo(() => findMergeNode(frameDoc, selectedMeta), [frameDoc, selectedMeta])

  let panel
  if (selection?.kind === 'competence') {
    const { domain, competence } = selection
    const niveauLabel = NIVEAU_LABELS[competence.niveau]
    panel = (
      <DetailsPanel
        title={competence.id}
        titleColor={domain.color}
        description={competence.description}
        html={competence.feedback}
      >
        <p className="details-meta">
          {niveauLabel ? `Niveau ${competence.niveau} — ${niveauLabel}` : null}
          {niveauLabel && competence.points != null ? ' · ' : null}
          {competence.points != null ? `${competence.points} points` : null}
        </p>
        {competence.archetype_titre ? (
          <p className="details-archetype">
            <strong>{competence.archetype_titre}</strong>
            {competence.archetype_description ? ` — ${competence.archetype_description}` : ''}
          </p>
        ) : null}
      </DetailsPanel>
    )
  } else if (selection?.kind === 'pole') {
    const { domain } = selection
    const competences = domain.competences ?? []
    const etablies = competences.filter((c) => c.statut === 'présence établie').length
    const renvois = competences.filter((c) => c.niveau === -1).length
    let description = `${competences.length} compétences dans ce pôle`
    if (etablies > 0) description += ` — ${etablies} établie${etablies > 1 ? 's' : ''}`
    if (renvois > 0) description += `, ${renvois} en renvoi`
    description += '. Sélectionnez une compétence pour le détail.'
    panel = (
      <DetailsPanel
        title={domain.id}
        titleColor={domain.color}
        description={description}
        html={domain.rapport_html}
      >
        {domain.tendance_titre ? (
          <p className="details-archetype">
            <strong>{domain.tendance_titre}</strong>
            {domain.tendance_description ? ` — ${domain.tendance_description}` : ''}
          </p>
        ) : null}
      </DetailsPanel>
    )
  } else {
    panel = (
      <DetailsPanel html={mergeDoc?.narratifs?.kairosHtml}>
        <p className="details-hint">
          Touchez un secteur du diagramme pour voir le détail et les traces.
        </p>
        <ProfileSummary profilMeta={mergeDoc?.profilMeta} totalCompetences={totalCompetences} />
      </DetailsPanel>
    )
  }

  return (
    <div className="merge-view">
      <StatBadges mergeDoc={mergeDoc} totalCompetences={totalCompetences} />
      <ViewToolbar activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="view-layout" data-tab={activeTab}>
        <div className="diagram-zone">
          <div className="hover-overlay" aria-hidden="true">
            {hoveredMeta?.id ?? ''}
          </div>
          {layout ? (
            <Sunburst
              layout={layout}
              selectedId={selectedMeta?.id ?? null}
              onSelect={handleSelect}
              onHover={setHoveredMeta}
              label="Cartographie cumulée des compétences"
            />
          ) : (
            <p className="diagram-placeholder" data-testid="diagram-status">
              {libError ? libError.message : 'Préparation du diagramme…'}
            </p>
          )}
          {feuilles.length > 1 && trees ? (
            <TimelinePlayer
              feuilles={feuilles}
              frameIndex={frame}
              onFrameChange={setFrameIndex}
              evolution={mergeDoc?.profilMeta?.evolution_globale ?? []}
              cumulative={cumulativeCounts}
              // Lecture en pause dès qu'un secteur est sélectionné ou survolé :
              // le re-render à chaque trame perdrait le focus et la lecture
              // du panneau de détails.
              suspended={selectedMeta != null || hoveredMeta != null}
            />
          ) : null}
          <HeatmapCalendar
            feuilles={mergeDoc?.feuilles ?? []}
            evolution={mergeDoc?.profilMeta?.evolution_globale ?? []}
            // D4 — synchro : la heatmap se construit avec la carte pendant
            // l'animation. À la dernière trame (défaut), currentDate = dernière
            // feuille -> tout est visible ; sans timeline, pas de synchro.
            currentDate={feuilles.length > 1 ? (feuilles[frame]?.iso ?? feuilles[frame]?.date ?? null) : null}
          />
        </div>
        <div className="panel-zone">{panel}</div>
      </div>
    </div>
  )
}
