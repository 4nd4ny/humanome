// Interface ultime — lecteur de portfolio surligné (spec §8.1, « fonction à
// conserver impérativement »).
//
// Volet latéral (non modal) ouvert depuis le bouton « Ouvrir dans le
// portfolio » d'une trace : liste des traces, réflexions du jury, modale d'un
// jour, passages saillants d'un pôle. Le texte vient du portfolio importé
// (segment daté), rendu en Markdown assaini ; le passage est surligné en
// jaune (début et fin retrouvés) ou en orange (un seul bout). Toutes les
// occurrences sont trouvées ; trace précédente / suivante, retour à la
// compétence, changement de jour. Le surlignage fonctionne dans toute
// cartographie fusionnée : chaque trace garde sa journée et la date de son
// passage. Hors ligne : aucun réseau, aucun nouvel onglet.

import { useEffect, useMemo, useRef, useState } from 'react'
import { formatLong, formatShort, weekdayName } from '../core/dates.js'
import { hasPortfolio } from '../core/model.js'
import { splitExtract } from '../core/highlight.js'
import { findPassage } from '../core/passages.js'
import { approximateInPortfolio, highlightHtml, locateInPortfolio, renderPortfolio } from './highlight-dom.js'

const ROLE_LABELS = { preuve: 'preuve', indice: 'indice' }

/**
 * Ce qu'il faut chercher pour la cible courante.
 * @returns {{loading: boolean, anchors: object | null, extract: string, primary: string, secondary: string | null,
 *   role: string | null, synthetic: boolean, ref: object | null}}
 */
function resolveTarget(target, getDetail) {
  if (target.kind === 'passage') {
    const extract = target.extract ?? ''
    return { loading: false, anchors: extract ? splitExtract(extract) : null, extract, primary: target.date, secondary: null, role: null, synthetic: false, ref: null }
  }
  const ref = target.list[target.index]
  const detail = getDetail(ref.date)
  if (detail === undefined) return { loading: true, anchors: null, extract: '', primary: ref.date, secondary: null, role: ref.role ?? null, synthetic: false, ref }
  const td = detail?.variants?.[ref.variantId]?.verdicts?.[target.code]?.traces?.[ref.id] ?? null
  const extract = td?.extract ?? ''
  const anchors = !extract ? null : td.start ? { start: td.start, end: td.end ?? null } : splitExtract(extract)
  return {
    loading: false,
    anchors,
    extract,
    primary: td?.sourceDate ?? ref.date,
    secondary: ref.date,
    role: ref.role ?? td?.role ?? null,
    synthetic: Boolean(td?.synthetic) || (td !== null && !extract),
    ref,
  }
}

/**
 * @param {{
 *   target: {kind: 'trace', code: string, list: Array<{id: string, date: string, variantId: string, role?: string}>, index: number}
 *         | {kind: 'passage', date: string, extract: string, label?: string},
 *   dataset: object, refl: object,
 *   getDetail: (date: string) => object | null | undefined, ensureDetails: (dates: string[]) => Promise<void>,
 *   reducedMotion?: boolean,
 *   onClose: () => void, onIndex?: (i: number) => void, onBackToCompetency?: (code: string) => void,
 * }} props
 */
export function PortfolioReader({ target, dataset, refl, getDetail, ensureDetails, reducedMotion = false, onClose, onIndex, onBackToCompetency }) {
  const headingRef = useRef(null)
  const textRef = useRef(null)
  const targetKey = target.kind === 'trace' ? `${target.code}|${target.list[target.index]?.id}` : `passage|${target.date}|${target.extract}`
  // Journée choisie à la main (changement de jour) et occurrence courante :
  // remises à zéro quand la cible change (ajustement pendant le rendu, sans effet).
  const [view, setView] = useState({ key: targetKey, date: null, occurrence: 0 })
  if (view.key !== targetKey) setView({ key: targetKey, date: null, occurrence: 0 })
  const viewDate = view.key === targetKey ? view.date : null
  const occurrence = view.key === targetKey ? view.occurrence : 0
  const setViewDate = (date) => setView((v) => ({ ...v, date }))
  const setOccurrence = (i) => setView((v) => ({ ...v, occurrence: i }))

  // Focus sur le titre à l'ouverture ; rendu au déclencheur à la fermeture.
  useEffect(() => {
    const opener = document.activeElement
    headingRef.current?.focus()
    return () => {
      if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus()
    }
  }, [])

  const portfolioDates = useMemo(() => dataset.days.filter(hasPortfolio).map((d) => d.date), [dataset])
  const want = useMemo(() => resolveTarget(target, getDetail), [target, getDetail])
  const own = useMemo(() => [...new Set([want.primary, want.secondary].filter(Boolean))], [want])

  // Chargement paresseux : la journée de la trace d'abord, les autres
  // journées seulement si le passage n'y est pas retrouvé en entier.
  useEffect(() => {
    const first = target.kind === 'trace' ? target.list[target.index]?.date : target.date
    ensureDetails([first, ...own].filter(Boolean))
  }, [target, own, ensureDetails])

  const ownLoaded = !want.loading && own.every((d) => getDetail(d) !== undefined)
  const ownFound = useMemo(
    () => ownLoaded && want.anchors !== null && own.some((d) => (locateInPortfolio(getDetail(d)?.portfolio, want.anchors) ?? []).some((r) => r.complete)),
    [ownLoaded, want, own, getDetail],
  )
  const needAll = ownLoaded && want.anchors !== null && !ownFound
  const allLoaded = !needAll || portfolioDates.every((d) => getDetail(d) !== undefined)

  useEffect(() => {
    if (needAll) ensureDetails(portfolioDates)
  }, [needAll, portfolioDates, ensureDetails])

  // getDetail change à chaque détail chargé : le résultat s'affine au fil du chargement.
  const result = useMemo(() => {
    if (!ownLoaded || want.anchors === null) return null
    return findPassage({
      primary: want.primary,
      secondary: want.secondary,
      dates: needAll ? portfolioDates : own,
      locate: (d) => (getDetail(d) === undefined ? null : locateInPortfolio(getDetail(d)?.portfolio, want.anchors)),
      approximate: (d) => (getDetail(d) === undefined ? null : approximateInPortfolio(getDetail(d)?.portfolio, want.extract)),
    })
  }, [ownLoaded, want, needAll, portfolioDates, own, getDetail])

  const shownDate = viewDate ?? result?.date ?? want.primary
  const shownDetail = getDetail(shownDate)
  const ranges = useMemo(() => (result && shownDate === result.date ? result.ranges : []), [result, shownDate])
  const current = ranges.length > 0 ? Math.min(occurrence, ranges.length - 1) : null
  const body = useMemo(() => {
    const portfolio = shownDetail?.portfolio
    if (!portfolio) return null
    const { html } = renderPortfolio(portfolio)
    // L'occurrence courante n'est cerclée que s'il y en a plusieurs.
    return ranges.length > 0 ? highlightHtml(html, ranges, { current: ranges.length > 1 ? current : null }).html : html
  }, [shownDetail, ranges, current])

  // Défilement centré sur le premier segment de l'occurrence courante.
  useEffect(() => {
    const box = textRef.current
    if (!box || current === null) return
    const mark = box.querySelector(`mark[data-occurrence="${current}"]`)
    mark?.scrollIntoView?.({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' })
  }, [body, current, reducedMotion])

  const dayIndex = portfolioDates.indexOf(shownDate)
  const prevDay = dayIndex >= 0 ? portfolioDates[dayIndex - 1] ?? null : portfolioDates.filter((d) => d < shownDate).at(-1) ?? null
  const nextDay = dayIndex >= 0 ? portfolioDates[dayIndex + 1] ?? null : portfolioDates.find((d) => d > shownDate) ?? null
  const showDay = (d) => {
    ensureDetails([d])
    setViewDate(d)
  }

  const meta = target.kind === 'trace' ? refl.compByCode.get(target.code) : null
  const searching = needAll && !allLoaded

  let status = null
  if (want.loading || (!ownLoaded && !want.synthetic)) status = { tone: 'muted', text: 'Chargement du portfolio…' }
  else if (portfolioDates.length === 0) status = { tone: 'warn', text: 'Aucun portfolio importé : importez le texte du portfolio (.md) avec vos analyses pour lire les passages surlignés.' }
  else if (!want.anchors) status = { tone: 'warn', text: 'Trace reconstituée depuis des compteurs : son extrait n’est pas connu, il n’y a rien à surligner.' }
  else if (searching) status = { tone: 'muted', text: 'Passage non retrouvé en entier dans sa journée : recherche dans les autres journées…' }
  else if (result?.status === 'found') status = { tone: 'ok', text: ranges.some((r) => r.complete) ? 'Passage retrouvé : début et fin, surligné en jaune.' : 'Passage retrouvé.' }
  else if (result?.status === 'partial') status = { tone: 'warn', text: 'Un seul bout du passage est retrouvé (surligné en orange) : l’extrait du jury a pu être tronqué ou reformulé.' }
  else if (result?.status === 'approximate')
    status = {
      tone: 'warn',
      text: `Passage approché : l’extrait du jury ne figure pas mot pour mot dans le portfolio (reformulé par l’analyse). Le passage le plus proche, qui en contient ${Math.round((result.share ?? 0) * 100)} % des mots, est encadré en pointillés : à vérifier. Voici l’extrait tel que le jury l’a cité.`,
    }
  else if (result?.status === 'relocated')
    status = { tone: 'warn', text: `Passage retrouvé tel quel dans la feuille du ${formatLong(result.date)}, alors que la trace est datée du ${formatLong(want.primary)} (décalage de date dans l’analyse).` }
  else if (result?.status === 'not-found' || result?.status === 'no-text')
    status = {
      tone: 'warn',
      text: getDetail(want.primary)?.portfolio
        ? 'Passage non retrouvé dans le portfolio importé : l’extrait du jury a pu être reformulé (défaut connu d’AuroraCore). Voici l’extrait tel que le jury l’a cité.'
        : `Pas de portfolio importé pour le ${formatLong(want.primary)}, et le passage n’a été retrouvé dans aucune autre journée.`,
    }

  const n = target.kind === 'trace' ? target.list.length : 1
  const k = target.kind === 'trace' ? target.index : 0

  return (
    <section
      className="carto-reader"
      role="region"
      aria-labelledby="carto-reader-title"
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.stopPropagation()
        onClose()
      }}
    >
      <header className="carto-reader-head">
        <div>
          <p className="carto-detail-kicker">Lecteur de portfolio</p>
          <h2 id="carto-reader-title" ref={headingRef} tabIndex={-1}>
            {weekdayName(shownDate)} {formatLong(shownDate)}
          </h2>
        </div>
        <button type="button" className="carto-btn" onClick={onClose}>
          Fermer le lecteur
        </button>
      </header>

      <div className="carto-reader-trace" style={meta ? { '--pole-color': refl.poleByNum.get(meta.pole)?.color } : undefined}>
        {target.kind === 'trace' ? (
          <>
            <p className="carto-reader-what">
              <span className="carto-code">{target.code}</span> {meta?.name ?? '(hors référentiel)'} — trace {k + 1} sur {n}
              {want.role ? ` · ${ROLE_LABELS[want.role] ?? want.role}` : ''} · {formatShort(target.list[k].date)}
            </p>
            <nav className="carto-reader-nav" aria-label="Traces de la compétence">
              <button type="button" className="carto-btn carto-btn--quiet" disabled={k === 0} onClick={() => onIndex?.(k - 1)}>
                ← Trace précédente
              </button>
              <button type="button" className="carto-btn carto-btn--quiet" disabled={k >= n - 1} onClick={() => onIndex?.(k + 1)}>
                Trace suivante →
              </button>
              {onBackToCompetency ? (
                <button type="button" className="carto-btn carto-btn--quiet" onClick={() => onBackToCompetency(target.code)}>
                  Retour à la compétence
                </button>
              ) : null}
            </nav>
          </>
        ) : (
          <p className="carto-reader-what">{target.label ?? 'Passage saillant'}</p>
        )}
        {want.extract ? (
          <figure className="carto-reader-quote">
            <figcaption>Extrait cité par le jury</figcaption>
            <blockquote>{want.extract}</blockquote>
          </figure>
        ) : null}
        {status ? (
          <p role="status" className={`carto-reader-status carto-reader-status--${status.tone}`}>
            {status.text}
          </p>
        ) : null}
        {result?.status === 'relocated' && shownDate === result.date && getDetail(want.primary)?.portfolio ? (
          <button type="button" className="carto-link-btn" onClick={() => setViewDate(want.primary)}>
            Lire la journée de la trace ({formatShort(want.primary)})
          </button>
        ) : null}
        {ranges.length > 1 ? (
          <nav className="carto-reader-nav" aria-label="Occurrences du passage">
            <span>
              Occurrence {current + 1} sur {ranges.length}
            </span>
            <button type="button" className="carto-btn carto-btn--quiet" disabled={current === 0} onClick={() => setOccurrence(current - 1)}>
              ← Précédente
            </button>
            <button type="button" className="carto-btn carto-btn--quiet" disabled={current >= ranges.length - 1} onClick={() => setOccurrence(current + 1)}>
              Suivante →
            </button>
          </nav>
        ) : null}
      </div>

      <nav className="carto-reader-days" aria-label="Changer de jour">
        <button type="button" className="carto-btn carto-btn--quiet" disabled={!prevDay} onClick={() => prevDay && showDay(prevDay)}>
          ← {prevDay ? formatShort(prevDay) : 'jour précédent'}
        </button>
        {viewDate && result && viewDate !== result.date ? (
          <button type="button" className="carto-link-btn" onClick={() => setViewDate(null)}>
            Revenir au passage
          </button>
        ) : null}
        <button type="button" className="carto-btn carto-btn--quiet" disabled={!nextDay} onClick={() => nextDay && showDay(nextDay)}>
          {nextDay ? formatShort(nextDay) : 'jour suivant'} →
        </button>
      </nav>

      {ranges.length > 0 ? (
        <p className="carto-reader-legend carto-small">
          <mark className="carto-hl carto-hl--complete">jaune</mark> début et fin retrouvés · <mark className="carto-hl carto-hl--partial">orange</mark> un seul bout
        </p>
      ) : null}

      {body !== null ? (
        // HTML assaini (DOMPurify) puis surligné par l'API DOM : jamais de HTML brut.
        <div ref={textRef} className="carto-reader-text carto-prose" dangerouslySetInnerHTML={{ __html: body }} />
      ) : shownDetail === undefined ? (
        <p className="carto-muted carto-reader-text">Chargement…</p>
      ) : (
        <p className="carto-muted carto-reader-text">Pas de texte de portfolio pour le {formatLong(shownDate)}.</p>
      )}
    </section>
  )
}
