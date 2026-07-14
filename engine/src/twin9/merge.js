// Port de aurora/merge3.py — Merge_v3 : fusion des cartographies journalières
// en carte évolutive ADDITIVE. Parité bit-à-bit avec le Python en mode mock
// (spec-merge-scan.md = contrat, merge3.py = source de vérité).
//
//   1. FUSION MÉCANIQUE : statut temporel, trajectoire, heat_timeline, cumuls
//   2. SECOND RESSORT   : faisceaux d'indices, chose jugée par empreinte
//   3. PROFIL IPSATIF   : répartition des 100 % (arrondi intermédiaire !)
//   4. RELECTURES       : kairos, 7 pôles, ≤ 12 histoires, rapporteur
//   5. GARDIEN          : formulations interdites + alertes de pôle
//   6. SORTIES          : carto_evolutive.json, rapport(s) md, viewer data
//
// Différences assumées avec merge3.py (mêmes conventions que journee.js) :
//   - pas de fs : les artefacts passent par ctx.artefacts (store injectable),
//     les gabarits confidentiels par ctx.protocole(relPath) (défaut "") ;
//   - la copie du visualiseur HTML lit ctx.viewer_html (chaîne fournie par
//     l'hôte) au lieu de ctx.impl_dir ;
//   - ecrireSorties RETOURNE en plus les structures ({cartoEvolutive,
//     profilIpsatif, rapportMd, rapportEvolutifMd, viewerDataJs, statuts}) —
//     le Python ne retournait que carto_evo, le reste partait sur disque ;
//   - les dicts à clés potentiellement numériques (competences, statuts,
//     poles/histoires des relectures) sont des Map (ordre d'insertion
//     contractuel) ; ctx.textes_journees est une Map ;
//   - les floats Python entiers (0.0, 1.0) transitent en PyFloat.
// Tous les index et longueurs sont en POINTS DE CODE.

import { infosPersonas, jugerFaisceau } from "./tribunal.js";
import { resolveContent } from "./templates.js";
import { empreinte, extractJson, log, logOk, logWarn } from "./util.js";
import { pjoin } from "./artefacts.js";
import { asNum, dictGet, entriesOf, pyIntOf, pyTruthy } from "./py/pyDict.js";
import { PyFloat, codePointCompare, pyJsonDumps } from "./py/pyJson.js";
import { pyDeepEqual } from "./py/pyEq.js";
import { pyRound } from "./py/pyRound.js";
import { pyFormat, pyStr } from "./py/pyStr.js";
import { pySum } from "./py/pySum.js";
import { PY_WS_CLASS, cpSlice, universalNewlines, pyStrip } from "./py/pyText.js";

export const STATUT_FAISCEAU = "établie par faisceau (second ressort)";

const W = PY_WS_CLASS;

/** str(e) tolérant (Error → message, sinon String). @param {unknown} e */
function strErr(e) {
  return e && /** @type {{message?: string}} */ (e).message !== undefined
    ? /** @type {{message: string}} */ (e).message
    : String(e);
}

/** incidents[k] = incidents.get(k, 0) + n — objet simple ou Map. */
function incr(incidents, k, n = 1) {
  if (incidents instanceof Map) {
    incidents.set(k, (incidents.get(k) || 0) + n);
  } else {
    incidents[k] = (incidents[k] || 0) + n;
  }
}

/** Gabarit par chemin relatif au protocole (mock : contenu facultatif). */
function gabaritDe(ctx, rel) {
  const content = ctx.protocole ? ctx.protocole(rel) : "";
  return content === null || content === undefined ? "" : content;
}

/** ctx["poles"] : liste de Pole (P1..P7) — tolère une Map {num: Pole}. */
function polesDe(ctx) {
  return ctx.poles instanceof Map ? Array.from(ctx.poles.values()) : ctx.poles;
}

/** dict Python générique (objet simple ou Map) : écriture d[k] = v. */
function dsSet(d, k, v) {
  if (d instanceof Map) d.set(k, v);
  else d[k] = v;
}

/** isinstance(x, dict) sur un résultat extractJson / une structure hôte. */
function isDict(v) {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    !(v instanceof PyFloat)
  );
}

/** isinstance(x, int) Python : bool inclus, floats (PyFloat/non entier) exclus. */
function isPyInt(v) {
  return v === true || v === false || (typeof v === "number" && Number.isInteger(v));
}

/** isinstance(x, (int, float)) Python : nombres, bools et PyFloat. */
function isPyNum(v) {
  return typeof v === "number" || typeof v === "boolean" || v instanceof PyFloat;
}

/** Valeur numérique (bool → 0/1, PyFloat → value). */
function toNum(v) {
  if (v === true) return 1;
  if (v === false) return 0;
  return asNum(/** @type {number|PyFloat} */ (v));
}

/** `x or y` Python. @param {unknown} v @param {unknown} dflt */
function orElse(v, dflt) {
  return pyTruthy(v) ? v : dflt;
}

/** [c.get("date") or c["journee"] for c in cartos]. @param {object[]} cartos */
function datesDe(cartos) {
  return cartos.map((c) => orElse(dictGet(c, "date", null), dictGet(c, "journee", null)));
}

// ── Statut temporel (règle de persistance DECISIONS-v3 §6) ───────────────────
/**
 * @param {number} nEtablies @param {number} nRenvois @returns {string}
 */
export function statutTemporel(nEtablies, nRenvois) {
  if (nEtablies >= 2) return "présence consolidée";
  if (nEtablies === 1) return "présence établie (à confirmer)";
  if (nRenvois >= 1) return "renvoi au cartographe";
  return "présence non établie";
}

// ── Trajectoire développementale (orthogonale au statut) ────────────────────
/**
 * @param {number[]} joursEtablie — index de jour des attestations (croissants).
 * @param {number[]} joursSignal — index distincts triés.
 * @param {number} nJours @returns {string}
 */
export function trajectoire(joursEtablie, joursSignal, nJours) {
  const tiers = Math.max(1, Math.floor((nJours + 2) / 3));
  const inDernier = (j) => j >= nJours - tiers && j < nJours;
  if (!joursEtablie.length) {
    if (joursSignal.length >= 2) return "frontière persistante";
    if (joursSignal.length) return "signal isolé";
    return "stable absente";
  }
  if (joursEtablie.length === 1) {
    return inDernier(joursEtablie[0]) ? "émergence récente" : "apparition isolée";
  }
  if (!joursEtablie.some(inDernier)) {
    return "en sommeil"; // l'attestation reste ; c'est la trace qui vieillit, pas la compétence
  }
  const ecarts = joursEtablie.slice(1).map((b, k) => b - joursEtablie[k]);
  if (Math.max(...ecarts) > tiers) return "intermittence";
  return "consolidation";
}

// ── Fusion mécanique ──────────────────────────────────────────────────────────
/**
 * cartos : cartographies journalières en ordre chronologique.
 * @param {object} ctx @param {object[]} cartos
 * @returns {Map<string, object>} — 61 entrées, ordre poles→competences.
 */
export function fusionner(ctx, cartos) {
  const nJours = cartos.length;
  /** @type {Map<string, object>} */
  const competences = new Map();
  /** @type {Map<string, object[]>} */
  const grainesParCode = new Map();
  for (const pole of polesDe(ctx)) {
    for (const comp of pole.competences) {
      const code = comp.code;
      if (!grainesParCode.has(code)) grainesParCode.set(code, []);
      const graines = /** @type {object[]} */ (grainesParCode.get(code));
      /** @type {object[]} */
      const attestations = [];
      /** @type {object[]} */
      const signaux = [];
      /** @type {PyFloat[]} */
      const heatTl = [];
      cartos.forEach((cj, i) => {
        const vRaw = dictGet(cj.verdicts, code, null);
        const v = /** @type {object} */ (orElse(vRaw, {}));
        let heat = 0.0;
        for (const g of /** @type {object[]} */ (dictGet(cj, "segments", []))) {
          if (/** @type {string[]} */ (dictGet(g, "comps", [])).includes(code)) {
            heat = Math.max(heat, toNum(dictGet(g, "heat", 0.0)));
          }
        }
        heatTl.push(new PyFloat(pyRound(heat, 3)));
        if (dictGet(v, "statut", null) === "présence établie") {
          attestations.push({
            jour_index: i,
            journee: dictGet(cj, "journee", null),
            date: dictGet(cj, "date", null),
            etage: dictGet(v, "etage", null),
            confiance: dictGet(v, "confiance", null),
            score_preuves: dictGet(v, "score_preuves", null),
            score_indices: dictGet(v, "score_indices", null),
            citations: /** @type {object[]} */ (orElse(dictGet(v, "traces_probantes", null), []))
              .slice(0, 3)
              .map((t) => cpSlice(/** @type {string} */ (dictGet(t, "extrait", "")), 0, 300)),
          });
        } else if (dictGet(v, "statut", null) === "renvoi au cartographe") {
          signaux.push({ jour_index: i, journee: dictGet(cj, "journee", null), type: "renvoi" });
        } else if (dictGet(v, "etage", null) === "minoritaire") {
          signaux.push({ jour_index: i, journee: dictGet(cj, "journee", null), type: "minoritaire" });
        } else if (
          dictGet(v, "statut", null) === "présence non établie" &&
          ["tribunal", "leger"].includes(pyStr(dictGet(v, "etage", "")).split("-")[0])
        ) {
          // « examinée et non retenue » (juge léger ou tribunal) n'est pas
          // « jamais évoquée » : le merge voit la différence
          signaux.push({ jour_index: i, journee: dictGet(cj, "journee", null), type: "instruite" });
        }
        for (const gr of /** @type {object[]} */ (dictGet(cj, "graines", []))) {
          if (dictGet(gr, "code", null) === code && !graines.some((x) => pyDeepEqual(x, gr))) {
            graines.push(gr);
          }
        }
      });
      const je = attestations.map((a) => /** @type {number} */ (a.jour_index));
      const js = Array.from(new Set(signaux.map((s) => /** @type {number} */ (s.jour_index)))).sort(
        (a, b) => a - b,
      );
      const nRenvois = signaux.filter((s) => s.type === "renvoi").length;
      let sp = 0;
      let si = 0;
      /** @type {number[]} */
      const confs = [];
      for (const a of attestations) {
        if (isPyInt(a.score_preuves)) sp += toNum(a.score_preuves);
        if (isPyInt(a.score_indices)) si += toNum(a.score_indices);
        if (isPyNum(a.confiance)) confs.push(toNum(a.confiance));
      }
      const cmoy = confs.length
        ? new PyFloat(pyRound(pySum(confs) / confs.length, 3))
        : new PyFloat(0);
      competences.set(code, {
        code,
        nom: comp.nom,
        pole: pole.num,
        statut_temporel: statutTemporel(attestations.length, nRenvois),
        trajectoire: trajectoire(je, js, nJours),
        attestations,
        signaux,
        heat_timeline: heatTl,
        cumul_preuves: sp,
        cumul_indices: si,
        confiance_moyenne: cmoy,
        score_cumule: new PyFloat(pyRound(sp + si * cmoy.value, 3)),
        graines,
        graines_recurrentes: new Set(graines.map((g) => dictGet(g, "journee", null))).size >= 2,
        faisceau: null,
      });
    }
  }
  return competences;
}

// ── Tribunal de second ressort : le juge du temps long ────────────────────────
/**
 * Instruit le FAISCEAU des compétences jamais établies mais dont les
 * suspicions reviennent sur plusieurs journées. Convocation mécanique.
 * ctx : {config, poles, base_dir, protocole?, artefacts, incidents,
 * textes_journees (Map), etat_faisceaux?, rapide?}.
 * @param {object} ctx @param {object[]} cartos
 * @param {Map<string, object>} competences @param {object} backend
 * @returns {Promise<Map<string, object>>}
 */
export async function secondRessort(ctx, cartos, competences, backend) {
  const cfg = /** @type {object} */ (dictGet(ctx.config, "merge", {}));
  /** @type {Map<string, object>} */
  const out = new Map();
  if (!pyTruthy(dictGet(cfg, "second_ressort", true))) {
    log("Merge_v3 : second ressort désactivé (config)");
    return out;
  }
  const seuilJ = pyIntOf(dictGet(cfg, "seuil_faisceau_journees", 2));
  /** @type {Map<string, [object, object]>} */
  const fiches = new Map();
  for (const p of polesDe(ctx)) {
    for (const c of p.competences) fiches.set(c.code, [p, c]);
  }
  const dates = datesDe(cartos);
  const periode = dates.length ? pyFormat("%s → %s", dates[0], dates[dates.length - 1]) : "-";
  /** @type {Map<unknown, number>} */
  const idxJour = new Map();
  cartos.forEach((cj, i) => {
    idxJour.set(dictGet(cj, "journee", null), i);
    if (pyTruthy(dictGet(cj, "date", null))) idxJour.set(dictGet(cj, "date", null), i);
  });

  /** @type {[number, string][]} */
  const candidats = [];
  for (const c of competences.values()) {
    if (!["présence non établie", "renvoi au cartographe"].includes(c.statut_temporel)) continue;
    // FAIT NOUVEAU : seules les suspicions jamais jugées déclenchent — une
    // marque déjà instruite (tribunal du jour ou faisceau) ne redéclenche
    // pas un jury lourd à elle seule
    const jours = new Set();
    for (const g of c.graines) {
      if (pyTruthy(dictGet(g, "extrait", null)) && !pyTruthy(dictGet(g, "jugee", null))) {
        jours.add(dictGet(g, "journee", null));
      }
    }
    if (jours.size >= seuilJ) candidats.push([jours.size, c.code]);
  }
  candidats.sort((a, b) => (a[0] !== b[0] ? b[0] - a[0] : codePointCompare(a[1], b[1])));

  const etatF = ctx.etat_faisceaux === undefined ? null : ctx.etat_faisceaux;
  /** @type {string[]} */
  const retenus = [];
  for (const [, code] of candidats) {
    const [pole, comp] = /** @type {[object, object]} */ (fiches.get(code));
    const c = /** @type {object} */ (competences.get(code));
    const pieces = /** @type {object[]} */ (c.graines).filter((g) =>
      pyTruthy(dictGet(g, "extrait", null)),
    );
    const triplets = pieces.map((g) => [
      dictGet(g, "journee", null),
      dictGet(g, "extrait", null),
      pyTruthy(dictGet(g, "jugee", null)),
    ]);
    // tri Python de triplets (str, str, bool) : False < True
    triplets.sort((a, b) => {
      for (let i = 0; i < 3; i++) {
        const x = a[i];
        const y = b[i];
        if (typeof x === "string" && typeof y === "string") {
          const d = codePointCompare(x, y);
          if (d !== 0) return d;
        } else {
          const nx = x === true ? 1 : x === false ? 0 : /** @type {number} */ (x);
          const ny = y === true ? 1 : y === false ? 0 : /** @type {number} */ (y);
          if (nx !== ny) return nx < ny ? -1 : 1;
        }
      }
      return 0;
    });
    const fpDossier = empreinte(triplets);
    // AUTORITÉ DE LA CHOSE JUGÉE : un dossier identique n'est pas réinstruit —
    // le verdict antérieur est repris (gratuit) ; tout fait nouveau change
    // l'empreinte. AUCUN PLAFOND : tout candidat est instruit — seul le
    // premier passage paie l'arriéré, la chose jugée fait l'économie ensuite.
    const ancien = dictGet(/** @type {object} */ (orElse(etatF, {})), code, null);
    let verdict;
    if (
      pyTruthy(ancien) &&
      dictGet(/** @type {object} */ (ancien), "empreinte", null) === fpDossier &&
      pyTruthy(dictGet(/** @type {object} */ (ancien), "verdict", null))
    ) {
      verdict = /** @type {object} */ (dictGet(/** @type {object} */ (ancien), "verdict", null));
      log(
        pyFormat(
          "Second ressort %s : chose jugée (dossier inchangé) — verdict repris sans nouvelle instruction",
          code,
        ),
      );
    } else {
      const tdir = pjoin(ctx.base_dir, "second_ressort", code);
      verdict = await jugerFaisceau(
        backend,
        ctx,
        tdir,
        pole,
        comp,
        c.graines,
        periode,
        ctx.config,
        ctx.incidents,
        ctx.textes_journees,
        { rapide: ctx.rapide === undefined ? null : ctx.rapide },
      );
      if (dictGet(verdict, "statut", null) === "présence non établie") {
        const marque = pyFormat("second ressort (%s) : faisceau non retenu", periode);
        for (const g of c.graines) {
          if (pyTruthy(dictGet(g, "extrait", null)) && !pyTruthy(dictGet(g, "jugee", null))) {
            // MUTATION PARTAGÉE : le même dict vit dans etat_scan — la marque
            // survit d'un run à l'autre
            dsSet(g, "jugee", marque);
          }
        }
      }
      if (etatF !== null) dsSet(etatF, code, { empreinte: fpDossier, verdict });
    }
    retenus.push(code);
    out.set(code, verdict);
    c.faisceau = {
      statut: verdict.statut,
      confiance: verdict.confiance,
      motif: dictGet(verdict, "motif_regle", null),
      prescription: dictGet(verdict, "prescription", null),
      traces: orElse(dictGet(verdict, "traces_probantes", null), []),
      jury: dictGet(verdict, "jury", null),
      gardien: dictGet(verdict, "gardien", null),
      dossier_cartographe: dictGet(verdict, "dossier_cartographe", null),
      deliberation: dictGet(verdict, "deliberation", null),
    };
    if (verdict.statut === "présence établie") {
      c.statut_temporel = STATUT_FAISCEAU;
      /** @type {Map<string, string[]>} */
      const parJour = new Map();
      for (const t of /** @type {object[]} */ (orElse(dictGet(verdict, "traces_probantes", null), []))) {
        const d = /** @type {string} */ (orElse(dictGet(t, "date", null), "-"));
        if (!parJour.has(d)) parJour.set(d, []);
        /** @type {string[]} */ (parJour.get(d)).push(
          cpSlice(/** @type {string} */ (dictGet(t, "extrait", "")), 0, 300),
        );
      }
      for (const [d, cits] of Array.from(parJour.entries()).sort((a, b) =>
        codePointCompare(a[0], b[0]),
      )) {
        c.attestations.push({
          jour_index: idxJour.has(d) ? idxJour.get(d) : 0,
          journee: d,
          date: d,
          etage: "faisceau",
          confiance: verdict.confiance,
          score_preuves: 0,
          score_indices: cits.length,
          citations: cits.slice(0, 3),
        });
      }
    } else if (verdict.statut === "renvoi au cartographe") {
      c.statut_temporel = "renvoi au cartographe";
      c.signaux.push({ jour_index: null, journee: "second-ressort", type: "faisceau-renvoi" });
    }
  }
  if (retenus.length) {
    const compte = (st) => retenus.filter((code) => /** @type {object} */ (out.get(code)).statut === st).length;
    logOk(
      pyFormat(
        "Second ressort : %d faisceaux instruits — %d établis, %d renvois, %d non établis",
        retenus.length,
        compte("présence établie"),
        compte("renvoi au cartographe"),
        compte("présence non établie"),
      ),
    );
  }
  return out;
}

// ── Profil ipsatif (Phase 40 du v4 — calcul algorithmique, 0 LLM) ─────────────
const POLES_IPSATIF = { 1: "TETE", 2: "COEUR", 3: "MAIN", 4: "AME", 5: "RACINES", 6: "CITE", 7: "FLAMBEAU" };

/**
 * Le score total de chaque individu vaut conventionnellement 100 % ; ce qui
 * varie, c'est la répartition. score = preuves + indices × confiance (formule
 * v4 — c'est le score_cumule de la fusion). Hors profil : les absentes (pas des
 * zéros) et les renvois (en attente).
 * ⚠ accumulation AVEC arrondi intermédiaire (ordre d'addition contractuel).
 * @param {Map<string, object>} competences @returns {object}
 */
export function profilIpsatif(competences) {
  const etablies = Array.from(competences.values()).filter(
    (c) =>
      ["présence consolidée", "présence établie (à confirmer)", STATUT_FAISCEAU].includes(
        c.statut_temporel,
      ) && asNum(c.score_cumule) > 0,
  );
  const total = pySum(etablies.map((c) => asNum(c.score_cumule)));
  /** @type {Record<string, {proportion: PyFloat, competences: object[]}>} */
  const parPole = {};
  for (const nom of Object.values(POLES_IPSATIF)) {
    parPole[nom] = { proportion: new PyFloat(0), competences: [] };
  }
  /** @type {[object, PyFloat][]} */
  const lignes = [];
  const tri = etablies
    .slice()
    .sort((a, b) =>
      asNum(a.score_cumule) !== asNum(b.score_cumule)
        ? asNum(b.score_cumule) - asNum(a.score_cumule)
        : codePointCompare(a.code, b.code),
    );
  for (const c of tri) {
    const prop = pyTruthy(total)
      ? new PyFloat(pyRound((100.0 * asNum(c.score_cumule)) / total, 1))
      : new PyFloat(0);
    lignes.push([c, prop]);
    const pp = parPole[POLES_IPSATIF[c.pole]];
    pp.competences.push({
      code: c.code,
      nom: c.nom,
      proportion: prop,
      score_preuves: c.cumul_preuves,
      score_indices: c.cumul_indices,
      score: c.score_cumule,
    });
    pp.proportion = new PyFloat(pyRound(pp.proportion.value + prop.value, 1));
  }
  const top5 = lignes.slice(0, 5);
  return {
    competences_etablies: pyFormat("%d / %d", etablies.length, competences.size),
    competences_renvoyees: Array.from(competences.values()).filter(
      (c) => c.statut_temporel === "renvoi au cartographe",
    ).length,
    par_pole: parPole,
    concentration: {
      top_5_competences: top5.map(([c, p]) => ({ code: c.code, nom: c.nom, proportion: p })),
      // sum([]) Python = 0 (int) ; sinon float
      part_du_top_5: top5.length
        ? new PyFloat(pyRound(pySum(top5.map(([, p]) => p.value)), 1))
        : 0,
    },
  };
}

// ── Relectures génératives orchestrées (résilientes) ─────────────────────────
/** @param {object} cj @returns {string} */
export function resumeJour(cj) {
  const etablies = /** @type {string[]} */ (dictGet(cj, "etablies", null));
  const et = orElse(etablies.join(", "), "aucune");
  /** @type {string[]} */
  const citations = [];
  for (const code of etablies.slice(0, 4)) {
    const v = /** @type {object} */ (dictGet(cj.verdicts, code, null));
    const traces = /** @type {object[]} */ (orElse(dictGet(v, "traces_probantes", null), [{}]));
    const tr = traces[0];
    citations.push(pyFormat("%s : « %s »", code, cpSlice(/** @type {string} */ (dictGet(tr, "extrait", "")), 0, 160)));
  }
  const auth = dictGet(cj, "authenticite", null);
  return pyFormat(
    "### %s (%s)%s\nÉtablies : %s\n%s",
    dictGet(cj, "journee", null),
    orElse(dictGet(cj, "date", null), "sans date"),
    pyTruthy(auth) ? pyFormat(" — écriture perçue : %s", auth) : "",
    et,
    citations.join("\n"),
  );
}

/**
 * Le registre des signaux ténus, pour le kairos : ce que la grille n'a pas
 * retenu mais qui revient — c'est là que se loge le plus singulier.
 * @param {Map<string, object>} competences @param {number} [maxLignes=15]
 * @returns {string}
 */
export function registreTenu(competences, maxLignes = 15) {
  /** @type {string[]} */
  const lignes = [];
  const nbJours = (c) => new Set(c.graines.map((g) => dictGet(g, "journee", null))).size;
  const avec = Array.from(competences.values())
    .filter((c) => pyTruthy(c.graines))
    .sort((a, b) => nbJours(b) - nbJours(a)); // tri STABLE, clé unique
  for (const c of avec.slice(0, maxLignes)) {
    const jours = Array.from(new Set(c.graines.map((g) => /** @type {string} */ (dictGet(g, "journee", null))))).sort(
      codePointCompare,
    );
    const g0 = c.graines.find((g) => pyTruthy(dictGet(g, "extrait", null))) || c.graines[0];
    const jugees = c.graines.filter((g) => pyTruthy(dictGet(g, "jugee", null))).length;
    const sources = Array.from(new Set(c.graines.map((g) => /** @type {string} */ (dictGet(g, "source", null))))).sort(
      codePointCompare,
    );
    lignes.push(
      pyFormat(
        "- %s — %s : %d signal(aux) sur %d journée(s) [%s]%s — sources : %s%s",
        c.code,
        c.nom,
        c.graines.length,
        jours.length,
        jours.join(", "),
        jugees ? pyFormat(" — dont %d déjà instruit(s) et non retenu(s)", jugees) : "",
        sources.join(", "),
        pyTruthy(dictGet(g0, "extrait", null))
          ? pyFormat(" — « %s »", cpSlice(/** @type {string} */ (dictGet(g0, "extrait", null)), 0, 120))
          : "",
      ),
    );
  }
  if (avec.length > maxLignes) {
    lignes.push(pyFormat("- (+ %d autres compétences avec signaux ténus)", avec.length - maxLignes));
  }
  return orElse(lignes.join("\n"), "(aucun signal ténu sur la période)");
}

/** Appel résilient : une relecture perdue ≠ une fusion perdue. */
async function appelRelecture(backend, prompt, task, meta, label, incidents) {
  try {
    return pyStrip(await backend.call(prompt, { task, meta, label }));
  } catch (e) {
    incr(incidents, "relecture_echec");
    logWarn(pyFormat("Relecture %s indisponible (%s)", label, strErr(e)));
    return null;
  }
}

const RE_QUESTION = new RegExp("## Question spontanée[" + W + "]*\\n(.+)");

/**
 * Relectures génératives : kairos évolutif (1), pôles (7), histoires (≤ cap),
 * rapporteur (1). → {kairos_evolutif, poles: Map, histoires: Map, kairos?,
 * rapport?} — kairos/rapport ABSENTS si relectures désactivées (comme Python).
 * @param {object} ctx @param {object[]} cartos
 * @param {Map<string, object>} competences @param {object} backend
 * @returns {Promise<object>}
 */
export async function relectures(ctx, cartos, competences, backend) {
  const cfg = /** @type {object} */ (dictGet(ctx.config, "merge", {}));
  /** @type {{kairos_evolutif: string|null, poles: Map<string, string>, histoires: Map<string, string>, kairos?: object|null, rapport?: object|null}} */
  const out = { kairos_evolutif: null, poles: new Map(), histoires: new Map() };
  if (!pyTruthy(dictGet(cfg, "relectures", true))) {
    log("Merge_v3 : relectures génératives désactivées (config)");
    return out;
  }
  const dates = datesDe(cartos);
  const base = {
    PREMIERE_DATE: dates[0],
    DERNIERE_DATE: dates[dates.length - 1],
    NB_JOURNEES: cartos.length,
    DATES_LISTE: dates.join(", "),
    JOURNAL_ID: ctx.journal_id,
  };
  /** @type {Map<string, string>} */
  const noms = new Map();
  for (const c of competences.values()) noms.set(c.code, c.nom);

  // 1. Kairos évolutif (1 appel) — palais mental JSON (v6 + v4-30)
  /** @type {string[]} */
  const donnees = [
    "### Résumés journaliers (citations retenues par la procédure)",
    cartos.map(resumeJour).join("\n\n"),
  ];
  /** @type {string[]} */
  const imps = [];
  for (const cj of cartos) {
    let q = "";
    const m = RE_QUESTION.exec(
      /** @type {string} */ (orElse(dictGet(cj, "premiere_impression", null), "")),
    );
    if (m) q = " — question du Lecteur : " + cpSlice(pyStrip(m[1]), 0, 160);
    imps.push(
      pyFormat(
        "- %s : écriture perçue « %s »%s",
        dictGet(cj, "journee", null),
        orElse(dictGet(cj, "authenticite", null), "?"),
        q,
      ),
    );
  }
  donnees.push("### Premières impressions du Lecteur (indicateurs)", imps.join("\n"));
  const st = Array.from(competences.values())
    .sort((a, b) => codePointCompare(a.code, b.code))
    .filter((c) => c.statut_temporel !== "présence non établie" || pyTruthy(c.graines))
    .map((c) => pyFormat("- %s %s — %s (%s)", c.code, c.nom, c.statut_temporel, c.trajectoire));
  donnees.push(
    "### Statuts calculés par la procédure (INTANGIBLES — tu racontes, tu ne requalifies pas)",
    st.join("\n"),
  );
  donnees.push(
    "### Registre des signaux ténus (suspicions conservées, jamais publiées)",
    registreTenu(competences),
  );
  // observations de l'Arpenteur (scan global) — présentes aussi quand elles
  // viennent d'un run antérieur (état persistant : la carte se souvient)
  const sg = /** @type {object} */ (orElse(dictGet(ctx, "scan_global", null), {}));
  if (pyTruthy(dictGet(sg, "orphelines", null)) || pyTruthy(dictGet(sg, "continuites", null))) {
    /** @type {string[]} */
    const lignes = [];
    for (const o of /** @type {object[]} */ (dictGet(sg, "orphelines", []))) {
      const ex = /** @type {object[]} */ (o.extraits_ancres)
        .slice(0, 2)
        .map((e) =>
          pyFormat(
            "« %s » (%s)",
            cpSlice(/** @type {string} */ (e.verbatim), 0, 120),
            orElse(dictGet(e, "date", null), dictGet(e, "journee", null)),
          ),
        )
        .join(" ; ");
      lignes.push(
        pyFormat(
          "- [hors référentiel] %s : %s — extraits : %s — hypothèse : %s — test : %s",
          orElse(dictGet(o, "titre", null), "?"),
          orElse(dictGet(o, "description", null), ""),
          ex,
          orElse(dictGet(o, "hypotheseFalsifiable", null), "-"),
          orElse(dictGet(o, "testEntretien", null), "-"),
        ),
      );
    }
    for (const o of /** @type {object[]} */ (dictGet(sg, "continuites", []))) {
      const extraits = /** @type {object[]} */ (o.extraits_ancres);
      const jrs = Array.from(
        new Set(extraits.map((e) => /** @type {string} */ (orElse(dictGet(e, "date", null), dictGet(e, "journee", null))))),
      ).sort(codePointCompare);
      const ex0 = extraits.length ? cpSlice(/** @type {string} */ (extraits[0].verbatim), 0, 100) : "";
      lignes.push(
        pyFormat(
          "- [continuité, %s] %s : %s — « %s »",
          jrs.join(", "),
          orElse(dictGet(o, "titre", null), "?"),
          orElse(dictGet(o, "description", null), ""),
          ex0,
        ),
      );
    }
    donnees.push(
      "### Observations du scan global (l'Arpenteur — le portfolio lu d'un seul " +
        "tenant ; pièces ancrées dans le texte brut, PISTES jamais verdicts)",
      lignes.join("\n"),
    );
  }
  const ips = profilIpsatif(competences);
  const lignesIps = entriesOf(ips.par_pole)
    .filter(([, d]) => pyTruthy(/** @type {object} */ (d).competences))
    .map(([n, d]) =>
      pyFormat(
        "- %s : %.1f %% (%d compétence(s))",
        n,
        /** @type {object} */ (d).proportion,
        /** @type {object} */ (d).competences.length,
      ),
    );
  lignesIps.push(
    "- top 5 : " +
      /** @type {object[]} */ (ips.concentration.top_5_competences)
        .map((t) => pyFormat("%s (%s %%)", t.nom, t.proportion))
        .join(", "),
  );
  donnees.push(
    "### Profil ipsatif (distribution des 100 % du travail observé — pour calibrer formeProfil)",
    orElse(lignesIps.join("\n"), "(aucune compétence établie)"),
  );
  donnees.push(
    "### Le référentiel des 61 compétences (pour vérifier les orphelines)",
    polesDe(ctx)
      .flatMap((p) => p.competences.map((c) => pyFormat("- %s %s", c.code, c.nom)))
      .join("\n"),
  );
  const v = { ...base, DONNEES: donnees.join("\n\n") };
  let raw = await appelRelecture(
    backend,
    resolveContent(gabaritDe(ctx, "merge/01-kairos-evolutif.md"), v),
    "merge_kairos",
    {},
    "merge_kairos",
    ctx.incidents,
  );
  /** @type {object|null} */
  let kairosStruct = null;
  /** @type {string|null} */
  let kairosMd = null;
  if (pyTruthy(raw)) {
    const data = extractJson(/** @type {string} */ (raw));
    if (isDict(data) && isDict(dictGet(/** @type {object} */ (data), "kairos", null))) {
      kairosStruct = /** @type {object} */ (data);
      const apprenant = orElse(
        dictGet(/** @type {object} */ (dictGet(kairosStruct, "kairos", null)), "apprenant", null),
        {},
      );
      kairosMd = /** @type {string|null} */ (
        dictGet(/** @type {object} */ (apprenant), "syntheseCompleteMarkdown", null)
      );
    }
    if (!pyTruthy(kairosMd)) {
      incr(ctx.incidents, "kairos_json_invalide");
      logWarn("Kairos : JSON invalide ou synthèse absente — repli sur le texte brut");
      kairosMd = raw;
    }
  }
  out.kairos = kairosStruct;
  out.kairos_evolutif = kairosMd;

  // 2. Pôles évolutifs (7 appels) — codes AVEC leurs intitulés
  for (const pole of polesDe(ctx)) {
    const codes = pole.competences.map((c) => c.code);
    /** @type {string[]} */
    const lignes = [];
    for (const cj of cartos) {
      const et = /** @type {string[]} */ (dictGet(cj, "etablies", null)).filter((c) => codes.includes(c));
      if (pyTruthy(et)) {
        lignes.push(
          pyFormat(
            "%s : %s",
            dictGet(cj, "journee", null),
            et.map((c) => pyFormat("%s (%s)", c, noms.has(c) ? noms.get(c) : c)).join(", "),
          ),
        );
      }
    }
    const vp = {
      ...base,
      POLE_NUM: pole.num,
      POLE_NOM: pole.nom,
      DONNEES: orElse(lignes.join("\n"), "(aucune présence établie sur la période)"),
    };
    raw = await appelRelecture(
      backend,
      resolveContent(gabaritDe(ctx, "merge/02-pole-evolutif.md"), vp),
      "merge_pole",
      { pole: pole.num },
      pyFormat("merge_pole_P%d", pole.num),
      ctx.incidents,
    );
    if (pyTruthy(raw)) out.poles.set(pyStr(pole.num), /** @type {string} */ (raw));
  }

  // 3. Histoires de compétences (consolidées + à confirmer + faisceau, plafonné)
  const cap = pyIntOf(dictGet(cfg, "max_histoires", 12));
  const cibles = Array.from(competences.values())
    .filter((c) =>
      ["présence consolidée", "présence établie (à confirmer)", STATUT_FAISCEAU].includes(
        c.statut_temporel,
      ),
    )
    .sort((a, b) => asNum(b.score_cumule) - asNum(a.score_cumule)) // tri STABLE
    .slice(0, cap);
  for (const c of cibles) {
    const occ = /** @type {object[]} */ (c.attestations)
      .map((a) =>
        pyFormat(
          "- %s (%s) : %s",
          a.journee,
          orElse(dictGet(a, "date", null), "-"),
          /** @type {string[]} */ (a.citations).map((x) => pyFormat("« %s »", cpSlice(x, 0, 120))).join(" / "),
        ),
      )
      .join("\n");
    const vc = {
      ...base,
      CODE: c.code,
      NOM: c.nom,
      POLE_NUM: c.pole,
      POLE_NOM: polesDe(ctx).find((p) => p.num === c.pole).nom,
      NB_JOURNEES_ETABLIES: c.attestations.length,
      STATUT_FINAL: c.statut_temporel,
      TRAJECTOIRE: c.trajectoire,
      CUMUL_PREUVES: c.cumul_preuves,
      CUMUL_INDICES: c.cumul_indices,
      CONFIANCE_MOY: c.confiance_moyenne,
      SCORE_CUMULE: c.score_cumule,
      DONNEES: orElse(occ, "(occurrence unique, voir attestation)"),
    };
    raw = await appelRelecture(
      backend,
      resolveContent(gabaritDe(ctx, "merge/03-competence-evolution.md"), vc),
      "merge_competence",
      { code: c.code },
      pyFormat("merge_comp_%s", c.code),
      ctx.incidents,
    );
    if (pyTruthy(raw)) out.histoires.set(c.code, cpSlice(/** @type {string} */ (raw), 0, 900));
  }

  // 4. RAPPORTEUR (v4-50) : le rapport fait PARTIE de l'évaluation
  out.rapport = null;
  if (pyTruthy(dictGet(cfg, "rapporteur", true))) {
    const ips2 = profilIpsatif(competences);
    /** @type {string[]} */
    const d = ["### Premières impressions du Lecteur"];
    d.push(
      cartos
        .map((cj) =>
          pyFormat(
            "- %s : écriture perçue « %s »",
            dictGet(cj, "journee", null),
            orElse(dictGet(cj, "authenticite", null), "?"),
          ),
        )
        .join("\n"),
    );
    d.push("### Territoires les plus denses (profil ipsatif, avec extraits verbatim)");
    /** @type {string[]} */
    const lignes = [];
    for (const t of /** @type {object[]} */ (ips2.concentration.top_5_competences)) {
      const c = /** @type {object} */ (competences.get(t.code));
      let cit = "";
      for (const a of /** @type {object[]} */ (c.attestations).slice().reverse()) {
        if (/** @type {string[]} */ (a.citations).length) {
          cit = a.citations[0];
          break;
        }
      }
      lignes.push(
        pyFormat(
          "- %s — %s (%s %% du profil, %s, %s) : « %s »",
          t.code,
          c.nom,
          t.proportion,
          c.statut_temporel,
          c.trajectoire,
          cpSlice(cit, 0, 220),
        ),
      );
    }
    d.push(orElse(lignes.join("\n"), "(aucune compétence établie)"));
    d.push("### Répartition par pôle (à traduire en langage humain, sans chiffres bruts)");
    d.push(
      orElse(
        entriesOf(ips2.par_pole)
          .filter(([, x]) => pyTruthy(/** @type {object} */ (x).competences))
          .map(([n, x]) =>
            pyFormat(
              "- %s : %.1f %% (%d compétence(s))",
              n,
              /** @type {object} */ (x).proportion,
              /** @type {object} */ (x).competences.length,
            ),
          )
          .join("\n"),
        "(profil vide)",
      ),
    );
    d.push("### Non trouvées significatives (signaux ou graines présents)");
    const nt = Array.from(competences.values())
      .filter(
        (c) =>
          c.statut_temporel === "présence non établie" &&
          (pyTruthy(c.signaux) || pyTruthy(c.graines)),
      )
      .sort((a, b) => b.graines.length + b.signaux.length - (a.graines.length + a.signaux.length));
    d.push(
      orElse(
        nt
          .slice(0, 6)
          .map((c) =>
            pyFormat("- %s %s (%d signal(aux), %d graine(s))", c.code, c.nom, c.signaux.length, c.graines.length),
          )
          .join("\n"),
        "(aucune)",
      ),
    );
    d.push("### Renvois au Cartographe (questions d'entretien disponibles)");
    /** @type {string[]} */
    const rv = [];
    for (const c of competences.values()) {
      if (c.statut_temporel === "renvoi au cartographe") {
        /** @type {unknown} */
        let q = null;
        for (const cj of cartos.slice().reverse()) {
          const v0 = orElse(dictGet(cj.verdicts, c.code, null), {});
          q = orElse(
            dictGet(
              /** @type {object} */ (orElse(dictGet(/** @type {object} */ (v0), "prescription", null), {})),
              "pour_cartographe",
              null,
            ),
            q,
          );
        }
        rv.push(pyFormat("- %s %s : %s", c.code, c.nom, orElse(q, "dossier préparé")));
      }
    }
    d.push(orElse(rv.join("\n"), "(aucun renvoi)"));
    const [signalements, alertesPoles] = gardienFormulations(cartos, competences, out);
    d.push("### Alertes du gardien des formulations et de pôle");
    d.push(
      orElse(
        alertesPoles.map((a) => "- " + a).join("\n") +
          (signalements.length
            ? pyFormat("\n- %d formulation(s) signalée(s) à relire", signalements.length)
            : ""),
        "(aucune)",
      ),
    );
    const gaming = cartos.reduce(
      (n, cj) => n + /** @type {object[]} */ (orElse(dictGet(cj, "alertes_injection", null), [])).length,
      0,
    );
    const produites = cartos
      .filter((cj) => dictGet(cj, "authenticite", null) === "produite")
      .map((cj) => /** @type {string} */ (dictGet(cj, "journee", null)));
    d.push("### Vigilance anti-gaming");
    d.push(
      pyFormat(
        "- instructions embarquées signalées : %d\n- journées à écriture perçue « produite » : %s",
        gaming,
        orElse(produites.join(", "), "aucune"),
      ),
    );
    d.push("### Observations Kairos (structurées)");
    d.push(cpSlice(pyJsonDumps(orElse(dictGet(out, "kairos", null), {})), 0, 4000));
    const vr = { ...base, DONNEES: d.join("\n\n") };
    raw = await appelRelecture(
      backend,
      resolveContent(gabaritDe(ctx, "merge/04-rapporteur.md"), vr),
      "merge_rapporteur",
      {},
      "merge_rapporteur",
      ctx.incidents,
    );
    if (pyTruthy(raw)) {
      const data = extractJson(/** @type {string} */ (raw));
      if (isDict(data) && isDict(dictGet(/** @type {object} */ (data), "rapport", null))) {
        out.rapport = /** @type {object} */ (dictGet(/** @type {object} */ (data), "rapport", null));
      } else {
        incr(ctx.incidents, "rapporteur_json_invalide");
        logWarn("Rapporteur : JSON invalide — rapport final absent de ce run");
      }
    }
  }

  logOk(
    pyFormat(
      "Merge_v3 : relectures — kairos %s, %d pôles, %d histoires, rapporteur %s",
      pyTruthy(out.kairos_evolutif) ? "ok" : "indisponible",
      out.poles.size,
      out.histoires.size,
      pyTruthy(dictGet(out, "rapport", null)) ? "ok" : "indisponible",
    ),
  );
  return out;
}

// ── Gardien des formulations (v4-26, mécanisé : il signale, il ne réécrit pas) ──
const FORMULATIONS_INTERDITES = [
  "n'a pas démontré",
  "n’a pas démontré",
  "manque de",
  "il faudrait que",
  "malheureusement",
  "insuffisant",
  "insuffisante",
  "lacune",
  "défaillance",
  "malgré ",
  "tu es ",
  "vous êtes ",
  "l'apprenant est ",
  "l’apprenant est ",
];

/**
 * Vérifie mécaniquement les cinq règles d'écriture sur tout ce que lira
 * l'élève. Il SIGNALE (niveau 1) — jamais il ne réécrit : reformuler est un
 * acte humain. Niveau 2 : alertes de pôle (patterns de renvoi, découragement).
 * @param {object[]} cartos @param {Map<string, object>} competences @param {object} rel
 * @returns {[object[], string[]]}
 */
export function gardienFormulations(cartos, competences, rel) {
  /** @type {{source: string, formulation: string}[]} */
  const signalements = [];

  const scan = (texte, source) => {
    const low = /** @type {string} */ (orElse(texte, "")).toLowerCase();
    for (const f of FORMULATIONS_INTERDITES) {
      if (low.includes(f)) signalements.push({ source, formulation: pyStrip(f) });
    }
  };

  for (const cj of cartos) {
    for (const [code, v] of entriesOf(cj.verdicts)) {
      if (
        dictGet(/** @type {object} */ (v), "statut", null) === "présence non établie" &&
        ["non-détectée", "minoritaire"].includes(
          /** @type {string} */ (dictGet(/** @type {object} */ (v), "etage", null)),
        )
      ) {
        continue; // prescriptions mécaniques standard, déjà conformes
      }
      const p = orElse(dictGet(/** @type {object} */ (v), "prescription", null), {});
      scan(
        dictGet(/** @type {object} */ (p), "pour_apprenant", null),
        pyFormat("prescription %s @ %s", code, dictGet(cj, "journee", null)),
      );
    }
  }
  scan(dictGet(rel, "kairos_evolutif", null), "kairos évolutif");
  for (const [n, t] of entriesOf(orElse(dictGet(rel, "poles", null), {}))) {
    scan(t, pyFormat("relecture pôle %s", n));
  }
  for (const [c, t] of entriesOf(orElse(dictGet(rel, "histoires", null), {}))) {
    scan(t, pyFormat("histoire %s", c));
  }

  /** @type {string[]} */
  const alertes = [];
  /** @type {Map<number, {renvois: number, etablies: number, graines: number}>} */
  const parPole = new Map();
  for (const c of competences.values()) {
    if (!parPole.has(c.pole)) parPole.set(c.pole, { renvois: 0, etablies: 0, graines: 0 });
    const d = /** @type {{renvois: number, etablies: number, graines: number}} */ (parPole.get(c.pole));
    if (c.statut_temporel === "renvoi au cartographe") d.renvois += 1;
    if (
      ["présence consolidée", "présence établie (à confirmer)", STATUT_FAISCEAU].includes(
        c.statut_temporel,
      )
    ) {
      d.etablies += 1;
    }
    if (pyTruthy(c.graines)) d.graines += 1;
  }
  for (const [pole, d] of Array.from(parPole.entries()).sort((a, b) => a[0] - b[0])) {
    if (d.renvois >= 3) {
      alertes.push(
        pyFormat(
          "Pôle %d : %d dossiers en renvoi — pattern de difficulté systémique possible, à contextualiser en entretien.",
          pole,
          d.renvois,
        ),
      );
    }
    if (d.etablies === 0 && d.graines >= 4) {
      alertes.push(
        pyFormat(
          "Pôle %d : aucune présence établie mais %d compétences à graines — " +
            "risque de découragement cumulatif si la restitution n'est pas accompagnée.",
          pole,
          d.graines,
        ),
      );
    }
  }
  return [signalements, alertes];
}

// ── Sorties ───────────────────────────────────────────────────────────────────
// Constante Python recopiée OCTET POUR OCTET (fin de ligne finale comprise).
const PROCEDURE = `## Comment lire cette carte (la procédure, en clair)

Ce journal est passé devant un **tribunal des compétences** : plusieurs lecteurs
indépendants ont surligné le texte, chacun sur son calque, sans se concerter ; un
greffier — seul à voir la superposition des calques — a recopié les pièces mot pour
mot (jamais de paraphrase) ; chaque dossier a été lu **trois fois** par un juge
rapide qui présume l'absence puis attaque sa propre lecture ; seuls les
**désaccords** entre ces trois lectures ont convoqué le tribunal complet — où
**personne ne vote** : une découverte minoritaire rouvre l'examen, une contestation
argumentée bloque la publication, et le désaccord irréductible part chez
l'enseignant, dossier préparé. Les signaux trop faibles pour la carte ne sont pas jetés : ils vivent au
**registre des graines**, et quand ils reviennent de journée en journée, un tribunal
de **second ressort** examine s'ils forment ensemble un faisceau probant.

Chaque affirmation montre sa pièce. Tu peux donc contester trois choses : **la pièce**
(cette phrase ne dit pas cela), **la lecture** (cette phrase ne prouve pas cela),
**le doute** (ce cas méritait l'examen humain). Les absences sont des territoires
non visités — pas des manques.
`;

/**
 * Écrit carto_evolutive.json, profil_ipsatif.json, rapport.md (si rapporteur),
 * rapport_evolutif.md et viewer/carto-evolutive-data.js via ctx.artefacts,
 * puis RETOURNE les structures (divergence assumée : le Python ne retournait
 * que carto_evo).
 * @param {object} ctx @param {object[]} cartos
 * @param {Map<string, object>} competences @param {object} rel
 * @param {{name: string}[]} roster
 * @returns {{cartoEvolutive: object, profilIpsatif: object, rapportMd: string|null,
 *   rapportEvolutifMd: string, viewerDataJs: string, statuts: Map<string, number>}}
 */
export function ecrireSorties(ctx, cartos, competences, rel, roster) {
  const base = ctx.base_dir;
  const dates = datesDe(cartos);
  /** @type {Map<string, number>} */
  const stats = new Map();
  for (const c of competences.values()) {
    stats.set(c.statut_temporel, (stats.get(c.statut_temporel) || 0) + 1);
  }
  const juryRaw = orElse(dictGet(ctx.config, "jury", null), {});
  const cartoEvo = {
    journal_id: ctx.journal_id,
    date: ctx.date,
    version: "Twin_v9",
    personas: infosPersonas(),
    jury_mode: pyStr(dictGet(/** @type {object} */ (juryRaw), "mode", "socle4+1")),
    periode: { debut: dates[0], fin: dates[dates.length - 1], n_journees: cartos.length },
    roster: roster.map((m) => dictGet(m, "name", null)),
    statuts: stats,
    competences,
    kairos_evolutif: dictGet(rel, "kairos_evolutif", null),
    kairos: dictGet(rel, "kairos", null),
    rapport: dictGet(rel, "rapport", null),
    scan_global: dictGet(ctx, "scan_global", null),
    profil_ipsatif: profilIpsatif(competences),
    rapports_poles: dictGet(rel, "poles", {}),
    histoires: dictGet(rel, "histoires", {}),
  };
  ctx.artefacts.writeJson(pjoin(base, "carto_evolutive.json"), cartoEvo);
  ctx.artefacts.writeJson(pjoin(base, "profil_ipsatif.json"), cartoEvo.profil_ipsatif);
  const rapp = dictGet(rel, "rapport", null);
  /** @type {string|null} */
  let rapportMd = null;
  if (pyTruthy(rapp)) {
    let md = dictGet(/** @type {object} */ (rapp), "rapport_complet_markdown", null);
    if (!pyTruthy(md)) {
      // repli : assemblage minimal depuis les champs structurés
      md = /** @type {[string, string][]} */ ([
        ["Portrait", "portrait"],
        ["La forme de votre profil", "forme_profil"],
        ["Ce que le tribunal n'a pas trouvé", "non_trouve"],
        ["Ce qui émerge entre les lignes", "emergences"],
      ])
        .map(([t, k]) =>
          pyFormat("## %s\n\n%s", t, orElse(dictGet(/** @type {object} */ (rapp), k, null), "")),
        )
        .join("\n\n");
    }
    rapportMd = pyFormat("# Cartographie de %s — %s\n\n%s\n", ctx.journal_id, ctx.date, md);
    ctx.artefacts.writeText(pjoin(base, "rapport.md"), rapportMd);
  }

  // rapport markdown
  /** @type {string[]} */
  const L = [
    pyFormat("# Cartographie évolutive — %s", ctx.journal_id),
    pyFormat(
      "*Twin_v9 — %s — %d journées (%s → %s)*",
      ctx.date,
      cartos.length,
      dates[0],
      dates[dates.length - 1],
    ),
    "",
    PROCEDURE,
    "---",
    "",
  ];
  if (pyTruthy(dictGet(rel, "kairos_evolutif", null))) {
    L.push(/** @type {string} */ (dictGet(rel, "kairos_evolutif", null)), "", "---", "");
  }
  L.push(
    "# La carte additive",
    "",
    "| Code | Compétence | Statut temporel | Trajectoire | Attestations | Dernière trace |",
    "|------|------------|-----------------|-------------|--------------|----------------|",
  );
  const codesTries = Array.from(competences.keys()).sort(codePointCompare);
  for (const code of codesTries) {
    const c = /** @type {object} */ (competences.get(code));
    if (c.statut_temporel === "présence non établie" && !pyTruthy(c.signaux) && !pyTruthy(c.graines)) {
      continue;
    }
    const att = orElse(
      /** @type {object[]} */ (c.attestations)
        .map((a) => orElse(dictGet(a, "date", null), a.journee))
        .join(", "),
      "—",
    );
    let cit = "";
    for (const a of /** @type {object[]} */ (c.attestations).slice().reverse()) {
      if (pyTruthy(a.citations)) {
        cit = pyFormat("« %s »", cpSlice(a.citations[0], 0, 80).replaceAll("|", "/"));
        break;
      }
    }
    L.push(
      pyFormat(
        "| %s | %s | %s | %s | %s | %s |",
        code,
        c.nom,
        c.statut_temporel,
        c.trajectoire,
        att,
        orElse(cit, "—"),
      ),
    );
  }
  const nonVisitees = Array.from(competences.values()).filter(
    (c) => c.statut_temporel === "présence non établie" && !pyTruthy(c.signaux) && !pyTruthy(c.graines),
  ).length;
  L.push(
    "",
    pyFormat("*Territoires non visités : %d compétences sans aucun signal sur la période.*", nonVisitees),
    "",
  );

  // second ressort
  const faisceaux = Array.from(competences.values()).filter((c) => pyTruthy(dictGet(c, "faisceau", null)));
  if (faisceaux.length) {
    L.push(
      "---",
      "",
      "# Second ressort — les faisceaux d'indices",
      "",
      "*Compétences jamais établies en journée mais dont les signaux revenaient : " +
        "instruites au niveau de la trajectoire.*",
      "",
    );
    for (const c of faisceaux.slice().sort((a, b) => codePointCompare(a.code, b.code))) {
      const f = /** @type {object} */ (c.faisceau);
      L.push(
        pyFormat(
          "- **%s %s** — %s (confiance %.2f) : %s",
          c.code,
          c.nom,
          f.statut,
          orElse(f.confiance, new PyFloat(0)),
          orElse(f.motif, ""),
        ),
      );
    }
    L.push("");
  }

  // l'Arpenteur : ce que le découpage en journées ne voit pas — TOUTES les
  // orphelines, sans plafond (le détail intégral vit dans scan_global.json)
  const sg = /** @type {object} */ (orElse(dictGet(ctx, "scan_global", null), {}));
  if (
    pyTruthy(dictGet(sg, "orphelines", null)) ||
    pyTruthy(dictGet(sg, "continuites", null)) ||
    pyTruthy(dictGet(sg, "graines_versees", null))
  ) {
    L.push(
      "---",
      "",
      "# L'Arpenteur — ce que le découpage en journées ne voit pas",
      "",
      pyFormat(
        "*Le portfolio entier lu d'un seul regard (condensé fidèle par journée, puis " +
          "retour au texte brut) : des pistes ancrées, jamais des verdicts. " +
          "%d graine(s) versée(s) au registre, %d suspicion(s) non retrouvée(s) dans le " +
          "texte brut (archivées), %d extrait(s) rejeté(s) à l'ancrage.*",
        dictGet(sg, "graines_versees", 0),
        dictGet(sg, "non_retrouvees", 0),
        dictGet(sg, "rejets_ancrage", 0),
      ),
      "",
    );
    for (const o of /** @type {object[]} */ (dictGet(sg, "orphelines", []))) {
      L.push(pyFormat("### Hors référentiel — %s", orElse(dictGet(o, "titre", null), "?")));
      L.push(pyFormat("- %s", orElse(dictGet(o, "description", null), "")));
      for (const e of /** @type {object[]} */ (o.extraits_ancres)) {
        L.push(
          pyFormat(
            "  - « %s » (%s)",
            cpSlice(/** @type {string} */ (e.verbatim), 0, 200),
            orElse(dictGet(e, "date", null), dictGet(e, "journee", null)),
          ),
        );
      }
      if (pyTruthy(dictGet(o, "pourquoiHorsReferentiel", null))) {
        L.push(pyFormat("- **Pourquoi hors des 61** : %s", dictGet(o, "pourquoiHorsReferentiel", null)));
      }
      if (pyTruthy(dictGet(o, "hypotheseFalsifiable", null))) {
        L.push(pyFormat("- **Hypothèse falsifiable** : %s", dictGet(o, "hypotheseFalsifiable", null)));
      }
      if (pyTruthy(dictGet(o, "testEntretien", null))) {
        L.push(pyFormat("- **Test en entretien** : %s", dictGet(o, "testEntretien", null)));
      }
      if (pyTruthy(dictGet(o, "codesLesPlusProches", null))) {
        L.push(
          pyFormat(
            "- **Compétences les plus proches** : %s",
            /** @type {string[]} */ (dictGet(o, "codesLesPlusProches", null)).join(", "),
          ),
        );
      }
      L.push("");
    }
    for (const o of /** @type {object[]} */ (dictGet(sg, "continuites", []))) {
      const extraits = /** @type {object[]} */ (o.extraits_ancres);
      const jrs = Array.from(
        new Set(extraits.map((e) => /** @type {string} */ (orElse(dictGet(e, "date", null), dictGet(e, "journee", null))))),
      ).sort(codePointCompare);
      L.push(pyFormat("### Continuité — %s (%s)", orElse(dictGet(o, "titre", null), "?"), jrs.join(", ")));
      L.push(
        pyFormat(
          "- %s%s",
          orElse(dictGet(o, "description", null), ""),
          pyTruthy(dictGet(o, "codes", null))
            ? " — en relation avec : " + /** @type {string[]} */ (dictGet(o, "codes", null)).join(", ")
            : "",
        ),
      );
      for (const e of extraits.slice(0, 4)) {
        L.push(
          pyFormat(
            "  - « %s » (%s)",
            cpSlice(/** @type {string} */ (e.verbatim), 0, 200),
            orElse(dictGet(e, "date", null), dictGet(e, "journee", null)),
          ),
        );
      }
      L.push("");
    }
  }

  const kx = /** @type {object} */ (
    orElse(
      dictGet(/** @type {object} */ (orElse(dictGet(rel, "kairos", null), {})), "emergencesCrossPoles", null),
      {},
    )
  );
  if (
    ["competencesOrphelines", "connexionsTransversales", "noeudsConceptuels"].some((k) =>
      pyTruthy(dictGet(kx, k, null)),
    ) ||
    pyTruthy(dictGet(kx, "patternTemporel", null))
  ) {
    L.push("---", "", "# Émergences structurées (Kairos — pistes, jamais des verdicts)", "");
    for (const o of /** @type {object[]} */ (orElse(dictGet(kx, "competencesOrphelines", null), [])).slice(0, 3)) {
      L.push(
        pyFormat(
          "- **Orpheline — %s** : %s *(test en entretien : %s)*",
          dictGet(o, "titre", "?"),
          dictGet(o, "description", ""),
          dictGet(o, "testEntretien", "—"),
        ),
      );
    }
    for (const c0 of /** @type {object[]} */ (orElse(dictGet(kx, "connexionsTransversales", null), [])).slice(0, 3)) {
      L.push(
        pyFormat(
          "- **Connexion — %s** (%s) : %s",
          dictGet(c0, "titre", "?"),
          /** @type {string[]} */ (orElse(dictGet(c0, "codesRelies", null), [])).join(", "),
          dictGet(c0, "description", ""),
        ),
      );
    }
    for (const n0 of /** @type {object[]} */ (orElse(dictGet(kx, "noeudsConceptuels", null), [])).slice(0, 3)) {
      L.push(pyFormat("- **Nœud — %s** : %s", dictGet(n0, "nom", "?"), dictGet(n0, "description", "")));
    }
    const pt = /** @type {object} */ (orElse(dictGet(kx, "patternTemporel", null), {}));
    if (pyTruthy(dictGet(pt, "type", null))) {
      L.push(
        pyFormat(
          "- **Pattern temporel** : %s — %s",
          dictGet(pt, "type", null),
          cpSlice(/** @type {string} */ (dictGet(pt, "evidence", "")), 0, 300),
        ),
      );
    }
    const ci = /** @type {object} */ (orElse(dictGet(kx, "coherenceImpressionsVerdicts", null), {}));
    if (pyTruthy(dictGet(ci, "divergences", null))) {
      L.push(
        pyFormat(
          "- **Cohérence impressions ↔ verdicts** : %s",
          cpSlice(/** @type {string} */ (dictGet(ci, "divergences", null)), 0, 300),
        ),
      );
    }
    L.push("");
  }

  const ips = /** @type {object} */ (cartoEvo.profil_ipsatif);
  L.push(
    "---",
    "",
    "# Le profil ipsatif (répartition des 100 % du travail observé)",
    "",
    pyFormat(
      "*Établies : %s — renvois : %s. Les absentes sont hors profil (pas des zéros).*",
      ips.competences_etablies,
      ips.competences_renvoyees,
    ),
    "",
  );
  for (const [nomP, d] of entriesOf(ips.par_pole)) {
    if (pyTruthy(/** @type {object} */ (d).competences)) {
      L.push(
        pyFormat(
          "- **%s** : %.1f %% — %s",
          nomP,
          /** @type {object} */ (d).proportion,
          /** @type {object[]} */ (/** @type {object} */ (d).competences)
            .slice(0, 4)
            .map((cc) => pyFormat("%s %.1f %%", cc.code, cc.proportion))
            .join(", "),
        ),
      );
    }
  }
  L.push(
    pyFormat("- **Concentration** : le top 5 porte %.1f %% du profil", ips.concentration.part_du_top_5),
    "",
  );

  if (pyTruthy(dictGet(rel, "histoires", null))) {
    L.push("---", "", "# Histoires d'apprentissage", "");
    const hist = /** @type {Map<string, string>} */ (dictGet(rel, "histoires", null));
    for (const code of Array.from(hist.keys()).sort(codePointCompare)) {
      const c = /** @type {object} */ (competences.get(code));
      L.push(
        pyFormat("**%s — %s** (%s, %s)", code, c.nom, c.statut_temporel, c.trajectoire),
        "",
        /** @type {string} */ (hist.get(code)),
        "",
      );
    }
  }
  if (pyTruthy(dictGet(rel, "poles", null))) {
    L.push("---", "", "# Évolution par pôle", "");
    const poles = /** @type {Map<string, string>} */ (dictGet(rel, "poles", null));
    for (const n of Array.from(poles.keys()).sort((a, b) => parseInt(a, 10) - parseInt(b, 10))) {
      L.push(/** @type {string} */ (poles.get(n)), "");
    }
  }

  // registre des graines (jamais des verdicts : des questions)
  const nbJoursDe = (c) => new Set(c.graines.map((g) => dictGet(g, "journee", null))).size;
  const avecGraines = Array.from(competences.values())
    .filter((c) => pyTruthy(c.graines))
    .sort((a, b) => (nbJoursDe(a) !== nbJoursDe(b) ? nbJoursDe(b) - nbJoursDe(a) : codePointCompare(a.code, b.code)));
  if (avecGraines.length) {
    L.push("---", "", "# Registre des graines (jamais des constats : des questions)", "");
    for (const c of avecGraines) {
      const jours = Array.from(
        new Set(c.graines.map((g) => /** @type {string} */ (dictGet(g, "journee", null)))),
      ).sort(codePointCompare);
      const rec = c.graines_recurrentes ? " — **récurrent**" : "";
      const sources = Array.from(
        new Set(c.graines.map((g) => /** @type {string} */ (dictGet(g, "source", null)))),
      ).sort(codePointCompare);
      L.push(
        pyFormat(
          "- **%s %s** (%d journée%s%s) — sources : %s",
          c.code,
          c.nom,
          jours.length,
          jours.length > 1 ? "s" : "",
          rec,
          sources.join(", "),
        ),
      );
      const g0 = c.graines.find((g) => pyTruthy(dictGet(g, "extrait", null))) || null;
      if (g0) {
        L.push(
          pyFormat(
            "  - « %s » → *%s*",
            cpSlice(/** @type {string} */ (dictGet(g0, "extrait", null)), 0, 160),
            dictGet(g0, "question", null),
          ),
        );
      }
    }
    L.push("");
  }

  // gardien des formulations (mécanique) : signale, ne réécrit pas
  const [signalements, alertesPoles] = gardienFormulations(cartos, competences, rel);
  if (signalements.length) {
    incr(ctx.incidents, "formulations_signalees", signalements.length);
    L.push(
      "---",
      "",
      "# Gardien des formulations (à relire par l'humain avant restitution)",
      "",
      "*Formulations mécaniquement détectées comme contraires aux règles d'écriture " +
        "Aurora — le gardien signale, il ne réécrit pas.*",
      "",
    );
    for (const s of signalements.slice(0, 20)) {
      L.push(pyFormat("- %s : « %s »", s.source, s.formulation));
    }
    if (signalements.length > 20) {
      L.push(pyFormat("- (+ %d autres signalements)", signalements.length - 20));
    }
    L.push("");
  }

  // cahier du cartographe : les renvois, dossiers préparés + alertes de pôle
  /** @type {[string, string, object, string][]} */
  const cahier = [];
  for (const cj of cartos) {
    for (const [code, v] of entriesOf(cj.verdicts)) {
      if (
        dictGet(/** @type {object} */ (v), "statut", null) === "renvoi au cartographe" &&
        pyTruthy(dictGet(/** @type {object} */ (v), "dossier_cartographe", null))
      ) {
        cahier.push([
          /** @type {string} */ (code),
          /** @type {string} */ (dictGet(cj, "journee", null)),
          /** @type {object} */ (v),
          pyFormat("journees/%s/tribunal/%s/", dictGet(cj, "journee", null), code),
        ]);
      }
    }
  }
  for (const c of competences.values()) {
    const f = dictGet(c, "faisceau", null);
    if (pyTruthy(f) && pyTruthy(dictGet(/** @type {object} */ (f), "dossier_cartographe", null))) {
      cahier.push([c.code, "second ressort", /** @type {object} */ (f), pyFormat("second_ressort/%s/", c.code)]);
    }
  }
  if (cahier.length || alertesPoles.length) {
    L.push("---", "", "# Cahier du cartographe (les dossiers qui appellent l'humain)", "");
    for (const a of alertesPoles) L.push(pyFormat("> ⚠ %s", a));
    if (alertesPoles.length) L.push("");
    const cahierTrie = cahier
      .slice()
      .sort((a, b) => (a[0] !== b[0] ? codePointCompare(a[0], b[0]) : codePointCompare(a[1], b[1])));
    for (const [code, ou, v, chemin] of cahierTrie) {
      const dc = /** @type {object} */ (orElse(dictGet(v, "dossier_cartographe", null), {}));
      const jury = /** @type {object} */ (orElse(dictGet(v, "jury", null), {}));
      L.push(pyFormat("### %s %s — %s", code, /** @type {object} */ (competences.get(code)).nom, ou));
      L.push(
        pyFormat("- **Motif** : %s", orElse(dictGet(dc, "motif", null), orElse(dictGet(v, "motif", null), "-"))),
      );
      L.push(pyFormat("- **Désaccord** : %s", orElse(dictGet(dc, "desaccord", null), "-")));
      if (pyTruthy(dictGet(jury, "positions_finales", null))) {
        const pos = entriesOf(dictGet(jury, "positions_finales", null))
          .map(([n, p]) => pyFormat("%s %s", n, p))
          .join(", ");
        const st2 = pyTruthy(dictGet(jury, "second_tour", null))
          ? pyFormat(" — second tour relancé par %s", dictGet(jury, "relance_par", null))
          : "";
        L.push(pyFormat("- **Positions finales** : %s%s", pos, st2));
      }
      const q = dictGet(
        /** @type {object} */ (orElse(dictGet(v, "prescription", null), {})),
        "pour_cartographe",
        null,
      );
      if (pyTruthy(q)) L.push(pyFormat("- **Question pour l'entretien** : %s", q));
      if (pyTruthy(dictGet(dc, "pieges_envisages", null))) {
        L.push(
          pyFormat("- **Pièges envisagés** : %s", /** @type {string[]} */ (dictGet(dc, "pieges_envisages", null)).join("; ")),
        );
      }
      for (const cit of /** @type {string[]} */ (orElse(dictGet(dc, "citations", null), [])).slice(0, 3)) {
        L.push(pyFormat("  - « %s »", cpSlice(cit, 0, 200)));
      }
      L.push(pyFormat("- **Dossier complet** : `%s`", chemin));
      L.push("");
    }
  }
  const rapportEvolutifMd = L.join("\n") + "\n";
  ctx.artefacts.writeText(pjoin(base, "rapport_evolutif.md"), rapportEvolutifMd);

  // visualiseur : données embarquées, DOSSIER CLINIQUE COMPLET compris — l'élève
  // peut suivre le déroulé du raisonnement, l'enseignant instruire l'arbitrage.
  // Seuls les « non établie » sans matière (non-détectées) sont omis.
  const garder = (v) =>
    dictGet(v, "statut", null) !== "présence non établie" ||
    ["minoritaire", "tribunal", "tribunal-court-circuit"].includes(
      /** @type {string} */ (dictGet(v, "etage", null)),
    );

  const data = {
    journal_id: ctx.journal_id,
    date: ctx.date,
    personas: cartoEvo.personas,
    jury_mode: cartoEvo.jury_mode,
    periode: cartoEvo.periode,
    roster: cartoEvo.roster,
    journees: cartos.map((cj) => {
      /** @type {Map<unknown, object>} */
      const verdictsGardes = new Map();
      for (const [k, v] of entriesOf(cj.verdicts)) {
        if (garder(/** @type {object} */ (v))) verdictsGardes.set(k, /** @type {object} */ (v));
      }
      const jid = /** @type {string} */ (dictGet(cj, "journee", null));
      return {
        id: jid,
        date: dictGet(cj, "date", null),
        titre: dictGet(cj, "titre", null),
        texte: ctx.textes_journees.has(jid) ? ctx.textes_journees.get(jid) : "",
        segments: dictGet(cj, "segments", null),
        etablies: dictGet(cj, "etablies", null),
        renvois: dictGet(cj, "renvois", null),
        premiere_impression: dictGet(cj, "premiere_impression", null),
        authenticite: dictGet(cj, "authenticite", null),
        consensus: dictGet(cj, "consensus", {}),
        legers: dictGet(cj, "legers", {}),
        validations: dictGet(cj, "validations", {}),
        graines: dictGet(cj, "graines", []),
        spans_ecartes: dictGet(cj, "spans_ecartes", []),
        calques: dictGet(cj, "calques", []),
        rejets: dictGet(cj, "rejets", []),
        alertes_injection: dictGet(cj, "alertes_injection", []),
        verdicts: verdictsGardes,
      };
    }),
    competences,
    kairos_evolutif: dictGet(rel, "kairos_evolutif", null),
    kairos: dictGet(rel, "kairos", null),
    rapport: dictGet(rel, "rapport", null),
    scan_global: dictGet(ctx, "scan_global", null),
    profil_ipsatif: cartoEvo.profil_ipsatif,
    rapports_poles: dictGet(rel, "poles", {}),
    histoires: dictGet(rel, "histoires", {}),
  };
  const vdir = pjoin(base, "viewer");
  // « </ » est échappé : un texte d'élève contenant </script> ne casse pas le viewer
  const viewerDataJs = pyFormat("window.CARTO9 = %s;\n", pyJsonDumps(data).replaceAll("</", "<\\/"));
  ctx.artefacts.writeText(pjoin(vdir, "carto-evolutive-data.js"), viewerDataJs);
  if (ctx.viewer_html !== undefined && ctx.viewer_html !== null) {
    ctx.artefacts.writeText(pjoin(vdir, "carto_evolutive.html"), universalNewlines(ctx.viewer_html));
  } else {
    logWarn(
      pyFormat(
        "Visualiseur source introuvable : %s",
        pjoin(pyStr(orElse(dictGet(ctx, "impl_dir", null), "?")), "viewer", "carto_evolutive.html"),
      ),
    );
  }
  logOk(
    "carto_evolutive.json + rapport_evolutif.md + rapport.md (Rapporteur) + " +
      "profil_ipsatif.json + viewer/carto_evolutive.html",
  );
  return {
    cartoEvolutive: cartoEvo,
    profilIpsatif: cartoEvo.profil_ipsatif,
    rapportMd,
    rapportEvolutifMd,
    viewerDataJs,
    statuts: stats,
  };
}
