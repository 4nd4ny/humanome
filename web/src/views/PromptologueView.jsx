// Atelier promptologue (P10) — squelette pré-câblé, implémenté par le chantier M7.

/**
 * @param {{section: string | null, lib?: object}} props
 */
export default function PromptologueView({ section }) {
  return (
    <div className="promptologue">
      <h1>Atelier promptologue</h1>
      <p role="status">Cette section arrive avec le jalon M7 (section : {section ?? 'accueil'}).</p>
    </div>
  )
}
