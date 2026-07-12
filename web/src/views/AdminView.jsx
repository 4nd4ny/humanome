// Administration (P12) — squelette pré-câblé, implémenté par le chantier M9.

/**
 * @param {{section: string | null, lib?: object}} props
 */
export default function AdminView({ section }) {
  return (
    <div className="admin">
      <h1>Administration</h1>
      <p role="status">Cette section arrive avec le jalon M9 (section : {section ?? 'accueil'}).</p>
    </div>
  )
}
