// Étage B2 — document merge final (plan-portage-moteur.md).
// buildMergeDocument(agrege, narrativeTexts, meta) -> document `cartographie-merge`.
//
// Rétro-conçu depuis l'oracle réel (assets-existants/merge-prototype/intermediate/
// carto_merge.json -> web/public/data/demo/merge.json), parité vérifiée par
// scripts/parity/parity-document.mjs. Règles retrouvées sur les 54 exemples :
//
// 1. FILTRAGE : une compétence agrégée est rendue ssi `statut_final ===
//    "présence établie"` (61 -> 54 ; équivalent, sur le corpus, à
//    `nb_feuilles_etablies > 0`).
// 2. NIVEAU (1..5) : quintile du `score_moyen_par_feuille` parmi les compétences
//    rendues. Seuils = quantiles « exclusifs » (méthode de
//    statistics.quantiles(v, n=5) de Python : position (n+1)·k/5, 1-based,
//    interpolation linéaire) ; niveau = 1 + nombre de seuils <= valeur
//    (une valeur égale au seuil bascule dans le quintile supérieur).
//    Vérifié 54/54 (distribution 10/11/11/11/11).
// 3. POINTS = nb_feuilles_etablies (54/54).
// 4. ARCHETYPE — arbre de décision retrouvé, vérifié 54/54 :
//      a. renvois >= établies                      -> frontiere_en_mouvement
//      b. sinon niveau === 3                        -> en_formation
//      c. sinon freqHaute = nb_feuilles_etablies >= médiane des
//         nb_feuilles_etablies des compétences RENDUES du même pôle :
//           niveau >= 4 : freqHaute ? trait_fondateur : pic_intensite
//           niveau <= 2 : freqHaute ? presence_arriere_plan : touche_occasionnelle
// 5. TENDANCE des pôles : tiers temporels des feuilles chronologiques coupés à
//    floor(n/3) et floor(2n/3) ; t_i = somme des `etablies` de
//    evolution_par_feuille par tiers ; p_i = 100·t_i/total (bruts) ;
//    ecart_max_min = round(max(p)-min(p), 1). Si l'écart BRUT > 12 :
//    crescendo si p3 est max, pic_milieu si p2 est max (decrescendo si p1,
//    non observé) ; sinon presence_reguliere. Seuil exact indécidable dans
//    (12.0, 13.04] sur 7 exemples ; 12 retenu (pôle 7 : écart 12.0 -> régulière).
// 6. HTML : templates reconstruits chaîne à chaîne (badge, score-summary,
//    histoire d'apprentissage, liens feuilles, rapports de pôle, kairos,
//    tableaux d'évolution) ; échappement identique à html.escape de Python.
//    Les narratifs eux-mêmes (llm_outputs/*.md) sont des sorties LLM injectées
//    telles quelles via `narrativeTexts`.
//
// Aucune E/S ici : le moteur ne lit ni n'écrit rien de lui-même (P5).

const POLE_COLORS = {
  1: '#2563eb',
  2: '#10b981',
  3: '#ec4899',
  4: '#8b5cf6',
  5: '#f59e0b',
  6: '#06b6d4',
  7: '#f97316',
}

const ARCHETYPES = {
  trait_fondateur: {
    titre: 'Trait fondateur',
    description: 'Revient souvent et avec densité',
  },
  presence_arriere_plan: {
    titre: "Présence d'arrière-plan",
    description: "Accompagne le travail au quotidien sans s'imposer",
  },
  touche_occasionnelle: {
    titre: 'Touche occasionnelle',
    description: 'Territoire effleuré',
  },
  frontiere_en_mouvement: {
    titre: 'Frontière en mouvement',
    description: 'Vibre à des frontières fines, à clarifier en entretien',
  },
  pic_intensite: {
    titre: "Pic d'intensité",
    description: "Apparaît rarement, mais densément quand c'est le cas",
  },
  en_formation: {
    titre: 'En formation',
    description: 'En train de prendre place dans le profil',
  },
}

const TENDANCES = {
  presence_reguliere: {
    titre: 'Présence régulière',
    description: 'Pôle mobilisé tout au long de la période',
  },
  pic_milieu: {
    titre: 'Pic au milieu',
    description: "Pôle qui s'approfondit dans la phase intermédiaire",
  },
  crescendo: {
    titre: 'Crescendo',
    description: 'Pôle dont la place croît au fil du portfolio',
  },
  // Non observé dans le corpus (aucun pôle décroissant) — libellés déduits par symétrie.
  decrescendo: {
    titre: 'Decrescendo',
    description: 'Pôle dont la place décroît au fil du portfolio',
  },
}

const ETABLIE = 'présence établie'

// --- Utilitaires -----------------------------------------------------------

/** html.escape de Python : & < > " ' (l'apostrophe devient &#x27;). */
export function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#x27;')
}

/** 2026-01-08 -> 08/01/2026 */
export function frDate(iso) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/** Arrondi à `nd` décimales (demi vers le haut, comme round() JS étendu). */
function round(x, nd = 0) {
  const f = 10 ** nd
  return Math.round((x + Number.EPSILON) * f) / f
}

/** Médiane d'un tableau de nombres. */
function median(values) {
  const s = [...values].sort((a, b) => a - b)
  const n = s.length
  if (n === 0) return NaN
  return n % 2 === 1 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2
}

/**
 * Quantiles « exclusifs » (statistics.quantiles(v, n) de Python, method par
 * défaut) : n-1 points de coupe aux positions (len+1)·k/n (1-based),
 * interpolation linéaire. Retourne les n-1 seuils.
 */
export function quantilesExclusive(values, n = 5) {
  const s = [...values].sort((a, b) => a - b)
  const m = s.length
  if (m < 2) throw new Error('quantilesExclusive: at least two values required')
  const out = []
  for (let k = 1; k < n; k++) {
    const pos = ((m + 1) * k) / n // position 1-based
    let j = Math.floor(pos)
    const g = pos - j
    if (j < 1) { out.push(s[0]); continue }
    if (j >= m) { out.push(s[m - 1]); continue }
    out.push(s[j - 1] + g * (s[j] - s[j - 1]))
  }
  return out
}

// --- Règles découvertes ----------------------------------------------------

/** Compétences rendues : statut final cumulé « présence établie ». */
export function isRendered(comp) {
  return comp.statut_final === ETABLIE
}

/**
 * Niveaux 1..5 par quintile du score moyen par feuille.
 * @param {Array<{code, score_moyen_par_feuille}>} comps compétences rendues
 * @returns {Map<string, number>} code -> niveau
 */
export function computeNiveaux(comps) {
  // Cas dégénéré (non observé : le corpus rend 54 compétences) : une seule
  // compétence n'a pas de quintiles — niveau médian neutre.
  if (comps.length === 1) return new Map([[comps[0].code, 3]])
  const th = quantilesExclusive(comps.map((c) => c.score_moyen_par_feuille), 5)
  const map = new Map()
  for (const c of comps) {
    map.set(c.code, 1 + th.filter((t) => c.score_moyen_par_feuille >= t).length)
  }
  return map
}

/**
 * Archétype d'une compétence rendue.
 * @param comp entrée `par_competence` (oracle merge numérique)
 * @param niveau quintile 1..5 (computeNiveaux)
 * @param poleMedianNbe médiane des nb_feuilles_etablies des compétences
 *   rendues du même pôle
 */
export function computeArchetype(comp, niveau, poleMedianNbe) {
  if (comp.nb_feuilles_renvois >= comp.nb_feuilles_etablies) return 'frontiere_en_mouvement'
  if (niveau === 3) return 'en_formation'
  const freqHaute = comp.nb_feuilles_etablies >= poleMedianNbe
  if (niveau >= 4) return freqHaute ? 'trait_fondateur' : 'pic_intensite'
  return freqHaute ? 'presence_arriere_plan' : 'touche_occasionnelle'
}

/**
 * Tendance temporelle d'un pôle à partir de son evolution_par_feuille.
 * Tiers coupés à floor(n/3) et floor(2n/3) ; comparaison sur les parts BRUTES,
 * stats exposées arrondies à 1 décimale.
 */
export function computeTendance(evolutionParFeuille) {
  const n = evolutionParFeuille.length
  const c1 = Math.floor(n / 3)
  const c2 = Math.floor((2 * n) / 3)
  const t = [0, 0, 0]
  evolutionParFeuille.forEach((e, i) => {
    t[i < c1 ? 0 : i < c2 ? 1 : 2] += e.etablies
  })
  const total = t[0] + t[1] + t[2]
  const raw = total > 0 ? t.map((x) => (100 * x) / total) : [0, 0, 0]
  const ecartRaw = Math.max(...raw) - Math.min(...raw)
  let tendance = 'presence_reguliere'
  if (ecartRaw > 12) {
    const max = Math.max(...raw)
    if (raw[2] === max) tendance = 'crescendo'
    else if (raw[1] === max) tendance = 'pic_milieu'
    else tendance = 'decrescendo'
  }
  return {
    tendance,
    stats: {
      t1: t[0],
      t2: t[1],
      t3: t[2],
      p1: round(raw[0], 1),
      p2: round(raw[1], 1),
      p3: round(raw[2], 1),
      ecart_max_min: round(ecartRaw, 1),
    },
  }
}

// --- Markdown minimal (converti comme le prototype Python) -----------------

/**
 * Convertit le markdown des narratifs LLM dans le sous-ensemble HTML observé
 * dans le corpus : ## -> <h4>, une ligne non vide -> un <p>, "- " -> <ul><li>
 * (les items séparés par des lignes vides restent dans le MÊME <ul>),
 * "> " -> <blockquote>, **gras** -> <strong>, *italique* -> <em>,
 * `code` -> <code>.
 * Tout le texte est échappé façon html.escape AVANT la pose des balises inline.
 */
export function markdownToHtml(md) {
  const inline = (s) =>
    escapeHtml(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')

  const lines = String(md).replace(/\r\n/g, '\n').split('\n')
  const isItem = (t) => /^[-*]\s+/.test(t)
  const out = []
  let i = 0
  while (i < lines.length) {
    const trimmed = lines[i].trim()
    if (trimmed === '') { i++; continue }
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed)
    if (heading) {
      const level = Math.min(6, heading[1].length + 2)
      out.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`)
      i++
      continue
    }
    if (trimmed.startsWith('>')) {
      // Blockquote : lignes consécutives commençant par ">" fusionnées.
      const quote = []
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quote.push(lines[i].trim().replace(/^>\s?/, ''))
        i++
      }
      out.push(`<blockquote>${inline(quote.join(' ').trim())}</blockquote>`)
      continue
    }
    if (isItem(trimmed)) {
      // Liste : les items séparés par des lignes vides restent dans le même <ul>.
      out.push('<ul>')
      while (i < lines.length) {
        const t = lines[i].trim()
        if (t === '') {
          let j = i
          while (j < lines.length && lines[j].trim() === '') j++
          if (j < lines.length && isItem(lines[j].trim())) { i = j; continue }
          break
        }
        if (!isItem(t)) break
        out.push(`<li>${inline(t.replace(/^[-*]\s+/, ''))}</li>`)
        i++
      }
      out.push('</ul>')
      continue
    }
    // Paragraphe : UNE ligne non vide = un <p> (comportement du prototype).
    out.push(`<p>${inline(trimmed)}</p>`)
    i++
  }
  return out.join('\n')
}

// --- Assemblages HTML ------------------------------------------------------

const dayLink = (date, focus) => {
  const q = focus ? `?focus=${focus}` : ''
  return `<a href="feuilles/${date}/carto-day.html${q}" target="_blank" rel="noopener">${frDate(date)}</a>`
}

/**
 * Feedback HTML d'une compétence : badge + score-summary + histoire
 * d'apprentissage (narratif LLM) + liens vers les feuilles établies.
 */
export function buildFeedbackHtml(comp, narrativeMd) {
  const badge = `<div class="verdict-badge etablie">Présence établie (cumulée)</div>`
  const confPct = Math.floor(comp.confiance_moyenne * 100) // troncature (observée 54/54)
  const sep = '<span class="score-sep"> · </span>'
  const s = (n) => (n === 1 ? '' : 's') // pluriel sauf N=1 (« 0 preuves décisives » observé)
  const renvoisSpan =
    comp.nb_feuilles_renvois > 0
      ? `<span class="score-renvois">${comp.nb_feuilles_renvois} renvoi${s(comp.nb_feuilles_renvois)}</span>${sep}`
      : '' // omis quand 0 renvoi (observé : 3.06, 6.01)
  const summary =
    `<div class="score-summary">` +
    `<span class="score-frequence">${comp.nb_feuilles_etablies} feuille${s(comp.nb_feuilles_etablies)}</span>${sep}` +
    renvoisSpan +
    `<span class="score-preuves">${comp.cumul_preuves} preuve${s(comp.cumul_preuves)} décisive${s(comp.cumul_preuves)}</span>${sep}` +
    `<span class="score-indices">${comp.cumul_indices} indice${s(comp.cumul_indices)}</span><br>` +
    `<span class="score-confiance">Confiance moy. ${confPct} %</span>${sep}` +
    `<span class="score-intensite">Intensité moy./feuille ${comp.score_moyen_par_feuille.toFixed(2)}</span>${sep}` +
    `<span class="score-cumule"><strong>Score ${Math.round(comp.score)}</strong></span>` +
    `</div>`
  const links = comp.presence_par_feuille
    .filter((e) => e.statut === ETABLIE)
    .map((e) => `<li>${dayLink(e.date, comp.code)}</li>`)
  return [
    badge,
    summary,
    `<h4>Histoire d'apprentissage</h4>`,
    markdownToHtml(narrativeMd),
    `<h4>Voir le détail par feuille</h4>`,
    `<ul class="liens-feuilles">`,
    ...links,
    `</ul>`,
  ].join('\n')
}

/**
 * Rapport évolutif HTML d'un pôle : titre + narratif LLM + tableau d'évolution.
 * Une ligne du tableau est liée vers la feuille ssi le rapport de pôle de cette
 * feuille existe (rapportCompletMarkdown non vide — observé : 06/01 partout,
 * 07/03 pôle 6 sans lien).
 */
export function buildPoleRapportHtml(pole, narrativeMd) {
  const hasRapport = new Map(
    (pole.rapports_par_feuille ?? []).map((r) => [r.date, Boolean(r.rapportCompletMarkdown)]),
  )
  const rows = pole.evolution_par_feuille
    .map(
      (e) =>
        `<tr><td>${hasRapport.get(e.date) ? dayLink(e.date) : frDate(e.date)}</td><td>${e.score.toFixed(2)}</td>` +
        `<td>${e.etablies}</td><td>${e.renvois}</td></tr>`,
    )
    .join('\n')
  return [
    `<h3>Rapport évolutif du pôle ${pole.pole_num} — ${escapeHtml(pole.pole_nom)}</h3>`,
    markdownToHtml(narrativeMd),
    `<h4>Évolution du pôle</h4>`,
    `<table class="evolution-pole"><tr><th>Date</th><th>Score</th><th>Établies</th><th>Renvois</th></tr>\n${rows}\n</table>`,
  ].join('\n')
}

/** Synthèse kairos HTML : préambule + narratif LLM + tableau d'évolution globale. */
export function buildKairosHtml(periode, evolutionGlobale, narrativeMd) {
  const rows = evolutionGlobale
    .map(
      (e) =>
        `<tr><td>${dayLink(e.date)}</td><td>${e.score_total.toFixed(2)}</td>` +
        `<td>${e.etablies}</td><td>${e.renvois}</td><td>${e.herfindahl.toFixed(4)}</td></tr>`,
    )
    .join('\n')
  return [
    `<h3>Synthèse évolutive du portfolio</h3>`,
    `<p class="periode-resume"><em>${periode.nb_feuilles} feuilles cartographiées entre ${frDate(periode.premiere)} et ${frDate(periode.derniere)}.</em></p>`,
    markdownToHtml(narrativeMd),
    `<h4>Évolution globale</h4>`,
    `<table class="evolution-globale"><tr><th>Date</th><th>Score total</th><th>Établies</th><th>Renvois</th><th>Herfindahl</th></tr>\n${rows}\n</table>`,
  ].join('\n')
}

// --- Construction du document ---------------------------------------------

/**
 * Construit le document `cartographie-merge` final.
 *
 * @param {object} agrege sortie de l'étage A (forme de carto_merge.json) :
 *   { version, date_construction, periode, feuilles, agrege:
 *     { par_competence, par_pole, global, ipsatif } }
 * @param {object} narrativeTexts narratifs LLM (markdown, injectés tels quels) :
 *   { competences: { '1.01': md, … }, poles: { 1: md, …  (clés nombre ou chaîne) },
 *     kairos: md }
 * @param {object} [meta] provenance : { journalId, sourceProtocole, generatedAt }
 *   (generatedAt par défaut = agrege.date_construction)
 * @returns {object} document conforme à cartographie-merge.schema.json
 */
export function buildMergeDocument(agrege, narrativeTexts, meta = {}) {
  const { par_competence, par_pole, global: globalAgg, ipsatif } = agrege.agrege
  const periode = agrege.periode
  const journalId = meta.journalId ?? null
  const sourceProtocole = meta.sourceProtocole ?? null
  const generatedAt = meta.generatedAt ?? agrege.date_construction ?? null

  const rendered = Object.values(par_competence).filter(isRendered)
  const niveaux = computeNiveaux(rendered)
  const poleMedians = new Map()
  for (const p of new Set(rendered.map((c) => c.pole))) {
    const nbes = rendered.filter((c) => c.pole === p).map((c) => c.nb_feuilles_etablies)
    poleMedians.set(p, median(nbes))
  }

  const domains = Object.keys(par_pole)
    .map(Number)
    .sort((a, b) => a - b)
    .map((num) => {
      const pole = par_pole[String(num)]
      const comps = rendered
        .filter((c) => c.pole === num)
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((c) => {
          const niveau = niveaux.get(c.code)
          const archetype = computeArchetype(c, niveau, poleMedians.get(num))
          return {
            id: `${c.code} — ${c.nom}`,
            code: c.code,
            points: c.nb_feuilles_etablies,
            niveau,
            statut: c.statut_final,
            description: c.nom,
            feedback: buildFeedbackHtml(c, requireNarrative(narrativeTexts.competences, c.code, 'compétence')),
            archetype,
            archetype_titre: ARCHETYPES[archetype].titre,
            archetype_description: ARCHETYPES[archetype].description,
            parFeuille: c.presence_par_feuille
              .filter((e) => !e.court_circuit)
              .map((e) => ({
                date: e.date,
                statut: e.statut,
                preuves: e.preuves,
                indices: e.indices,
                confiance: e.confiance,
                score: e.score,
              })),
            nb_feuilles_etablies: c.nb_feuilles_etablies,
            nb_feuilles_renvois: c.nb_feuilles_renvois,
            score_cumule: c.score,
            score_moyen_par_feuille: c.score_moyen_par_feuille,
            cumul_preuves: c.cumul_preuves,
            cumul_indices: c.cumul_indices,
            confiance_moyenne: c.confiance_moyenne,
          }
        })
      const { tendance, stats } = computeTendance(pole.evolution_par_feuille)
      return {
        id: pole.pole_nom,
        color: POLE_COLORS[num],
        competences: comps,
        parFeuille: pole.evolution_par_feuille.map((e) => ({ ...e })),
        tendance_temporelle: tendance,
        tendance_titre: TENDANCES[tendance].titre,
        tendance_description: TENDANCES[tendance].description,
        tendance_stats: stats,
        rapport_html: buildPoleRapportHtml(pole, requireNarrative(narrativeTexts.poles, num, 'pôle')),
      }
    })

  const kairosHtml = buildKairosHtml(periode, ipsatif.evolution_globale, narrativeTexts.kairos ?? '')

  const profilMeta = {
    journal_id: journalId,
    date_construction: agrege.date_construction ?? null,
    premiere_date: periode.premiere,
    derniere_date: periode.derniere,
    nb_feuilles: periode.nb_feuilles,
    feuilles_chronologiques: [...periode.feuilles_chronologiques],
    competences_etablies: ipsatif.statistiques.competences_etablies,
    competences_renvoyees: ipsatif.statistiques.competences_renvoyees,
    competences_orphelines: globalAgg.emergences_cumulees.competences_orphelines.length,
    score_total: ipsatif.statistiques.score_total,
    indice_herfindahl: ipsatif.indice_herfindahl_global,
    evolution_globale: ipsatif.evolution_globale.map((e) => ({ ...e })),
    source_protocole: sourceProtocole,
  }

  const feuilles = periode.feuilles_chronologiques.map((date, i) => ({
    date,
    iso: date,
    label: frDate(date),
    ordre: i,
    carto_day_url: `feuilles/${date}/carto-day.html`,
  }))

  return {
    schemaVersion: '1.0.0',
    kind: 'cartographie-merge',
    generatedAt,
    source: { protocole: sourceProtocole, journalId },
    periode: {
      premiere: periode.premiere,
      derniere: periode.derniere,
      nbFeuilles: periode.nb_feuilles,
    },
    domains,
    profilMeta,
    profilIpsatif: structuredClone(ipsatif.par_pole),
    feuilles,
    narratifs: { kairosHtml, rapportHtml: kairosHtml },
    reserved: {
      connexionsData: [],
      noeudsConceptuels: [],
      patternTemporel: { pattern: '', description: '' },
      piecesData: {},
    },
  }
}

function requireNarrative(map, key, kind) {
  const v = map?.[key] ?? map?.[String(key)]
  if (typeof v !== 'string') {
    throw new Error(`buildMergeDocument: narratif manquant pour ${kind} ${key}`)
  }
  return v
}
