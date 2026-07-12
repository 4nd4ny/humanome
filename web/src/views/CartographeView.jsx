// Espace cartographe (P9) — squelette pré-câblé, implémenté par le chantier M7.

/**
 * @param {{section: string | null, lib?: object}} props
 */
export default function CartographeView({ section }) {
  return (
    <div className="cartographe">
      <h1>Espace cartographe</h1>
      <p role="status">Cette section arrive avec le jalon M7 (section : {section ?? 'accueil'}).</p>
    </div>
  )
}
