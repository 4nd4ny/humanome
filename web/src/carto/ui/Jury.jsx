// Interface ultime — réflexions du jury (spec §8.2).
//
// Délibération en sections dépliables à DEUX niveaux :
//   1. AuroraCore : la décision du président d'abord (verdict argumenté,
//      prescription, voix), puis les éclairages des voix et le raisonnement du
//      président qui y ont conduit (délibérations complètes au second niveau) ;
//   2. examen adversarial du Pédagogue (présomption d'absence, présomption de
//      sycophantie, conclusion adversariale) ;
//   3. pièces du Greffier (verbatim), chacune avec son sort dans le verdict.
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

/**
 * Examen adversarial du Pédagogue (Aurora v3).
 * @param {{pedagogue: object, confidence?: number | null}} props confidence : celle du
 *   verdict, déjà lue au-dessus — la confiance finale ne se dit que si elle en diffère (D-66)
 */
export function PedagogueReview({ pedagogue, confidence = null }) {
  const absence = pedagogue?.presomptionAbsence ?? null
  const syco = pedagogue?.presomptionSycophantie ?? null
  const conclusion = pedagogue?.conclusionAdversariale ?? null
  const final = typeof conclusion?.confianceFinale === 'number' && conclusion.confianceFinale !== confidence ? conclusion.confianceFinale : null
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
        <summary>Conclusion adversariale{final === null ? '' : ` (confiance finale ${fmt(final)})`}</summary>
        <p>{txt(conclusion?.raisonnement) || '—'}</p>
      </details>
    </div>
  )
}

/**
 * Sort de chaque pièce dans le verdict, d'après ses traces : retenue comme
 * preuve, comme indice, ou absente (non retenue). Par numéro de pièce.
 * @param {Record<string, {pieceId?: unknown, role?: string}> | null | undefined} traces
 * @returns {Map<string, 'preuve' | 'indice'>}
 */
export function pieceFates(traces) {
  const fates = new Map()
  for (const t of Object.values(traces ?? {})) {
    if (t?.pieceId === null || t?.pieceId === undefined) continue
    const key = String(t.pieceId)
    if (fates.get(key) !== 'preuve') fates.set(key, t.role === 'preuve' ? 'preuve' : 'indice')
  }
  return fates
}

/**
 * Pièces du Greffier d'une journée Aurora v3 (verbatim, ouvrables dans le
 * portfolio), chacune avec son sort : on lit ainsi, à côté du raisonnement du
 * Pédagogue qui les cite par numéro, celles que le verdict a retenues.
 */
export function DayPieces({ pieces, traces, date, onOpenPassage }) {
  if (!Array.isArray(pieces) || pieces.length === 0) return <p className="carto-muted">Aucune pièce versée.</p>
  const fates = pieceFates(traces)
  return (
    <ol className="carto-pieces">
      {pieces.map((p, i) => {
        const fate = p.numero === null || p.numero === undefined ? undefined : fates.get(String(p.numero))
        return (
          <li key={`${txt(p.numero)}-${txt(p.pid)}-${i}`}>
            <p>
              <strong>Pièce {txt(p.numero)}</strong> <span className={`carto-piece-fate${fate ? ' carto-piece-fate--kept' : ''}`}>{fate ? `retenue comme ${fate}` : 'non retenue'}</span>
              {p.context ? <> — {txt(p.context)}</> : null}
            </p>
            {p.extract ? <blockquote className="carto-verbatim">{txt(p.extract)}</blockquote> : null}
            {p.extract && onOpenPassage ? (
              <button type="button" className="carto-link-btn" onClick={() => onOpenPassage({ date, extract: p.extract, label: `Pièce ${txt(p.numero)} du Greffier` })}>
                Ouvrir dans le portfolio
              </button>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

export const JUROR_ORDER = ['linguiste', 'historien', 'anthropologue', 'philosophe', 'pedagogue', 'sociologue', 'creatif']

const DECISION = [
  ['verdict_argumente', 'Verdict argumenté'],
  ['prescription', 'Prescription'],
]
const REASONING = [
  ['points_convergence', 'Points de convergence'],
  ['points_tension', 'Points de tension'],
  ['analyse_reflexive', 'Analyse réflexive'],
]

/**
 * Délibération d'un run AuroraCore (porte sur tout le journal). La décision du
 * président se lit d'abord — verdict argumenté, prescription, voix ; ce qui y
 * a conduit se déplie au-dessous : les éclairages des voix, le raisonnement
 * du président, le débat, les pièces.
 * @param {{run: object, shown?: Array<string | null | undefined>}} props
 *   shown : textes déjà lus au-dessus (le motif et la prescription d'une
 *   journée sont ceux du président) — la décision ne les redit pas (D-66)
 */
export function RunJury({ run, shown = [] }) {
  const said = new Set(shown.filter(Boolean).map((t) => String(t).trim()))
  const jury = run?.jury && typeof run.jury === 'object' ? run.jury : {}
  const president = run?.president && typeof run.president === 'object' ? run.president : null
  const delib = run?.deliberation ?? {}
  const debate = run?.debate ?? {}
  const voices = JUROR_ORDER.filter((k) => jury[k] && typeof jury[k] === 'object')
  const pieces = Array.isArray(run?.pieces) ? run.pieces : []
  const field = (key) => txt(president?.[key]).trim()
  const decision = DECISION.filter(([key]) => field(key) && !said.has(field(key)))
  const reasoning = REASONING.filter(([key]) => field(key))
  const votes =
    typeof jury.voix_presence === 'number'
      ? `${jury.voix_presence} voix pour la présence, ${jury.voix_non_etablie ?? 0} non établie, ${jury.voix_sans_eclairage ?? 0} sans éclairage${
          jury.consensus === true ? ' · consensus' : jury.consensus === false ? ' · sans consensus' : ''
        }`
      : null
  return (
    <>
      {decision.length > 0 ? (
        <section className="carto-president-decision" aria-label="Décision du président">
          <h4>Décision du président</h4>
          <dl className="carto-president">
            {decision.map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{txt(president[key])}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      {votes ? <p className="carto-small carto-muted">{votes}</p> : null}
      {voices.length > 0 ? (
        <details className="carto-jury-section">
          <summary>Éclairages des voix</summary>
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
        </details>
      ) : null}
      {reasoning.length > 0 || delib.president?.markdown ? (
        <details className="carto-jury-section">
          <summary>Raisonnement du président</summary>
          {reasoning.length > 0 ? (
            <dl className="carto-president">
              {reasoning.map(([key, label]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>{txt(president[key])}</dd>
                </div>
              ))}
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
 * @param {{detail: object | null, run?: object | null, date: string, confidence?: number | null,
 *   onOpenPassage?: (p: {date: string, extract: string, label?: string}) => void}} props
 *   confidence : celle du verdict, lue au-dessus
 */
export function JuryReflections({ detail, run = null, date, confidence = null, onOpenPassage }) {
  const pedagogue = detail?.pedagogue ?? null
  const pieces = detail?.pieces ?? []
  return (
    <div className="carto-jury">
      {run ? <RunJury run={run} shown={[detail?.motif, detail?.prescription]} /> : null}
      {pedagogue ? (
        <details className="carto-jury-section">
          <summary>Examen adversarial du Pédagogue</summary>
          <PedagogueReview pedagogue={pedagogue} confidence={confidence} />
        </details>
      ) : null}
      {!run && pieces.length > 0 ? (
        <details className="carto-jury-section">
          <summary>Pièces du Greffier ({pieces.length}, verbatim)</summary>
          <DayPieces pieces={pieces} traces={detail?.traces} date={date} onOpenPassage={onOpenPassage} />
        </details>
      ) : null}
    </div>
  )
}
