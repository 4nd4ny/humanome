// Lien de partage employeur (P8) — squelette pré-câblé, implémenté par le
// chantier M6 : mot de passe -> GET api/share/<token> -> visualisation en
// lecture seule (mention « garantie par » si validée, P9).

/**
 * @param {{token: string, lib?: object}} props
 */
export default function ShareView({ token }) {
  return (
    <div className="share-view">
      <h1>Cartographie partagée</h1>
      <p role="status">Cette section arrive avec le jalon M6 (lien : {token.slice(0, 8)}…).</p>
    </div>
  )
}
