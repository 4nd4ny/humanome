// Section « Monitoring » de l'administration : tableau de bord LECTURE SEULE
// sur les journaux et compteurs en base (GET /api/admin/monitoring) — activité,
// finances, tokens (détection d'anomalies), connexions (pays + réseau tronqué,
// jamais d'IP brute, cahier §6.5), votes de gouvernance, comptes par rôle.
//
// Graphiques : SVG maison, séries en variables CSS --mon-* (palette validée
// clair/sombre), barres fines avec infobulle native <title> par jour, légende
// dès 2 séries, et chaque graphique offre sa table (« Voir les données »).

import { useCallback, useEffect, useState } from 'react'
import { ApiError, ApiUnavailableError } from '../../api/client.js'
import { ASSIGNABLE_ROLES, fetchMonitoring, frDate, listUsers, nb, usd } from './admin-api.js'

const PERIODS = [
  { days: 7, label: '7 j' },
  { days: 30, label: '30 j' },
  { days: 90, label: '90 j' },
  { days: 365, label: '1 an' },
]

/** Jours ISO continus (UTC) finissant aujourd'hui — l'axe du temps ne saute pas. */
function dayRange(days) {
  const out = []
  const today = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86_400_000)
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

const DAY_FMT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })

function jourCourt(iso) {
  const d = new Date(`${iso}T12:00:00Z`)
  return Number.isNaN(d.getTime()) ? iso : DAY_FMT.format(d)
}

/** Grande valeur + libellé (stat tile : le chiffre est la figure). */
function Tile({ label, value, hint }) {
  return (
    <div className="mon-tile">
      <span className="mon-tile-value">{value}</span>
      <span className="mon-tile-label">{label}</span>
      {hint ? <span className="mon-tile-hint">{hint}</span> : null}
    </div>
  )
}

function Legend({ series }) {
  if (series.length < 2) return null
  return (
    <ul className="mon-legend">
      {series.map((s) => (
        <li key={s.key}>
          <span className="mon-swatch" style={{ background: `var(${s.cssVar})` }} aria-hidden="true" />
          {s.label}
        </li>
      ))}
    </ul>
  )
}

/** Table de secours d'un graphique (accessibilité) : jours non vides seulement. */
function DataTable({ points, series, format }) {
  const filled = points.filter((p) => series.some((s) => (p.values[s.key] || 0) !== 0))
  if (filled.length === 0) return null
  return (
    <details className="mon-data">
      <summary>Voir les données</summary>
      <table className="admin-table">
        <thead>
          <tr>
            <th scope="col">Jour</th>
            {series.map((s) => (
              <th scope="col" key={s.key}>
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filled.map((p) => (
            <tr key={p.date}>
              <th scope="row">{jourCourt(p.date)}</th>
              {series.map((s) => (
                <td key={s.key}>{format(p.values[s.key] || 0)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

/**
 * Barres empilées par jour (magnitude dans le temps). points :
 * [{date, values: {clé: nombre}}] ; series : [{key, label, cssVar}].
 * Marques fines, écart de surface entre segments, infobulle <title> par jour.
 */
function StackedBars({ titre, points, series, format }) {
  const W = 720
  const H = 120
  const max = Math.max(...points.map((p) => series.reduce((t, s) => t + (p.values[s.key] || 0), 0)))
  if (max <= 0) {
    return (
      <figure className="mon-chart">
        <figcaption>{titre}</figcaption>
        <p className="mon-empty">Aucune donnée sur la période.</p>
      </figure>
    )
  }
  const n = points.length
  const gap = n > 120 ? 0.5 : 2
  const bw = Math.max(1, W / n - gap)

  return (
    <figure className="mon-chart">
      <figcaption>{titre}</figcaption>
      <svg viewBox={`0 0 ${W} ${H + 16}`} role="img" aria-label={titre} preserveAspectRatio="none">
        {[0.5, 1].map((f) => (
          <line key={f} x1="0" x2={W} y1={H - H * f} y2={H - H * f} className="mon-grid" />
        ))}
        {points.map((p, i) => {
          const x = (W / n) * i
          let y = H
          const total = series.reduce((t, s) => t + (p.values[s.key] || 0), 0)
          const label = `${jourCourt(p.date)} — ${series
            .map((s) => `${s.label} : ${format(p.values[s.key] || 0)}`)
            .join(', ')}`
          return (
            <g key={p.date}>
              <title>{label}</title>
              {/* cible de survol plus large que la marque */}
              <rect x={x} y="0" width={W / n} height={H} fill="transparent" />
              {series.map((s) => {
                const v = p.values[s.key] || 0
                if (v <= 0) return null
                const h = Math.max(1, (v / max) * (H - 4))
                y -= h
                const rect = (
                  <rect
                    key={s.key}
                    x={x + gap / 2}
                    y={y}
                    width={bw}
                    height={Math.max(0.5, h - (total > 0 ? gap / 2 : 0))}
                    rx={bw > 3 ? 1.5 : 0}
                    fill={`var(${s.cssVar})`}
                  />
                )
                y -= gap / 2
                return rect
              })}
            </g>
          )
        })}
        <line x1="0" x2={W} y1={H} y2={H} className="mon-axis" />
        <text x="0" y={H + 13} className="mon-tick">
          {jourCourt(points[0].date)}
        </text>
        <text x={W} y={H + 13} textAnchor="end" className="mon-tick">
          {jourCourt(points[n - 1].date)}
        </text>
        <text x="4" y="12" className="mon-tick">
          max {format(max)}
        </text>
      </svg>
      <Legend series={series} />
      <DataTable points={points} series={series} format={format} />
    </figure>
  )
}

/**
 * Barres divergentes (polarité) : entrées au-dessus de la ligne de base,
 * sorties en dessous — l'argent qui rentre versus l'usage débité.
 */
function DivergingBars({ titre, points, up, down, format }) {
  const W = 720
  const H = 140
  const mid = H / 2
  const max = Math.max(
    ...points.map((p) => Math.max(p.values[up.key] || 0, p.values[down.key] || 0)),
  )
  if (max <= 0) {
    return (
      <figure className="mon-chart">
        <figcaption>{titre}</figcaption>
        <p className="mon-empty">Aucun mouvement sur la période.</p>
      </figure>
    )
  }
  const n = points.length
  const gap = n > 120 ? 0.5 : 2
  const bw = Math.max(1, W / n - gap)
  const scale = (v) => (v / max) * (mid - 10)

  return (
    <figure className="mon-chart">
      <figcaption>{titre}</figcaption>
      <svg viewBox={`0 0 ${W} ${H + 16}`} role="img" aria-label={titre} preserveAspectRatio="none">
        {points.map((p, i) => {
          const x = (W / n) * i
          const vUp = p.values[up.key] || 0
          const vDown = p.values[down.key] || 0
          return (
            <g key={p.date}>
              <title>
                {`${jourCourt(p.date)} — ${up.label} : ${format(vUp)}, ${down.label} : ${format(vDown)}`}
              </title>
              <rect x={x} y="0" width={W / n} height={H} fill="transparent" />
              {vUp > 0 ? (
                <rect
                  x={x + gap / 2}
                  y={mid - Math.max(1, scale(vUp))}
                  width={bw}
                  height={Math.max(1, scale(vUp))}
                  rx={bw > 3 ? 1.5 : 0}
                  fill={`var(${up.cssVar})`}
                />
              ) : null}
              {vDown > 0 ? (
                <rect
                  x={x + gap / 2}
                  y={mid + 1}
                  width={bw}
                  height={Math.max(1, scale(vDown))}
                  rx={bw > 3 ? 1.5 : 0}
                  fill={`var(${down.cssVar})`}
                />
              ) : null}
            </g>
          )
        })}
        <line x1="0" x2={W} y1={mid} y2={mid} className="mon-axis" />
        <text x="0" y={H + 13} className="mon-tick">
          {jourCourt(points[0].date)}
        </text>
        <text x={W} y={H + 13} textAnchor="end" className="mon-tick">
          {jourCourt(points[n - 1].date)}
        </text>
        <text x="4" y="12" className="mon-tick">
          max {format(max)}
        </text>
      </svg>
      <Legend series={[up, down]} />
      <DataTable points={points} series={[up, down]} format={format} />
    </figure>
  )
}

const OUTCOME = {
  adopted: { label: 'Majorité atteinte — entérinable', className: 'mon-outcome-ok' },
  rejected: { label: 'Rejetée (majorité contre)', className: 'mon-outcome-bad' },
  pending: { label: 'En attente de voix', className: 'mon-outcome-wait' },
  blocked: { label: 'Électorat vide', className: 'mon-outcome-wait' },
}

/** Une proposition au vote : décompte, verdict, retardataires à relancer. */
function Proposition({ prop }) {
  const d = prop.decompte
  const outcome = OUTCOME[d.outcome] ?? OUTCOME.pending
  const relance =
    prop.manquants.length > 0
      ? `mailto:?bcc=${encodeURIComponent(prop.manquants.map((m) => m.email).join(','))}` +
        `&subject=${encodeURIComponent(`[humanome] Vote en attente : ${prop.label} ${prop.semver}`)}`
      : null

  return (
    <li className="mon-prop">
      <div className="mon-prop-head">
        <strong>{prop.label}</strong> <span className="mon-prop-semver">v{prop.semver}</span>
        <span className={`mon-outcome ${outcome.className}`}>{outcome.label}</span>
      </div>
      <p className="mon-prop-counts">
        Pour {d.pour} · Contre {d.contre} · Abstention {d.abstention} · Sans voix {d.notVoted} —
        seuil {d.threshold ?? '—'} sur {d.electorateSize} membre{d.electorateSize > 1 ? 's' : ''}
        {prop.soumiseLe ? ` · soumise le ${frDate(prop.soumiseLe)}` : ''}
      </p>
      {prop.manquants.length > 0 ? (
        <p className="mon-prop-late">
          À relancer :{' '}
          {prop.manquants.map((m, i) => (
            <span key={m.id}>
              {i > 0 ? ', ' : ''}
              <span title={m.email}>{m.displayName}</span>
            </span>
          ))}
          {relance ? (
            <>
              {' — '}
              <a href={relance}>écrire aux retardataires</a>
            </>
          ) : null}
        </p>
      ) : null}
    </li>
  )
}

function VotesBlock({ votes }) {
  const propositions = [...votes.competences, ...votes.referentiel]
  return (
    <section className="mon-block" aria-labelledby="mon-votes-h">
      <h3 id="mon-votes-h">Votes de gouvernance</h3>
      <p className="mon-note">
        Électorat courant : {votes.electorat.length} épistémiarque
        {votes.electorat.length > 1 ? 's' : ''}. La majorité se calcule sur tout l’électorat
        (cahier §3.5) — les propositions « entérinables » peuvent être validées depuis l’espace
        épistémiarque.
      </p>
      {propositions.length === 0 ? (
        <p>Aucune proposition au vote actuellement.</p>
      ) : (
        <ul className="mon-props">
          {propositions.map((p) => (
            <Proposition key={`${p.label}-${p.id}`} prop={p} />
          ))}
        </ul>
      )}
    </section>
  )
}

/** Comptes portant un rôle donné (liste paginée réutilisant GET admin/users). */
function RoleTable({ fetchFn }) {
  const [role, setRole] = useState('admin')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    setError(null)
    listUsers({ role, page }, fetchFn)
      .then((result) => {
        if (alive) setData(result)
      })
      .catch(() => {
        if (alive) setError('Chargement impossible.')
      })
    return () => {
      alive = false
    }
  }, [role, page, fetchFn])

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <section className="mon-block" aria-labelledby="mon-roles-h">
      <h3 id="mon-roles-h">Comptes par rôle</h3>
      <div className="mon-role-picker">
        <label htmlFor="mon-role-select">Rôle</label>
        <select
          id="mon-role-select"
          value={role}
          onChange={(e) => {
            setPage(1)
            setRole(e.target.value)
          }}
        >
          {ASSIGNABLE_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        {data ? (
          <span role="status">
            {data.total} compte{data.total > 1 ? 's' : ''}
          </span>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="load-error">
          {error}
        </p>
      ) : null}
      {data && data.users.length > 0 ? (
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Compte</th>
              <th scope="col">Rôles</th>
              <th scope="col">Créé le</th>
            </tr>
          </thead>
          <tbody>
            {data.users.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.displayName}</strong>
                  <br />
                  <span className="admin-email">{u.email}</span>
                </td>
                <td>{u.roles.join(', ') || '—'}</td>
                <td className="admin-created">{frDate(u.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : data ? (
        <p>Aucun compte ne porte ce rôle.</p>
      ) : null}
      {totalPages > 1 ? (
        <div className="admin-pagination">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Précédent
          </button>
          <span>
            Page {page} / {totalPages}
          </span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Suivant
          </button>
        </div>
      ) : null}
    </section>
  )
}

/** @param {{fetchFn?: typeof fetch}} props */
export default function MonitoringSection({ fetchFn }) {
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const result = await fetchMonitoring({ days }, fetchFn)
      setData(result)
      setStatus('ready')
    } catch (err) {
      setStatus('error')
      setError(
        err instanceof ApiUnavailableError || err instanceof ApiError
          ? err.message
          : 'Chargement impossible.',
      )
    }
  }, [days, fetchFn])

  useEffect(() => {
    load()
  }, [load])

  return (
    <section className="mon">
      <h2>Monitoring</h2>
      <div className="mon-periods" role="group" aria-label="Période observée">
        {PERIODS.map((p) => (
          <button
            key={p.days}
            type="button"
            aria-pressed={days === p.days}
            onClick={() => setDays(p.days)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error ? (
        <p role="alert" className="load-error">
          {error}
        </p>
      ) : null}
      {status === 'loading' && !data ? <p role="status">Chargement du tableau de bord…</p> : null}

      {data ? <Dashboard data={data} fetchFn={fetchFn} /> : null}
    </section>
  )
}

function Dashboard({ data, fetchFn }) {
  const days = data.periode.jours
  const range = dayRange(days)
  const index = (rows, pick) => {
    const byDate = new Map(rows.map((r) => [r.date, r]))
    return range.map((date) => ({ date, values: pick(byDate.get(date)) }))
  }

  const u = data.utilisateurs
  const c = data.cartographies
  const f = data.finances
  const t = data.tokens
  const cx = data.connexions

  const depensePeriodeUsd =
    (t.periode.demo.coutUsd || 0) +
    (t.periode.tuteur.coutUsd || 0) +
    (t.periode.twin9.depenseMicrousd || 0) / 1_000_000

  return (
    <>
      <div className="mon-tiles">
        <Tile label="connectés maintenant" value={nb(u.actifsMaintenant)} hint={`+ ${nb(u.sessionsAnonymes)} visiteur${u.sessionsAnonymes > 1 ? 's' : ''} anonyme${u.sessionsAnonymes > 1 ? 's' : ''}`} />
        <Tile label="comptes" value={nb(u.total)} hint={`+ ${nb(u.nouveauxPeriode)} sur la période · ${nb(u.nonActives)} non activé${u.nonActives > 1 ? 's' : ''}`} />
        <Tile label="cartographies" value={nb(c.total)} hint={`${nb(c.parType.jour)} journée · ${nb(c.parType.merge)} merge`} />
        <Tile label="partages actifs" value={nb(c.partages.actifs)} hint={`${nb(c.partages.consultationsPeriode)} consultation${c.partages.consultationsPeriode > 1 ? 's' : ''} sur la période`} />
        <Tile label="crédits en circulation" value={usd(f.soldes.totalMicrousd)} hint={`${nb(f.soldes.comptesCredites)} compte${f.soldes.comptesCredites > 1 ? 's' : ''} crédité${f.soldes.comptesCredites > 1 ? 's' : ''}`} />
        <Tile label="dépense LLM période" value={usd(Math.round(depensePeriodeUsd * 1_000_000))} hint="démo + tuteur + Twin9" />
        <Tile label="connexions période" value={nb(cx.periode.reussies)} hint={`${nb(cx.periode.echouees)} échec${cx.periode.echouees > 1 ? 's' : ''}`} />
      </div>

      <section className="mon-block" aria-labelledby="mon-cx-h">
        <h3 id="mon-cx-h">Connexions</h3>
        <StackedBars
          titre="Connexions par jour"
          points={index(cx.parJour, (r) => ({ reussies: r?.reussies || 0, echouees: r?.echouees || 0 }))}
          series={[
            { key: 'reussies', label: 'Réussies', cssVar: '--mon-s1' },
            { key: 'echouees', label: 'Échouées', cssVar: '--mon-bad' },
          ]}
          format={nb}
        />
        <div className="mon-cols">
          <div>
            <h4>Par pays (période)</h4>
            {cx.parPays.length === 0 ? (
              <p className="mon-empty">Aucune connexion journalisée.</p>
            ) : (
              <table className="admin-table mon-compact">
                <thead>
                  <tr>
                    <th scope="col">Pays</th>
                    <th scope="col">Connexions</th>
                  </tr>
                </thead>
                <tbody>
                  {cx.parPays.map((p) => (
                    <tr key={p.pays ?? '—'}>
                      <th scope="row">{p.pays ?? 'Inconnu'}</th>
                      <td>{nb(p.n)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div>
            <h4>Dernières connexions</h4>
            {cx.dernieres.length === 0 ? (
              <p className="mon-empty">
                Le journal démarre avec ce déploiement : les connexions apparaîtront ici.
              </p>
            ) : (
              <table className="admin-table mon-compact">
                <thead>
                  <tr>
                    <th scope="col">Quand</th>
                    <th scope="col">Compte</th>
                    <th scope="col">Pays</th>
                    <th scope="col">Réseau</th>
                    <th scope="col">Issue</th>
                  </tr>
                </thead>
                <tbody>
                  {cx.dernieres.map((l, i) => (
                    <tr key={`${l.date}-${i}`}>
                      <td>{frDate(l.date)}</td>
                      <td>{l.email ?? l.displayName ?? 'Compte inconnu'}</td>
                      <td>{l.pays ?? '—'}</td>
                      <td>
                        <code>{l.reseau ?? '—'}</code>
                      </td>
                      <td>{l.reussie ? 'OK' : 'Échec'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <p className="mon-note">
          Journal RGPD (§6.5) : seul le pays et le réseau tronqué (/24 ou /48) sont conservés —
          jamais l’adresse IP complète. Rétention 365 jours.
        </p>
      </section>

      <section className="mon-block" aria-labelledby="mon-tokens-h">
        <h3 id="mon-tokens-h">Tokens et coûts LLM</h3>
        <StackedBars
          titre="Tokens par jour (entrée + sortie, par source)"
          points={index(t.parJour, (r) => ({
            demo: r?.demo ? r.demo.entree + r.demo.sortie : 0,
            tuteur: r?.tuteur ? r.tuteur.entree + r.tuteur.sortie : 0,
            twin9: r?.twin9 ? r.twin9.entree + r.twin9.sortie : 0,
          }))}
          series={[
            { key: 'demo', label: 'Démo publique', cssVar: '--mon-s1' },
            { key: 'tuteur', label: 'Tuteur', cssVar: '--mon-s2' },
            { key: 'twin9', label: 'Twin9 / Twin6', cssVar: '--mon-s3' },
          ]}
          format={nb}
        />
        <table className="admin-table mon-compact">
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">Requêtes (période)</th>
              <th scope="col">Tokens entrée</th>
              <th scope="col">Tokens sortie</th>
              <th scope="col">Coût (période)</th>
              <th scope="col">Coût (tout temps)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Démo publique</th>
              <td>{nb(t.periode.demo.requetes)}</td>
              <td>{nb(t.periode.demo.entree)}</td>
              <td>{nb(t.periode.demo.sortie)}</td>
              <td>{usd(Math.round((t.periode.demo.coutUsd || 0) * 1_000_000))}</td>
              <td>{usd(Math.round((t.toutTemps.demo.coutUsd || 0) * 1_000_000))}</td>
            </tr>
            <tr>
              <th scope="row">Tuteur</th>
              <td>{nb(t.periode.tuteur.requetes)}</td>
              <td>{nb(t.periode.tuteur.entree)}</td>
              <td>{nb(t.periode.tuteur.sortie)}</td>
              <td>{usd(Math.round((t.periode.tuteur.coutUsd || 0) * 1_000_000))}</td>
              <td>{usd(Math.round((t.toutTemps.tuteur.coutUsd || 0) * 1_000_000))}</td>
            </tr>
            <tr>
              <th scope="row">Twin9 / Twin6 (débits crédits)</th>
              <td>{nb(t.periode.twin9.appels)}</td>
              <td>{nb(t.periode.twin9.entree)}</td>
              <td>{nb(t.periode.twin9.sortie)}</td>
              <td>{usd(t.periode.twin9.depenseMicrousd)}</td>
              <td>{usd(t.toutTemps.twin9.depenseMicrousd)}</td>
            </tr>
          </tbody>
        </table>
        {t.twin9ParModele.length > 0 ? (
          <>
            <h4>Twin9 / Twin6 par modèle (période)</h4>
            <table className="admin-table mon-compact">
              <thead>
                <tr>
                  <th scope="col">Modèle</th>
                  <th scope="col">Appels</th>
                  <th scope="col">Tokens entrée</th>
                  <th scope="col">Tokens sortie</th>
                  <th scope="col">Débité</th>
                </tr>
              </thead>
              <tbody>
                {t.twin9ParModele.map((m) => (
                  <tr key={m.modele}>
                    <th scope="row">{m.modele}</th>
                    <td>{nb(m.appels)}</td>
                    <td>{nb(m.entree)}</td>
                    <td>{nb(m.sortie)}</td>
                    <td>{usd(m.depenseMicrousd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}
        <p className="mon-note">
          Un pic inhabituel de tokens ou d’échecs de connexion est le premier signal d’une clé
          compromise ou d’un abus — comparez avec les jours précédents.
        </p>
      </section>

      <section className="mon-block" aria-labelledby="mon-fin-h">
        <h3 id="mon-fin-h">Finances (crédits Twin9)</h3>
        <DivergingBars
          titre="Mouvements par jour"
          points={index(f.parJour, (r) => ({
            recharges: r?.topup || 0,
            sorties: Math.abs((r?.debit || 0) + (r?.refund || 0)),
          }))}
          up={{ key: 'recharges', label: 'Recharges', cssVar: '--mon-good' }}
          down={{ key: 'sorties', label: 'Débits + remboursements', cssVar: '--mon-s1' }}
          format={usd}
        />
        <table className="admin-table mon-compact">
          <thead>
            <tr>
              <th scope="col">Mouvement</th>
              <th scope="col">Période</th>
              <th scope="col">Tout temps</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['topup', 'Recharges'],
              ['debit', 'Débits (exécutions)'],
              ['refund', 'Remboursements'],
              ['adjust', 'Ajustements admin'],
            ].map(([kind, label]) => (
              <tr key={kind}>
                <th scope="row">{label}</th>
                <td>
                  {usd(f.periode[kind]?.microusd || 0)}
                  {f.periode[kind]?.n ? ` (${nb(f.periode[kind].n)})` : ''}
                </td>
                <td>
                  {usd(f.toutTemps[kind]?.microusd || 0)}
                  {f.toutTemps[kind]?.n ? ` (${nb(f.toutTemps[kind].n)})` : ''}
                </td>
              </tr>
            ))}
            <tr>
              <th scope="row">PayPal encaissé (captures)</th>
              <td>
                {usd(f.paypal.periode.brutMicrousd)} ({nb(f.paypal.periode.captures)})
              </td>
              <td>
                {usd(f.paypal.toutTemps.brutMicrousd)} ({nb(f.paypal.toutTemps.captures)})
                {f.paypal.toutTemps.rembourseMicrousd > 0
                  ? ` dont ${usd(f.paypal.toutTemps.rembourseMicrousd)} remboursés`
                  : ''}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="mon-block" aria-labelledby="mon-act-h">
        <h3 id="mon-act-h">Activité</h3>
        <div className="mon-cols">
          <StackedBars
            titre="Inscriptions par jour"
            points={index(u.parJour, (r) => ({ n: r?.n || 0 }))}
            series={[{ key: 'n', label: 'Inscriptions', cssVar: '--mon-s1' }]}
            format={nb}
          />
          <StackedBars
            titre="Cartographies créées par jour"
            points={index(c.parJour, (r) => ({ n: r?.n || 0 }))}
            series={[{ key: 'n', label: 'Cartographies', cssVar: '--mon-s2' }]}
            format={nb}
          />
        </div>
        <p className="mon-note">
          Partages : {nb(c.partages.creesPeriode)} créé{c.partages.creesPeriode > 1 ? 's' : ''} sur
          la période · {nb(c.partages.consultationsTotal)} consultation
          {c.partages.consultationsTotal > 1 ? 's' : ''} au total · {nb(c.avecDocument)}{' '}
          cartographie{c.avecDocument > 1 ? 's' : ''} stockée{c.avecDocument > 1 ? 's' : ''} (opt-in).
        </p>
      </section>

      <VotesBlock votes={data.votes} />
      <RoleTable fetchFn={fetchFn} />
    </>
  )
}
