// Interface ultime — réflexions du jury (spec §8.2).
//
// Délibération en sections dépliables à DEUX niveaux :
//   1. six éclairages et président (AuroraCore : voix par voix, délibération
//      complète au second niveau) ;
//   2. verdict (statut, confiance, preuves, indices, motif, prescription) ;
//   3. examen adversarial du Pédagogue (présomption d'absence, présomption de
//      sycophantie, conclusion adversariale) ;
//   4. pièces du Greffier (verbatim).
// Sources : carto-phone d'AuroraCore, DayView, CompetenceDiff.JuryDetail.
// Tout texte importé est rendu comme DONNÉE (texte React) ; le Markdown passe
// par renderMarkdown (DOMPurify) — jamais de HTML brut.

import { ATTAQUES } from '@engine/pipeline/extract.js'
import { renderMarkdown } from '../../lib/md.js'
import { JUROR_LABELS } from '../core/importers/aurora-core.js'
import { verdictStatusLabel } from '../core/model.js'
import { formatShort } from '../core/dates.js'

const fmt = (n) => (typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '—')
const txt = (v) => (v === null || v === undefined ? '' : String(v))

/** Markdown importé, assaini. */
export function Markdown({ text, className = 'carto-prose' }) {
  if (!text || !String(text).trim()) return null
  // renderMarkdown échappe le texte puis passe la sortie par DOMPurify (ADR-007).
  return <div className={className} dangerouslySetInnerHTML={{ __html: renderMarkdown(String(text)) }} />
}

/** Libellé d'une attaque du Pédagogue : « (g) mouvement-vers ». */
export function attackLabel(letter) {
  const def = ATTAQUES[letter]
  return def ? `(${letter}) ${def.nom}` : `(${txt(letter)})`
}

/** Verdict d'une journée (niveau 1, section 2). */
export function VerdictFacts({ verdict, detail }) {
  return (
    <dl className="carto-verdict-facts">
      <div>
        <dt>Statut</dt>
        <dd title={verdict.rawStatus ?? undefined}>{verdictStatusLabel(verdict)}</dd>
      </div>
      <div>
        <dt>Confiance</dt>
        <dd>{fmt(verdict.confidence)}</dd>
      </div>
      <div>
        <dt>Preuves · indices</dt>
        <dd>
          {verdict.proofs} · {verdict.hints}
        </dd>
      </div>
      {detail?.motif ? (
        <div className="carto-verdict-wide">
          <dt>Motif</dt>
          <dd>{txt(detail.motif)}</dd>
        </div>
      ) : null}
      {detail?.prescription ? (
        <div className="carto-verdict-wide">
          <dt>Prescription</dt>
          <dd>{txt(detail.prescription)}</dd>
        </div>
      ) : null}
    </dl>
  )
}

/** Examen adversarial du Pédagogue (Aurora v3). */
export function PedagogueReview({ pedagogue }) {
  const absence = pedagogue?.presomptionAbsence ?? null
  const syco = pedagogue?.presomptionSycophantie ?? null
  const conclusion = pedagogue?.conclusionAdversariale ?? null
  const resist = Array.isArray(absence?.piecesQuiResistent) ? absence.piecesQuiResistent : []
  const exams = Array.isArray(syco?.examenPieces) ? syco.examenPieces : []
  return (
    <div className="carto-jury-block">
      <details>
        <summary>Présomption d’absence</summary>
        <p>{txt(absence?.raisonnement) || '—'}</p>
        {resist.length > 0 ? (
          <ul>
            {resist.map((p, i) => (
              <li key={`${txt(p?.pieceId)}-${i}`}>
                Pièce {txt(p?.pieceId)} résiste : {txt(p?.motifResistance ?? p?.motif)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="carto-muted">Aucune pièce ne résiste à la présomption d’absence.</p>
        )}
      </details>
      <details>
        <summary>Présomption de sycophantie</summary>
        <p>{txt(syco?.raisonnement) || '—'}</p>
        {exams.length > 0 ? (
          <ul>
            {exams.map((e, i) => (
              <li key={`${txt(e?.pieceId)}-${i}`}>
                Pièce {txt(e?.pieceId)}, attaque {attackLabel(e?.attaqueDominante)} : {txt(e?.motifAttaque)} → <em>{txt(e?.verdictAttaque)}</em>
              </li>
            ))}
          </ul>
        ) : null}
      </details>
      <details>
        <summary>Conclusion adversariale (confiance finale {fmt(conclusion?.confianceFinale)})</summary>
        <p>{txt(conclusion?.raisonnement) || '—'}</p>
      </details>
    </div>
  )
}

/** Pièces du Greffier d'une journée Aurora v3 (verbatim, ouvrables dans le portfolio). */
export function DayPieces({ pieces, date, onOpenPassage }) {
  if (!Array.isArray(pieces) || pieces.length === 0) return <p className="carto-muted">Aucune pièce versée.</p>
  return (
    <ol className="carto-pieces">
      {pieces.map((p, i) => (
        <li key={`${txt(p.numero)}-${txt(p.pid)}-${i}`}>
          <p>
            <strong>Pièce {txt(p.numero)}</strong> — {txt(p.context)}
          </p>
          {p.extract ? <blockquote className="carto-verbatim">{txt(p.extract)}</blockquote> : null}
          {p.extract && onOpenPassage ? (
            <button type="button" className="carto-link-btn" onClick={() => onOpenPassage({ date, extract: p.extract, label: `Pièce ${txt(p.numero)} du Greffier` })}>
              Ouvrir dans le portfolio
            </button>
          ) : null}
        </li>
      ))}
    </ol>
  )
}

const JUROR_ORDER = ['linguiste', 'historien', 'anthropologue', 'philosophe', 'pedagogue', 'sociologue', 'creatif']

/** Délibération d'un run AuroraCore (porte sur tout le journal). */
export function RunJury({ run }) {
  const jury = run?.jury && typeof run.jury === 'object' ? run.jury : {}
  const president = run?.president && typeof run.president === 'object' ? run.president : null
  const delib = run?.deliberation ?? {}
  const debate = run?.debate ?? {}
  const voices = JUROR_ORDER.filter((k) => jury[k] && typeof jury[k] === 'object')
  const pieces = Array.isArray(run?.pieces) ? run.pieces : []
  return (
    <>
      <details className="carto-jury-section">
        <summary>Six éclairages et président</summary>
        {typeof jury.voix_presence === 'number' ? (
          <p className="carto-small carto-muted">
            {jury.voix_presence} voix pour la présence, {jury.voix_non_etablie ?? 0} non établie, {jury.voix_sans_eclairage ?? 0} sans éclairage
            {jury.consensus === true ? ' · consensus' : jury.consensus === false ? ' · sans consensus' : ''}
          </p>
        ) : null}
        {voices.map((k) => (
          <details key={k} className="carto-jury-voice">
            <summary>
              {JUROR_LABELS[k] ?? k} — {txt(jury[k].position) || 'position non dite'} · confiance {fmt(jury[k].confiance)}
            </summary>
            <p>{txt(jury[k].synthese)}</p>
            {delib[k]?.markdown ? (
              <details>
                <summary>Délibération complète</summary>
                <Markdown text={delib[k].markdown} />
              </details>
            ) : null}
          </details>
        ))}
        {president || delib.president?.markdown ? (
          <details className="carto-jury-voice">
            <summary>Président de séance</summary>
            {president ? (
              <dl className="carto-president">
                {[
                  ['points_convergence', 'Points de convergence'],
                  ['points_tension', 'Points de tension'],
                  ['analyse_reflexive', 'Analyse réflexive'],
                  ['verdict_argumente', 'Verdict argumenté'],
                  ['prescription', 'Prescription'],
                ].map(([key, label]) =>
                  president[key] ? (
                    <div key={key}>
                      <dt>{label}</dt>
                      <dd>{txt(president[key])}</dd>
                    </div>
                  ) : null,
                )}
              </dl>
            ) : null}
            {delib.president?.markdown ? (
              <details>
                <summary>Délibération complète</summary>
                <Markdown text={delib.president.markdown} />
              </details>
            ) : null}
          </details>
        ) : null}
      </details>
      {debate.accusation || debate.defense || debate.replique ? (
        <details className="carto-jury-section">
          <summary>Débat contradictoire</summary>
          {[
            ['accusation', 'Accusation'],
            ['defense', 'Défense'],
            ['replique', 'Réplique de l’accusation'],
          ].map(([key, label]) =>
            debate[key]?.markdown ? (
              <details key={key}>
                <summary>{label}</summary>
                <Markdown text={debate[key].markdown} />
              </details>
            ) : null,
          )}
        </details>
      ) : null}
      {pieces.length > 0 ? (
        <details className="carto-jury-section">
          <summary>Pièces du Greffier ({pieces.length}, verbatim)</summary>
          {pieces.map((p, i) => (
            <details key={`${p.date}-${p.name}-${i}`}>
              <summary>
                {formatShort(p.date)} · {txt(p.name).replace(/\.md$/u, '')}
              </summary>
              <Markdown text={p.text} />
            </details>
          ))}
        </details>
      ) : null}
    </>
  )
}

/**
 * Réflexions du jury pour UNE observation (journée × compétence).
 * @param {{verdict: object, detail: object | null, run?: object | null, date: string,
 *   onOpenPassage?: (p: {date: string, extract: string, label?: string}) => void, showVerdict?: boolean}} props
 *   showVerdict : false quand le verdict est déjà affiché juste au-dessus
 */
export function JuryReflections({ verdict, detail, run = null, date, onOpenPassage, showVerdict = true }) {
  const pedagogue = detail?.pedagogue ?? null
  const pieces = detail?.pieces ?? []
  return (
    <div className="carto-jury">
      {run ? <RunJury run={run} /> : null}
      {showVerdict ? (
        <details className="carto-jury-section">
          <summary>Verdict</summary>
          <VerdictFacts verdict={verdict} detail={detail} />
        </details>
      ) : null}
      {pedagogue ? (
        <details className="carto-jury-section">
          <summary>Examen adversarial du Pédagogue</summary>
          <PedagogueReview pedagogue={pedagogue} />
        </details>
      ) : null}
      {!run && pieces.length > 0 ? (
        <details className="carto-jury-section">
          <summary>Pièces du Greffier ({pieces.length}, verbatim)</summary>
          <DayPieces pieces={pieces} date={date} onOpenPassage={onOpenPassage} />
        </details>
      ) : null}
    </div>
  )
}
