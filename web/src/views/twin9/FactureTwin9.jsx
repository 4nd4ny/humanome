// Facture récapitulative Twin9 — document formel imprimable (ADR-010 §3).
//
// Rend la sortie déterministe de GET /api/twin9/facture (FactureService) : un
// document que l'apprenant OU l'établissement peut imprimer/exporter en PDF via
// le navigateur. La facture ne contient QUE des compteurs (appels, tokens,
// montants) — jamais le moindre contenu de portfolio (cahier §6.5).
//
// L'impression est isolée par une feuille @media print dédiée (twin9-credit.css) :
// tout le reste de la page est masqué, seul .facture-twin9 s'imprime. Le bouton
// « Imprimer » vit HORS du document (.facture-actions) pour ne pas figurer sur la
// feuille.

import { formatUsd } from '../../api/twin9.js'

/** Date ISO « 2026-07-14 12:00:00 » -> « 2026-07-14 » (partie calendaire). */
function jourDe(iso) {
  return String(iso ?? '').slice(0, 10)
}

/**
 * Montant micro-USD signé « +1,23 $ » / « -1,23 $ » (0 -> « 0,00 $ »).
 * formatUsd rend déjà le signe négatif ; on ajoute « + » pour les crédits.
 */
function formatSigne(microusd) {
  const n = Number(microusd) || 0
  return n > 0 ? `+${formatUsd(n)}` : formatUsd(n)
}

/**
 * @param {object} props
 * @param {object} props.facture sortie de fetchFacture (ou null)
 * @param {() => void} [props.onImprimer] déclencheur d'impression (défaut window.print)
 */
export default function FactureTwin9({ facture, onImprimer }) {
  if (!facture) return null

  const imprimer =
    onImprimer ?? (() => (typeof window !== 'undefined' ? window.print() : undefined))

  const lignes = Array.isArray(facture.lignes) ? facture.lignes : []
  const recharges = Array.isArray(facture.recharges) ? facture.recharges : []
  const ajustements = Array.isArray(facture.ajustements) ? facture.ajustements : []
  const mentions = Array.isArray(facture.mentions) ? facture.mentions : []
  const emetteur = facture.emetteur ?? {}
  const client = facture.client ?? {}

  return (
    <div className="facture-bloc">
      <div className="facture-actions">
        <button type="button" className="btn-primaire" onClick={imprimer}>
          Imprimer / exporter en PDF
        </button>
      </div>

      <article className="facture-twin9" aria-label={`Facture ${facture.numero}`}>
        <header className="facture-entete">
          <div className="facture-emetteur">
            <strong>{emetteur.nom ?? 'Harmonia Éducation'}</strong>
            {emetteur.service ? <span>{emetteur.service}</span> : null}
            {emetteur.site ? <span>{emetteur.site}</span> : null}
          </div>
          <div className="facture-meta">
            <p className="facture-titre">Facture récapitulative</p>
            <p className="facture-numero">
              N° <strong>{facture.numero}</strong>
            </p>
            <p className="facture-periode">Période&nbsp;: {facture.periode}</p>
          </div>
        </header>

        <section className="facture-client">
          <h3>Client</h3>
          <p>{client.nom || '—'}</p>
          <p>{client.email || ''}</p>
        </section>

        <section className="facture-lignes">
          <h3>Consommation des tokens prépayés</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Modèle</th>
                  <th scope="col" className="num">
                    Appels
                  </th>
                  <th scope="col" className="num">
                    Tokens entrée
                  </th>
                  <th scope="col" className="num">
                    Tokens sortie
                  </th>
                  <th scope="col" className="num">
                    Coût
                  </th>
                </tr>
              </thead>
              <tbody>
                {lignes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="facture-vide">
                      Aucune consommation sur cette période.
                    </td>
                  </tr>
                ) : (
                  lignes.map((l) => (
                    <tr key={l.model}>
                      <td>{l.model}</td>
                      <td className="num">{l.appels}</td>
                      <td className="num">{l.tokens_in?.toLocaleString?.('fr-FR') ?? l.tokens_in}</td>
                      <td className="num">
                        {l.tokens_out?.toLocaleString?.('fr-FR') ?? l.tokens_out}
                      </td>
                      <td className="num">{formatUsd(l.consomme_microusd)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colSpan={4}>
                    Total consommé
                  </th>
                  <td className="num">{formatUsd(facture.total_consomme_microusd)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {recharges.length > 0 ? (
          <section className="facture-recharges">
            <h3>Recharges de la période</h3>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Libellé</th>
                    <th scope="col">Référence PayPal</th>
                    <th scope="col" className="num">
                      Montant
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recharges.map((r, i) => (
                    <tr key={r.paypal_order_id ?? i}>
                      <td>{jourDe(r.date)}</td>
                      <td>{r.libelle}</td>
                      <td className="mono">{r.paypal_order_id ?? '—'}</td>
                      <td className="num">{formatUsd(r.montant_microusd)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={3}>
                      Total rechargé
                    </th>
                    <td className="num">{formatUsd(facture.total_recharges_microusd)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        ) : null}

        {ajustements.length > 0 ? (
          <section className="facture-ajustements">
            <h3>Ajustements</h3>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Libellé</th>
                    <th scope="col" className="num">
                      Montant
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ajustements.map((a, i) => (
                    <tr key={i}>
                      <td>{jourDe(a.date)}</td>
                      <td>{a.libelle}</td>
                      <td className="num">{formatSigne(a.montant_microusd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <section className="facture-totaux">
          <dl>
            <div>
              <dt>Total consommé</dt>
              <dd>{formatUsd(facture.total_consomme_microusd)}</dd>
            </div>
            <div>
              <dt>Total rechargé</dt>
              <dd>{formatUsd(facture.total_recharges_microusd)}</dd>
            </div>
            <div className="facture-solde-fin">
              <dt>Solde en fin de période</dt>
              <dd>{formatUsd(facture.solde_fin_periode_microusd)}</dd>
            </div>
          </dl>
        </section>

        {mentions.length > 0 ? (
          <footer className="facture-mentions">
            {mentions.map((m, i) => (
              <p key={i}>{m}</p>
            ))}
          </footer>
        ) : null}
      </article>
    </div>
  )
}
