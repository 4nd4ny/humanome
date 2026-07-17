// Interface V3 — état partagé et calcul des panneaux (spec §12, §14).
//
// Les états fonctionnels sont SÉPARÉS (§3.4) : ouvrir une branche, filtrer,
// inspecter, déplacer la tête de lecture, masquer un panneau, exclure d'un
// partage, changer de thème et passer en mode expert sont des états distincts.
// Changer de thème, de mode ou de panneaux ne modifie JAMAIS la révision, les
// calculs, les dates, le filtre, l'inspection ou le projet de partage.
//
//   availablePanels = capacitésDuFormat ∩ audience ∩ interfaceMode
//   renderedPanels  = visiblePanels ∩ availablePanels
//
// Une préférence mémorisée ne peut donc jamais réafficher audit, éditeur ou
// constructeur privé dans une vue employeur (AC-UI-04).

export const ALL_PANELS = [
  'tree', 'sun', 'heatmap', 'timeline', 'legend', 'stats',
  'comparison', 'portfolio', 'importAudit', 'jsonEditor', 'shareInspector',
]

/** Panneaux par audience (le mode expert n'élargit JAMAIS l'audience §4). */
const AUDIENCE_PANELS = {
  learner: new Set(ALL_PANELS),
  preview: new Set(['tree', 'sun', 'heatmap', 'timeline', 'legend', 'stats', 'portfolio']),
  employer: new Set(['tree', 'sun', 'heatmap', 'timeline', 'legend', 'stats', 'portfolio']),
}

/**
 * Panneaux par mode de présentation (§14.1-2, étendu le 2026-07-17 : vues
 * préconfigurées par persona — un mode reste un NIVEAU DE PRÉSENTATION,
 * jamais un niveau d'autorisation §4, l'audience borne toujours).
 *
 * - employeur   : lire les forces et leurs preuves — soleil, indicateurs,
 *                 preuves, préparation du partage (se mettre dans les yeux
 *                 du destinataire) ;
 * - apprenant   : explorer, comprendre, annoter, se comparer à soi-même ;
 * - cartographe : relire et garantir — arbre complet, provenance, file de
 *                 revue, audit d'import et arbitrage des variantes ;
 * - expert      : tout, y compris l'éditeur JSON.
 */
const MODE_PANELS = {
  simplified: new Set(['tree', 'sun', 'heatmap', 'timeline', 'legend', 'stats', 'comparison', 'portfolio']),
  employeur: new Set(['sun', 'stats', 'legend', 'portfolio', 'heatmap', 'timeline', 'shareInspector']),
  apprenant: new Set(['tree', 'sun', 'heatmap', 'timeline', 'legend', 'stats', 'comparison', 'portfolio', 'shareInspector']),
  cartographe: new Set(['tree', 'sun', 'heatmap', 'timeline', 'legend', 'stats', 'comparison', 'portfolio', 'importAudit']),
  expert: new Set(ALL_PANELS),
}

export const INTERFACE_MODES = ['simplified', 'employeur', 'apprenant', 'cartographe', 'expert']

/**
 * Capacités du FORMAT visualisé : la précision temporelle restreint heatmap et
 * timeline (§18.7, §20 — la heatmap journalière n'existe que sous `day`).
 * @param {{temporalPrecision?: 'day'|'month'|'hidden'}} format
 */
export function formatCapabilities({ temporalPrecision = 'day' } = {}) {
  const caps = new Set(ALL_PANELS)
  if (temporalPrecision !== 'day') caps.delete('heatmap')
  if (temporalPrecision === 'hidden') {
    caps.delete('timeline')
    caps.delete('comparison')
  }
  return caps
}

/**
 * availablePanels = capacitésDuFormat ∩ audience ∩ mode (§14.3).
 * @param {{format?: object, audience: 'learner'|'preview'|'employer', interfaceMode: 'simplified'|'expert'}} p
 */
export function availablePanels({ format = {}, audience, interfaceMode }) {
  const caps = formatCapabilities(format)
  const aud = AUDIENCE_PANELS[audience] ?? AUDIENCE_PANELS.employer
  const mode = MODE_PANELS[interfaceMode] ?? MODE_PANELS.simplified
  return new Set([...caps].filter((p) => aud.has(p) && mode.has(p)))
}

/** renderedPanels = visiblePanels ∩ availablePanels (AC-UI-04). */
export function renderedPanels(visiblePanels, available) {
  return new Set([...visiblePanels].filter((p) => available.has(p)))
}

/** Préréglages initiaux de visibilité par mode (§14.4 : premier accès). */
export function defaultVisiblePanels(interfaceMode) {
  switch (interfaceMode) {
    case 'expert':
      return new Set(ALL_PANELS)
    case 'employeur':
      // Lire les forces choisies et leurs preuves, préparer le partage.
      return new Set(['sun', 'stats', 'legend', 'portfolio', 'shareInspector'])
    case 'apprenant':
      // Explorer, comprendre, se comparer à soi-même, annoter les preuves.
      return new Set(['sun', 'heatmap', 'timeline', 'comparison', 'portfolio', 'stats', 'legend'])
    case 'cartographe':
      // Relire et garantir : provenance, file de revue, audit, arbitrage.
      return new Set(['tree', 'portfolio', 'importAudit', 'sun', 'heatmap', 'stats'])
    default:
      return new Set(['sun', 'heatmap', 'timeline', 'legend', 'stats'])
  }
}

/** État fonctionnel initial (spec §12). */
export function initialState({ audience = 'learner', interfaceMode = 'simplified' } = {}) {
  return {
    activeRevisionId: null,
    activeScopeNodeId: null, // null = racine (toutes les compétences)
    manuallyExpandedTreeNodeIds: new Set(),
    temporarilyRevealedTreeNodeIds: new Set(),
    hoverPreview: null,
    inspection: null, // {day, source, pinnedCompetencyIds: [], portfolioPinned: false}
    playheadDay: null, // null = dernière journée (état complet)
    baselineDay: null,
    comparisonMode: null, // null | 'last-evaluation' | 'quarter-start' | 'year-start'
    visibleHeatmapPeriod: null, // année visible, sans déplacer la tête de lecture
    sunViewportNodeId: null, // cadrage radial sans effet sur le filtre
    interfaceMode,
    visiblePanels: defaultVisiblePanels(interfaceMode),
    panelOverridesByMode: Object.fromEntries(INTERFACE_MODES.map((m) => [m, null])),
    printSections: null, // choisies à l'impression, distinctes de visiblePanels
    surfaceTheme: 'system',
    colorVisionSupport: 'standard',
    motionPreference: 'system',
    audience,
    shareDraftId: null,
    playback: { playing: false, direction: 1, speed: 1 },
  }
}

/**
 * Expansions effectives = manuelles ∪ révélées temporairement (§12). Seules
 * les manuelles répondent aux chevrons ; une révélation ne ferme jamais une
 * branche ouverte par l'utilisateur.
 */
export function effectiveExpandedTreeNodeIds(state) {
  return new Set([...state.manuallyExpandedTreeNodeIds, ...state.temporarilyRevealedTreeNodeIds])
}

/**
 * Bascule de mode (§14.3) : conserve filtre, date, inspection, portfolio,
 * cadrage, expansions et brouillon de partage (AC-UI-01). Les préférences de
 * panneaux sont mémorisées PAR MODE (§14.4).
 */
export function switchMode(state, nextMode) {
  if (nextMode === state.interfaceMode) return state
  const overrides = {
    ...state.panelOverridesByMode,
    [state.interfaceMode]: new Set(state.visiblePanels),
  }
  const remembered = overrides[nextMode]
  return {
    ...state,
    interfaceMode: nextMode,
    panelOverridesByMode: overrides,
    visiblePanels: remembered ? new Set(remembered) : defaultVisiblePanels(nextMode),
  }
}

/** Sélection d'une portée (arbre, soleil, heatmap ou portfolio → MÊME filtre, AC-SYNC-02). */
export function selectScope(state, nodeId) {
  if (state.activeScopeNodeId === nodeId) return state // idempotent (§13.2)
  return { ...state, activeScopeNodeId: nodeId }
}

/** Retrait du filtre — uniquement par la commande explicite (§13.2). */
export function clearScope(state) {
  return { ...state, activeScopeNodeId: null }
}

/**
 * Inspection d'une journée (PAS un déplacement de la tête de lecture,
 * AC-SYNC-03/04). Une nouvelle inspection est désépinglée par défaut ;
 * l'inspection met la lecture en pause (§13.5).
 */
export function inspectDay(state, { day, source, pinnedCompetencyIds = [] }) {
  return {
    ...state,
    inspection: { day, source, pinnedCompetencyIds, portfolioPinned: false },
    playback: { ...state.playback, playing: false },
  }
}

/** Seule l'action « Voir l'état à cette date » déplace la tête de lecture (AC-SYNC-04). */
export function setPlayhead(state, day) {
  return { ...state, playheadDay: day }
}

/** Relancer la lecture ferme une inspection non épinglée (§13.5). */
export function play(state, direction = 1) {
  const inspection = state.inspection?.portfolioPinned ? state.inspection : null
  return { ...state, inspection, playback: { ...state.playback, playing: true, direction } }
}

export function pause(state) {
  return { ...state, playback: { ...state.playback, playing: false } }
}
