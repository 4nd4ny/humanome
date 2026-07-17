// Rendu des résultats d'un run Twin9 depuis carto_evolutive.json (contrat
// DONNEES.md). Le narratif (synthèse kairos, rapport du Rapporteur, histoires)
// est du markdown produit par le modèle : il PASSE par renderMarkdown (mini
// parseur maison + DOMPurify, ADR-007) avant tout dangerouslySetInnerHTML — aucun
// HTML brut du modèle n'atteint le DOM sans assainissement.

import { useMemo, useState } from 'react'
import { renderMarkdown } from '../../lib/md.js'
import { formatUsd } from '../../api/twin9.js'
import { downloadJson } from '../../lib/download-json.js'
import { journeesDepuisCarto } from './run-helpers.js'
import { twin9ToMergeDocument } from '@engine/twin9/mapper.js'
import { saveCartography } from '../../lib/carto-store.js'
import { useSunburstLib } from '../view-helpers.js'
import MergeView from '../MergeView.jsx'

/** Bloc markdown assaini (null si vide). */
function Markdown({ md, className }) {
  const texte = typeof md === 'string' ? md.trim() : ''
  if (!texte) return null
  return <div className={className} dangerouslySetInnerHTML={{ __html: renderMarkdown(texte) }} />
}

/**
 * @param {object} props
 * @param {object} props.carto carto_evolutive.json déjà sérialisé en objet plat
 *   (via JSON.parse(pyJsonDumpsWriteJson(...)) — Maps/PyFloat aplanis)
 * @param {string} [props.cartoStr] mêmes octets, pour l'export « un clic »
 * @param {boolean} [props.demonstration] true = données fictives (mode démo)
 * @param {object} [props.referentiel] forme moteur {poles, competences} — active
 *   le sunburst évolutif (adaptateur carto_evolutive → cartographie-merge)
 * @param {object} [props.lib] module sunburst injecté (tests)
 * @param {(str: string, nom: string) => void} [props.onExport] couture de test
 * @param {typeof saveCartography} [props.saveFn] couture de test (carto-store)
 */
export default function ResultatsTwin9({
  carto,
  cartoStr,
  demonstration = false,
  referentiel = null,
  lib: injectedLib,
  onExport = downloadJson,
  saveFn = saveCartography,
}) {
  const { lib } = useSunburstLib(injectedLib)
  const [sauvegarde, setSauvegarde] = useState({ status: 'idle', message: '' })

  // Projection sunburst : l'adaptateur refuse (message français) un document
  // sans attestation datée — dans ce cas la section sunburst est simplement
  // absente, les autres blocs (narratifs, jauges) restent.
  const mergeDoc = useMemo(() => {
    if (!carto || !referentiel) return null
    try {
      return twin9ToMergeDocument(carto, referentiel, { generatedAt: carto.date ?? null })
    } catch {
      return null
    }
  }, [carto, referentiel])

  if (!carto) return null

  async function enregistrer() {
    setSauvegarde({ status: 'saving', message: '' })
    try {
      await saveFn({
        type: 'twin9',
        titre: `Twin9 — ${carto.journal_id ?? 'analyse'}${carto.periode?.debut ? ` (${carto.periode.debut} → ${carto.periode.fin ?? carto.periode.debut})` : ''}`,
        document: carto,
        visibility: 'privee',
      })
      setSauvegarde({
        status: 'done',
        message:
          'Enregistrée dans « Mes cartographies » (ce navigateur uniquement). La copie serveur, elle, reste un choix explicite : Mon espace → Mes cartographies → « Copier sur le serveur ».',
      })
    } catch (error) {
      setSauvegarde({
        status: 'error',
        message: error?.message ?? 'Enregistrement local impossible (stockage navigateur indisponible).',
      })
    }
  }
  const apprenant = carto.kairos?.kairos?.apprenant ?? null
  const rapport = carto.rapport ?? null
  const profil = carto.profil_ipsatif ?? {}
  const parPole = profil.par_pole ?? {}
  const renvois = rapport?.pour_cartographe?.renvois ?? []
  const statuts = carto.statuts ?? {}
  const journees = journeesDepuisCarto(carto)
  const periode = carto.periode ?? {}
  const nomFichier = `carto_evolutive_${carto.journal_id ?? 'twin9'}.json`

  return (
    <section className="twin9-resultats" aria-label="Résultats de l’analyse Twin9">
      {demonstration ? (
        <p role="note" className="twin9-demo-banner" data-testid="resultats-demo">
          Démonstration à <strong>données fictives</strong> — ceci n’est pas l’analyse d’un
          portfolio réel, seulement un aperçu du rendu.
        </p>
      ) : null}

      <header className="twin9-resultats-tete">
        <h2>Cartographie évolutive — {carto.journal_id ?? 'Twin9'}</h2>
        <p className="twin9-resultats-meta">
          {periode.n_journees != null ? `${periode.n_journees} journée(s)` : null}
          {periode.debut ? ` · du ${periode.debut} au ${periode.fin ?? periode.debut}` : null}
          {carto.jury_mode ? ` · jury ${carto.jury_mode}` : null}
        </p>
        <button type="button" className="twin9-export" onClick={() => onExport(cartoStr ?? '', nomFichier)}>
          Exporter le JSON (carto_evolutive.json)
        </button>
        {!demonstration ? (
          <span className="twin9-sauvegarde">
            <button
              type="button"
              className="twin9-export"
              onClick={enregistrer}
              disabled={sauvegarde.status === 'saving' || sauvegarde.status === 'done'}
            >
              {sauvegarde.status === 'done'
                ? 'Enregistrée dans mes cartographies ✓'
                : 'Enregistrer dans mes cartographies'}
            </button>
            {sauvegarde.message ? (
              <span
                className="twin9-resultats-meta"
                role={sauvegarde.status === 'error' ? 'alert' : 'status'}
              >
                {sauvegarde.message}
              </span>
            ) : null}
          </span>
        ) : null}
      </header>

      {mergeDoc ? (
        <article className="twin9-bloc" data-testid="twin9-sunburst">
          <h3>Cartographie évolutive — sunburst</h3>
          <p className="twin9-resultats-meta">
            La même visualisation que toute cartographie du site, projetée depuis les journées
            attestées de l’analyse Twin9.
          </p>
          <MergeView mergeDoc={mergeDoc} referentiel={referentiel} lib={lib} />
        </article>
      ) : null}

      {apprenant?.syntheseCompleteMarkdown ? (
        <article className="twin9-bloc">
          <h3>Synthèse — le kairos</h3>
          <Markdown md={apprenant.syntheseCompleteMarkdown} className="twin9-narratif" />
        </article>
      ) : null}

      {rapport?.rapport_complet_markdown ? (
        <article className="twin9-bloc">
          <h3>Rapport du Rapporteur</h3>
          <Markdown md={rapport.rapport_complet_markdown} className="twin9-narratif" />
        </article>
      ) : null}

      <article className="twin9-bloc">
        <h3>Profil ipsatif par pôle</h3>
        <p className="twin9-resultats-meta">
          {profil.competences_etablies ? `Établies : ${profil.competences_etablies}` : null}
          {profil.competences_renvoyees != null
            ? ` · Renvois : ${profil.competences_renvoyees}`
            : null}
        </p>
        <ul className="twin9-poles">
          {Object.entries(parPole)
            .sort((a, b) => (Number(b[1]?.proportion) || 0) - (Number(a[1]?.proportion) || 0))
            .map(([pole, d]) => (
              <li key={pole} className="twin9-pole">
                <div className="twin9-pole-tete">
                  <span className="twin9-pole-nom">{pole}</span>
                  <span className="twin9-pole-part">{(Number(d?.proportion) || 0).toFixed(1)} %</span>
                </div>
                <div className="twin9-jauge" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, Number(d?.proportion) || 0)}%` }} />
                </div>
                {Array.isArray(d?.competences) && d.competences.length ? (
                  <ul className="twin9-pole-comps">
                    {d.competences.map((c) => (
                      <li key={c.code}>
                        <span className="twin9-comp-code">{c.code}</span> {c.nom}
                        <span className="twin9-comp-part"> — {(Number(c.proportion) || 0).toFixed(1)} %</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
        </ul>
      </article>

      {renvois.length ? (
        <article className="twin9-bloc">
          <h3>Renvois au cartographe (à instruire en entretien)</h3>
          <ul className="twin9-renvois">
            {renvois.map((r, i) => (
              <li key={`${r.competence_code}-${i}`}>
                <span className="twin9-comp-code">{r.competence_code}</span> — {r.question_entretien}
              </li>
            ))}
          </ul>
        </article>
      ) : null}

      <article className="twin9-bloc">
        <h3>Journées analysées</h3>
        {Object.keys(statuts).length ? (
          <ul className="twin9-statuts">
            {Object.entries(statuts).map(([statut, n]) => (
              <li key={statut}>
                <span className="twin9-statut-n">{n}</span> {statut}
              </li>
            ))}
          </ul>
        ) : null}
        {journees.length ? (
          <table className="twin9-journees">
            <thead>
              <tr>
                <th scope="col">Journée</th>
                <th scope="col">Établies</th>
                <th scope="col">Renvois</th>
              </tr>
            </thead>
            <tbody>
              {journees.map((j) => (
                <tr key={j.jour_index}>
                  <th scope="row">{j.date ?? j.journee ?? `Journée ${j.jour_index + 1}`}</th>
                  <td>{j.etablies.length ? j.etablies.join(', ') : '—'}</td>
                  <td>{j.renvois.length ? j.renvois.join(', ') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="twin9-resultats-meta">
            Aucune présence datée reconstituée pour cette période.
          </p>
        )}
      </article>
    </section>
  )
}
