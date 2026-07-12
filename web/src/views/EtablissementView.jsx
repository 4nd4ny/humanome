// Espace établissement (P11) — squelette pré-câblé, implémenté par le chantier M8.

/**
 * @param {{section: string | null, lib?: object}} props
 */
export default function EtablissementView({ section }) {
  return (
    <div className="etablissement">
      <h1>Espace établissement</h1>
      <p role="status">Cette section arrive avec le jalon M8 (section : {section ?? 'accueil'}).</p>
    </div>
  )
}
