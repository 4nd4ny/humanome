import { useEffect, useMemo, useRef, useState } from 'react'
import Sunburst from '../components/Sunburst.jsx'
import DetailsPanel from '../components/DetailsPanel.jsx'
import ViewToolbar from '../components/ViewToolbar.jsx'
import { frenchDate, loadDay } from '../data/load.js'
import { dayHash } from '../router.js'
import { useDiagramSize, useSunburstLib } from './view-helpers.js'

function refCompetence(referentiel, code) {
  return (referentiel?.competences ?? []).find((c) => c.code === code) ?? null
}

function refPoleOfCode(referentiel, code) {
  const num = Number.parseInt(String(code).split('.')[0], 10)
  return (referentiel?.poles ?? []).find((p) => p.num === num) ?? null
}

/** Resolves a sector meta against the day document + referentiel. */
export function findDayNode(dayDoc, referentiel, meta) {
  if (!dayDoc || !meta) return null
  if (meta.kind === 'competence') {
    const code = meta.code ?? String(meta.id ?? '').split(' ')[0]
    for (const pole of dayDoc.poles ?? []) {
      const competence = (pole.competences ?? []).find((c) => c.code === code)
      if (competence) {
        return {
          kind: 'competence',
          pole,
          competence,
          ref: refCompetence(referentiel, code),
          refPole: refPoleOfCode(referentiel, code),
        }
      }
    }
    return null
  }
  if (meta.kind === 'pole') {
    const refPole = (referentiel?.poles ?? []).find(
      (p) =>
        p.nom === meta.id ||
        p.nom === meta.domainId ||
        p.num === meta.domainId ||
        String(p.num) === String(meta.domainId ?? meta.id),
    )
    const pole = refPole
      ? (dayDoc.poles ?? []).find((dp) => dp.poleNum === refPole.num)
      : null
    return pole ? { kind: 'pole', pole, refPole } : null
  }
  return null
}

const STATUT_CLASSES = {
  'présence établie': 'etablie',
  'renvoi au cartographe': 'renvoi',
  'présence non établie': 'non-etablie',
}

function VerdictBlock({ verdict }) {
  if (!verdict) return null
  const motif = verdict.motif ?? verdict.raison
  const prescription = verdict.prescription ?? verdict.prescriptionMinimale
  return (
    <div className="verdict-block" data-testid="verdict-block">
      <p>
        <span className={`verdict-badge ${STATUT_CLASSES[verdict.statut] ?? ''}`}>
          {verdict.statut}
        </span>{' '}
        <span className="verdict-stats">
          Confiance {Math.round((verdict.confiance ?? 0) * 100)} % · {verdict.nombrePreuves}{' '}
          preuve{verdict.nombrePreuves > 1 ? 's' : ''} · {verdict.nombreIndices} indice
          {verdict.nombreIndices > 1 ? 's' : ''}
        </span>
      </p>
      {motif ? (
        <p>
          <strong>Motif</strong> — {motif}
        </p>
      ) : null}
      {prescription ? (
        <p>
          <strong>Prescription</strong> — {prescription}
        </p>
      ) : null}
    </div>
  )
}

function PedagogueBlocks({ pedagogue }) {
  if (!pedagogue) return null
  const blocks = [
    ['Présomption d’absence', pedagogue.presomptionAbsence],
    ['Présomption de sycophantie', pedagogue.presomptionSycophantie],
    ['Conclusion adversariale', pedagogue.conclusionAdversariale],
  ]
  return (
    <section className="pedagogue" data-testid="pedagogue">
      <h3>Examen adversarial du pédagogue</h3>
      {blocks.map(([label, block]) =>
        block ? (
          <details key={label} className="pedagogue-block">
            <summary>{label}</summary>
            {block.raisonnement ? <p>{block.raisonnement}</p> : null}
            {block.confianceFinale != null ? (
              <p>Confiance finale : {Math.round(block.confianceFinale * 100)} %</p>
            ) : null}
          </details>
        ) : null,
      )}
    </section>
  )
}

function TracesList({ traces, pieces }) {
  if (!traces || traces.length === 0) return null
  const pieceByNumero = new Map((pieces ?? []).map((p) => [p.numero, p]))
  return (
    <section className="traces" data-testid="traces">
      <h3>Traces retenues</h3>
      <ul>
        {traces.map((trace, i) => {
          const piece = pieceByNumero.get(trace.pieceId)
          return (
            <li key={i}>
              <strong>Pièce {trace.pieceId}</strong> — {trace.type} ({trace.role})
              {piece?.contexte ? <span className="trace-contexte"> · {piece.contexte}</span> : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function PoleRapport({ rapport }) {
  if (!rapport) return null
  return (
    <section className="pole-rapport">
      {rapport.portraitPole ? <p>{rapport.portraitPole}</p> : null}
      {Array.isArray(rapport.territoiresDenses) && rapport.territoiresDenses.length > 0 ? (
        <>
          <h3>Territoires denses</h3>
          <ul>
            {rapport.territoiresDenses.map((t, i) => (
              <li key={i}>
                <strong>{t.competence}</strong>
                {t.description ? ` — ${t.description}` : ''}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {rapport.territoiresNonVisites ? (
        <>
          <h3>Territoires non visités</h3>
          <p>{rapport.territoiresNonVisites}</p>
        </>
      ) : null}
      {rapport.emergencesPole ? (
        <>
          <h3>Émergences</h3>
          <p>{rapport.emergencesPole}</p>
        </>
      ) : null}
      {Array.isArray(rapport.pistes) && rapport.pistes.length > 0 ? (
        <>
          <h3>Pistes</h3>
          <ul>
            {rapport.pistes.map((piste, i) => (
              <li key={i}>{piste}</li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  )
}

function PassagesSaillants({ passages }) {
  if (!passages || passages.length === 0) return null
  return (
    <details className="passages" data-testid="passages">
      <summary>Passages saillants ({passages.length})</summary>
      <ul>
        {passages.map((passage, i) => (
          <li key={i}>
            {passage.extraitVerbatim ? <em>« {passage.extraitVerbatim} »</em> : null}
            {passage.contexte ? <span> — {passage.contexte}</span> : null}
          </li>
        ))}
      </ul>
    </details>
  )
}

function ExclusLists({ exclus, referentiel }) {
  if (!exclus) return null
  const sections = [
    ['Présences non établies', exclus.nonEtablies ?? [], 'non-etablies'],
    ['Court-circuits (aucune pièce extraite)', exclus.courtCircuits ?? [], 'court-circuits'],
  ]
  if (sections.every(([, items]) => items.length === 0)) return null
  return (
    <aside className="exclus" data-testid="exclus">
      <h3>Hors diagramme ce jour</h3>
      {sections.map(([label, items, key]) =>
        items.length > 0 ? (
          <details key={key} data-testid={`exclus-${key}`}>
            <summary>
              {label} ({items.length})
            </summary>
            <ul>
              {items.map((item, i) => {
                const code = typeof item === 'string' ? item : item.code
                const ref = refCompetence(referentiel, code)
                const raison =
                  typeof item === 'object'
                    ? item.verdict?.raison ?? item.verdict?.motif ?? null
                    : null
                return (
                  <li key={i}>
                    <strong>{code}</strong>
                    {ref ? ` — ${ref.nom}` : ''}
                    {raison ? <span className="exclus-raison"> · {raison}</span> : null}
                  </li>
                )
              })}
            </ul>
          </details>
        ) : null,
      )}
    </aside>
  )
}

/**
 * Vue Journée : sunburst du jour (largeur = preuves/indices, longueur =
 * confiance) + panneau verdict / pédagogue / traces / rapport de pôle,
 * navigation entre jours et gestion du ?focus=<code>.
 *
 * @param {{
 *   date: string,                // AAAA-MM-JJ (validée par le routeur)
 *   focus?: string | null,       // code de compétence à mettre en évidence
 *   referentiel: object,
 *   days?: string[],             // dates iso connues, pour précédent/suivant
 *   getDay?: (iso: string) => Promise<object>, // défaut : fetch paresseux
 *   lib?: object,                // module sunburst (injecté dans les tests)
 * }} props
 */
export default function DayView({
  date,
  focus = null,
  referentiel,
  days = [],
  getDay = loadDay,
  lib: injectedLib,
}) {
  const { lib, error: libError } = useSunburstLib(injectedLib)
  const size = useDiagramSize()
  const [doc, setDoc] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [selectedMeta, setSelectedMeta] = useState(null)
  const [hoveredMeta, setHoveredMeta] = useState(null)
  // Onglet actif sous 768px (CSS seule masque la zone inactive : les deux
  // zones restent dans le DOM, pour le desktop et pour l'impression).
  const [activeTab, setActiveTab] = useState('diagramme')
  const appliedFocus = useRef(null)

  function handleSelect(meta) {
    setSelectedMeta(meta)
    if (meta) setActiveTab('details') // tap = sélection -> détail lisible à une main
  }

  useEffect(() => {
    let active = true
    setDoc(null)
    setLoadError(null)
    setSelectedMeta(null)
    appliedFocus.current = null
    getDay(date).then(
      (loaded) => active && setDoc(loaded),
      (error) => active && setLoadError(error),
    )
    return () => {
      active = false
    }
  }, [date, getDay])

  const built = useMemo(() => {
    if (!lib || !doc) return null
    return lib.buildDayTree(doc, referentiel)
  }, [lib, doc, referentiel])

  const layout = useMemo(() => {
    if (!lib || !built) return null
    return lib.layoutSunburst(built.tree, { size })
  }, [lib, built, size])

  // ?focus=<code> : sélectionne la compétence dès que le layout est prêt.
  useEffect(() => {
    if (!focus || !layout || appliedFocus.current === focus) return
    const sector = layout.sectors.find(
      (s) => s.meta?.kind === 'competence' && s.meta.code === focus,
    )
    if (sector) {
      setSelectedMeta(sector.meta)
      setActiveTab('details') // lien ?focus= suivi depuis un mobile -> verdict visible
      appliedFocus.current = focus
    }
  }, [focus, layout])

  const selection = useMemo(
    () => findDayNode(doc, referentiel, selectedMeta),
    [doc, referentiel, selectedMeta],
  )

  const sortedDays = useMemo(() => [...days].sort(), [days])
  const dayIndex = sortedDays.indexOf(date)
  const previous = dayIndex > 0 ? sortedDays[dayIndex - 1] : null
  const next = dayIndex !== -1 && dayIndex < sortedDays.length - 1 ? sortedDays[dayIndex + 1] : null

  let panel
  if (selection?.kind === 'competence') {
    const { competence, ref, refPole } = selection
    panel = (
      <DetailsPanel
        title={`${competence.code}${ref ? ` — ${ref.nom}` : ''}`}
        titleColor={refPole?.couleur}
      >
        <VerdictBlock verdict={competence.verdict} />
        <PedagogueBlocks pedagogue={competence.pedagogue} />
        <TracesList traces={competence.tracesRetenues} pieces={competence.pieces} />
      </DetailsPanel>
    )
  } else if (selection?.kind === 'pole') {
    const { pole, refPole } = selection
    const audit = pole.auditPole
    const description = audit
      ? `${audit.presencesEtablies ?? 0} présence(s) établie(s), ${audit.renvoisCartographe ?? 0} renvoi(s), ` +
        `${audit.nonEtablies ?? 0} non établie(s), ${audit.courtCircuits ?? 0} court-circuit(s).`
      : undefined
    panel = (
      <DetailsPanel title={refPole?.nom} titleColor={refPole?.couleur} description={description}>
        <PoleRapport rapport={pole.rapport} />
        <PassagesSaillants passages={pole.passagesSaillants} />
      </DetailsPanel>
    )
  } else {
    const apprenant = doc?.kairos?.kairos?.apprenant
    panel = (
      <DetailsPanel>
        <p className="details-hint">
          Touchez un secteur du diagramme pour voir le verdict, l’examen du pédagogue et les
          traces.
        </p>
        {apprenant?.portrait ? <p>{apprenant.portrait}</p> : null}
        {apprenant?.formeProfil ? <p>{apprenant.formeProfil}</p> : null}
      </DetailsPanel>
    )
  }

  return (
    <div className="day-view">
      <nav className="day-nav" aria-label="Navigation entre les journées">
        <a className="button" href="#/merge">
          ← Retour à la cartographie
        </a>
        <span className="day-badge" data-testid="day-badge">
          Journée du {frenchDate(date)}
        </span>
        <span className="day-nav-links">
          {previous ? (
            <a className="button" href={dayHash(previous)}>
              ← {frenchDate(previous)}
            </a>
          ) : (
            <span className="button button-disabled">←</span>
          )}
          {next ? (
            <a className="button" href={dayHash(next)}>
              {frenchDate(next)} →
            </a>
          ) : (
            <span className="button button-disabled">→</span>
          )}
        </span>
      </nav>

      <ViewToolbar activeTab={activeTab} onTabChange={setActiveTab} />

      {loadError ? (
        <p className="load-error" role="alert">
          {loadError.message}
        </p>
      ) : (
        <div className="view-layout" data-tab={activeTab}>
          <div className="diagram-zone">
            <div className="hover-overlay" aria-hidden="true">
              {hoveredMeta?.id ?? ''}
            </div>
            {layout ? (
              <Sunburst
                layout={layout}
                selectedId={selectedMeta?.id ?? null}
                onSelect={handleSelect}
                onHover={setHoveredMeta}
                label={`Cartographie de la journée du ${frenchDate(date)}`}
              />
            ) : (
              <p className="diagram-placeholder" data-testid="diagram-status">
                {libError ? libError.message : 'Préparation du diagramme…'}
              </p>
            )}
          </div>
          <div className="panel-zone">
            {panel}
            <ExclusLists exclus={built?.exclus} referentiel={referentiel} />
          </div>
        </div>
      )}
    </div>
  )
}
