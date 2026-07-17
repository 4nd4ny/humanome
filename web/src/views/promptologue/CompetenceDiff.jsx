// Diff de compétences avec traces de délibération du jury (D15).
//
// Rend la sortie de buildCompetenceDiff (bench.js) : par journée, les
// compétences établies d'un côté et pas de l'autre, chacune dépliable sur les
// traces qui ont conduit au choix DES DEUX côtés — pièces du greffier
// (extraits verbatim), présomptions du pédagogue (attaques a..h nommées),
// traces retenues, verdict motivé. Composant de rendu pur (aucun état).

import { ATTAQUES } from '@engine/pipeline/extract.js'
import { statutBadge, statutLabel } from '../../lib/consistency-view.js'

/** Libellé d'une attaque du pédagogue : « (g) mouvement-vers ». */
export function attaqueLabel(lettre) {
  const def = ATTAQUES[lettre]
  return def ? `(${lettre}) ${def.nom}` : `(${lettre})`
}

function Badge({ statut }) {
  return <span className={`verdict-badge ${statutBadge(statut)}`}>{statutLabel(statut)}</span>
}

/** Détail de délibération d'UN côté (extractCompetenceDetail, ou null). */
function JuryDetail({ detail, label }) {
  if (!detail) {
    return (
      <div className="banc-jury">
        <h5>{label}</h5>
        <p className="banc-jury-vide">
          Compétence absente de ce document (hors périmètre, ou non instruite par ce run).
        </p>
      </div>
    )
  }
  const { pieces, pedagogue, tracesRetenues, verdict, courtCircuit } = detail
  return (
    <div className="banc-jury">
      <h5>
        {label} — <Badge statut={detail.statut} />
      </h5>
      {courtCircuit ? (
        <p className="banc-jury-vide">
          Court-circuit : {verdict?.raison ?? 'aucune pièce extraite par le Greffier'}.
          {verdict?.prescriptionMinimale ? ` Prescription : ${verdict.prescriptionMinimale}` : ''}
        </p>
      ) : (
        <>
          <p className="banc-jury-etape">
            <strong>Greffier</strong> — {pieces.length} pièce(s) versée(s) :
          </p>
          <ul>
            {pieces.map((piece) => (
              <li key={`${piece.pid}-${piece.numero}`}>
                {/* String() : un document importé reste de la DONNÉE — jamais
                    un objet en enfant React, même mal formé. */}
                Pièce {String(piece.numero)} : {String(piece.contexte ?? '')}
                {piece.extraitVerbatim ? (
                  <blockquote className="banc-jury-verbatim">
                    « {String(piece.extraitVerbatim)} »
                  </blockquote>
                ) : null}
              </li>
            ))}
          </ul>
          {pedagogue ? (
            <>
              <p className="banc-jury-etape">
                <strong>Pédagogue — présomption d’absence</strong> :{' '}
                {pedagogue.presomptionAbsence?.raisonnement ?? '—'}
              </p>
              {(pedagogue.presomptionAbsence?.piecesQuiResistent ?? []).length > 0 ? (
                <ul>
                  {pedagogue.presomptionAbsence.piecesQuiResistent.map((p) => (
                    <li key={p.pieceId}>
                      Pièce {p.pieceId} résiste : {p.motifResistance}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="banc-jury-vide">Aucune pièce ne résiste à la présomption d’absence.</p>
              )}
              <p className="banc-jury-etape">
                <strong>Pédagogue — présomption de sycophantie</strong> :{' '}
                {pedagogue.presomptionSycophantie?.raisonnement ?? '—'}
              </p>
              {(pedagogue.presomptionSycophantie?.examenPieces ?? []).length > 0 ? (
                <ul>
                  {pedagogue.presomptionSycophantie.examenPieces.map((e) => (
                    <li key={e.pieceId}>
                      Pièce {e.pieceId}, attaque {attaqueLabel(e.attaqueDominante)} :{' '}
                      {e.motifAttaque} → <em>{e.verdictAttaque}</em>
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="banc-jury-etape">
                <strong>Conclusion adversariale</strong> :{' '}
                {pedagogue.conclusionAdversariale?.raisonnement ?? '—'} (confiance{' '}
                {pedagogue.conclusionAdversariale?.confianceFinale ?? '—'})
              </p>
            </>
          ) : (
            <p className="banc-jury-vide">
              Dossier ouvert mais non instruit par le pédagogue dans cette passe.
            </p>
          )}
          {tracesRetenues.length > 0 ? (
            <p className="banc-jury-etape">
              <strong>Traces retenues</strong> :{' '}
              {tracesRetenues
                .map((t) => `pièce ${t.pieceId} (${t.type}, ${t.role})`)
                .join(' ; ')}
            </p>
          ) : null}
          {verdict ? (
            <p className="banc-jury-etape">
              <strong>Verdict</strong> — {verdict.statut} (confiance {verdict.confiance ?? '—'},{' '}
              {verdict.nombrePreuves ?? 0} preuve(s), {verdict.nombreIndices ?? 0} indice(s)).{' '}
              {verdict.motif ?? ''}
              {verdict.prescription ? ` Prescription : ${verdict.prescription}` : ''}
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}

function DiffEntries({ titre, entries, labelA, labelB, competenceNames }) {
  if (entries.length === 0) return null
  return (
    <div className="banc-diff-groupe">
      <h4>{titre}</h4>
      {entries.map((entry) => (
        <details key={entry.code} className="banc-diff-competence">
          <summary>
            {entry.code}
            {competenceNames[entry.code] ? ` — ${competenceNames[entry.code]}` : ''} :{' '}
            <Badge statut={entry.statutA} /> ({labelA}) vs <Badge statut={entry.statutB} /> (
            {labelB})
          </summary>
          <div className="banc-diff-cotes">
            <JuryDetail detail={entry.detailA} label={labelA} />
            <JuryDetail detail={entry.detailB} label={labelB} />
          </div>
        </details>
      ))}
    </div>
  )
}

/**
 * @param {object} props
 * @param {{parJour: Array}} props.diff sortie de buildCompetenceDiff
 * @param {string} [props.labelA] libellé du côté A (version, modèle…)
 * @param {string} [props.labelB]
 * @param {Record<string, string>} [props.competenceNames] code -> nom
 */
export default function CompetenceDiff({ diff, labelA = 'A', labelB = 'B', competenceNames = {} }) {
  if (!diff || diff.parJour.length === 0) return null
  return (
    <section aria-label="Diff de compétences" data-testid="banc-diff-competences">
      <h3>Diff de compétences — traces du jury</h3>
      {diff.parJour.map(({ iso, communes, seulementA, seulementB }) => (
        <details key={iso} open={diff.parJour.length === 1}>
          <summary>
            {iso} — {communes.length} commune(s), {seulementA.length} seulement {labelA},{' '}
            {seulementB.length} seulement {labelB}
          </summary>
          <p>
            Établies des deux côtés : {communes.join(', ') || '—'}
          </p>
          <DiffEntries
            titre={`Établies seulement par ${labelA}`}
            entries={seulementA}
            labelA={labelA}
            labelB={labelB}
            competenceNames={competenceNames}
          />
          <DiffEntries
            titre={`Établies seulement par ${labelB}`}
            entries={seulementB}
            labelA={labelA}
            labelB={labelB}
            competenceNames={competenceNames}
          />
          {seulementA.length === 0 && seulementB.length === 0 ? (
            <p>Aucun écart : les deux côtés établissent exactement les mêmes compétences.</p>
          ) : null}
        </details>
      ))}
    </section>
  )
}
