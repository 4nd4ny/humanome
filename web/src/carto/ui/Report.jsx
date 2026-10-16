// Interface ultime — rapport imprimable (spec §11, point 3).
//
// Pages A4 en CSS d'impression et SVG natif : aucune capture raster
// (jsPDF / html2canvas écartés). Page 1 : identité (pseudonyme), période,
// ensemble, soleil, légende ; page 2 : profil chiffré, compétences et
// confiance moyenne du jury, précautions de lecture ; pages suivantes : réflexions du
// jury choisies, dépliées, avec les extraits ; en option, la comparaison A/B.
//
// L'aperçu s'ouvre dans un dialogue rattaché à <body> ; tant qu'il est
// ouvert, l'impression ne sort QUE le rapport (le reste de la page est
// masqué par la feuille d'impression). Les boutons et contrôles ne sont pas
// imprimés.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { reportDates, reportObservations, reportSummary, reportTraces } from '../core/report.js'
import { changeNarrative, compareSets } from '../core/compare.js'
import { layoutSun } from '../core/state.js'
import { REVIEW_LABELS, canonicalJson, verdictStatusLabel } from '../core/model.js'
import { formatLong, formatShort } from '../core/dates.js'
import { stripMarkdownMarks } from '../core/highlight.js'
import { JUROR_LABELS } from '../core/importers/aurora-core.js'
import { Sun } from './Sun.jsx'
import { SunLegend } from './DetailPanel.jsx'
import { JUROR_ORDER, PedagogueReview, VerdictFacts } from './Jury.jsx'
import { verdictDetailOf } from './Observations.jsx'
import { ComparePrecautions } from './ComparePanel.jsx'
import { useFocusTrap } from './DayModal.jsx'
import { DEFAULT_PALETTE, themeColor } from './colors.js'
import { PaletteContext } from './palette.js'

const nf = (n, d = 2) => (typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—')
const pct = (x) => `${nf(x * 100, 1)} %`
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`
const txt = (v) => (v === null || v === undefined ? '' : String(v))

/** Options par défaut du rapport. */
export const DEFAULT_REPORT_OPTIONS = Object.freeze({ pseudonym: '', codes: [], scope: 'last', extracts: true, comparison: false, notes: false })

/** Précautions de lecture du rapport (§1, §8.2). */
export function ReadingPrecautions() {
  return (
    <aside className="carto-print-precautions" aria-label="Précautions de lecture">
      <h3>Précautions de lecture</h3>
      <ul>
        <li>
          Ce document est un miroir : il montre ce que l’analyse a relevé dans les écrits de la personne. Il ne la compare à personne ni à aucune norme et ne classe pas
          ses compétences.
        </li>
        <li>L’absence d’une trace ne signifie pas l’absence de la compétence : une compétence sans secteur n’a simplement pas été observée dans ces journées.</li>
        <li>
          L’angle d’un secteur est la part des points de la compétence (un point par preuve, moins pour un indice : plus il y a de traces, plus il est large) ; sa hauteur est la confiance moyenne du jury dans ses verdicts, qui n’est ni un
          niveau de maîtrise ni une force.
        </li>
        <li>
          Niveau de preuve : exploratoire. Chaque verdict vient d’une analyse automatique (un seul codeur, un modèle de langage) ; la personne a pu le confirmer, le
          nuancer ou le contester.
        </li>
      </ul>
    </aside>
  )
}

function Facts({ items }) {
  return (
    <dl className="carto-print-facts">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function Cover({ dataset, refl, state, layout, geometry, t, summary, pseudonym, today }) {
  const name = pseudonym.trim()
  const ensemble = `${summary.setName ? `« ${summary.setName} » — ` : ''}${plural(summary.activeDays, 'journée cochée', 'journées cochées')} sur ${summary.totalDays}, dont ${plural(summary.analysedDays, 'analysée', 'analysées')}`
  return (
    <section className="carto-print-page carto-print-cover" aria-labelledby="carto-print-title">
      <header className="carto-print-head">
        {name ? <p className="carto-print-kicker">Cartographie de compétences</p> : null}
        <h1 id="carto-print-title">{name || 'Cartographie de compétences'}</h1>
      </header>
      <Facts
        items={[
          ['Période', summary.period ? `du ${formatLong(summary.period.from)} au ${formatLong(summary.period.to)}` : 'aucune journée analysée'],
          ['Ensemble', ensemble],
          ['État', t ? `cumulé jusqu’au ${formatLong(t)}` : 'complet (toutes les journées cochées)'],
          ['Référentiel', dataset.referential?.label ?? '—'],
        ]}
      />
      <Sun
        refl={refl}
        state={state}
        layout={layout}
        geometry={geometry}
        compact
        label={`Soleil : ${plural(summary.competencies.length, 'compétence observée', 'compétences observées')} dans ${plural(summary.analysedDays, 'journée', 'journées')}`}
        caption={t ? `État cumulé jusqu’au ${formatShort(t)}` : 'État complet des journées cochées'}
      />
      {summary.poles.length > 0 ? (
        <ul className="carto-print-poles" aria-label="Pôles du soleil">
          {summary.poles.map((p) => (
            <li key={p.num}>
              <span className="carto-print-swatch" style={{ background: themeColor(p.color) }} aria-hidden="true" />
              {p.symbol} {p.name} <span className="carto-print-faint">{pct(p.share)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <SunLegend origin={geometry.origin} />
      <footer className="carto-print-foot">
        Document produit le {formatLong(today)}, dans le navigateur de la personne, à partir de ses propres cartographies. Il reflète ses écrits tels que l’analyse les a
        lus.
      </footer>
    </section>
  )
}

function Profile({ refl, summary }) {
  return (
    <section className="carto-print-page" aria-labelledby="carto-print-profile">
      <h2 id="carto-print-profile">Profil</h2>
      <Facts
        items={[
          ['Compétences observées', String(summary.competencies.length)],
          ['Pôles', String(summary.poles.length)],
          ['Traces', `${plural(summary.proofs, 'preuve', 'preuves')}, ${plural(summary.hints, 'indice', 'indices')}`],
          ['Concentration', `${pct(summary.concentration)} du soleil pour les cinq plus grandes parts`],
        ]}
      />
      <table className="carto-print-table">
        <caption>Pôles : part du soleil et confiance moyenne du jury</caption>
        <thead>
          <tr>
            <th scope="col">Pôle</th>
            <th scope="col">Part</th>
            <th scope="col">Confiance moyenne</th>
            <th scope="col">Compétences</th>
          </tr>
        </thead>
        <tbody>
          {summary.poles.map((p) => (
            <tr key={p.num}>
              <th scope="row">
                <span className="carto-print-swatch" style={{ background: themeColor(p.color) }} aria-hidden="true" /> {p.symbol} {p.name}
              </th>
              <td className="carto-num">{pct(p.share)}</td>
              <td className="carto-num">{nf(p.confidence)}</td>
              <td className="carto-num">{p.competencies}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="carto-print-table">
        <caption>Compétences observées, dans l’ordre du référentiel</caption>
        <thead>
          <tr>
            <th scope="col">Compétence</th>
            <th scope="col">Part</th>
            <th scope="col">Confiance moyenne</th>
            <th scope="col">Preuves</th>
            <th scope="col">Indices</th>
            <th scope="col">Journées</th>
          </tr>
        </thead>
        <tbody>
          {summary.competencies.map((c) => (
            <tr key={c.code} style={{ '--pole-color': themeColor(refl.poleByNum.get(c.pole)?.color) }}>
              <th scope="row">
                <span className="carto-code">{c.code}</span> {c.name}
                {c.status === 'needs_review' ? <span className="carto-print-faint"> · renvoi au cartographe</span> : null}
              </th>
              <td className="carto-num">{pct(c.share)}</td>
              <td className="carto-num">
                <span className="carto-print-bar" aria-hidden="true">
                  <span style={{ width: `${Math.round(Math.max(0, Math.min(1, c.confidence ?? 0)) * 100)}%` }} />
                </span>
                {nf(c.confidence)}
              </td>
              <td className="carto-num">{c.proofs}</td>
              <td className="carto-num">{c.hints}</td>
              <td className="carto-num">{c.days}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ReadingPrecautions />
    </section>
  )
}

/** Délibération d'un run AuroraCore : voix (synthèses) et président, sans les délibérations complètes. */
function RunVoices({ run }) {
  if (run === undefined) return <p className="carto-muted">Chargement de la délibération…</p>
  if (!run) return null
  const jury = run.jury && typeof run.jury === 'object' ? run.jury : {}
  const president = run.president && typeof run.president === 'object' ? run.president : null
  const voices = JUROR_ORDER.filter((k) => jury[k] && typeof jury[k] === 'object')
  return (
    <div className="carto-print-run">
      <h4>Délibération du jury (sur tout le journal)</h4>
      {typeof jury.voix_presence === 'number' ? (
        <p className="carto-print-faint">
          {jury.voix_presence} voix pour la présence, {jury.voix_non_etablie ?? 0} non établie, {jury.voix_sans_eclairage ?? 0} sans éclairage
          {jury.consensus === true ? ' · consensus' : jury.consensus === false ? ' · sans consensus' : ''}
        </p>
      ) : null}
      {voices.length > 0 ? (
        <dl className="carto-print-voices">
          {voices.map((k) => (
            <div key={k}>
              <dt>
                {JUROR_LABELS[k] ?? k} — {txt(jury[k].position) || 'position non dite'} · confiance {nf(jury[k].confiance)}
              </dt>
              <dd>{txt(jury[k].synthese)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {president ? (
        <dl className="carto-president">
          {[
            ['points_convergence', 'Points de convergence'],
            ['points_tension', 'Points de tension'],
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
    </div>
  )
}

function Extracts({ traces, code, getDetail }) {
  return (
    <>
      <h4>Extraits ({traces.length})</h4>
      <ol className="carto-print-extracts">
        {traces.map((t) => {
          const vd = verdictDetailOf(getDetail, t.date, t.variantId, code)
          const extract = vd === undefined ? undefined : vd?.traces?.[t.id]?.extract ?? ''
          return (
            <li key={t.id}>
              <p className="carto-print-faint">
                {formatShort(t.date)} · {t.role === 'preuve' ? 'preuve' : 'indice'}
              </p>
              {extract === undefined ? (
                <p className="carto-muted">Chargement…</p>
              ) : extract ? (
                <blockquote className="carto-verbatim">{stripMarkdownMarks(extract)}</blockquote>
              ) : (
                <p className="carto-print-faint">Trace sans extrait.</p>
              )}
            </li>
          )
        })}
      </ol>
    </>
  )
}

function Competency({ code, dataset, refl, state, options, getDetail, getRunDetail }) {
  const meta = refl.compByCode.get(code)
  const s = state.competencies.get(code)
  if (!meta || !s) return null
  const pole = refl.poleByNum.get(meta.pole)
  const observations = reportObservations(dataset, state, code, { scope: options.scope })
  const traces = reportTraces(dataset, state, code, { scope: options.scope })
  const runRefs = [...new Set(observations.map((o) => verdictDetailOf(getDetail, o.date, o.variantId, code)?.runRef).filter(Boolean))]
  return (
    <article className="carto-print-comp" style={{ '--pole-color': themeColor(pole?.color) }} aria-labelledby={`carto-print-c-${code}`}>
      <h3 id={`carto-print-c-${code}`}>
        <span className="carto-code">{code}</span> {meta.name}
      </h3>
      <p className="carto-print-faint">
        {pole?.symbol} {pole?.name} · part {pct(s.theta / 360)} · confiance moyenne {nf(s.confidence)} · {plural(s.days.length, 'journée', 'journées')} ·{' '}
        {plural(s.proofs, 'preuve', 'preuves')}, {plural(s.hints, 'indice', 'indices')}
      </p>
      {options.extracts && traces.length > 0 ? <Extracts traces={traces} code={code} getDetail={getDetail} /> : null}
      {runRefs.map((key) => (
        <RunVoices key={key} run={getRunDetail(key)} />
      ))}
      {observations.map((o) => {
        const vd = verdictDetailOf(getDetail, o.date, o.variantId, code)
        const review = dataset.reviews?.[o.key]
        return (
          <div key={o.key} className="carto-print-obs">
            <h4>
              {formatLong(o.date)} — {verdictStatusLabel(o.verdict)}
            </h4>
            {vd === undefined ? (
              <p className="carto-muted">Chargement…</p>
            ) : (
              <>
                {/* Le statut est dans le titre ; le motif d'un verdict AuroraCore est celui du
                    président, imprimé une fois avec la délibération (D-66). */}
                <VerdictFacts verdict={o.verdict} detail={vd} status={false} texts={!vd?.runRef} />
                {vd?.pedagogue ? <PedagogueReview pedagogue={vd.pedagogue} /> : null}
              </>
            )}
            {options.notes && review && review.state && review.state !== 'unreviewed' ? (
              <p className="carto-print-review">
                <strong>Réponse de la personne : {REVIEW_LABELS[review.state] ?? review.state}</strong>
                {review.note ? ` — ${review.note}` : ''}
              </p>
            ) : null}
          </div>
        )
      })}
    </article>
  )
}

function Jury({ dataset, refl, state, options, getDetail, getRunDetail }) {
  return (
    <section className="carto-print-page" aria-labelledby="carto-print-jury">
      <h2 id="carto-print-jury">Réflexions du jury</h2>
      <p className="carto-print-faint">
        {options.scope === 'all' ? 'Toutes les journées où chaque compétence est observée.' : 'La dernière journée où chaque compétence est observée.'} Niveau de preuve :
        exploratoire — chaque verdict vient d’une analyse automatique (un seul codeur, un modèle de langage).
      </p>
      {options.codes.map((code) => (
        <Competency key={code} code={code} dataset={dataset} refl={refl} state={state} options={options} getDetail={getDetail} getRunDetail={getRunDetail} />
      ))}
    </section>
  )
}

function Comparison({ dataset, refl, params, geometry, options }) {
  const saved = dataset.preferences?.compare ?? null
  const cmp = useMemo(() => (saved?.a && saved?.b ? compareSets(dataset, refl, saved.a, saved.b, { params }) : null), [dataset, refl, saved, params])
  const layouts = useMemo(
    () => (cmp ? [layoutSun(cmp.a.state, refl, geometry, { minThickness: params.minThicknessPx, minArc: params.minArcPx }), layoutSun(cmp.b.state, refl, geometry, { minThickness: params.minThicknessPx, minArc: params.minArcPx })] : null),
    [cmp, refl, geometry, params],
  )
  const story = useMemo(() => (cmp ? changeNarrative(cmp, { nameOf: (c) => refl.compByCode.get(c)?.name ?? c }) : []), [cmp, refl])
  if (!cmp) {
    return (
      <section className="carto-print-page" aria-labelledby="carto-print-cmp">
        <h2 id="carto-print-cmp">Comparaison de soi à soi</h2>
        <p className="carto-muted">Aucune comparaison n’est définie.</p>
      </section>
    )
  }
  const note = dataset.comparisons.find((c) => c.key === `${canonicalJson(saved.a.def)}|${canonicalJson(saved.b.def)}`)?.note ?? ''
  const side = (s) => `« ${s.name} » — ${s.label} : ${plural(s.state.dates.length, 'journée analysée', 'journées analysées')}`
  return (
    <section className="carto-print-page" aria-labelledby="carto-print-cmp">
      <h2 id="carto-print-cmp">Comparaison de soi à soi</h2>
      <p className="carto-print-faint">A et B sont deux sélections des journées de la même personne. La comparaison montre des écarts ; elle ne dit jamais lequel est « meilleur ».</p>
      <Facts
        items={[
          ['A', side(cmp.a)],
          ['B', side(cmp.b)],
        ]}
      />
      {cmp.warnings.length > 0 ? (
        <ul className="carto-print-warnings">
          {cmp.warnings.map((w) => (
            <li key={w.code}>{w.text}</li>
          ))}
        </ul>
      ) : null}
      <div className="carto-print-two">
        {[
          [cmp.a, layouts[0], 'a'],
          [cmp.b, layouts[1], 'b'],
        ].map(([s, layout, key]) => (
          <Sun key={key} refl={refl} state={s.state} layout={layout} geometry={geometry} compact label={`Soleil de ${s.name}`} caption={`${key.toUpperCase()} — ${s.name}`} />
        ))}
      </div>
      <CompactCodes refl={refl} label="Dans A et dans B" codes={cmp.common} />
      <CompactCodes refl={refl} label="Seulement dans A" codes={cmp.onlyA} />
      <CompactCodes refl={refl} label="Seulement dans B" codes={cmp.onlyB} />
      <h3>Ce qui a changé</h3>
      <ul className="carto-print-story">
        {story.map((s) => (
          <li key={s.text}>{s.text}</li>
        ))}
      </ul>
      <ComparePrecautions />
      {options.notes && note ? (
        <p className="carto-print-review">
          <strong>Lecture de la personne :</strong> {note}
        </p>
      ) : null}
    </section>
  )
}

/** Liste compacte de compétences (une page de comparaison doit tenir sur une page). */
function CompactCodes({ refl, label, codes }) {
  return (
    <p className="carto-print-codes">
      <strong>
        {label} ({codes.length})
      </strong>
      {codes.length === 0 ? ' : aucune.' : ' : '}
      {codes.map((c, i) => (
        <span key={c}>
          {i > 0 ? ' · ' : ''}
          <span className="carto-code">{c}</span> {refl.compByCode.get(c)?.name ?? ''}
        </span>
      ))}
    </p>
  )
}

/**
 * Le document du rapport (pages).
 * @param {{dataset: object, refl: object, state: object, layout: object, geometry: object, params: object, t: string | null,
 *   options: typeof DEFAULT_REPORT_OPTIONS, getDetail: Function, getRunDetail: Function, today?: string}} props
 */
export function ReportDocument({ dataset, refl, state, layout, geometry, params, t, options, getDetail, getRunDetail, today = new Date().toISOString().slice(0, 10) }) {
  const summary = useMemo(() => reportSummary(dataset, state, refl), [dataset, state, refl])
  const rootRef = useRef(null)
  // Un rapport est un document : tout ce qui se replie est déplié.
  useLayoutEffect(() => {
    for (const d of rootRef.current?.querySelectorAll('details:not([open])') ?? []) d.open = true
  })
  // Un document pour d'autres : la palette par défaut, quelle que soit celle de l'écran (D-64).
  return (
    <PaletteContext.Provider value={DEFAULT_PALETTE}>
      <div ref={rootRef} className="carto-print-doc">
        <Cover dataset={dataset} refl={refl} state={state} layout={layout} geometry={geometry} t={t} summary={summary} pseudonym={options.pseudonym ?? ''} today={today} />
        <Profile refl={refl} summary={summary} />
        {options.codes.length > 0 ? <Jury dataset={dataset} refl={refl} state={state} options={options} getDetail={getDetail} getRunDetail={getRunDetail} /> : null}
        {options.comparison ? <Comparison dataset={dataset} refl={refl} params={params} geometry={geometry} options={options} /> : null}
      </div>
    </PaletteContext.Provider>
  )
}

/**
 * Aperçu du rapport dans un dialogue ; charge les détails nécessaires avant
 * d'autoriser l'impression.
 * @param {{data: object, onClose: () => void} & Parameters<typeof ReportDocument>[0]} props
 */
export function ReportPreview({ data, onClose, ...doc }) {
  const { dataset, state, options } = doc
  const dialogRef = useRef(null)
  const [host] = useState(() => document.createElement('div'))
  useLayoutEffect(() => {
    host.className = 'carto-print-portal'
    document.body.appendChild(host)
    document.body.classList.add('carto-print-open')
    // Pages A4 seulement pendant l'aperçu (une règle @page ne se limite pas à une classe).
    const page = document.createElement('style')
    page.dataset.cartoPrint = ''
    page.textContent = '@page { size: A4; margin: 14mm 15mm 16mm; }'
    document.head.appendChild(page)
    return () => {
      document.body.classList.remove('carto-print-open')
      host.remove()
      page.remove()
    }
  }, [host])
  useFocusTrap(dialogRef, true, onClose)

  const { ensureDetails, ensureRunDetail, getDetail, getRunDetail } = data
  const dates = useMemo(() => reportDates(dataset, state, options.codes, { scope: options.scope, extracts: options.extracts }), [dataset, state, options])
  useEffect(() => {
    if (dates.length > 0) ensureDetails(dates)
  }, [dates, ensureDetails])
  const detailsReady = dates.every((d) => getDetail(d) !== undefined)
  const runKeys = useMemo(() => {
    if (!detailsReady) return []
    const keys = new Set()
    for (const code of options.codes) {
      for (const o of reportObservations(dataset, state, code, { scope: options.scope })) {
        const ref = verdictDetailOf(getDetail, o.date, o.variantId, code)?.runRef
        if (ref) keys.add(ref)
      }
    }
    return [...keys]
  }, [detailsReady, dataset, state, options, getDetail])
  useEffect(() => {
    for (const k of runKeys) ensureRunDetail(k)
  }, [runKeys, ensureRunDetail])
  const ready = detailsReady && runKeys.every((k) => getRunDetail(k) !== undefined)

  return createPortal(
    <div ref={dialogRef} className="carto-print-overlay" role="dialog" aria-modal="true" aria-labelledby="carto-print-dialog-title">
      <div className="carto-print-toolbar">
        <div>
          <h2 id="carto-print-dialog-title">Aperçu du rapport imprimable</h2>
          <p className="carto-small">Pages A4. Pour un PDF, choisissez « Enregistrer au format PDF » comme imprimante.</p>
        </div>
        <div className="carto-print-actions">
          <button type="button" className="carto-btn" onClick={() => window.print()} disabled={!ready}>
            {ready ? 'Imprimer ou enregistrer en PDF' : 'Préparation des pages…'}
          </button>
          <button type="button" className="carto-btn carto-btn--quiet" onClick={onClose}>
            Fermer l’aperçu
          </button>
        </div>
      </div>
      <div className="carto-print-sheet" aria-busy={!ready}>
        <ReportDocument {...doc} getDetail={getDetail} getRunDetail={getRunDetail} />
      </div>
    </div>,
    host,
  )
}
