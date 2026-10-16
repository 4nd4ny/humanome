// Interface ultime — seconde lecture d'une compétence (journal D-68) : une
// autre analyse des mêmes écrits — un run AuroraCore, six voix et un
// président, sur tout le journal — jointe au jeu sans changer le soleil.
//
// Repliée, sa ligne dit le verdict de ce jury. Dépliée : la décision du
// président d'abord, sans rien déplier ; puis les traces que ce jury a
// retenues (une trace déjà listée plus haut, même jour et même passage, ne
// redit pas son extrait) ; puis les réflexions des membres du jury, une ligne
// par membre ; puis le raisonnement du président, le débat, les pièces. La
// délibération n'est lue qu'à l'ouverture (D-67). Sa date est celle de
// l'analyse, faite après le journal : dite une fois, comme telle (D-69).

import { useEffect, useState } from 'react'
import { runsInDays, verdictStatusLabel } from '../core/model.js'
import { formatLong, formatShort } from '../core/dates.js'
import { plainText } from '../core/restatement.js'
import { PresidentDecision, RunJury } from './Jury.jsx'
import { verdictDetailOf } from './Observations.jsx'

const fmt = (n) => (typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '—')
const SOURCES = { 'aurora-core': 'AuroraCore' }
const SNIPPET = 220
const MIN_SAME = 20 // en deçà, deux extraits qui se recoupent peuvent le faire par hasard

/**
 * Secondes lectures qui portent sur une compétence — sauf un run déjà réparti
 * sur les journées, dont la délibération se lit avec les verdicts par journée.
 */
export function readingsOf(dataset, code) {
  const inDays = runsInDays(dataset)
  return (dataset?.readings ?? []).filter((r) => r?.codes?.[code] && !inDays.has(r.id))
}

const capitalized = (text) => text.charAt(0).toUpperCase() + text.slice(1)

/** Nom d'une seconde lecture : « jury AuroraCore ». */
export function readingName(reading) {
  return `jury ${SOURCES[reading.source] ?? reading.source ?? 'externe'}`
}

/**
 * Quand l'analyse a été faite — après le journal, sur lui tout entier : « analyse
 * faite le 19 avril 2026 » (et non « du 19 avril », qui se lirait comme une
 * journée du journal), ou null.
 */
export function analysisDate(reading) {
  return reading?.analysedAt ? `analyse faite le ${formatLong(reading.analysedAt)}` : null
}

/**
 * Les traces d'une seconde lecture, chacune avec la trace de la liste
 * principale qui cite le même passage le même jour (l'un des extraits
 * contient l'autre), s'il y en a une.
 * @param {Array<{date: string | null, role: string, extract: string}>} readingTraces
 * @param {Array<{date: string, extract: string}>} mainTraces
 */
export function matchTraces(readingTraces, mainTraces) {
  const main = mainTraces.map((m) => ({ ...m, plain: ` ${plainText(m.extract)} ` })).filter((m) => m.plain.trim().length >= MIN_SAME)
  return readingTraces.map((t) => {
    const p = ` ${plainText(t.extract)} `
    const same = p.trim().length >= MIN_SAME ? main.find((m) => m.date === t.date && (m.plain.includes(p) || p.includes(m.plain))) : undefined
    return { ...t, same: same ? { date: same.date } : null }
  })
}

function SecondReading({ reading, code, mainTraces, dated, getRunDetail, ensureRunDetail, onOpenPassage }) {
  const key = `${reading.id}|${code}`
  const s = reading.codes[code]
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (open) ensureRunDetail(key)
  }, [open, key, ensureRunDetail])
  const run = open ? getRunDetail(key) : undefined
  const traces = run ? matchTraces(Array.isArray(run.traces) ? run.traces : [], mainTraces) : []
  return (
    <details className="carto-second-reading" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary title={s.rawStatus ?? undefined}>
        {capitalized(readingName(reading))}
        {dated && analysisDate(reading) ? ` (${analysisDate(reading)})` : ''} : {verdictStatusLabel({ status: s.status })} · confiance {fmt(s.confidence)} · {s.proofs} preuve
        {s.proofs > 1 ? 's' : ''}, {s.hints} indice{s.hints > 1 ? 's' : ''}
      </summary>
      {!open ? null : run === undefined ? (
        <p className="carto-muted">Chargement de la délibération…</p>
      ) : run === null ? (
        <p className="carto-muted">Délibération absente de l’import.</p>
      ) : (
        <div className="carto-jury">
          <PresidentDecision run={run} />
          {traces.length > 0 ? (
            <details className="carto-jury-section">
              <summary>Traces retenues par ce jury</summary>
              <ol className="carto-trace-list">
                {traces.map((t, i) => (
                  <li key={`${t.date}-${i}`} className={`carto-trace carto-trace--${t.role === 'preuve' ? 'preuve' : 'indice'}`}>
                    <div className="carto-trace-meta">
                      <span>{t.date ? formatShort(t.date) : 'sans date'}</span>
                      <span className="carto-role">{t.role === 'preuve' ? 'preuve' : 'indice'}</span>
                    </div>
                    {t.same ? (
                      <p className="carto-small carto-muted">Le même passage qu’une trace listée plus haut.</p>
                    ) : t.extract ? (
                      <blockquote className="carto-trace-quote">{t.extract.length > SNIPPET ? `${t.extract.slice(0, SNIPPET).trimEnd()}…` : t.extract}</blockquote>
                    ) : null}
                    {t.extract && t.date && onOpenPassage ? (
                      <button
                        type="button"
                        className="carto-btn carto-btn--quiet carto-btn--small"
                        onClick={() => onOpenPassage({ date: t.date, extract: t.extract, label: `Trace retenue par le ${readingName(reading)} (seconde lecture)` })}
                      >
                        Ouvrir dans le portfolio
                      </button>
                    ) : null}
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
          <RunJury run={run} decision={false} />
        </div>
      )}
    </details>
  )
}

/**
 * Secondes lectures d'une compétence, sous ses verdicts par journée.
 * @param {{dataset: object, code: string, traces: Array<{id: string, date: string, variantId: string}>,
 *   getDetail: Function, getRunDetail: Function, ensureRunDetail: (key: string) => void,
 *   onOpenPassage?: (p: {date: string, extract: string, label?: string}) => void}} props
 *   traces : celles de la liste principale (un passage qui y est déjà ne se redit pas)
 */
export function SecondReadings({ dataset, code, traces = [], getDetail, getRunDetail, ensureRunDetail, onOpenPassage }) {
  const readings = readingsOf(dataset, code)
  if (readings.length === 0) return null
  const mainTraces = traces.map((t) => ({ date: t.date, extract: verdictDetailOf(getDetail, t.date, t.variantId, code)?.traces?.[t.id]?.extract ?? '' }))
  // Une lecture : sa date se dit une fois, ici ; plusieurs : chacune sur sa ligne.
  const single = readings.length === 1 ? analysisDate(readings[0]) : null
  return (
    <section className="carto-second-readings" aria-label="Seconde lecture">
      <h3>Seconde lecture</h3>
      <p className="carto-small carto-muted">
        {single
          ? `Une autre analyse des mêmes écrits, faite sur tout le journal d’un coup (${single}) : elle se lit ici et ne change pas le soleil.`
          : 'D’autres analyses des mêmes écrits, faites chacune sur tout le journal d’un coup : elles se lisent ici et ne changent pas le soleil.'}
      </p>
      {readings.map((r) => (
        <SecondReading
          key={r.id}
          reading={r}
          code={code}
          mainTraces={mainTraces}
          dated={readings.length > 1}
          getRunDetail={getRunDetail}
          ensureRunDetail={ensureRunDetail}
          onOpenPassage={onOpenPassage}
        />
      ))}
    </section>
  )
}

/**
 * Rapport de pôle d'une seconde lecture (porte sur tout le journal), lu à
 * l'ouverture.
 */
export function PoleReading({ reading, num, getRunDetail, ensureRunDetail, render }) {
  const key = `${reading.id}|pole:${num}`
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (open) ensureRunDetail(key)
  }, [open, key, ensureRunDetail])
  const run = open ? getRunDetail(key) : undefined
  return (
    <details className="carto-run-jury" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        Rapport de pôle — seconde lecture, {readingName(reading)} (porte sur tout le journal{analysisDate(reading) ? ` ; ${analysisDate(reading)}` : ''})
      </summary>
      {!open ? null : run === undefined ? <p className="carto-muted">Chargement…</p> : run ? render(run) : <p className="carto-muted">Rapport absent de l’import.</p>}
    </details>
  )
}
