import { useMemo, useState } from 'react'
import Sunburst from '../components/Sunburst.jsx'
import DetailsPanel from '../components/DetailsPanel.jsx'
import HeatmapCalendar from '../components/HeatmapCalendar.jsx'
import StatBadges from '../components/StatBadges.jsx'
import ViewToolbar from '../components/ViewToolbar.jsx'
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

  function handleSelect(meta) {
    setSelectedMeta(meta)
    if (meta) setActiveTab('details') // tap = sélection -> détail lisible à une main
  }

  const layout = useMemo(() => {
    if (!lib || !mergeDoc) return null
    return lib.layoutSunburst(lib.buildMergeTree(mergeDoc), { size })
  }, [lib, mergeDoc, size])

  const totalCompetences = referentiel?.competences?.length ?? 61
  const selection = useMemo(() => findMergeNode(mergeDoc, selectedMeta), [mergeDoc, selectedMeta])

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
          <HeatmapCalendar
            feuilles={mergeDoc?.feuilles ?? []}
            evolution={mergeDoc?.profilMeta?.evolution_globale ?? []}
          />
        </div>
        <div className="panel-zone">{panel}</div>
      </div>
    </div>
  )
}
