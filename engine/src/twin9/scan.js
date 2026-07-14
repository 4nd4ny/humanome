// Port de aurora/scan9.py — « l'Arpenteur » : scan global du portfolio, sans
// grille. Parité bit-à-bit avec le Python en mode mock (spec-merge-scan.md =
// contrat, scan9.py = source de vérité).
//
//   A. CONDENSATION FIDÈLE  : 1 appel/journée, incrémental par empreinte
//   B. PASSE GLOBALE        : le condensé ENTIER d'un seul regard (chose vue)
//   C. RETOUR AUX SOURCES   : vérification sur le texte BRUT + ancrage mécanique
//   D. VERSEMENT ADDITIF    : graines source="scan-global" + orphelines/continuités
//
// L'Arpenteur est un lecteur, pas un juge : il ne publie aucun statut, il VERSE
// des pièces ré-ancrées dans le texte brut. Rien ne se verse sans extrait
// retrouvé ; une suspicion non retrouvée meurt proprement (archivée, jamais
// versée). AUCUN plafond : `retour_max_caracteres` est une taille de LOT
// technique (tous les lots sont lus), pas un plafond d'instruction.
//
// Différences assumées avec scan9.py (mêmes conventions que merge.js) :
//   - pas de fs : les artefacts passent par ctx.artefacts (store injectable),
//     les gabarits confidentiels par ctx.protocole(relPath) (défaut "") ;
//   - ctx.textes_journees est une Map ; competences est la Map de fusionner ;
//   - les floats Python entiers transitent en PyFloat.
// Tous les index et longueurs sont en POINTS DE CODE.

import { sentencesDe, suspicion } from "./journee.js";
import { resolveContent, varsClient } from "./templates.js";
import {
  empreinte,
  extractJson,
  findVerbatim,
  log,
  logOk,
  logWarn,
  neutraliserBalises,
} from "./util.js";
import { pjoin } from "./artefacts.js";
import { dictGet, entriesOf, pyIntOf, pyTruthy } from "./py/pyDict.js";
import { PyFloat, codePointCompare } from "./py/pyJson.js";
import { pyDeepEqual } from "./py/pyEq.js";
import { pyRound } from "./py/pyRound.js";
import { pyFormat, pyStr } from "./py/pyStr.js";
import { cpLen, cpSlice, pyStrip } from "./py/pyText.js";

export const VERSION_SCAN = "scan-v1";

/** str(e) tolérant (Error → message, sinon String). @param {unknown} e */
function strErr(e) {
  return e && /** @type {{message?: string}} */ (e).message !== undefined
    ? /** @type {{message: string}} */ (e).message
    : String(e);
}

/** `x or y` Python. @param {unknown} v @param {unknown} dflt */
function orElse(v, dflt) {
  return pyTruthy(v) ? v : dflt;
}

/** dict Python générique (objet simple ou Map) : d.setdefault(k, default). */
function setdefault(d, k, dflt) {
  if (d instanceof Map) {
    if (!d.has(k)) d.set(k, dflt);
    return d.get(k);
  }
  if (!(k in d) || d[k] === undefined) d[k] = dflt;
  return d[k];
}

/** dict Python générique : écriture d[k] = v. */
function dsSet(d, k, v) {
  if (d instanceof Map) d.set(k, v);
  else d[k] = v;
}

/** Map ou objet simple : lecture avec défaut (comme dict.get). */
function mGet(d, k, dflt = null) {
  if (d instanceof Map) return d.has(k) ? d.get(k) : dflt;
  return dictGet(d, k, dflt);
}

/** ctx["poles"] : liste de Pole (P1..P7) — tolère une Map {num: Pole}. */
function polesDe(ctx) {
  return ctx.poles instanceof Map ? Array.from(ctx.poles.values()) : ctx.poles;
}

/** incidents[k] = incidents.get(k, 0) + 1 — objet simple ou Map. */
function inc(ctx, cle) {
  const incidents = ctx.incidents;
  if (incidents instanceof Map) incidents.set(cle, (incidents.get(cle) || 0) + 1);
  else incidents[cle] = (incidents[cle] || 0) + 1;
}

/** Gabarit par chemin relatif au protocole (mock : contenu facultatif). */
function gabaritDe(ctx, rel) {
  const content = ctx.protocole ? ctx.protocole(rel) : "";
  return content === null || content === undefined ? "" : content;
}

/** Appel résilient : une panne du scan ne casse jamais le pipeline. */
async function appel(ctx, backend, prompt, task, meta, label, gabarit, variables) {
  try {
    return await backend.call(prompt, { task, meta, label, gabarit, variables: varsClient(variables) });
  } catch (e) {
    inc(ctx, "scan_appel_echec");
    logWarn(pyFormat("Arpenteur : appel %s indisponible (%s)", label, strErr(e)));
    return null;
  }
}

/**
 * Les journées du scan = celles de la carte (ordre chronologique, journées des
 * exécutions passées comprises — la carte est additive).
 * @param {object} ctx @param {object[]} cartos @returns {object[]}
 */
function joursDe(ctx, cartos) {
  /** @type {object[]} */
  const jours = [];
  for (const cj of cartos) {
    const jid = dictGet(cj, "journee", null);
    const texte = orElse(mGet(ctx.textes_journees, jid, null), "");
    if (pyTruthy(pyStrip(/** @type {string} */ (texte)))) {
      jours.push({ id: jid, date: dictGet(cj, "date", null), texte });
    }
  }
  return jours;
}

// ── A. Condensation fidèle (1 appel/journée, incrémental par empreinte) ──────
/**
 * @param {object} ctx @param {object[]} jours @param {object} backend @param {object} etatScan
 * @returns {Promise<number>} — nombre de condensés repris (empreinte inchangée).
 */
async function condenser(ctx, jours, backend, etatScan) {
  const conds = setdefault(etatScan, "condenses", {});
  const modele = mGet(mGet(ctx.config, "backend_tribunal", null) || {}, "model", null);
  let reprises = 0;
  for (const j of jours) {
    const fp = empreinte(j.texte, modele, VERSION_SCAN);
    const ent = mGet(conds, j.id, null);
    if (ent && mGet(ent, "empreinte", null) === fp && pyTruthy(mGet(ent, "condense", null))) {
      reprises += 1;
      continue;
    }
    const variables = {
      JOURNEE_ID: j.id,
      DATE: orElse(j.date, "-"),
      TEXTE: neutraliserBalises(j.texte),
    };
    const prompt = resolveContent(gabaritDe(ctx, "scan/00-condense-fidele.md"), variables);
    const raw = await appel(
      ctx,
      backend,
      prompt,
      "condense",
      { journee: j.id, sentences: sentencesDe(j.texte, j.id) },
      pyFormat("condense_%s", j.id),
      "scan/00-condense-fidele.md",
      variables,
    );
    const data = raw ? extractJson(/** @type {string} */ (raw)) : null;
    const c = mGet(data || {}, "condense_fidele", null);
    if (!isDict(c) || !pyTruthy(mGet(/** @type {object} */ (c), "resume", null))) {
      inc(ctx, "condense_json_invalide");
      logWarn(
        pyFormat(
          "Arpenteur : condensé %s invalide — journée absente de la passe globale de " +
            "ce run (sera retentée au prochain)",
          j.id,
        ),
      );
      continue;
    }
    // le condensé remplacé est ARCHIVÉ, jamais supprimé (rien ne se perd)
    let archives = ent ? orElse(mGet(ent, "archives", null), []) : [];
    if (ent && pyTruthy(mGet(ent, "condense", null))) {
      archives = archives.concat([
        { empreinte: mGet(ent, "empreinte", null), condense: mGet(ent, "condense", null) },
      ]);
    }
    dsSet(conds, j.id, { empreinte: fp, date: j.date, condense: c, archives });
  }
  if (reprises) {
    log(pyFormat("Arpenteur : %d condensé(s) repris sans relecture (empreintes)", reprises));
  }
  return reprises;
}

/** isinstance(x, dict) sur un résultat extractJson / une structure hôte. */
function isDict(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof PyFloat) && !(v instanceof Map);
}

// ── B. Passe globale (1 appel — le portfolio entier d'un seul regard) ────────
/**
 * → [arpentage, nouveau] : `nouveau=false` si le condensé du portfolio est
 * inchangé — chose vue, la passe et les retours ne sont pas rejoués.
 * @param {object} ctx @param {object[]} jours @param {object} backend @param {object} etatScan
 * @returns {Promise<[object|null, boolean]>}
 */
async function passeGlobale(ctx, jours, backend, etatScan) {
  const conds = mGet(etatScan, "condenses", {}) || {};
  /** @type {string[]} */
  const blocs = [];
  /** @type {Record<string, string[]>} */
  const pepites = {};
  for (const j of jours) {
    const ent = mGet(conds, j.id, null);
    if (!ent || !pyTruthy(mGet(ent, "condense", null))) continue;
    const c = /** @type {object} */ (mGet(ent, "condense", null));
    const peps = /** @type {unknown[]} */ (orElse(mGet(c, "pepites", null), [])).filter(
      (p) => typeof p === "string" && pyTruthy(pyStrip(p)),
    );
    pepites[j.id] = /** @type {string[]} */ (peps);
    blocs.push(
      pyFormat(
        "#### %s (%s)\n- Résumé : %s\n- Forme : %s\n- Singularités : %s\n- Pépites verbatim : %s",
        j.id,
        orElse(j.date, "-"),
        mGet(c, "resume", ""),
        orElse(mGet(c, "forme", ""), "-"),
        orElse(mGet(c, "singularites", ""), "-"),
        orElse(peps.map((p) => pyFormat("« %s »", p)).join(" / "), "—"),
      ),
    );
  }
  if (!blocs.length) {
    logWarn("Arpenteur : aucun condensé disponible — passe globale annulée");
    return [null, false];
  }
  // chose vue : liste triée de paires [jid, empreinte] + la version (2 parts)
  const paires = entriesOf(conds)
    .filter(([, e]) => pyTruthy(mGet(/** @type {object} */ (e), "condense", null)))
    .map(([jid, e]) => [jid, mGet(/** @type {object} */ (e), "empreinte", null)]);
  paires.sort((a, b) => {
    const d = codePointCompare(/** @type {string} */ (a[0]), /** @type {string} */ (b[0]));
    return d !== 0 ? d : codePointCompare(/** @type {string} */ (a[1]), /** @type {string} */ (b[1]));
  });
  const fp = empreinte(paires, VERSION_SCAN);
  const ancien = mGet(etatScan, "arpentage", null);
  if (ancien && mGet(ancien, "empreinte", null) === fp && mGet(ancien, "resultat", null) !== null) {
    log(
      "Arpenteur : condensé du portfolio inchangé — passe globale et retours aux sources " +
        "reprises sans relecture (chose vue)",
    );
    return [mGet(ancien, "resultat", null), false];
  }
  const dates = jours.map((j) => orElse(j.date, j.id));
  const liste61 = polesDe(ctx)
    .flatMap((p) => p.competences.map((c) => pyFormat("- %s %s", c.code, c.nom)))
    .join("\n");
  const variables = {
    JOURNAL_ID: ctx.journal_id,
    PREMIERE_DATE: dates[0],
    DERNIERE_DATE: dates[dates.length - 1],
    NB_JOURNEES: jours.length,
    LISTE_61: liste61,
    CONDENSES: blocs.join("\n\n"),
  };
  const prompt = resolveContent(gabaritDe(ctx, "scan/01-arpenteur.md"), variables);
  const raw = await appel(
    ctx,
    backend,
    prompt,
    "arpenteur",
    {
      jours: jours.map((j) => [j.id, j.date]),
      codes: polesDe(ctx).flatMap((p) => p.competences.map((c) => c.code)),
      pepites,
    },
    "arpenteur_global",
    "scan/01-arpenteur.md",
    variables,
  );
  const data = raw ? extractJson(/** @type {string} */ (raw)) : null;
  const a = mGet(data || {}, "arpentage", null);
  if (!isDict(a)) {
    inc(ctx, "arpentage_json_invalide");
    logWarn("Arpenteur : passe globale invalide — scan sans effet sur ce run");
    return [null, false];
  }
  dsSet(etatScan, "arpentage", { empreinte: fp, resultat: a });
  return [a, true];
}

// ── C+D. Retour aux sources + ancrage mécanique ──────────────────────────────
/**
 * Résout des références (id ou date) vers les journées, ordre préservé.
 * @param {unknown[]|null} refs @param {object[]} jours @returns {object[]}
 */
export function resoudreJournees(refs, jours) {
  /** @type {Map<string, object>} */
  const parCle = new Map();
  for (const j of jours) {
    parCle.set(/** @type {string} */ (j.id), j); // id : affectation directe
    if (pyTruthy(j.date)) {
      if (!parCle.has(/** @type {string} */ (j.date))) parCle.set(/** @type {string} */ (j.date), j); // date : PREMIER gagne
    }
  }
  /** @type {Set<unknown>} */
  const vus = new Set();
  /** @type {object[]} */
  const out = [];
  for (const r of refs || []) {
    const j = parCle.get(pyStrip(pyStr(r)));
    if (j && !vus.has(j.id)) {
      vus.add(j.id);
      out.push(j);
    }
  }
  return out;
}

/**
 * Vérifie la suspicion sur le texte BRUT des journées citées, puis ancre chaque
 * verbatim (findVerbatim) dans sa journée. → [extraits ancrés, issues].
 * @param {object} ctx @param {object} obs @param {string} type_ @param {object[]} cites
 * @param {object} backend @param {string} labelBase @returns {Promise<[object[], unknown[]]>}
 */
export async function retourAuxSources(ctx, obs, type_, cites, backend, labelBase) {
  const cfg = orElse(mGet(ctx.config, "scan_global", null), {});
  const maxC = pyIntOf(mGet(/** @type {object} */ (cfg), "retour_max_caracteres", 30000));
  // lots techniques : TOUS les lots sont lus (borne de contexte, pas plafond)
  /** @type {object[][]} */
  const lots = [];
  /** @type {object[]} */
  let cur = [];
  let curLen = 0;
  for (const j of cites) {
    if (cur.length && curLen + cpLen(j.texte) > maxC) {
      lots.push(cur);
      cur = [];
      curLen = 0;
    }
    cur.push(j);
    curLen += cpLen(j.texte);
  }
  if (cur.length) lots.push(cur);
  /** @type {object[]} */
  const bruts = [];
  /** @type {unknown[]} */
  const issues = [];
  for (let li = 0; li < lots.length; li++) {
    const lot = lots[li];
    const dossier = lot
      .map((j) =>
        pyFormat("#### Journée %s (%s)\n\n%s", j.id, orElse(j.date, "-"), neutraliserBalises(j.texte)),
      )
      .join("\n\n");
    const variables = {
      TYPE: type_,
      TITRE: orElse(mGet(obs, "titre", null), orElse(mGet(obs, "code", null), "?")),
      DESCRIPTION: orElse(mGet(obs, "description", null), orElse(mGet(obs, "pourquoiInvisibleAuJour", null), "-")),
      INDICES: orElse(/** @type {unknown[]} */ (orElse(mGet(obs, "indices", null), [])).join(" ; "), "-"),
      DOSSIER: dossier,
    };
    const prompt = resolveContent(gabaritDe(ctx, "scan/02-retour-aux-sources.md"), variables);
    /** @type {unknown[]} */
    const sents = [];
    for (const j of lot) for (const s of sentencesDe(j.texte, j.id)) sents.push(s);
    const raw = await appel(
      ctx,
      backend,
      prompt,
      "retour_sources",
      { jours: lot.map((j) => j.id), sentences: sents, titre: orElse(mGet(obs, "titre", null), mGet(obs, "code", null)) },
      pyFormat("retour_%s_l%d", labelBase, li + 1),
      "scan/02-retour-aux-sources.md",
      variables,
    );
    const data = raw ? extractJson(/** @type {string} */ (raw)) : null;
    const r = mGet(data || {}, "retour_aux_sources", null);
    if (!isDict(r)) {
      inc(ctx, "retour_json_invalide");
      continue;
    }
    issues.push(mGet(/** @type {object} */ (r), "issue", null));
    for (const e of /** @type {unknown[]} */ (orElse(mGet(/** @type {object} */ (r), "extraits", null), []))) {
      if (isDict(e) && pyTruthy(mGet(/** @type {object} */ (e), "verbatim", null))) bruts.push(/** @type {object} */ (e));
    }
  }
  // ancrage : la citation est l'assurance-vie de la carte (mémoire §2)
  /** @type {Map<string, object>} */
  const parId = new Map();
  for (const j of cites) parId.set(/** @type {string} */ (j.id), j);
  for (const j of cites) {
    if (pyTruthy(j.date) && !parId.has(/** @type {string} */ (j.date))) parId.set(/** @type {string} */ (j.date), j);
  }
  const st = setdefault(setdefault(ctx, "ancrage_stats", {}), "arpenteur", { ancres: 0, rejets: 0 });
  /** @type {object[]} */
  const ancres = [];
  for (const e of bruts) {
    const j = parId.get(pyStrip(pyStr(mGet(e, "journee", ""))));
    const loc = j ? findVerbatim(/** @type {string} */ (j.texte), /** @type {string} */ (mGet(e, "verbatim", null))) : null;
    if (loc) {
      st.ancres += 1;
      ancres.push({
        journee: j.id,
        date: dictGet(j, "date", null),
        verbatim: cpSlice(pyStr(mGet(e, "verbatim", null)), 0, 300),
        span: [loc[0], loc[1]],
        ratio: new PyFloat(pyRound(loc[2], 3)),
      });
    } else {
      st.rejets += 1;
      inc(ctx, "scan_ancrage_rejets");
    }
  }
  return [ancres, issues];
}

// ── E. Versement (0 LLM — la procédure dispose) ──────────────────────────────
/** @param {object} o @returns {[string, unknown]} */
export function cleObs(o) {
  if (dictGet(o, "type", null) === "graine-referentiel") return ["graine", dictGet(o, "code", null)];
  return [dictGet(o, "type", null), pyStrip(pyStr(orElse(dictGet(o, "titre", null), ""))).toLowerCase()];
}

/** @param {string} code @param {Map<string,string>|object} noms @param {object} extrait @returns {object} */
function graine(code, noms, extrait) {
  return suspicion(
    code,
    mGet(noms, code, code),
    { id: dictGet(extrait, "journee", null), date: dictGet(extrait, "date", null) },
    "scan-global",
    dictGet(extrait, "verbatim", null),
  );
}

/**
 * Fusion additive dans l'état persistant : une observation revue s'enrichit de
 * ses nouveaux extraits (et graines correspondantes), jamais remplacée — les
 * graines existantes gardent leurs marques « jugée » du second ressort.
 * @param {object} etatScan @param {object[]} nouvelles @param {Map<string,string>|object} noms
 */
function fusionnerObs(etatScan, nouvelles, noms) {
  const obsEtat = /** @type {object[]} */ (setdefault(etatScan, "observations", []));
  /** @type {Map<string, object>} */
  const parCle = new Map();
  for (const o of obsEtat) parCle.set(JSON.stringify(dictGet(o, "cle", null)), o);
  for (const n of nouvelles) {
    const cle = cleObs(n);
    const k = JSON.stringify(cle);
    const o = parCle.get(k);
    if (o === undefined) {
      n.cle = cle.slice(); // LISTE (sérialisable)
      obsEtat.push(n);
      parCle.set(k, n);
      continue;
    }
    /** @type {Set<string>} */
    const deja = new Set(
      /** @type {object[]} */ (dictGet(o, "extraits_ancres", [])).map((e) =>
        JSON.stringify([dictGet(e, "journee", null), dictGet(e, "verbatim", null)]),
      ),
    );
    for (const e of /** @type {object[]} */ (dictGet(n, "extraits_ancres", []))) {
      const ek = JSON.stringify([dictGet(e, "journee", null), dictGet(e, "verbatim", null)]);
      if (!deja.has(ek)) {
        /** @type {object[]} */ (dictGet(o, "extraits_ancres", [])).push(e);
        for (const code of /** @type {string[]} */ (orElse(dictGet(o, "codes", null), []))) {
          /** @type {object[]} */ (setdefault(o, "graines", [])).push(graine(code, noms, e));
        }
      }
    }
    for (const champ of [
      "description",
      "hypotheseFalsifiable",
      "testEntretien",
      "pourquoiHorsReferentiel",
      "codesLesPlusProches",
      "issues",
    ]) {
      if (pyTruthy(dictGet(n, champ, null)) && !pyTruthy(dictGet(o, champ, null))) o[champ] = dictGet(n, champ, null);
    }
  }
}

/**
 * Re-versé à CHAQUE run après la fusion (elle reconstruit `competences`). Les
 * dicts de graines viennent de l'état persistant : une marque « jugée » posée
 * par le second ressort y reste d'un run à l'autre.
 * @param {object} ctx @param {Map<string, object>} competences @param {object} etatScan
 * @returns {object}
 */
export function verser(ctx, competences, etatScan) {
  let nGraines = 0;
  /** @type {object[]} */
  const orphelines = [];
  /** @type {object[]} */
  const continuites = [];
  for (const o of /** @type {object[]} */ (mGet(etatScan, "observations", []) || [])) {
    if (dictGet(o, "type", null) === "hors-referentiel") orphelines.push(o);
    else if (dictGet(o, "type", null) === "continuite") continuites.push(o);
    for (const g of /** @type {object[]} */ (orElse(dictGet(o, "graines", null), []))) {
      const c = competences.get(/** @type {string} */ (dictGet(g, "code", null)));
      if (c === undefined) {
        inc(ctx, "scan_code_inconnu");
        continue;
      }
      if (!(/** @type {object[]} */ (c.graines).some((x) => pyDeepEqual(x, g)))) {
        c.graines.push(g);
        nGraines += 1;
        c.graines_recurrentes =
          new Set(/** @type {object[]} */ (c.graines).map((x) => dictGet(x, "journee", null))).size >= 2;
      }
    }
  }
  const scanGlobal = {
    version: VERSION_SCAN,
    orphelines,
    continuites,
    graines_versees: nGraines,
    non_retrouvees: /** @type {unknown[]} */ (mGet(etatScan, "non_retrouvees", []) || []).length,
    rejets_ancrage: mGet(orElse(mGet(orElse(mGet(ctx, "ancrage_stats", null), {}), "arpenteur", null), {}), "rejets", 0),
  };
  ctx.scan_global = scanGlobal;
  return scanGlobal;
}

// ── Orchestration (étape 9bis : après la fusion, avant le second ressort) ────
/**
 * @param {object} ctx @param {object[]} cartos
 * @param {Map<string, object>} competences @param {object} backend @returns {Promise<object>}
 */
export async function arpenter(ctx, cartos, competences, backend) {
  let etatScan = mGet(ctx, "etat_scan", null);
  if (etatScan === null || etatScan === undefined) {
    etatScan = ctx.etat_scan = {}; // --sans-etat : scan éphémère
  }
  const jours = joursDe(ctx, cartos);
  /** @type {Map<string, string>} */
  const noms = new Map();
  for (const p of polesDe(ctx)) for (const c of p.competences) noms.set(c.code, c.nom);
  if (!jours.length) {
    logWarn("Arpenteur : aucune journée avec texte — scan sans objet");
    return verser(ctx, competences, etatScan);
  }
  log(
    pyFormat(
      "Arpenteur : scan global — %d journées, du %s au %s",
      jours.length,
      orElse(jours[0].date, jours[0].id),
      orElse(jours[jours.length - 1].date, jours[jours.length - 1].id),
    ),
  );

  const reprises = await condenser(ctx, jours, backend, etatScan);
  const [arpentage, nouveau] = await passeGlobale(ctx, jours, backend, etatScan);

  if (pyTruthy(arpentage) && nouveau) {
    const familles = /** @type {[string, unknown][]} */ ([
      ["hors-referentiel", dictGet(/** @type {object} */ (arpentage), "observationsHorsReferentiel", null)],
      ["continuite", dictGet(/** @type {object} */ (arpentage), "continuites", null)],
      ["graine-referentiel", dictGet(/** @type {object} */ (arpentage), "grainesReferentiel", null)],
    ]);
    /** @type {object[]} */
    const nouvelles = [];
    /** @type {object[]} */
    const mortes = [];
    let num = 0;
    for (const [type_, liste] of familles) {
      for (const obs of /** @type {unknown[]} */ (orElse(liste, []))) {
        if (!isDict(obs)) continue;
        num += 1;
        const cites = resoudreJournees(dictGet(/** @type {object} */ (obs), "journeesCitees", null), jours);
        if (!cites.length) {
          inc(ctx, "scan_journees_introuvables");
          mortes.push({ .../** @type {object} */ (obs), type: type_, motif: "journées citées introuvables" });
          continue;
        }
        const [ancres, issues] = await retourAuxSources(
          ctx,
          /** @type {object} */ (obs),
          /** @type {string} */ (type_),
          cites,
          backend,
          pyFormat("%s%02d", cpSlice(/** @type {string} */ (type_), 0, 4), num),
        );
        if (!ancres.length) {
          // la suspicion meurt proprement : archivée, jamais versée
          mortes.push({ .../** @type {object} */ (obs), type: type_, issues, motif: "aucun extrait retrouvé et ancré" });
          continue;
        }
        const codes =
          type_ === "graine-referentiel" && pyTruthy(dictGet(/** @type {object} */ (obs), "code", null))
            ? [dictGet(/** @type {object} */ (obs), "code", null)]
            : /** @type {unknown[]} */ (orElse(dictGet(/** @type {object} */ (obs), "codesRelies", null), [])).filter(
                (c) => pyTruthy(c),
              );
        const o = {
          type: type_,
          titre: orElse(dictGet(/** @type {object} */ (obs), "titre", null), dictGet(/** @type {object} */ (obs), "code", null)),
          description: orElse(
            dictGet(/** @type {object} */ (obs), "description", null),
            dictGet(/** @type {object} */ (obs), "pourquoiInvisibleAuJour", null),
          ),
          codes,
          codesLesPlusProches: dictGet(/** @type {object} */ (obs), "codesLesPlusProches", null),
          pourquoiHorsReferentiel: dictGet(/** @type {object} */ (obs), "pourquoiHorsReferentiel", null),
          hypotheseFalsifiable: dictGet(/** @type {object} */ (obs), "hypotheseFalsifiable", null),
          testEntretien: dictGet(/** @type {object} */ (obs), "testEntretien", null),
          issues,
          extraits_ancres: ancres,
          graines: /** @type {string[]} */ (codes).flatMap((code) => ancres.map((e) => graine(code, noms, e))),
          scan_date: ctx.date,
        };
        nouvelles.push(o);
      }
    }
    fusionnerObs(etatScan, nouvelles, noms);
    if (mortes.length) {
      for (const m of mortes) /** @type {object[]} */ (setdefault(etatScan, "non_retrouvees", [])).push(m);
    }
  }

  const resume = verser(ctx, competences, etatScan);
  ctx.artefacts.writeJson(pjoin(ctx.base_dir, "scan_global.json"), {
    version: VERSION_SCAN,
    journal_id: ctx.journal_id,
    date: ctx.date,
    n_journees: jours.length,
    condenses_repris: reprises,
    passe_globale_rejouee: Boolean(nouveau),
    arpentage_brut: mGet(orElse(mGet(etatScan, "arpentage", null), {}), "resultat", null),
    observations: mGet(etatScan, "observations", []) || [],
    non_retrouvees: mGet(etatScan, "non_retrouvees", []) || [],
    parametres: orElse(mGet(ctx.config, "scan_global", null), {}),
  });
  logOk(
    pyFormat(
      "Arpenteur : %d orpheline(s), %d continuité(s), %d graine(s) versée(s), %d suspicion(s) " +
        "non retrouvée(s), %d rejet(s) d'ancrage",
      resume.orphelines.length,
      resume.continuites.length,
      resume.graines_versees,
      resume.non_retrouvees,
      resume.rejets_ancrage,
    ),
  );
  return resume;
}
