// Port de aurora/heatmap.py — ancrage des tags + agrégation en heat map
// (0 LLM). Parité bit-à-bit avec CPython (spec-journee.md §3).
//
// Ancrage : chaque extrait cité est localisé dans le texte source (exact →
// espaces normalisés → approché). Non localisable = rejeté + compté.
// Agrégation : chaque caractère accumule poids_modèle × confiance ; la heat
// est normalisée par le poids total du roster. Découpage en segments.
//
// Différences assumées avec heatmap.py :
//   - pas de fs : ecrire_sorties / ecrire_viewer écrivent via ctx.artefacts
//     (store injectable, voir artefacts.js) ; la copie de viewer/heatmap.html
//     se fait depuis ctx.viewer_html (contenu fourni par l'hôte) ;
//   - itération du set `actifs` de segments() : reproduite à l'identique via
//     PyIntSet (émulation de la table de hachage CPython — spec §7.3) : dès
//     que les indices dépassent la taille de table ou après des discard,
//     l'ordre des slots n'est PAS croissant, et il pilote l'ordre de
//     sommation flottante de heat/conf_moyenne (arrondis au 4ᵉ/3ᵉ décimal).
// Tous les index (start/end) et longueurs sont en POINTS DE CODE.

import { findVerbatim, logOk } from "./util.js";
import { pjoin } from "./artefacts.js";
import { PyFloat, codePointCompare, pyJsonDumps } from "./py/pyJson.js";
import { asNum, dictGet, entriesOf, pyFloatOf } from "./py/pyDict.js";
import { pyRound } from "./py/pyRound.js";
import { PyIntSet } from "./py/pySet.js";
import { pySum } from "./py/pySum.js";
import { pyFormat } from "./py/pyStr.js";
import { cpSlice, universalNewlines } from "./py/pyText.js";

/**
 * ancrer(raw, tags_par_modele, roster) → [spans, rejets].
 * span = {start, end, model, code, conf, poids, justification, ratio, tronque}.
 * @param {string} raw
 * @param {Map<string, object[]>|Record<string, object[]>} tagsParModele —
 *   itéré dans l'ordre d'insertion (dict Python) : utiliser une Map si un nom
 *   de lecteur peut être purement numérique.
 * @param {{name: string, weight?: unknown}[]} roster
 * @returns {[object[], object[]]}
 */
export function ancrer(raw, tagsParModele, roster) {
  /** @type {Map<string, number>} */
  const poids = new Map();
  for (const m of roster) poids.set(m.name, pyFloatOf(dictGet(m, "weight", new PyFloat(1))));
  /** @type {object[]} */
  const spans = [];
  /** @type {object[]} */
  const rejets = [];
  for (const [name, tags] of entriesOf(tagsParModele)) {
    for (const t of /** @type {object[]} */ (tags)) {
      const loc = findVerbatim(raw, t.extrait);
      if (loc === null) {
        rejets.push({
          model: name,
          competence: t.competence,
          extrait: cpSlice(t.extrait, 0, 200),
          motif: "non ancré (citation introuvable)",
        });
        continue;
      }
      const [s, e0, ratio] = loc;
      const tronque = e0 - s > 1200; // tag-paragraphe paresseux : tronqué et marqué,
      const e = tronque ? s + 1200 : e0; // mais PAS compté en rejet
      spans.push({
        start: s,
        end: e,
        model: name,
        code: t.competence,
        conf: t.confiance,
        poids: new PyFloat(poids.has(name) ? /** @type {number} */ (poids.get(name)) : 1.0),
        justification: dictGet(t, "justification", ""),
        ratio: new PyFloat(pyRound(ratio, 3)),
        tronque,
      });
    }
  }
  let nTronques = 0;
  for (const sp of spans) if (sp.tronque) nTronques++;
  logOk(
    pyFormat("Ancrage : %d spans ancrés (%d tronqués), %d tags rejetés", spans.length, nTronques, rejets.length),
  );
  return [spans, rejets];
}

/**
 * Balayage par événements : découpe le texte en segments à couverture
 * homogène. Seuls les segments couverts sont émis.
 * @param {string} _raw @param {object[]} spans @param {number} poidsTotal
 * @returns {object[]}
 */
export function segments(_raw, spans, poidsTotal) {
  /** @type {Map<number, [number, number][]>} */
  const events = new Map();
  spans.forEach((sp, i) => {
    if (!events.has(sp.start)) events.set(sp.start, []);
    /** @type {[number, number][]} */ (events.get(sp.start)).push([1, i]);
    if (!events.has(sp.end)) events.set(sp.end, []);
    /** @type {[number, number][]} */ (events.get(sp.end)).push([-1, i]);
  });
  const points = Array.from(events.keys()).sort((a, b) => a - b);
  const actifs = new PyIntSet(); // ordre d'itération CPython (spec §7.3)
  /** @type {object[]} */
  const segs = [];
  for (let j = 0; j < points.length; j++) {
    const pt = points[j];
    for (const [op, i] of /** @type {[number, number][]} */ (events.get(pt))) {
      if (op > 0) actifs.add(i);
      else actifs.discard(i);
    }
    const nxt = j + 1 < points.length ? points[j + 1] : null;
    if (nxt === null || nxt === pt) continue;
    if (!actifs.size) continue;
    const cover = actifs.values().map((i) => spans[i]);
    /** @type {Map<string, number>} */
    const parModele = new Map(); // poids par modèle : max(conf), pas de cumul intra-modèle
    for (const c of cover) {
      const w = asNum(c.poids) * asNum(c.conf);
      const prev = parModele.has(c.model) ? /** @type {number} */ (parModele.get(c.model)) : 0.0;
      parModele.set(c.model, Math.max(prev, w));
    }
    // sum() CPython ≥ 3.12 : sommation compensée (pySum), pas d'additions naïves
    const heat = pySum(parModele.values()) / (poidsTotal || 1.0);
    const confSum = pySum(cover.map((c) => asNum(c.conf)));
    const details = cover
      .slice()
      .sort((a, b) => codePointCompare(a.model, b.model) || codePointCompare(a.code, b.code))
      .map((c) => ({ model: c.model, code: c.code, conf: c.conf }));
    segs.push({
      start: pt,
      end: nxt,
      heat: new PyFloat(pyRound(Math.min(1.0, heat), 4)),
      models: sortedUnique(cover.map((c) => c.model)),
      comps: sortedUnique(cover.map((c) => c.code)),
      conf_moyenne: new PyFloat(pyRound(confSum / cover.length, 3)),
      details,
    });
  }
  return segs;
}

/** sorted(set(...)) Python sur des chaînes. @param {string[]} items */
function sortedUnique(items) {
  return Array.from(new Set(items)).sort(codePointCompare);
}

/**
 * marks = [(start, end, attrs_str)] non chevauchants → texte annoté.
 * Tri lexicographique du TRIPLET complet ; un mark dont start < pos courant
 * est sauté (chevauchement résiduel).
 * @param {string} raw @param {[number, number, string][]} marks
 * @returns {string}
 */
export function insererMarks(raw, marks) {
  const sorted = marks
    .slice()
    .sort((a, b) => a[0] - b[0] || a[1] - b[1] || codePointCompare(a[2], b[2]));
  /** @type {string[]} */
  const out = [];
  let pos = 0;
  for (const [s, e, attrs] of sorted) {
    if (s < pos) continue;
    out.push(htmlEscapeMin(cpSlice(raw, pos, s)));
    out.push(pyFormat("<mark %s>%s</mark>", attrs, htmlEscapeMin(cpSlice(raw, s, e))));
    pos = e;
  }
  out.push(htmlEscapeMin(cpSlice(raw, pos)));
  return out.join("");
}

/** Identité : markdown, le texte est laissé tel quel. @param {string} s */
export function htmlEscapeMin(s) {
  return s;
}

/**
 * Fusionne les spans chevauchants d'un même modèle
 * → [[start, end, Set(codes), conf_max]].
 * @param {object[]} spansModele @returns {[number, number, Set<string>, number][]}
 */
export function fusionSpansModele(spansModele) {
  if (!spansModele.length) return [];
  const ss = spansModele.slice().sort((a, b) => a.start - b.start || b.end - a.end);
  /** @type {[number, number, Set<string>, number][]} */
  const out = [[ss[0].start, ss[0].end, new Set([ss[0].code]), asNum(ss[0].conf)]];
  for (const sp of ss.slice(1)) {
    const last = out[out.length - 1];
    if (sp.start < last[1]) {
      last[1] = Math.max(last[1], sp.end);
      last[2].add(sp.code);
      last[3] = Math.max(last[3], asNum(sp.conf));
    } else {
      out.push([sp.start, sp.end, new Set([sp.code]), asNum(sp.conf)]);
    }
  }
  return out;
}

/**
 * Copies annotées par modèle + portfolio.heat.md + heatmap.json, écrits via
 * ctx.artefacts sous ctx.base_dir. Utilise ctx.journal_id et ctx.date.
 * → rollup par compétence.
 * @param {{base_dir: string, journal_id: unknown, date: unknown,
 *   artefacts: ReturnType<import("./artefacts.js").memArtefacts>}} ctx
 * @param {string} raw @param {object[]} spans @param {object[]} segs
 * @param {object[]} rejets @param {{name: string}[]} roster
 * @returns {Map<string, object>}
 */
export function ecrireSorties(ctx, raw, spans, segs, rejets, roster) {
  const base = ctx.base_dir;
  // 1. copies annotées par modèle (l'artefact stigmergique individuel)
  for (const m of roster) {
    const name = m.name;
    const fus = fusionSpansModele(spans.filter((sp) => sp.model === name));
    /** @type {[number, number, string][]} */
    const marks = fus.map(([s, e, codes, conf]) => [
      s,
      e,
      pyFormat(
        'data-model="%s" data-comps="%s" data-conf="%.2f"',
        name,
        Array.from(codes).sort(codePointCompare).join(","),
        conf,
      ),
    ]);
    ctx.artefacts.writeText(pjoin(base, "tagged", pyFormat("%s.md", name)), insererMarks(raw, marks));
  }
  // 2. portfolio fusionné avec chaleur
  /** @type {[number, number, string][]} */
  const marksSegs = segs.map((g) => [
    g.start,
    g.end,
    pyFormat(
      'data-heat="%.2f" data-models="%s" data-comps="%s"',
      asNum(g.heat),
      g.models.join(","),
      g.comps.join(","),
    ),
  ]);
  ctx.artefacts.writeText(pjoin(base, "portfolio.heat.md"), insererMarks(raw, marksSegs));
  // 3. heatmap.json — rollup par code (ordre de première apparition)
  /** @type {Map<string, {modeles: Map<string, number>, n_spans: number, max_heat: PyFloat}>} */
  const rollup = new Map();
  for (const sp of spans) {
    if (!rollup.has(sp.code)) {
      rollup.set(sp.code, { modeles: new Map(), n_spans: 0, max_heat: new PyFloat(0) });
    }
    const r = /** @type {{modeles: Map<string, number>, n_spans: number, max_heat: PyFloat}} */ (
      rollup.get(sp.code)
    );
    r.modeles.set(sp.model, (r.modeles.get(sp.model) || 0) + 1);
    r.n_spans += 1;
  }
  for (const g of segs) {
    for (const code of g.comps) {
      const r = rollup.get(code);
      if (r) r.max_heat = new PyFloat(Math.max(r.max_heat.value, asNum(g.heat)));
    }
  }
  ctx.artefacts.writeJson(pjoin(base, "heatmap.json"), {
    journal_id: ctx.journal_id,
    date: ctx.date,
    roster: roster.map((m) => m.name),
    segments: segs,
    par_competence: rollup,
    rejets,
  });
  logOk(pyFormat("portfolio.heat.md + tagged/{%d modèles}.md + heatmap.json", roster.length));
  return rollup;
}

/**
 * heatmap-data.js pour le visualiseur autonome (+ copie de heatmap.html si
 * ctx.viewer_html est fourni — l'hôte lit le fichier, pas ce module).
 * @param {{base_dir: string, journal_id: unknown, date: unknown,
 *   viewer_html?: string|null,
 *   artefacts: ReturnType<import("./artefacts.js").memArtefacts>}} ctx
 * @param {string} raw @param {object[]} segs @param {{name: string}[]} roster
 * @param {unknown} competencesNoms @param {unknown} consensus
 */
export function ecrireViewer(ctx, raw, segs, roster, competencesNoms, consensus) {
  const data = {
    journal_id: ctx.journal_id,
    date: ctx.date,
    texte: raw,
    segments: segs,
    roster: roster.map((m) => m.name),
    competences: competencesNoms,
    consensus,
  };
  const vdir = pjoin(ctx.base_dir, "viewer");
  ctx.artefacts.writeText(
    pjoin(vdir, "heatmap-data.js"),
    pyFormat("window.HEATMAP_DATA = %s;\n", pyJsonDumps(data)),
  );
  if (ctx.viewer_html !== undefined && ctx.viewer_html !== null) {
    ctx.artefacts.writeText(pjoin(vdir, "heatmap.html"), universalNewlines(ctx.viewer_html));
  }
  logOk("viewer/heatmap.html + heatmap-data.js");
}
