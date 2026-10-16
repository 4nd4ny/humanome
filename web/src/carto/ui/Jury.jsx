// Interface ultime — réflexions du jury (spec §8.2).
//
// Délibération en sections dépliables à DEUX niveaux :
//   1. six éclairages et président (AuroraCore : voix par voix, délibération
//      complète au second niveau) ;
//   2. examen adversarial du Pédagogue (présomption d'absence, présomption de
//      sycophantie, conclusion adversariale) ;
//   3. pièces du Greffier (verbatim).
// Le verdict (statut, confiance, preuves, indices, motif, prescription) se lit
// au-dessus, une seule fois (journal D-66).
// Sources : carto-phone d'AuroraCore, DayView, CompetenceDiff.JuryDetail.
// Tout texte importé est rendu comme DONNÉE (texte React) ; le Markdown passe
// par renderMarkdown (DOMPurify) — jamais de HTML brut.

import { ATTAQUES } from '@engine/pipeline/attaques.js'
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

/**
 * Verdict d'une journée. Chaque information une fois (journal D-66) : là où la
 * ligne de la journée dit déjà le statut, la confiance et les preuves, seuls
 * le motif et la prescription restent (`summary` faux) ; le statut seul peut
 * aussi être dit au-dessus (`status` faux) ; un verdict AuroraCore, réparti
 * sur les journées de ses traces, porte le motif et la prescription du
 * président, dits une fois dans la délibération (`texts` faux).
 * @param {{verdict: object, detail: object | null, summary?: boolean, status?: boolean, texts?: boolean}} props
 */
export function VerdictFacts({ verdict, detail, summary = true, status = true, texts = true }) {
  const motif = texts ? detail?.motif : null
  const prescription = texts ? detail?.prescription : null
  if (!summary && !motif && !prescription) return null
  return (
    <dl className="carto-verdict-facts">
      {summary && status ? (
        <div>
          <dt>Statut</dt>
          <dd title={verdict.rawStatus ?? undefined}>{verdictStatusLabel(verdict)}</dd>
        </div>
      ) : null}
      {summary ? (
        <>
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
        </>
      ) : null}
      {motif ? (
        <div className="carto-verdict-wide">
          <dt>Motif</dt>
          <dd>{txt(motif)}</dd>
        </div>
      ) : null}
      {prescription ? (
        <div className="carto-verdict-wide">
          <dt>Prescription</dt>
          <dd>{txt(prescription)}</dd>
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

export const JUROR_ORDER = ['linguiste', 'historien', 'anthropologue', 'philosophe', 'pedagogue', 'sociologue', 'creatif']

/**
 * Délibération d'un run AuroraCore (porte sur tout le journal).
 * @param {{run: object, shown?: Array<string | null | undefined>}} props
 *   shown : textes déjà lus au-dessus (le motif et la prescription d'une
 *   journée sont ceux du président) — le président ne les redit pas (D-66)
 */
export function RunJury({ run, shown = [] }) {
  const said = new Set(shown.filter(Boolean).map((t) => String(t).trim()))
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
                  president[key] && !said.has(String(president[key]).trim()) ? (
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
 * Réflexions du jury pour UNE observation (journée × compétence). Le verdict
 * se lit au-dessus, une fois (D-66).
 * @param {{detail: object | null, run?: object | null, date: string,
 *   onOpenPassage?: (p: {date: string, extract: string, label?: string}) => void}} props
 */
export function JuryReflections({ detail, run = null, date, onOpenPassage }) {
  const pedagogue = detail?.pedagogue ?? null
  const pieces = detail?.pieces ?? []
  return (
    <div className="carto-jury">
      {run ? <RunJury run={run} shown={[detail?.motif, detail?.prescription]} /> : null}
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
