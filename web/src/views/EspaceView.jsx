// Espace apprenant (P8) — squelette pré-câblé, implémenté par le chantier M6.
// Contrat de composition : le panneau « Mes cartographies » (confidentialité,
// partage, export) vit dans ./espace/CartographiesPanel.jsx.

/**
 * @param {{section: string | null, lib?: object}} props
 */
export default function EspaceView({ section }) {
  return (
    <div className="espace">
      <h1>Espace apprenant</h1>
      <p role="status">Cette section arrive avec le jalon M6 (section : {section ?? 'accueil'}).</p>
    </div>
  )
}
