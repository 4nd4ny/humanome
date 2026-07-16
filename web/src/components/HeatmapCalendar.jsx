// GitHub-style calendar heatmap of the portfolio sheets (idea borrowed from
// the legacy React prototypes, rebuilt in plain SVG — no dependency).
// One column per week (Monday first), intensity = day score from
// profilMeta.evolution_globale, click = day view route.
import { dayHash, navigate } from '../router.js'
import { frenchDate } from '../data/load.js'

const CELL = 12
const GAP = 3
const STEP = CELL + GAP
const TOP = 18 // room for month labels
const LEFT = 28 // room for weekday labels
const LEVEL_COLORS = ['#dbeafe', '#93c5fd', '#60a5fa', '#3b82f6', '#1d4ed8']
const EMPTY_COLOR = 'rgba(148, 163, 184, 0.18)'
const MONTH_LABELS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

function toUtc(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function toIso(date) {
  return date.toISOString().slice(0, 10)
}

/** Monday-based weekday index (Mon=0 … Sun=6). */
function weekdayIndex(date) {
  return (date.getUTCDay() + 6) % 7
}

/**
 * Builds the week columns between the first and last sheet dates.
 * @returns {{weeks: string[][], months: Array<{label: string, week: number}>}}
 */
export function buildCalendarGrid(isoDates) {
  const sorted = [...isoDates].sort()
  const first = toUtc(sorted[0])
  const last = toUtc(sorted[sorted.length - 1])
  const start = new Date(first)
  start.setUTCDate(start.getUTCDate() - weekdayIndex(first))

  const weeks = []
  const months = []
  let cursor = new Date(start)
  let previousMonth = -1
  while (cursor <= last) {
    const week = []
    for (let i = 0; i < 7; i += 1) {
      week.push(toIso(cursor))
      cursor = new Date(cursor)
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    const month = toUtc(week[0]).getUTCMonth()
    if (month !== previousMonth) {
      months.push({ label: MONTH_LABELS[month], week: weeks.length })
      previousMonth = month
    }
    weeks.push(week)
  }
  return { weeks, months }
}

/** Quantizes a score into one of the 5 intensity levels. */
export function scoreLevel(score, maxScore) {
  if (!maxScore || score <= 0) return 0
  return Math.min(4, 1 + Math.floor((score / maxScore) * 4))
}

/**
 * @param {{
 *   feuilles: Array<{iso: string, label?: string}>, // mergeDoc.feuilles
 *   evolution?: Array<{date: string, score_total: number}>, // profilMeta.evolution_globale
 *   onPickDay?: (iso: string) => void, // default: navigate to #/jour/<iso>
 *   currentDate?: string | null, // D4 : synchro timeline — au-delà de cette date
 *     (ISO), les cellules passent en état « à venir » ; celle du jour courant est
 *     surlignée. null (défaut) = tout visible (hors animation / fin de plage).
 * }} props
 */
export default function HeatmapCalendar({ feuilles, evolution = [], onPickDay, currentDate = null }) {
  if (!feuilles || feuilles.length === 0) return null

  const scoreByDate = new Map(evolution.map((e) => [e.date, e.score_total]))
  const maxScore = Math.max(0, ...evolution.map((e) => e.score_total ?? 0))
  const activeDates = new Set(feuilles.map((f) => f.iso ?? f.date))
  const { weeks, months } = buildCalendarGrid([...activeDates])

  const width = LEFT + weeks.length * STEP
  const height = TOP + 7 * STEP
  const pick = onPickDay ?? ((iso) => navigate(dayHash(iso)))
  // Synchro timeline : une date > currentDate n'est pas encore « posée ».
  const sync = typeof currentDate === 'string' && currentDate !== ''

  return (
    <figure className="heatmap">
      <figcaption className="heatmap-caption">
        {feuilles.length} feuilles de portfolio — cliquez sur un jour pour ouvrir sa cartographie
      </figcaption>
      <div className="heatmap-scroll">
        <svg
          className="heatmap-grid"
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          preserveAspectRatio="xMidYMid meet"
          style={{ maxWidth: `${width}px`, height: 'auto' }}
          role="group"
          aria-label="Calendrier des feuilles de portfolio"
        >
          {months.map(({ label, week }) => (
            <text key={`${label}-${week}`} x={LEFT + week * STEP} y={11} className="heatmap-month">
              {label}
            </text>
          ))}
          {['lun.', 'mer.', 'ven.'].map((label, i) => (
            <text key={label} x={0} y={TOP + (i * 2 + 1) * STEP - 4} className="heatmap-month">
              {label}
            </text>
          ))}
          {weeks.map((week, wi) =>
            week.map((iso, di) => {
              const active = activeDates.has(iso)
              // « à venir » ne concerne que les FEUILLES (cellules actives) pas
              // encore atteintes : les cases vides restent des cases vides.
              const future = sync && active && iso > currentDate
              const isCurrent = sync && active && iso === currentDate
              const score = scoreByDate.get(iso) ?? 0
              const level = scoreLevel(score, maxScore)
              const x = LEFT + wi * STEP
              const y = TOP + di * STEP
              // Vide, ou active MAIS pas encore atteinte par l'animation :
              // cellule inerte, couleur « à venir » (la carte se construit).
              if (!active || future) {
                return (
                  <rect
                    key={iso}
                    x={x}
                    y={y}
                    width={CELL}
                    height={CELL}
                    rx="2"
                    fill={EMPTY_COLOR}
                    className={future ? 'heatmap-future' : undefined}
                    data-future={future ? 'true' : undefined}
                  />
                )
              }
              return (
                <rect
                  key={iso}
                  x={x}
                  y={y}
                  width={CELL}
                  height={CELL}
                  rx="2"
                  fill={LEVEL_COLORS[level]}
                  className={isCurrent ? 'heatmap-day heatmap-day-current' : 'heatmap-day'}
                  data-iso={iso}
                  data-current={isCurrent ? 'true' : undefined}
                  role="link"
                  tabIndex={0}
                  aria-label={`Journée du ${frenchDate(iso)}`}
                  onClick={() => pick(iso)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault() // Espace ne doit pas faire défiler la page
                      pick(iso)
                    }
                  }}
                >
                  <title>{`${frenchDate(iso)} — score ${Math.round(score * 10) / 10}`}</title>
                </rect>
              )
            }),
          )}
        </svg>
      </div>
    </figure>
  )
}
