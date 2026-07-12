// Régénération rétrospective (P10.6, cahier §3.4 et §8) — logique pure.
//
// Relancer la cartographie d'une JOURNÉE existante avec une version PLUS
// RÉCENTE du référentiel, puis comparer : compétences nouvellement détectées
// (souvent ajoutées au référentiel depuis), disparues, stables.
//
// RGPD : le texte de la journée ne vient JAMAIS du serveur (il n'y est pas,
// client-first §6.1) — il est retrouvé dans les portfolios locaux du
// navigateur, ou collé par le promptologue.

import { STATUT_ETABLIE } from './bench.js'

/**
 * Index code -> statut d'un document cartographie-jour.
 * @param {object} doc @returns {Map<string, string|null>}
 */
function statutsParCode(doc) {
  const map = new Map()
  for (const pole of doc?.poles ?? []) {
    for (const comp of pole.competences ?? []) {
      map.set(comp.code, comp?.verdict?.statut ?? null)
    }
  }
  return map
}

/**
 * Compare l'original et la régénération : présence établie avant/après.
 *
 * @param {object} originalDoc cartographie-jour d'origine
 * @param {object} newDoc cartographie-jour régénérée (référentiel plus récent)
 * @returns {{nouvelles: Array<{code: string, statutApres: string}>,
 *   disparues: Array<{code: string, statutAvant: string, statutApres: string|null}>,
 *   stables: string[]}}
 */
export function compareRetroDocs(originalDoc, newDoc) {
  const avant = statutsParCode(originalDoc)
  const apres = statutsParCode(newDoc)
  const etabliAvant = new Set([...avant].filter(([, s]) => s === STATUT_ETABLIE).map(([c]) => c))
  const etabliApres = new Set([...apres].filter(([, s]) => s === STATUT_ETABLIE).map(([c]) => c))

  const nouvelles = [...etabliApres]
    .filter((code) => !etabliAvant.has(code))
    .sort()
    .map((code) => ({ code, statutApres: STATUT_ETABLIE }))
  const disparues = [...etabliAvant]
    .filter((code) => !etabliApres.has(code))
    .sort()
    .map((code) => ({ code, statutAvant: STATUT_ETABLIE, statutApres: apres.get(code) ?? null }))
  const stables = [...etabliAvant].filter((code) => etabliApres.has(code)).sort()

  return { nouvelles, disparues, stables }
}

/**
 * Retrouve le texte local d'une journée dans les portfolios du navigateur
 * (même règle de regroupement que computeDayGroups : segments d'une même date
 * concaténés).
 *
 * @param {Array<{titre?: string, segments?: Array<{date: string, texte: string}>}>} portfolios
 * @param {string} date ISO AAAA-MM-JJ
 * @returns {{texte: string, portfolioTitre: string} | null}
 */
export function findLocalDayText(portfolios, date) {
  for (const record of portfolios ?? []) {
    const parts = (record.segments ?? [])
      .filter((seg) => seg?.date === date && typeof seg.texte === 'string')
      .map((seg) => seg.texte)
    if (parts.length > 0) {
      return { texte: parts.join('\n\n'), portfolioTitre: record.titre ?? 'Portfolio local' }
    }
  }
  return null
}

/**
 * Versions de référentiel STRICTEMENT plus récentes qu'une version de base.
 * @param {Array<{version: string}>} versions métadonnées API
 * @param {string|null} baseVersion version du référentiel d'origine (si connue)
 * @returns {Array<{version: string}>} plus récentes d'abord
 */
export function newerReferentielVersions(versions, baseVersion) {
  const parse = (v) => {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v ?? ''))
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
  }
  const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
  const base = parse(baseVersion)
  return (versions ?? [])
    .filter((entry) => parse(entry?.version) !== null)
    .filter((entry) => base === null || cmp(parse(entry.version), base) > 0)
    .sort((a, b) => cmp(parse(b.version), parse(a.version)))
}
