// Interface ultime — vue « employeur » d'une version partagée (spec §12.1) :
// lecture seule, soleil, heatmap (si les dates ne sont pas masquées) et
// extraits choisis. Ni comparaison, ni droit de réponse, ni réseau : tout ce
// qui s'affiche est dans le document publié. C'est aussi l'APERÇU VERROUILLÉ
// que voit l'apprenant avant de publier : le même composant, les mêmes
// données, donc exactement ce que verra le destinataire.

import { useId, useMemo, useState } from 'react'
import { layoutPole, layoutSun } from '../core/state.js'
import { DEFAULT_PARAMS, ringGeometry } from '../core/formulas.js'
import { calendarGrid } from '../core/heatmap.js'
import { formatLong, monthName, todayIso } from '../core/dates.js'
import { PRECISION_LABELS, formatSharedDate, garantieScope, sharedState } from '../core/share.js'
import { Sun } from './Sun.jsx'
import { usePrefersReducedMotion } from './Player.jsx'
import { heatColor, inkOn } from './colors.js'
import './carto.css'

const GEOMETRY = ringGeometry({ outerRadius: 190, centerRadius: 30, gap: 5 })
const pct = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 })
const num = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`

/** Jour de publication dans le fuseau du lecteur (l'horodatage est en UTC). */
function publishedDay(iso) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? String(iso ?? '').slice(0, 10) : formatLong(todayIso(d))
}

/** « du 22 décembre 2025 au 5 janvier 2026 », « d’avril à juin 2026 »… */
export function periodLabel({ from, to }, precision) {
  const a = formatSharedDate(from, precision)
  const b = formatSharedDate(to, precision)
  if (from === to) return a
  if (precision === 'month') return `${/^[aeiouyâàéèêëîïôöûüh]/iu.test(a) ? 'd’' : 'de '}${a} à ${b}`
  return `du ${a} au ${b}`
}

/** Mois AAAA-MM de `from` à `to` inclus. */
function monthsBetween(from, to) {
  const out = []
  let [y, m] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return out
}

/** Heatmap figée de la version partagée : par mois, ou calendrier par jour. */
function SharedHeatmap({ heatmap, period }) {
  const cells = useMemo(() => new Map(heatmap.cells.map((c) => [c.key, c])), [heatmap])
  const label = (key) => {
    const c = cells.get(key)
    const when = formatSharedDate(key, heatmap.precision)
    return c ? `${when} : ${plural(c.days, 'journée', 'journées')}, niveau ${c.level} sur 5` : `${when} : rien de partagé`
  }

  if (heatmap.precision === 'month') {
    const months = period ? monthsBetween(period.from, period.to) : heatmap.cells.map((c) => c.key)
    return (
      <figure className="carto-shared-heat">
        <ol className="carto-shared-months" aria-label="Activité par mois">
          {months.map((key, i) => {
            const c = cells.get(key)
            const year = i === 0 || key.endsWith('-01') ? key.slice(0, 4) : null
            return (
              <li key={key} title={label(key)} className={c ? '' : 'is-silent'} style={c ? { background: heatColor(c.level, null), color: inkOn(heatColor(c.level, null)) } : undefined}>
                <span aria-hidden="true">
                  {monthName(key, { short: true })}
                  {year ? <small>{year}</small> : null}
                </span>
                <span className="carto-visually-hidden">{label(key)}</span>
              </li>
            )
          })}
        </ol>
        <figcaption className="carto-small carto-muted">Plus la case est foncée, plus les compétences partagées sont observées ce mois-là (niveaux relatifs à cette personne).</figcaption>
      </figure>
    )
  }

  const from = period?.from ?? heatmap.cells[0]?.key
  const to = period?.to ?? heatmap.cells.at(-1)?.key
  if (!from || !to) return null
  return <SharedCalendar from={from} to={to} cells={cells} label={label} />
}

function SharedCalendar({ from, to, cells, label }) {
  const { weeks, months } = useMemo(() => calendarGrid({ from, to }), [from, to])
  const CELL = 11
  const STEP = 13
  const LEFT = 4
  const TOP = 14
  const width = LEFT + weeks.length * STEP
  const height = TOP + 7 * STEP
  return (
    <figure className="carto-shared-heat">
      <div className="carto-hm-scroll">
        <svg className="carto-hm" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Activité par journée, du ${formatLong(from)} au ${formatLong(to)} : ${plural(cells.size, 'journée partagée', 'journées partagées')}`}>
          {months.map((m) => (
            <text key={m.key} className="carto-hm-month" x={LEFT + m.week * STEP} y={TOP - 4}>
              {m.label}
            </text>
          ))}
          {weeks.map((w, wi) =>
            w.days.map((date, row) => {
              if (!date) return null
              const c = cells.get(date)
              return (
                <rect key={date} x={LEFT + wi * STEP} y={TOP + row * STEP} width={CELL} height={CELL} rx={2} className={c ? 'carto-hm-cell' : 'carto-hm-cell is-silent'} fill={c ? heatColor(c.level, null) : 'transparent'}>
                  <title>{label(date)}</title>
                </rect>
              )
            }),
          )}
        </svg>
      </div>
      <figcaption className="carto-small carto-muted">Une case par jour ; plus elle est foncée, plus les compétences partagées y sont observées (niveaux relatifs à cette personne).</figcaption>
    </figure>
  )
}

/**
 * @param {{doc: object, garantie?: object | null, preview?: boolean}} props
 *   `preview` : aperçu verrouillé avant publication. Le titre affiché est
 *   celui de l'instantané (figé, relu avant publication).
 *   `garantie` : {par, date} quand un cartographe a publié la version à la
 *   demande de l'apprenant (journal D-42) ; sinon la vue dit qu'elle a été
 *   publiée par la personne elle-même.
 */
export function SharedView({ doc, garantie = null, preview = false }) {
  const read = useMemo(() => {
    try {
      const shared = sharedState(doc)
      return { ...shared, layout: layoutSun(shared.state, shared.ref, GEOMETRY, { minThickness: DEFAULT_PARAMS.minThicknessPx, minArc: DEFAULT_PARAMS.minArcPx }) }
    } catch {
      return null
    }
  }, [doc])
  if (!read) {
    return (
      <p role="alert" className="carto-error">
        Cette version partagée est illisible : elle a peut-être été produite par une autre version du site.
      </p>
    )
  }
  return <SharedDocument doc={doc} garantie={garantie} preview={preview} refl={read.ref} state={read.state} layout={read.layout} />
}

function SharedDocument({ doc, garantie, preview, refl, state, layout }) {
  const uid = useId()
  const [selection, setSelection] = useState(null)
  const [hover, setHover] = useState(null)
  // Pôle ouvert sur 360° (journal D-45), comme dans l'interface.
  const [zoom, setZoom] = useState(null)
  const reducedMotion = usePrefersReducedMotion()
  const zoomLayout = useMemo(
    () => (zoom != null ? layoutPole(state, refl, GEOMETRY, zoom, { minThickness: DEFAULT_PARAMS.minThicknessPx, minArc: DEFAULT_PARAMS.minArcPx }) : null),
    [state, refl, zoom],
  )
  // Choisir une compétence (ou un pôle) d'un autre pôle referme le pôle ouvert.
  const select = (t) => {
    setSelection(t)
    const pole = t?.type === 'pole' ? t.num : t?.type === 'competency' ? refl.compByCode.get(t.code)?.pole : null
    if (zoom != null && pole != null && pole !== zoom) setZoom(null)
  }
  const precision = doc.datePrecision
  const extractsByCode = useMemo(() => {
    const map = new Map()
    for (const e of doc.extracts ?? []) {
      if (!map.has(e.code)) map.set(e.code, [])
      map.get(e.code).push(e)
    }
    for (const list of map.values()) list.sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')))
    return map
  }, [doc])
  const title = doc.title
  const periodText = doc.period ? periodLabel(doc.period, precision) : 'dates masquées par son auteur'
  const Heading = preview ? 'h3' : 'h1'
  const Sub = preview ? 'h4' : 'h2'

  const focusCodes = selection?.type === 'competency' ? new Set([selection.code]) : selection?.type === 'pole' ? new Set(state.poles.get(selection.num)?.codes ?? []) : null

  return (
    <article className={`carto-app carto-shared${preview ? ' carto-shared--preview' : ''}`} aria-labelledby={`${uid}-title`}>
      <header className="carto-shared-head">
        <Heading id={`${uid}-title`}>{title}</Heading>
        <p className="carto-shared-lede">Cartographie de compétences partagée par son auteur, en lecture seule.</p>
        <dl className="carto-shared-facts">
          <div>
            <dt>Période</dt>
            <dd>{periodText}</dd>
          </div>
          <div>
            <dt>Journées</dt>
            <dd>{plural(state.dates.length, 'journée de portfolio', 'journées de portfolio')}</dd>
          </div>
          <div>
            <dt>Compétences</dt>
            <dd>{plural(state.competencies.size, 'compétence observée', 'compétences observées')}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>figée le {publishedDay(doc.publishedAt)}</dd>
          </div>
        </dl>
        {garantie ? (
          <p className="carto-shared-garantie" data-testid="share-garantie">
            <strong>
              Relue et garantie par {garantie.par || 'son cartographe'}
              {garantie.date ? `, le ${formatLong(String(garantie.date).slice(0, 10))}` : ''}
            </strong>
            , qui atteste avoir vérifié {garantieScope()}.
          </p>
        ) : (
          <p className="carto-small carto-muted" data-testid="share-sans-garantie">
            Publiée par la personne elle-même : aucun cartographe ne l’a garantie.
          </p>
        )}
      </header>

      <div className="carto-shared-grid">
        <section className="carto-shared-visual" aria-label="Soleil des compétences">
          <Sun
            refl={refl}
            state={state}
            layout={zoomLayout ?? layout}
            geometry={GEOMETRY}
            selection={selection}
            hover={hover}
            label={`Soleil : ${plural(state.competencies.size, 'compétence partagée', 'compétences partagées')}`}
            caption="Choisissez un secteur pour lire la compétence et ses extraits."
            onSelect={select}
            onHover={setHover}
            zoom={zoom}
            onZoom={setZoom}
            reducedMotion={reducedMotion}
          />
          {doc.heatmap ? <SharedHeatmap heatmap={doc.heatmap} period={doc.period} /> : <p className="carto-small carto-muted">Les dates ont été masquées : la heatmap n’est pas partagée.</p>}
          <details className="carto-shared-howto">
            <summary>Comment lire ce soleil</summary>
            <ul className="carto-small">
              <li>Chaque secteur extérieur est une compétence observée dans le portfolio réflexif de la personne. Son angle est sa part des traces relevées dans l’ensemble partagé : plus une compétence a de traces, plus son secteur est large.</li>
              <li>Sa hauteur est la confiance moyenne du jury dans ses verdicts (de 0 à 1) : ce n’est ni un niveau de maîtrise ni une note. L’anneau intérieur regroupe les compétences par pôle.</li>
              <li>Un double-clic sur un pôle de l’anneau intérieur l’ouvre sur tout le cercle : ses seules compétences, chacune selon sa part des traces du pôle. Un clic au centre ramène à tous les pôles.</li>
              <li>Un secteur hachuré signale une présence encore à confirmer.</li>
              <li>Ce document montre ce que la personne a choisi de partager : il ne classe pas, ne compare à personne et ne dit rien de ce qui n’a pas été partagé.</li>
            </ul>
          </details>
        </section>

        <section className="carto-shared-list" aria-labelledby={`${uid}-list`}>
          <Sub id={`${uid}-list`} className="carto-visually-hidden">
            Compétences et extraits
          </Sub>
          {refl.poles
            .filter((p) => state.poles.has(p.num))
            .map((p) => (
              <section key={p.num} className="carto-shared-pole" style={{ '--pole-color': p.color }} aria-label={`Pôle ${p.name}`}>
                <Sub className="carto-shared-pole-name">
                  <span aria-hidden="true">{p.symbol}</span> {p.name}
                </Sub>
                <ul>
                  {state.poles
                    .get(p.num)
                    .codes.map((code) => {
                      const c = state.competencies.get(code)
                      const meta = refl.compByCode.get(code)
                      const extracts = extractsByCode.get(code) ?? []
                      const dimmed = focusCodes && !focusCodes.has(code)
                      return (
                        <li key={code} className={`carto-shared-comp${dimmed ? ' is-dimmed' : ''}${focusCodes?.has(code) ? ' is-focus' : ''}`}>
                          <p className="carto-shared-comp-name">
                            <span className="carto-code">{code}</span> {meta?.name ?? code}
                            {c.status === 'needs_review' ? <span className="carto-chip carto-shared-chip">à confirmer</span> : null}
                          </p>
                          <p className="carto-small carto-muted">
                            Part {pct.format(c.theta / 360)}, confiance {num.format(c.confidence ?? 0)}, {plural(c.days.length, 'journée', 'journées')} ({plural(c.proofs ?? 0, 'preuve', 'preuves')}, {plural(c.hints ?? 0, 'indice', 'indices')})
                          </p>
                          {meta?.description ? <p className="carto-small carto-shared-desc">{meta.description}</p> : null}
                          {extracts.length > 0 ? (
                            <ul className="carto-shared-extracts" aria-label={`Extraits choisis pour ${meta?.name ?? code}`}>
                              {extracts.map((e, i) => (
                                <li key={i}>
                                  <blockquote className="carto-verbatim">{e.text}</blockquote>
                                  <p className="carto-small carto-muted">
                                    {e.role === 'preuve' ? 'Preuve' : 'Indice'}
                                    {e.date ? `, ${formatSharedDate(e.date, precision)}` : ''}
                                  </p>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      )
                    })}
                </ul>
              </section>
            ))}
        </section>
      </div>

      <footer className="carto-shared-foot carto-small carto-muted">
        <p>
          Version figée : elle ne change pas tant que son auteur n’en publie pas une nouvelle. Dates {PRECISION_LABELS[precision] ?? 'masquées'}.
          {preview ? null : ' Son auteur peut révoquer ce lien à tout moment.'}
        </p>
        <p>Référentiel : {doc.referential?.label ?? refl.label}. humanome.xyz ne dépose ni traceur ni statistique tierce.</p>
      </footer>
    </article>
  )
}
