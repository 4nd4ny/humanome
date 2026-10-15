// Interface ultime — liste des compétences (spec §6.3) : arbre ARIA
// pôle → compétence → journées observées. Le chevron ouvre ; le libellé
// sélectionne (même filtre que le soleil) ; une date ouvre la journée. La
// recherche ignore accents et casse et conserve les ancêtres. Seules les
// compétences OBSERVÉES sont listées : rien n'est montré comme « manquant ».

import { useEffect, useMemo, useRef, useState } from 'react'
import { formatShort } from '../core/dates.js'
import { poleVars } from './colors.js'

const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Amène `el` dans la partie visible des boîtes défilantes qui l'entourent,
 * jusqu'à la tuile de la liste (`root.closest('.v3-tile-content')`, journal
 * D-53 ; avant : la colonne `.carto-col`) comprise, au plus près, SANS JAMAIS
 * faire défiler la page. Une sélection faite dans le soleil ne doit pas
 * déplacer le soleil sous le pointeur : entre les deux clics d'un double-clic
 * (qui ouvre un pôle, journal D-45), la page fuyait de plusieurs centaines de
 * pixels avec `scrollIntoView`. Le détail montre déjà la sélection.
 */
export function revealInList(el, root) {
  const limit = root?.closest?.('.v3-tile-content, .carto-col') ?? root
  if (!el || !limit) return
  for (let box = el.parentElement; box && box !== document.body && box !== document.documentElement; box = box.parentElement) {
    const { overflowY } = window.getComputedStyle(box)
    if ((overflowY === 'auto' || overflowY === 'scroll') && box.scrollHeight > box.clientHeight) {
      const b = box.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      if (r.top < b.top) box.scrollTop -= b.top - r.top
      else if (r.bottom > b.bottom) box.scrollTop += Math.min(r.bottom - b.bottom, r.top - b.top)
    }
    if (box === limit) break
  }
}

/**
 * @param {{
 *   refl: object, state: object, selection: object | null,
 *   dayFilter?: {date: string, codes: Set<string>} | null,
 *   onSelect: (t: object | null) => void, onOpenDay: (date: string, code?: string) => void,
 *   onClearDayFilter?: () => void,
 * }} props
 */
export function CompetencyList({ refl, state, selection, dayFilter = null, onSelect, onOpenDay, onClearDayFilter }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(() => new Set())
  const itemRefs = useRef(new Map())
  const navRef = useRef(null)

  const tree = useMemo(() => {
    const q = fold(query.trim())
    const out = []
    for (const pole of refl.poles) {
      const pState = state.poles.get(pole.num)
      if (!pState) continue
      const poleMatch = q !== '' && fold(pole.name).includes(q)
      const comps = []
      for (const code of refl.codesByPole.get(pole.num)) {
        const c = state.competencies.get(code)
        if (!c || !(c.theta > 0)) continue
        if (dayFilter && !dayFilter.codes.has(code)) continue
        const meta = refl.compByCode.get(code)
        const match = q === '' || poleMatch || fold(`${code} ${meta.name} ${meta.description}`).includes(q)
        if (match) comps.push({ code, name: meta.name, days: c.days, status: c.status })
      }
      if (comps.length > 0) out.push({ pole, comps, days: new Set(comps.flatMap((c) => c.days)).size })
    }
    return out
  }, [refl, state, query, dayFilter])

  // Défile jusqu'à la sélection (y compris après un clic sur un jour), dans la
  // liste seulement : jamais la page (revealInList). Une compétence d'un pôle
  // replié n'est dessinée qu'une fois son pôle ouvert (effet suivant) : on la
  // montre alors, une seule fois.
  const pendingReveal = useRef(null)
  useEffect(() => {
    const key = selection?.type === 'competency' ? `c:${selection.code}` : selection?.type === 'pole' ? `p:${selection.num}` : null
    const el = key ? itemRefs.current.get(key) : null
    if (el?.isConnected) revealInList(el, navRef.current)
    pendingReveal.current = el?.isConnected ? null : key
  }, [selection, dayFilter])
  useEffect(() => {
    const key = pendingReveal.current
    pendingReveal.current = null
    const el = key ? itemRefs.current.get(key) : null
    if (el?.isConnected) revealInList(el, navRef.current)
  }, [open])

  // Une compétence sélectionnée ouvre son pôle (révélation, jamais fermeture).
  useEffect(() => {
    if (selection?.type !== 'competency') return
    const pole = refl.compByCode.get(selection.code)?.pole
    if (pole) setOpen((prev) => (prev.has(`p:${pole}`) ? prev : new Set(prev).add(`p:${pole}`)))
  }, [selection, refl])

  const toggle = (key) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const searching = query.trim() !== '' || dayFilter !== null
  const isSel = (t) =>
    selection && ((t.type === 'pole' && selection.type === 'pole' && selection.num === t.num) || (t.type === 'competency' && selection.type === 'competency' && selection.code === t.code))

  return (
    <nav ref={navRef} className="carto-list" aria-label="Compétences observées">
      <div className="carto-list-search">
        <label htmlFor="carto-list-q">Chercher une compétence</label>
        <input id="carto-list-q" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="nom, code, pôle…" autoComplete="off" />
      </div>
      {dayFilter ? (
        <p className="carto-chip-line">
          <span className="carto-chip">
            Observées le {formatShort(dayFilter.date)}
            <button type="button" aria-label="Retirer le filtre par journée" onClick={onClearDayFilter}>
              ×
            </button>
          </span>
        </p>
      ) : null}
      {tree.length === 0 ? (
        <p className="carto-muted">{searching ? 'Aucune compétence observée ne correspond.' : 'Aucune compétence observée pour cette sélection.'}</p>
      ) : (
        <ul role="tree" aria-label={`${refl.label} — compétences observées`}>
          {tree.map(({ pole, comps, days }) => {
            const pKey = `p:${pole.num}`
            const pOpen = searching || open.has(pKey)
            return (
              <li key={pKey} role="treeitem" aria-expanded={pOpen} aria-selected={Boolean(isSel({ type: 'pole', num: pole.num }))}>
                <div className="carto-list-row">
                  <button type="button" className="carto-chevron" aria-label={`${pOpen ? 'Fermer' : 'Ouvrir'} ${pole.name}`} onClick={() => toggle(pKey)}>
                    {pOpen ? '▾' : '▸'}
                  </button>
                  <button
                    type="button"
                    ref={(el) => itemRefs.current.set(pKey, el)}
                    className={`carto-list-label carto-list-pole carto-pole${isSel({ type: 'pole', num: pole.num }) ? ' is-selected' : ''}`}
                    style={poleVars(pole.color)}
                    onClick={() => onSelect(isSel({ type: 'pole', num: pole.num }) ? null : { type: 'pole', num: pole.num })}
                  >
                    <span className="carto-pole-mark" aria-hidden="true">{pole.symbol}</span>
                    {pole.name}
                    <span className="carto-count"> · {days} j.</span>
                  </button>
                </div>
                {pOpen ? (
                  <ul role="group">
                    {comps.map((c) => {
                      const cKey = `c:${c.code}`
                      const cOpen = open.has(cKey)
                      const sel = isSel({ type: 'competency', code: c.code })
                      return (
                        <li key={cKey} role="treeitem" aria-expanded={cOpen} aria-selected={Boolean(sel)}>
                          <div className="carto-list-row">
                            <button type="button" className="carto-chevron" aria-label={`${cOpen ? 'Fermer' : 'Ouvrir'} les journées de ${c.name}`} onClick={() => toggle(cKey)}>
                              {cOpen ? '▾' : '▸'}
                            </button>
                            <button
                              type="button"
                              ref={(el) => itemRefs.current.set(cKey, el)}
                              className={`carto-list-label${sel ? ' is-selected' : ''}`}
                              onClick={() => onSelect(sel ? null : { type: 'competency', code: c.code })}
                            >
                              <span className="carto-code">{c.code}</span> {c.name}
                              {c.status === 'needs_review' ? <span className="carto-tag-renvoi"> renvoi</span> : null}
                              <span className="carto-count"> · {c.days.length} j.</span>
                            </button>
                          </div>
                          {cOpen ? (
                            <ul role="group" className="carto-list-days">
                              {c.days.map((d) => (
                                <li key={d} role="treeitem">
                                  <button type="button" className="carto-list-day" onClick={() => onOpenDay(d, c.code)}>
                                    {formatShort(d)}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </nav>
  )
}
