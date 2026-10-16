// Interface ultime — panneau de détail d'un pôle, partie « rapports » (spec
// §6.4) : rapport de pôle de chaque journée (portrait, territoires denses,
// pistes) et passages saillants repliables, ouvrables dans le portfolio. Les
// « territoires non visités » et les « émergences » ne sont PAS affichés, ni
// le rapport complet rédigé qui les contient : une compétence non observée
// n'est jamais listée comme manquante (§1.2, D-16).

import { contributingVariant, runIdOf, runsInDays } from '../core/model.js'
import { needPole } from '../core/split.js'
import { formatLong, formatShort } from '../core/dates.js'
import { plainText } from '../core/restatement.js'
import { Markdown } from './Jury.jsx'
import { PoleReading } from './SecondReading.jsx'

const txt = (v) => (v === null || v === undefined ? '' : String(v))

/**
 * Les passages saillants d'un rapport, rapprochés des territoires denses qui
 * citent déjà leur extrait — le même, de la même journée : un tel passage se
 * lit sous son territoire, par son seul contexte, l'extrait ne se redit pas
 * (journal D-66) ; les autres se lisent à part, entiers, avec leur propre
 * lien (un passage qui n'est qu'une partie de l'extrait cité dit laquelle ;
 * un passage d'une autre feuille s'ouvre à sa date).
 * @param {object[]} passages
 * @param {object[] | null | undefined} denseTerritories
 * @param {string} date journée du rapport
 * @returns {{byTerritory: Map<number, object[]>, others: object[]}} byTerritory : par indice de territoire
 */
export function placePassages(passages, denseTerritories, date) {
  const cited = (denseTerritories ?? []).map((d, i) => ({ i, text: plainText(d?.extraitVerbatim) })).filter((c) => c.text)
  const byTerritory = new Map()
  const others = []
  for (const p of passages) {
    const e = plainText(p?.extract)
    const hit = e && (!p?.date || p.date === date) ? cited.find((c) => c.text === e) : undefined
    if (hit) byTerritory.set(hit.i, [...(byTerritory.get(hit.i) ?? []), p])
    else others.push(p)
  }
  return { byTerritory, others }
}

function PassageItem({ extract, context, date, label, onOpenPassage }) {
  return (
    <li>
      {extract ? <blockquote className="carto-trace-quote">{txt(extract)}</blockquote> : null}
      {context ? <p className="carto-small">{txt(context)}</p> : null}
      {extract && onOpenPassage ? (
        <button type="button" className="carto-btn carto-btn--quiet carto-btn--small" onClick={() => onOpenPassage({ date, extract, label })}>
          Ouvrir dans le portfolio
        </button>
      ) : null}
    </li>
  )
}

/**
 * @param {{num: number, dates: string[], dataset: object, getDetail: Function, getRunDetail: Function,
 *   ensureRunDetail?: (key: string) => void,
 *   onOpenPassage: (p: {date: string, extract: string, label?: string}) => void}} props
 *   dates : journées de l'état affiché où le pôle est observé
 */
export function PoleReports({ num, dates, dataset, getDetail, getRunDetail, ensureRunDetail, onOpenPassage }) {
  const byDate = new Map(dataset.days.map((d) => [d.date, d]))
  const ordered = [...dates].sort().reverse() // la plus récente d'abord
  const runIds = []
  const blocks = ordered.map((date) => {
    const variant = contributingVariant(byDate.get(date))
    const detail = getDetail(date, needPole(num))
    const vd = detail === undefined ? undefined : detail?.variants?.[variant?.id] ?? null
    const runId = runIdOf(variant)
    if (runId && !runIds.includes(runId)) runIds.push(runId)
    return { date, vd }
  })
  // Une journée dont le rapport n'a rien d'affichable (un texte complet seul, D-16) n'ouvre pas de bloc vide.
  const shown = (r) => Boolean(txt(r?.portrait).trim() || r?.denseTerritories?.length || r?.leads?.length)
  const withReports = blocks.filter((b) => b.vd === undefined || shown(b.vd?.poleReports?.[num]) || b.vd?.passages?.some((p) => Number(p.pole) === num))
  // Secondes lectures (D-68) : le rapport du pôle de chacune, lu à l'ouverture.
  const inDays = runsInDays(dataset)
  const readings = ensureRunDetail ? (dataset.readings ?? []).filter((r) => !inDays.has(r.id) && (r.poles ?? []).includes(num)) : []

  return (
    <section className="carto-pole-reports" aria-label="Rapports du pôle">
      {runIds.map((runId) => {
        const run = getRunDetail(`${runId}|pole:${num}`)
        if (run === null) return null
        return (
          <details key={runId} className="carto-run-jury">
            <summary>Rapport de pôle — {runId} (porte sur tout le journal)</summary>
            {run === undefined ? <p className="carto-muted">Chargement…</p> : <Markdown text={run.report ?? run.reading ?? ''} />}
          </details>
        )
      })}
      {readings.map((r) => (
        <PoleReading key={r.id} reading={r} num={num} getRunDetail={getRunDetail} ensureRunDetail={ensureRunDetail} render={(run) => <Markdown text={run.report ?? run.reading ?? ''} />} />
      ))}
      {withReports.length > 0 ? <h3>Rapports de pôle par journée</h3> : null}
      {withReports.map(({ date, vd }, i) => {
        const report = vd?.poleReports?.[num] ?? null
        const { byTerritory, others: passages } = placePassages(
          (vd?.passages ?? []).filter((p) => Number(p.pole) === num),
          report?.denseTerritories,
          date,
        )
        return (
          <details key={date} className="carto-pole-report" open={i === 0 || undefined}>
            <summary>{formatShort(date)}</summary>
            {vd === undefined ? <p className="carto-muted">Chargement…</p> : null}
            {report?.portrait ? <p>{txt(report.portrait)}</p> : null}
            {report?.denseTerritories?.length ? (
              <>
                <h4>Territoires denses</h4>
                <ul className="carto-plain-list">
                  {report.denseTerritories.map((d, ti) => (
                    <li key={`${txt(d?.competence)}|${txt(d?.extraitVerbatim).slice(0, 40)}`}>
                      <p>
                        <strong>{txt(d?.competence)}</strong> — {txt(d?.description)}
                      </p>
                      {d?.extraitVerbatim ? <blockquote className="carto-trace-quote">{txt(d.extraitVerbatim)}</blockquote> : null}
                      {d?.ceQueCaDit ? <p className="carto-small">{txt(d.ceQueCaDit)}</p> : null}
                      {/* Le même extrait, relevé aussi comme passage saillant : son contexte seul (D-66). */}
                      {[...new Set((byTerritory.get(ti) ?? []).map((p) => txt(p.context).trim()).filter(Boolean))].map((context) => (
                        <p key={context} className="carto-small carto-muted">
                          Passage saillant : {context}
                        </p>
                      ))}
                      {d?.extraitVerbatim ? (
                        <button
                          type="button"
                          className="carto-btn carto-btn--quiet carto-btn--small"
                          onClick={() => onOpenPassage({ date, extract: d.extraitVerbatim, label: `Territoire dense : ${txt(d.competence)}` })}
                        >
                          Ouvrir dans le portfolio
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {report?.leads?.length ? (
              <>
                <h4>Pistes</h4>
                <ul>
                  {[...new Set(report.leads.map(txt))].map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {passages.length > 0 ? (
              <details>
                <summary>
                  {byTerritory.size > 0 ? 'Autres passages saillants' : 'Passages saillants'} ({passages.length})
                </summary>
                <ul className="carto-plain-list">
                  {passages.map((p) => (
                    <PassageItem
                      key={`${txt(p.pid)}|${p.date}`}
                      extract={p.extract}
                      context={p.context}
                      date={p.date ?? date}
                      label={`Passage saillant du ${formatLong(p.date ?? date)}`}
                      onOpenPassage={onOpenPassage}
                    />
                  ))}
                </ul>
              </details>
            ) : null}
          </details>
        )
      })}
    </section>
  )
}
