// Interface ultime — référentiel de compétences (spec §3 « un référentiel est
// obligatoire », §15 point ouvert 8).
//
// Le référentiel est CHARGÉ DEPUIS UN FICHIER (forme publiée du site :
// { id, version, label?, poles[{num, nom, couleur}], competences[{code, nom,
// pole, description?}] }) puis EMBARQUÉ dans le jeu de données (archive
// autoporteuse, §4.2). Rien n'est codé en dur dans les vues : ni « RESPIRE v7 »,
// ni « 61 », ni les noms de pôles.
//
// L'ordre angulaire du soleil est celui du référentiel (§5.4) : pôles par
// numéro croissant, compétences dans l'ordre du fichier au sein de leur pôle.
// Chaque pôle reçoit un SYMBOLE et un MOTIF stables pour le mode
// « distinctions renforcées » (§6.1) : l'identité ne repose jamais sur la
// seule couleur.

const POLE_MARKS = [
  { symbol: '●', pattern: 'solid' },
  { symbol: '◆', pattern: 'diagonal' },
  { symbol: '■', pattern: 'dots' },
  { symbol: '▲', pattern: 'cross' },
  { symbol: '⬟', pattern: 'horizontal' },
  { symbol: '⬢', pattern: 'vertical' },
  { symbol: '★', pattern: 'grid' },
  { symbol: '✚', pattern: 'diagonal-reverse' },
]

/** Couleur de repli d'un pôle sans couleur déclarée. */
export const FALLBACK_POLE_COLOR = '#78716c'

/**
 * Erreurs de forme d'un document de référentiel (vide si valide).
 * @param {unknown} doc
 * @returns {string[]}
 */
export function referentialErrors(doc) {
  const errors = []
  if (!doc || typeof doc !== 'object') return ['Référentiel illisible (objet attendu)']
  if (!Array.isArray(doc.poles) || doc.poles.length === 0) errors.push('poles[] absent ou vide')
  if (!Array.isArray(doc.competences) || doc.competences.length === 0) errors.push('competences[] absent ou vide')
  if (errors.length) return errors
  const nums = new Set()
  for (const p of doc.poles) {
    const num = Number(p?.num)
    if (!Number.isInteger(num)) errors.push(`pôle sans numéro entier (${JSON.stringify(p?.num)})`)
    else if (nums.has(num)) errors.push(`pôle ${num} dupliqué`)
    nums.add(num)
    if (typeof p?.nom !== 'string' || p.nom.trim() === '') errors.push(`pôle ${p?.num} sans nom`)
  }
  const codes = new Set()
  for (const c of doc.competences) {
    if (typeof c?.code !== 'string' || c.code.trim() === '') {
      errors.push('compétence sans code')
      continue
    }
    if (codes.has(c.code)) errors.push(`compétence ${c.code} dupliquée`)
    codes.add(c.code)
    if (!nums.has(Number(c.pole))) errors.push(`compétence ${c.code} : pôle ${c.pole} inconnu`)
  }
  return errors
}

/**
 * Forme sérialisable et minimale, embarquée dans le jeu de données.
 * @param {object} doc référentiel publié (ou déjà embarqué)
 */
export function toEmbeddedReferential(doc) {
  const errors = referentialErrors(doc)
  if (errors.length) throw new Error(`Référentiel invalide : ${errors.join(' ; ')}`)
  return {
    id: typeof doc.id === 'string' ? doc.id : 'referentiel',
    version: typeof doc.version === 'string' ? doc.version : '0.0.0',
    label: typeof doc.label === 'string' ? doc.label : `${doc.id ?? 'référentiel'} ${doc.version ?? ''}`.trim(),
    poles: doc.poles.map((p) => ({ num: Number(p.num), nom: p.nom, couleur: p.couleur ?? null })),
    competences: doc.competences.map((c) => ({
      code: c.code,
      nom: typeof c.nom === 'string' ? c.nom : c.code,
      pole: Number(c.pole),
      description: typeof c.description === 'string' ? c.description : '',
    })),
  }
}

/**
 * Référentiel prêt à l'emploi (index, ordre angulaire, marques).
 * @param {object} doc forme embarquée ou publiée
 * @returns {{
 *   id: string, version: string, label: string,
 *   poles: Array<{num: number, name: string, color: string, symbol: string, pattern: string, order: number}>,
 *   competencies: Array<{code: string, name: string, pole: number, description: string, order: number}>,
 *   poleByNum: Map<number, object>, compByCode: Map<string, object>, codesByPole: Map<number, string[]>,
 * }}
 */
export function normalizeReferential(doc) {
  const emb = toEmbeddedReferential(doc)
  const poles = [...emb.poles]
    .sort((a, b) => a.num - b.num)
    .map((p, i) => ({
      num: p.num,
      name: p.nom,
      color: p.couleur ?? FALLBACK_POLE_COLOR,
      symbol: POLE_MARKS[i % POLE_MARKS.length].symbol,
      pattern: POLE_MARKS[i % POLE_MARKS.length].pattern,
      order: i,
    }))
  const poleOrder = new Map(poles.map((p) => [p.num, p.order]))
  // Ordre du fichier au sein de chaque pôle (tri stable par rang de pôle).
  const competencies = emb.competences
    .map((c, fileIndex) => ({ ...c, fileIndex }))
    .sort((a, b) => poleOrder.get(a.pole) - poleOrder.get(b.pole) || a.fileIndex - b.fileIndex)
    .map((c, i) => ({ code: c.code, name: c.nom, pole: c.pole, description: c.description, order: i }))
  const codesByPole = new Map(poles.map((p) => [p.num, []]))
  for (const c of competencies) codesByPole.get(c.pole).push(c.code)
  return {
    id: emb.id,
    version: emb.version,
    label: emb.label,
    poles,
    competencies,
    poleByNum: new Map(poles.map((p) => [p.num, p])),
    compByCode: new Map(competencies.map((c) => [c.code, c])),
    codesByPole,
  }
}

/** Libellé « code — nom » d'une compétence (ou le code seul si inconnue). */
export function competencyLabel(ref, code) {
  const c = ref.compByCode.get(code)
  return c ? `${c.code} — ${c.name}` : `${code} (hors référentiel)`
}

/**
 * Nom court d'un pôle : la partie avant « — » (« TETE — Penser… » → « TETE »).
 */
export function poleShortName(pole) {
  return String(pole?.name ?? '').split('—')[0].trim() || String(pole?.num ?? '')
}
