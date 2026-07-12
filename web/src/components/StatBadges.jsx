import { frenchDate } from '../data/load.js'

/**
 * Header statistics of the merge view.
 * @param {{mergeDoc: object, totalCompetences?: number}} props
 */
export default function StatBadges({ mergeDoc, totalCompetences = 61 }) {
  const periode = mergeDoc?.periode ?? {}
  const meta = mergeDoc?.profilMeta ?? {}
  const items = [
    { label: 'Feuilles de portfolio', value: String(periode.nbFeuilles ?? meta.nb_feuilles ?? '—') },
    {
      label: 'Période',
      value:
        periode.premiere && periode.derniere
          ? `${frenchDate(periode.premiere)} → ${frenchDate(periode.derniere)}`
          : '—',
    },
    {
      label: 'Compétences établies',
      value:
        meta.competences_etablies != null
          ? `${meta.competences_etablies} / ${totalCompetences}`
          : '—',
    },
  ]

  return (
    <ul className="stat-badges">
      {items.map(({ label, value }) => (
        <li key={label} className="stat-badge">
          <span className="stat-badge-value">{value}</span>
          <span className="stat-badge-label">{label}</span>
        </li>
      ))}
    </ul>
  )
}
