// Toolbar shared by the merge and day views: the mobile tab switcher
// (Diagramme / Détails, shown under 768px by CSS only — both zones stay in
// the DOM) and the print button. Toggle buttons use aria-pressed: this is a
// display switch, not a full ARIA tabs widget (both panels remain visible on
// desktop where the switcher is hidden).

const TABS = [
  ['diagramme', 'Diagramme'],
  ['details', 'Détails'],
]

/**
 * @param {{
 *   activeTab: 'diagramme' | 'details',
 *   onTabChange: (tab: string) => void,
 * }} props
 */
export default function ViewToolbar({ activeTab, onTabChange }) {
  return (
    <div className="view-toolbar">
      <div className="view-tabs" aria-label="Affichage de la cartographie">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`view-tab${activeTab === id ? ' view-tab-active' : ''}`}
            aria-pressed={activeTab === id}
            onClick={() => onTabChange(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="button print-button"
        onClick={() => window.print()}
      >
        Imprimer
      </button>
    </div>
  )
}
