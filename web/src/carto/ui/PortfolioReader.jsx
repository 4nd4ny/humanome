// Interface ultime — lecteur de portfolio surligné (spec §8.1, « fonction à
// conserver impérativement »).
//
// Volet latéral (non modal) ouvert depuis le bouton « Ouvrir dans le
// portfolio » d'une trace (liste des traces, modale d'un jour) ou d'un passage
// saillant de pôle. Il montre ce qui a permis l'évaluation, pas tout le
// portfolio (journal D-56) : en tête, fixes au défilement, la journée affichée
// entre les triangles de la trace précédente et de la trace suivante, et la
// fermeture ; dessous, la compétence et la trace, l'extrait du jury SEULEMENT
// s'il n'est pas retrouvé tel quel (retrouvé, il se lit surligné dans le
// texte), puis le texte de la journée. Le texte vient du portfolio importé
// (segment daté), rendu en Markdown assaini ; le passage y est surligné en
// jaune (début et fin retrouvés), en orange (un seul bout) ou encadré en
// pointillés (approché), et chaque marque qui n'est pas le jaune est dite une
// fois, là où elle apparaît. Le surlignage fonctionne dans toute cartographie
// fusionnée : chaque trace garde sa journée et la date de son passage. Hors
// ligne : aucun réseau, aucun nouvel onglet.

import { useEffect, useMemo, useRef, useState } from 'react'
import { formatLong, weekdayName } from '../core/dates.js'
import { hasPortfolio } from '../core/model.js'
import { splitExtract } from '../core/highlight.js'
import { findPassage } from '../core/passages.js'
import { approximateInPortfolio, highlightHtml, locateInPortfolio, renderPortfolio } from './highlight-dom.js'
import { poleVars } from './colors.js'

const ROLE_LABELS = { preuve: 'preuve', indice: 'indice' }

/** Triangle « blanc » (contour seul), comme ◁ et ▷ : il se dessine pareil partout. */
function Triangle({ dir }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path d={dir === 'left' ? 'M12 2.5 2.5 8 12 13.5Z' : 'M4 2.5 13.5 8 4 13.5Z'} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

function Cross() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M3.5 3.5 12.5 12.5M12.5 3.5 3.5 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

/**
 * Bouton à triangle. Inactif, il garde le focus (aria-disabled) : au clavier,
 * arrivé à la dernière trace, on ne perd pas sa place dans le volet.
 */
function StepButton({ dir, label, disabled, onStep, small = false }) {
  return (
    <button
      type="button"
      className={small ? 'carto-reader-step carto-reader-step--small' : 'carto-reader-step'}
      aria-label={label}
      title={label}
      aria-disabled={disabled ? 'true' : undefined}
      onClick={() => {
        if (!disabled) onStep()
      }}
    >
      <Triangle dir={dir} />
    </button>
  )
}

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
 * Pourquoi l'extrait du jury est cité (il n'est pas retrouvé tel quel dans le
 * texte affiché), ou null : retrouvé, il se lit surligné.
 */
function quoteCaption(result, { portfolioCount, primaryHasText, primary, demo }) {
  if (!result || result.status === 'found' || result.status === 'relocated') return null
  if (result.status === 'partial') return 'Extrait cité par le jury ; seul le bout surligné en orange est retrouvé tel quel.'
  if (result.status === 'approximate') {
    return result.ranges.length > 1
      ? 'Extrait cité par le jury, reformulé par l’analyse : les phrases encadrées en pointillés en sont les plus proches, à vérifier.'
      : 'Extrait cité par le jury, reformulé par l’analyse : la phrase encadrée en pointillés en est la plus proche, à vérifier.'
  }
  if (portfolioCount === 0) {
    // La démonstration n'a pas de fichier à importer : son portfolio vient du site (D-57).
    return demo
      ? 'Extrait cité par le jury. Le portfolio de cette démonstration n’est pas encore chargé : rechargez la page pour le télécharger.'
      : 'Extrait cité par le jury. Importez le portfolio (.md) pour le lire surligné dans son texte.'
  }
  if (!primaryHasText) return `Extrait cité par le jury ; le portfolio importé n’a pas de texte pour le ${formatLong(primary)}.`
  return 'Extrait cité par le jury, introuvable tel quel dans le portfolio.'
}

/**
 * @param {{
 *   target: {kind: 'trace', code: string, list: Array<{id: string, date: string, variantId: string, role?: string}>, index: number}
 *         | {kind: 'passage', date: string, extract: string, label?: string},
 *   dataset: object, refl: object,
 *   getDetail: (date: string) => object | null | undefined, ensureDetails: (dates: string[]) => Promise<void>,
 *   reducedMotion?: boolean,
 *   onClose: () => void, onIndex?: (i: number) => void,
 * }} props
 */
export function PortfolioReader({ target, dataset, refl, getDetail, ensureDetails, reducedMotion = false, onClose, onIndex }) {
  const panelRef = useRef(null)
  const headingRef = useRef(null)
  const textRef = useRef(null)
  const targetKey = target.kind === 'trace' ? `${target.code}|${target.list[target.index]?.id}` : `passage|${target.date}|${target.extract}`
  // Occurrence courante, remise à zéro quand la cible change (ajustement pendant le rendu, sans effet).
  const [occ, setOcc] = useState({ key: targetKey, index: 0 })
  if (occ.key !== targetKey) setOcc({ key: targetKey, index: 0 })
  const occurrence = occ.key === targetKey ? occ.index : 0

  // Focus sur le titre à l'ouverture ; rendu au déclencheur à la fermeture.
  useEffect(() => {
    const opener = document.activeElement
    headingRef.current?.focus()
    return () => {
      if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus()
    }
  }, [])

  // Une autre trace se lit depuis le haut du volet.
  useEffect(() => {
    panelRef.current?.scrollTo?.({ top: 0 })
  }, [targetKey])

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

  const searching = needAll && !allLoaded
  // Le résultat n'est montré qu'une fois définitif : toutes les journées utiles lues.
  const settled = want.anchors === null ? ownLoaded : result !== null && !searching
  const shownDate = (settled && result?.date) || want.primary
  const shownDetail = getDetail(shownDate)
  const ranges = useMemo(() => (settled && result ? result.ranges : []), [settled, result])
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

  const meta = target.kind === 'trace' ? refl.compByCode.get(target.code) : null
  const n = target.kind === 'trace' ? target.list.length : 1
  const k = target.kind === 'trace' ? target.index : 0
  const stepper = target.kind === 'trace' && n > 1
  const step = (i) => {
    if (i >= 0 && i < n) onIndex?.(i)
  }

  const caption =
    settled && want.extract
      ? quoteCaption(result, {
          portfolioCount: portfolioDates.length,
          primaryHasText: Boolean(getDetail(want.primary)?.portfolio),
          primary: want.primary,
          demo: dataset.origin === 'demo',
        })
      : null
  const note = settled && !want.extract ? (want.synthetic ? 'Trace reconstituée depuis des compteurs : pas d’extrait à surligner.' : 'Extrait inconnu : rien à surligner.') : null
  // Un bout seul (orange) à côté du passage retrouvé : la seule marque que rien d'autre n'explique.
  const legend = settled && result?.status !== 'partial' && ranges.some((r) => !r.complete && !r.approximate)
  // Passage lu dans la feuille d'un autre jour que celui de la trace (décalage de date de l'analyse).
  const elsewhere = settled && shownDate !== want.primary
  const isTrace = target.kind === 'trace'
  const details = []
  if (n > 1) details.push(`trace ${k + 1} sur ${n}`)
  if (want.role) details.push(ROLE_LABELS[want.role] ?? want.role)
  if (elsewhere) details.push(`${isTrace ? 'datée' : 'daté'} du ${formatLong(want.primary)}`)
  const detailLine = details.join(', ')

  // Pour les lecteurs d'écran seulement : ce que la mise en page montre
  // d'elle-même — la trace et la journée d'abord, pour qu'un pas d'une trace à
  // l'autre s'entende même quand le résultat ne change pas.
  let outcome = ''
  if (!settled) outcome = searching ? 'Recherche du passage dans les autres journées…' : 'Chargement du portfolio…'
  else if (note) outcome = note
  else if (result?.status === 'found') outcome = 'Passage surligné.'
  else if (result?.status === 'relocated') outcome = `Passage surligné dans cette feuille ; ${isTrace ? 'la trace est datée' : 'le passage est daté'} du ${formatLong(want.primary)}.`
  else outcome = caption ?? ''
  const live = `${n > 1 ? `Trace ${k + 1} sur ${n}, ` : ''}${weekdayName(shownDate)} ${formatLong(shownDate)} : ${outcome}`
  const occurrenceWord = result?.status === 'approximate' ? 'Phrase' : 'Occurrence'

  return (
    <section
      ref={panelRef}
      className="carto-reader"
      role="region"
      aria-labelledby="carto-reader-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
          return
        }
        // ← et → passent d'une trace à l'autre, comme les triangles — sauf
        // depuis les occurrences ou le texte, qui gardent leurs flèches.
        if (!stepper || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        if (e.target?.closest?.('.carto-reader-occ, .carto-reader-text')) return
        e.preventDefault()
        e.stopPropagation()
        step(e.key === 'ArrowLeft' ? k - 1 : k + 1)
      }}
    >
      <header className="carto-reader-head">
        {stepper ? <StepButton dir="left" label="Trace précédente" disabled={k === 0} onStep={() => step(k - 1)} /> : null}
        <h2 id="carto-reader-title" ref={headingRef} tabIndex={-1}>
          {weekdayName(shownDate)} {formatLong(shownDate)}
        </h2>
        {stepper ? <StepButton dir="right" label="Trace suivante" disabled={k >= n - 1} onStep={() => step(k + 1)} /> : null}
        <button type="button" className="carto-reader-close" aria-label="Fermer le lecteur" title="Fermer le lecteur (Échap)" onClick={onClose}>
          <Cross />
        </button>
      </header>

      <p role="status" className="carto-visually-hidden">
        {live}
      </p>

      <div className="carto-reader-trace carto-pole" style={meta ? poleVars(refl.poleByNum.get(meta.pole)?.color) : undefined}>
        {target.kind === 'trace' ? (
          <p className="carto-reader-what">
            <span className="carto-code">{target.code}</span> {meta?.name ?? '(hors référentiel)'}
            {detailLine ? <span className="carto-reader-sub">{detailLine}</span> : null}
          </p>
        ) : (
          <p className="carto-reader-what">
            {target.label ?? 'Passage saillant'}
            {detailLine ? <span className="carto-reader-sub">{detailLine}</span> : null}
          </p>
        )}
        {caption ? (
          <figure className="carto-reader-quote">
            <figcaption>{caption}</figcaption>
            <blockquote>{want.extract}</blockquote>
          </figure>
        ) : null}
        {note ? <p className="carto-reader-note">{note}</p> : null}
        {searching ? <p className="carto-reader-note">Recherche du passage dans les autres journées…</p> : null}
        {ranges.length > 1 ? (
          <div className="carto-reader-occ" role="group" aria-label={`${occurrenceWord}s du passage`}>
            <StepButton small dir="left" label={`${occurrenceWord} précédente`} disabled={current === 0} onStep={() => setOcc({ key: targetKey, index: current - 1 })} />
            <span>
              {occurrenceWord} {current + 1} sur {ranges.length}
            </span>
            <StepButton
              small
              dir="right"
              label={`${occurrenceWord} suivante`}
              disabled={current >= ranges.length - 1}
              onStep={() => setOcc({ key: targetKey, index: current + 1 })}
            />
          </div>
        ) : null}
        {legend ? (
          <p className="carto-reader-note">
            <mark className="carto-hl carto-hl--partial">En orange</mark>, un seul bout du passage est retrouvé à cet endroit.
          </p>
        ) : null}
      </div>

      {body !== null ? (
        // HTML assaini (DOMPurify) puis surligné par l'API DOM : jamais de HTML brut.
        <div ref={textRef} className="carto-reader-text carto-prose" dangerouslySetInnerHTML={{ __html: body }} />
      ) : shownDetail === undefined ? (
        <p className="carto-muted carto-reader-text">Chargement…</p>
      ) : settled && !caption ? (
        <p className="carto-muted carto-reader-text">Pas de texte de portfolio pour ce jour.</p>
      ) : null}
    </section>
  )
}
