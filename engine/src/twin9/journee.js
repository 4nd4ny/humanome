// Port de aurora/journee.py — cartographie d'UNE journée de portfolio,
// atomique (le temps long appartient à merge3). Parité bit-à-bit avec le
// Python en mode mock (spec-journee.md = contrat, journee.py = source de
// vérité).
//
//   1. TAGGING        : N lecteurs × 7 pôles (calques), caches injectables
//   2. ANCRAGE        : localisation verbatim des extraits (rejets comptés)
//   3. HEAT           : agrégation pondérée par caractère → segments
//   4. CONSENSUS      : corroborée / à instruire / minoritaire / non détectée
//   5. CONTRE-LECTURE : la convergence ne se publie pas sans contre-examen
//   6. TRIBUNAL       : TOUS les désaccords du juge léger (tribunal.js)
//   7. CARTO JOUR     : verdicts Schéma 1 + registre des suspicions
//
// Différences assumées avec journee.py (contrat spec-index §4.10 / spec §7.9) :
//   - PAS de ThreadPool : exécution SÉQUENTIELLE dans l'ordre des jobs
//     (tagging : roster × pôles ; juge léger : ordre de a_examiner). C'est
//     l'ordre déterministe que l'oracle canonicalise (équivaut à Python
//     max_workers=1) ;
//   - pas de fs : caches et carto passent par ctx.artefacts (store
//     injectable) ; le magasin de calques inter-runs est ctx.calquesStore
//     (mémoire par défaut : artefacts.js) ; les gabarits confidentiels par
//     ctx.protocole(relPath) (défaut "" — le mock ignore le prompt) ;
//   - l'horodatage des calques est injectable (ctx.horodatage() → ISO
//     secondes) pour neutraliser datetime.now() dans l'oracle ;
//   - les floats Python entiers (1.0) transitent en PyFloat (pyJson.js) :
//     l'hôte qui fournit roster/config depuis du JSON doit préserver la
//     distinction (poids 1.0 ≠ 1) pour les empreintes et les artefacts.
// Tous les index et longueurs sont en POINTS DE CODE.

import { ancrer, segments } from "./heatmap.js";
import { permutation } from "./referentiel.js";
import { resolveContent } from "./templates.js";
import {
  constituerDossier,
  infosPersonas,
  juger,
  parsePieces,
  typeRole,
  verdictDossierVide,
} from "./tribunal.js";
import {
  empreinte,
  extractJson,
  findVerbatim,
  log,
  logOk,
  logWarn,
  neutraliserBalises,
  stableHash,
} from "./util.js";
import { pjoin } from "./artefacts.js";
import {
  asNum,
  dictGet,
  entriesOf,
  hasKey,
  pyFloatOf,
  pyIntOf,
  pyTruthy,
  pyTupleCompare,
} from "./py/pyDict.js";
import { PyFloat, codePointCompare } from "./py/pyJson.js";
import { pySum } from "./py/pySum.js";
import { pyRound } from "./py/pyRound.js";
import { pyFormat, pyStr } from "./py/pyStr.js";
import { PY_WS_CLASS, cpLen, cpSlice, pySplitlines, pyStrip } from "./py/pyText.js";

export const SEUILS_CONSENSUS = {
  conf_min: 0.4,
  corrobore: 0.6,
  instruire: 0.25,
  instruire_min_modeles: 2,
  suspicion_min: 0.15,
}; // [CALIBRATION]

export const VERSION_PROTOCOLE = "v9.8-contre-lecture";

const W = PY_WS_CLASS;

/** str(e) Python d'une exception JS (message seul, comme str(Exception)). */
function strErr(e) {
  return e instanceof Error ? e.message : pyStr(e);
}

/** float(x) avec TypeError/ValueError → 0.5 (confiance des tags). */
function confOf(v) {
  try {
    return pyFloatOf(v);
  } catch {
    return 0.5;
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

/** isoformat(timespec="seconds") local, comme datetime.now() Python. */
function nowIsoSeconds() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
    "T" + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds())
  );
}

const RE_SPLIT_SENT = new RegExp("(?<=[.!?])[" + W + "]+");

/**
 * _sentences_de : phrases exploitables d'une journée → [[jid, phrase]].
 * @param {string} texte @param {string} jid @returns {[string, string][]}
 */
export function sentencesDe(texte, jid) {
  /** @type {[string, string][]} */
  const out = [];
  for (const rawLine of pySplitlines(texte)) {
    const line = pyStrip(rawLine);
    if (line.startsWith("#") || cpLen(line) < 60) continue;
    for (const part of line.split(RE_SPLIT_SENT)) {
      const s = pyStrip(part);
      const n = cpLen(s);
      if (n >= 60 && n <= 400) out.push([jid, s]);
    }
  }
  return out;
}

// ── 1. Tagging de la journée ──────────────────────────────────────────────────
/**
 * → [tags valides, alertes] ; [null, []] si la réponse est inexploitable
 * (l'échec est compté mais JAMAIS mis en cache).
 */
async function tagCall(ctx, backend, entry, pole, jr, inc) {
  // décorrélation des lecteurs : sections de la fiche dans un ordre propre
  const ordre = permutation(pole.competences.length, pyFormat("fiche|%s|P%d", entry.name, pole.num));
  const variables = {
    POLE_NUM: pole.num,
    POLE_NOM: pole.nom,
    JOURNEE: jr.id,
    POLE_FICHES: pole.ficheComplete(ordre),
    PORTFOLIO: neutraliserBalises(jr.texte),
  };
  const prompt = resolveContent(gabaritDe(ctx, "tagger/1-tag-pole.md"), variables);
  const meta = {
    pole: pole.num,
    codes: pole.competences.map((c) => [c.code, c.nom]),
    sentences: jr.sentences,
    journee: jr.id,
  };
  const raw = await backend.call(prompt, {
    model: dictGet(entry, "model", null),
    temperature: dictGet(entry, "temperature", 0.3),
    seed: dictGet(entry, "seed", null),
    task: "tagger",
    meta,
    label: pyFormat("tag_%s_%s_P%d", entry.name, jr.id, pole.num),
  });
  const data = extractJson(raw);
  const isDict = typeof data === "object" && data !== null && !Array.isArray(data);
  if (!isDict || !Array.isArray(/** @type {object} */ (data).tags)) {
    inc("tags_json_invalides");
    return [null, []];
  }
  const codesPole = new Set(pole.competences.map((c) => c.code));
  /** @type {object[]} */
  const valides = [];
  let ignores = 0;
  for (const t of /** @type {{tags: unknown[]}} */ (data).tags) {
    const tDict = typeof t === "object" && t !== null && !Array.isArray(t);
    if (!tDict || !codesPole.has(dictGet(/** @type {object} */ (t), "competence", null))) {
      ignores += 1;
      continue;
    }
    const extrait = dictGet(/** @type {object} */ (t), "extrait", null);
    if (typeof extrait !== "string" || !pyStrip(extrait)) {
      ignores += 1;
      continue;
    }
    const conf = confOf(dictGet(/** @type {object} */ (t), "confiance", 0.5));
    valides.push({
      competence: /** @type {object} */ (t).competence,
      extrait: pyStrip(extrait),
      confiance: new PyFloat(Math.max(0.0, Math.min(1.0, conf))),
      justification: cpSlice(pyStr(dictGet(/** @type {object} */ (t), "justification", "")), 0, 400),
    });
  }
  if (ignores) inc("tags_invalides_ignores", ignores);
  const rawAlertes = dictGet(/** @type {object} */ (data), "alertes", null);
  const alertes = Array.isArray(rawAlertes)
    ? rawAlertes.filter((a) => pyTruthy(a)).map((a) => cpSlice(pyStr(a), 0, 300))
    : [];
  return [valides, alertes];
}

/**
 * Chaque lecteur dépose sur son CALQUE : un fichier par (lecteur, pôle).
 * Séquentiel dans l'ordre des jobs (roster × pôles) — voir en-tête.
 * → [resultats: Map<name, tags[]>, alertes].
 */
async function tagging(ctx, jr, roster, backends, inc) {
  const jdir = pjoin(ctx.logs_dir, jr.id);
  const horodatage = ctx.horodatage ? ctx.horodatage() : nowIsoSeconds();
  const marqueRun = empreinte(ctx.base_dir).slice(0, 6);
  /** @type {Map<string, object[]>} */
  const resultats = new Map();
  for (const m of roster) resultats.set(m.name, []);
  /** @type {object[]} */
  const alertes = [];
  for (const entry of roster) {
    for (const pole of polesDe(ctx)) {
      const name = entry.name;
      const path = pjoin(jdir, pyFormat("tags_%s_P%d.json", name, pole.num));
      let tags;
      let al;
      if (ctx.artefacts.exists(path)) {
        const data = /** @type {object} */ (ctx.artefacts.readJson(path));
        tags = dictGet(data, "tags", []);
        al = dictGet(data, "alertes", []);
      } else {
        let res;
        try {
          res = await tagCall(ctx, backends[name], entry, pole, jr, inc);
        } catch (e) {
          inc("echec_appel_tagging");
          logWarn(
            pyFormat("Tagging %s P%d @%s : échec (%s) — 0 tag pour ce passage", name, pole.num, jr.id, strErr(e)),
          );
          res = null;
        }
        if (res === null) {
          tags = [];
          al = [];
        } else if (res[0] === null) {
          tags = []; // réponse inexploitable : pas de cache
          al = [];
        } else {
          [tags, al] = res;
          ctx.artefacts.writeJson(path, {
            calque_id: pyFormat("%s@%s.%s", name, horodatage, marqueRun),
            model: name,
            llm: dictGet(entry, "model", null),
            famille: dictGet(entry, "family", name.split("#")[0]),
            passe: dictGet(entry, "passe", null),
            poids: new PyFloat(pyFloatOf(dictGet(entry, "weight", new PyFloat(1)))),
            journee: jr.id,
            pole: pole.num,
            horodatage,
            tags,
            alertes: al,
            elagues: [],
          });
        }
      }
      /** @type {object[]} */ (resultats.get(name)).push(...tags);
      for (const a of al) alertes.push({ model: name, alerte: a });
    }
  }
  if (alertes.length) {
    inc("injection_signalee", alertes.length);
    logWarn(
      pyFormat("Journée %s : %d alerte(s) d'instructions embarquées dans le texte", jr.id, alertes.length),
    );
  }
  return [resultats, alertes];
}

// ── Calques : persistance, accumulation inter-exécutions, élagage ─────────────
function fichiersCalques(ctx, jdir) {
  return ctx.artefacts
    .list(jdir)
    .filter((fn) => fn.startsWith("tags_") && fn.endsWith(".json"))
    .sort(codePointCompare);
}

function idsCalquesLocaux(ctx, jdir) {
  /** @type {Set<string>} */
  const ids = new Set();
  for (const fn of fichiersCalques(ctx, jdir)) {
    try {
      const cid = dictGet(/** @type {object} */ (ctx.artefacts.readJson(pjoin(jdir, fn))), "calque_id", null);
      if (pyTruthy(cid)) ids.add(/** @type {string} */ (cid));
    } catch {
      /* lecture illisible : ignorée, comme en Python */
    }
  }
  return ids;
}

/**
 * Calques d'exécutions ANTÉRIEURES sur le même texte (empreinte identique).
 * @returns {object[]}
 */
function chargerCalquesArchives(ctx, jr, idsLocaux) {
  const cstore = ctx.calquesStore;
  const cfgCalques = dictGet(ctx.config, "calques", {});
  if (!pyTruthy(cstore) || !pyTruthy(dictGet(cfgCalques, "accumulation", true))) return [];
  const store = cstore.get(jr.id);
  if (store === null || store === undefined) return [];
  if (dictGet(/** @type {object} */ (store), "texte_empreinte", null) !== empreinte(jr.texte)) {
    return []; // texte modifié : les ancrages anciens sont caducs
  }
  let calques = /** @type {object[]} */ (dictGet(/** @type {object} */ (store), "calques", [])).filter(
    (c) => pyTruthy(dictGet(c, "id", null)) && !idsLocaux.has(c.id),
  );
  const cap = pyIntOf(dictGet(cfgCalques, "max_archives", 12));
  if (calques.length > cap) {
    // les plus récents d'abord — jamais silencieux (tri stable, reverse=True)
    calques = calques
      .slice()
      .sort((a, b) => codePointCompare(pyStr(pyTruthy(dictGet(b, "horodatage", null)) ? b.horodatage : ""),
        pyStr(pyTruthy(dictGet(a, "horodatage", null)) ? a.horodatage : "")));
    logWarn(pyFormat("Calques %s : %d archivés, plafonnés aux %d plus récents", jr.id, calques.length, cap));
    calques = calques.slice(0, cap);
  }
  return calques;
}

/**
 * Verse les calques de CE run au magasin persistant, groupés par lecteur.
 * → descripteurs des calques du run (triés par id).
 */
function persisterCalques(ctx, jr) {
  const jdir = pjoin(ctx.logs_dir, jr.id);
  /** @type {Map<string, object>} */
  const parCalque = new Map();
  for (const fn of fichiersCalques(ctx, jdir)) {
    const data = /** @type {object} */ (ctx.artefacts.readJson(pjoin(jdir, fn)));
    const cid = dictGet(data, "calque_id", null);
    if (!pyTruthy(cid)) continue;
    if (!parCalque.has(/** @type {string} */ (cid))) {
      parCalque.set(/** @type {string} */ (cid), {
        id: cid,
        lecteur: dictGet(data, "model", null),
        llm: dictGet(data, "llm", null),
        famille: dictGet(data, "famille", null),
        passe: dictGet(data, "passe", null),
        poids: dictGet(data, "poids", new PyFloat(1)),
        journee: jr.id,
        horodatage: dictGet(data, "horodatage", null),
        tags: [],
        elagues: [],
      });
    }
    const grp = /** @type {{tags: object[], elagues: object[]}} */ (parCalque.get(/** @type {string} */ (cid)));
    grp.tags.push(.../** @type {object[]} */ (dictGet(data, "tags", [])));
    grp.elagues.push(.../** @type {object[]} */ (dictGet(data, "elagues", [])));
  }
  const descripteurs = Array.from(parCalque.values()).map((c) => ({
    id: c.id,
    lecteur: c.lecteur,
    llm: c.llm,
    passe: c.passe,
    horodatage: c.horodatage,
    n_tags: c.tags.length,
    n_elagues: c.elagues.length,
    source: "run",
  }));
  const cstore = ctx.calquesStore;
  if (pyTruthy(cstore) && parCalque.size) {
    const eTexte = empreinte(jr.texte);
    let store = cstore.get(jr.id);
    if (store === null || store === undefined) {
      store = { journee: jr.id, texte_empreinte: eTexte, calques: [] };
    }
    if (dictGet(/** @type {object} */ (store), "texte_empreinte", null) !== eTexte) {
      logWarn(pyFormat("Calques %s : texte modifié — les calques antérieurs sont archivés caducs", jr.id));
      store = { journee: jr.id, texte_empreinte: eTexte, calques: [] };
    }
    const ids = new Set(
      /** @type {object[]} */ (/** @type {object} */ (store).calques).map((c) => dictGet(c, "id", null)),
    );
    const tries = Array.from(parCalque.entries()).sort((a, b) => codePointCompare(a[0], b[0]));
    for (const [cid, c] of tries) {
      if (!ids.has(cid)) /** @type {object[]} */ (/** @type {object} */ (store).calques).push(c);
    }
    cstore.set(jr.id, store);
  }
  return descripteurs.sort((a, b) => codePointCompare(a.id, b.id));
}

/**
 * Élagage LOCAL AU CALQUE : les tags d'un code rejeté par le jury sont
 * déplacés dans `elagues` (avec la marque du verdict), run courant seulement.
 */
function elaguerCalques(ctx, jr, rejetes, marque, inc) {
  const jdir = pjoin(ctx.logs_dir, jr.id);
  let n = 0;
  for (const fn of fichiersCalques(ctx, jdir)) {
    const path = pjoin(jdir, fn);
    const data = /** @type {object} */ (ctx.artefacts.readJson(path));
    /** @type {object[]} */
    const vivants = [];
    const elagues = /** @type {object[]} */ (dictGet(data, "elagues", []));
    let change = false;
    for (const t of /** @type {object[]} */ (dictGet(data, "tags", []))) {
      if (rejetes.has(dictGet(t, "competence", null))) {
        elagues.push({ ...t, juge: marque });
        change = true;
        n += 1;
      } else {
        vivants.push(t);
      }
    }
    if (change) {
      data.tags = vivants;
      data.elagues = elagues;
      ctx.artefacts.writeJson(path, data);
    }
  }
  if (n) inc("tags_elagues_apres_jury", n);
}

/**
 * La superposition des calques pour UNE compétence — le bloc que seul le
 * Greffier verra (max 10 lignes).
 * @param {{texte: string}} jr @param {{spans: object[], sous_seuil?: object[]}} c
 * @returns {string}
 */
export function blocCalques(jr, c) {
  /** @type {Set<string>} */
  const vus = new Set();
  /** @type {string[]} */
  const lignes = [];
  for (const sp of c.spans.concat(/** @type {object[]} */ (dictGet(c, "sous_seuil", [])))) {
    const k = sp.start + " " + sp.end + " " + sp.model;
    if (vus.has(k)) continue;
    vus.add(k);
    lignes.push(
      pyFormat(
        "- « %s » — calque %s, confiance %.2f",
        neutraliserBalises(cpSlice(cpSlice(jr.texte, sp.start, sp.end), 0, 240)),
        sp.model,
        asNum(sp.conf),
      ),
    );
    if (lignes.length >= 10) break;
  }
  return lignes.join("\n");
}

// ── 4. Consensus journalier (0 LLM) ───────────────────────────────────────────
/**
 * ⚠ roster = LECTEURS (roster du run + calques archivés fantômes).
 * → Map code → {statut, ratio, modeles, familles, span_partage, spans,
 * sous_seuil} dans l'ordre du référentiel.
 * @param {object[]} spans @param {object[]} segs @param {object[]} roster
 * @param {import("./referentiel.js").Pole[]} poles @param {object} seuils
 * @returns {Map<string, object>}
 */
export function consensus(spans, segs, roster, poles, seuils) {
  /** @type {Map<string, string>} */
  const familles = new Map();
  for (const m of roster) familles.set(m.name, /** @type {string} */ (dictGet(m, "family", m.name)));
  const n = roster.length || 1;
  /** @type {Map<string, object[]>} */
  const parComp = new Map();
  /** @type {Map<string, object[]>} */
  const sousSeuil = new Map();
  const confMin = asNum(seuils.conf_min);
  const suspicionMin = asNum(dictGet(seuils, "suspicion_min", 0.15));
  for (const sp of spans) {
    const conf = asNum(sp.conf);
    if (conf >= confMin) {
      if (!parComp.has(sp.code)) parComp.set(sp.code, []);
      /** @type {object[]} */ (parComp.get(sp.code)).push(sp);
    } else if (conf >= suspicionMin) {
      if (!sousSeuil.has(sp.code)) sousSeuil.set(sp.code, []);
      /** @type {object[]} */ (sousSeuil.get(sp.code)).push(sp); // jamais jeté : registre
    }
  }
  // span partagé = ≥ 2 modèles sur le MÊME code, sur des caractères communs
  /** @type {Map<string, boolean>} */
  const partages = new Map();
  for (const g of segs) {
    /** @type {Map<string, Set<string>>} */
    const parCode = new Map();
    for (const d of /** @type {object[]} */ (dictGet(g, "details", []))) {
      if (asNum(d.conf) >= confMin) {
        if (!parCode.has(d.code)) parCode.set(d.code, new Set());
        /** @type {Set<string>} */ (parCode.get(d.code)).add(d.model);
      }
    }
    for (const [code, mods] of parCode.entries()) {
      if (mods.size >= 2) partages.set(code, true);
    }
  }
  const minMod = pyIntOf(dictGet(seuils, "instruire_min_modeles", 2));
  // collège MONO-FAMILLE : la corroboration mesure la STABILITÉ (≥ 2 lectures)
  const monoFamille = new Set(familles.values()).size < 2;
  /** @type {Map<string, object>} */
  const out = new Map();
  for (const pole of poles) {
    for (const c of pole.competences) {
      const code = c.code;
      const sps = parComp.has(code) ? /** @type {object[]} */ (parComp.get(code)) : [];
      const modeles = Array.from(new Set(sps.map((sp) => sp.model))).sort(codePointCompare);
      const fams = Array.from(new Set(modeles.map((m) => /** @type {string} */ (familles.get(m))))).sort(
        codePointCompare,
      );
      const r = modeles.length / n;
      const diversiteOk = fams.length >= 2 || (monoFamille && modeles.length >= 2);
      let statut;
      if (r === 0) statut = "non détectée";
      else if (r >= asNum(seuils.corrobore) && diversiteOk && partages.get(code) === true) statut = "corroborée";
      else if (r >= asNum(seuils.instruire) && modeles.length >= minMod) statut = "à instruire";
      else statut = "minoritaire";
      out.set(code, {
        statut,
        ratio: new PyFloat(pyRound(r, 3)),
        modeles,
        familles: fams,
        span_partage: partages.get(code) === true,
        spans: sps.slice().sort((a, b) => asNum(b.conf) - asNum(a.conf)),
        sous_seuil: (sousSeuil.has(code) ? /** @type {object[]} */ (sousSeuil.get(code)) : [])
          .slice()
          .sort((a, b) => asNum(b.conf) - asNum(a.conf)),
      });
    }
  }
  return out;
}

// ── 2. Première impression (nourrit jurés et gardien) ────────────────────────
async function premiereImpression(ctx, jr, inc) {
  if (!pyTruthy(dictGet(ctx.config, "premiere_impression", true))) return null;
  const jdir = pjoin(ctx.journees_dir, jr.id);
  const path = pjoin(jdir, "10-premiere-impression.md");
  if (ctx.artefacts.exists(path)) return ctx.artefacts.readText(path);
  const [backendR, modeleR] = rapideDe(ctx);
  const prompt = resolveContent(gabaritDe(ctx, "lourd/10-premiere-impression.md"), {
    JOURNEE: jr.id,
    PORTFOLIO: neutraliserBalises(jr.texte),
  });
  let out;
  try {
    out = await backendR.call(prompt, {
      model: modeleR,
      task: "premiere_impression",
      meta: { journee: jr.id },
      label: pyFormat("lecteur_%s_impression", jr.id),
    });
  } catch (e) {
    inc("premiere_impression_echec");
    logWarn(pyFormat("Première impression %s indisponible (%s)", jr.id, strErr(e)));
    return null;
  }
  ctx.artefacts.writeText(path, out);
  return out;
}

const RE_AUTHENTICITE = new RegExp(
  "\\*\\*[" + W + "]*Indicateur[" + W + "]*\\*\\*[" + W + "]*:[" + W + "]*`?(habitée|mixte|produite)",
  "i",
);

/**
 * Indicateur d'authenticité de la première impression (habitée|mixte|produite).
 * @param {string|null|undefined} impression @returns {string|null}
 */
export function authenticiteDe(impression) {
  if (!pyTruthy(impression)) return null;
  const m = /** @type {string} */ (impression).match(RE_AUTHENTICITE);
  return m ? m[1].toLowerCase() : null;
}

/**
 * → [backend, modèle] de l'analyse RAPIDE : backend_rapide dédié si
 * configuré, sinon le backend du tribunal avec son model_mini.
 */
function rapideDe(ctx) {
  const [br, mr] = pyTruthy(ctx.rapide) ? ctx.rapide : [null, null];
  if (br !== null && br !== undefined) return [br, mr];
  const bk = dictGet(ctx.config, "backend_tribunal", {});
  const modelMini = dictGet(bk, "model_mini", null);
  return [ctx.backend_tribunal, pyTruthy(modelMini) ? modelMini : dictGet(bk, "model", null)];
}

// ── 5. Le juge léger v6, lancé N fois ─────────────────────────────────────────
const RE_LEGER_STATUT = new RegExp("\\*\\*[" + W + "]*Statut[" + W + "]*\\*\\*[" + W + "]*:[" + W + "]*([^\\n]+)", "i");
const RE_LEGER_PIECES = new RegExp("\\*\\*[" + W + "]*Pi[èe]ces[^*]*\\*\\*[" + W + "]*:[" + W + "]*([^\\n]+)", "i");
const RE_PIECE_NUM = new RegExp("\\bP[" + W + "]*(\\d+)\\b", "g");
const RE_LEGER_CONF = new RegExp(
  "\\*\\*[" + W + "]*Confiance[" + W + "]*\\*\\*[" + W + "]*:[" + W + "]*([01](?:[.,]\\d+)?)",
  "i",
);
const RE_MOTIF_VERDICT = new RegExp(
  "\\*\\*[" + W + "]*Motif du verdict[" + W + "]*\\*\\*[" + W + "]*:[" + W + "]*([^\\n]+)",
  "i",
);

/**
 * Contrat de sortie 20b/20c → {statut, pieces: [int], conf} — statut null si
 * illisible.
 * @param {string|null|undefined} texte
 * @returns {{statut: string|null, pieces: number[], conf: PyFloat}}
 */
export function parseLeger(texte) {
  let statut = null;
  const m = (texte || "").match(RE_LEGER_STATUT);
  if (m) {
    const raw = m[1].toLowerCase();
    if (raw.includes("renvoi")) statut = "renvoi au cartographe";
    else if (raw.includes("non établie") || raw.includes("non etablie")) statut = "présence non établie";
    else if (raw.includes("établie") || raw.includes("etablie")) statut = "présence établie";
  }
  const mp = (texte || "").match(RE_LEGER_PIECES);
  /** @type {number[]} */
  let pieces = [];
  if (mp) {
    /** @type {Set<number>} */
    const nums = new Set();
    RE_PIECE_NUM.lastIndex = 0;
    for (const mm of mp[1].matchAll(RE_PIECE_NUM)) nums.add(parseInt(mm[1], 10));
    pieces = Array.from(nums).sort((a, b) => a - b);
  }
  const mc = (texte || "").match(RE_LEGER_CONF);
  const conf = mc ? parseFloat(mc[1].replace(",", ".")) : 0.5;
  return { statut, pieces, conf: new PyFloat(Math.max(0.0, Math.min(1.0, conf))) };
}

/**
 * 20c — confirmation adversariale, AVEUGLE aux lectures du juge léger.
 * → {statut, pieces, conf, motif} | null si panne.
 */
async function contreLecture(ctx, jr, comp, dossier, tdir, nPasses, inc) {
  const code = comp.code;
  const nom = comp.nom;
  const [backendR, modeleR] = rapideDe(ctx);
  const path = pjoin(tdir, "20c-contre-lecture.md");
  let out;
  if (ctx.artefacts.exists(path)) {
    out = ctx.artefacts.readText(path);
  } else {
    const prompt = resolveContent(gabaritDe(ctx, "lourd/20c-contre-lecture.md"), {
      CODE: code,
      NOM: nom,
      PASSES: nPasses,
      COMPETENCE_FICHE: comp.fiche_md,
      DOSSIER: dossier,
    });
    try {
      out = await backendR.call(prompt, {
        model: modeleR,
        seed: stableHash(pyFormat("contre|%s|%s", jr.id, code)) % (2 ** 31 - 1),
        task: "contre_lecture",
        meta: { code, nom },
        label: pyFormat("contre-lecture_%s_%s", jr.id, code),
      });
    } catch (e) {
      inc("contre_lecture_echec");
      logWarn(pyFormat("Contre-lecture %s@%s indisponible (%s) → tribunal", code, jr.id, strErr(e)));
      return null;
    }
    ctx.artefacts.writeText(path, out);
  }
  const cl = /** @type {object} */ (parseLeger(out));
  const m = (out || "").match(RE_MOTIF_VERDICT);
  cl.motif = m ? pyStrip(m[1]) : null;
  if (cl.statut === null) inc("contre_lecture_illisible");
  return cl;
}

const RE_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/;

/**
 * Greffier stigmergique + juge léger v6 ×N + RÉSOLUTION MÉCANIQUE.
 * → [verdict Schéma 1 | null si tribunal, détail].
 */
export async function jugerLeger(ctx, jr, pole, comp, consEntry, inc) {
  const code = comp.code;
  const nom = comp.nom;
  const cfg = dictGet(ctx.config, "juge_leger", {});
  const nPasses = Math.max(1, pyIntOf(dictGet(cfg, "passes", 3)));
  const tdir = pjoin(ctx.journees_dir, jr.id, "tribunal", code);
  let dossier;
  let vide;
  try {
    [dossier, vide] = await constituerDossier(
      ctx.backend_tribunal,
      ctx,
      tdir,
      pole,
      comp,
      jr,
      ctx.config,
      jr.sentences,
      { rapide: rapideDe(ctx), calques: blocCalques(jr, consEntry) },
    );
  } catch (e) {
    inc("greffier_echec");
    logWarn(pyFormat("Greffier %s@%s indisponible (%s) → tribunal", code, jr.id, strErr(e)));
    return [null, { erreur: pyFormat("greffier : %s", strErr(e)) }];
  }
  if (vide) return [verdictDossierVide(code, nom, dossier), { dossier_vide: true }];

  /** @type {object[]} */
  const lectures = [];
  for (let k = 1; k <= nPasses; k++) {
    const path = pjoin(tdir, pyFormat("20b-leger-%d.md", k));
    let out;
    if (ctx.artefacts.exists(path)) {
      out = ctx.artefacts.readText(path);
    } else {
      const [backendR, modeleR] = rapideDe(ctx);
      const prompt = resolveContent(gabaritDe(ctx, "lourd/20b-juge-leger.md"), {
        CODE: code,
        NOM: nom,
        PASSE: k,
        PASSES: nPasses,
        COMPETENCE_FICHE: comp.fiche_md,
        DOSSIER: dossier,
      });
      try {
        out = await backendR.call(prompt, {
          model: modeleR,
          seed: stableHash(pyFormat("leger|%s|%s|%d", jr.id, code, k)) % (2 ** 31 - 1),
          task: "leger",
          meta: { code, nom, passe: k },
          label: pyFormat("leger_%s_%s_p%d", jr.id, code, k),
        });
      } catch (e) {
        inc("leger_echec");
        logWarn(pyFormat("Juge léger %s@%s p%d indisponible (%s) → tribunal", code, jr.id, k, strErr(e)));
        return [null, { erreur: pyFormat("léger p%d : %s", k, strErr(e)) }];
      }
      ctx.artefacts.writeText(path, out);
    }
    const lecture = parseLeger(out);
    if (lecture.statut === null) {
      inc("leger_illisible");
      return [null, { lectures, resolution: pyFormat("lecture %d illisible → tribunal", k) }];
    }
    lectures.push(lecture);
  }

  /** @type {Record<string, unknown>} */
  const detail = { lectures };
  const statuts = new Set(lectures.map((le) => /** @type {string} */ (le.statut)));
  /** @type {Map<number, object>} */
  const piecesGreffier = new Map();
  for (const p of parsePieces(dossier)) piecesGreffier.set(p.num, p);

  if (statuts.size === 1 && statuts.has("présence établie")) {
    // des pièces, ça se compte : communes à ≥ 2 lectures, ré-ancrées
    /** @type {Map<number, number>} */
    const compte = new Map();
    for (const le of lectures) {
      for (const p of new Set(/** @type {number[]} */ (le.pieces))) {
        compte.set(p, (compte.get(p) || 0) + 1);
      }
    }
    const seuilCommun = nPasses >= 2 ? 2 : 1;
    /** @type {object[]} */
    const traces = [];
    const nums = Array.from(compte.entries())
      .filter(([num, cpt]) => cpt >= seuilCommun && piecesGreffier.has(num))
      .map(([num]) => num)
      .sort((a, b) => a - b);
    for (const num of nums) {
      const p = /** @type {object} */ (piecesGreffier.get(num));
      const [tType, role] = typeRole(p.type);
      if (tType === null) continue; // pièce non probante
      const loc = findVerbatim(jr.texte, p.extrait);
      if (loc === null) {
        inc("trace_leger_non_ancree");
        continue;
      }
      const [s0, e0] = loc;
      traces.push({
        piece: num,
        extrait: cpSlice(cpSlice(jr.texte, s0, e0), 0, 400),
        date:
          pyTruthy(dictGet(p, "date", null)) && RE_DATE_PREFIX.test(pyStr(p.date))
            ? pyStr(p.date)
            : pyTruthy(dictGet(jr, "date", null))
              ? jr.date
              : jr.id,
        type: tType,
        role,
      });
      if (traces.length >= 5) break;
    }
    const sp = traces.filter((t) => t.role === "preuve décisive").length;
    const si = traces.length - sp;
    if (!(sp >= 1 || si >= 2)) {
      // garde-fou du barème : concordance sans pièces → tribunal
      detail.resolution = "concordance sans pièces communes ancrables → tribunal";
      return [null, detail];
    }
    let cl = null;
    if (pyTruthy(dictGet(cfg, "contre_lecture", false))) {
      // dernière épreuve avant publication — après le barème (gratuit d'abord)
      cl = await contreLecture(ctx, jr, comp, dossier, tdir, nPasses, inc);
      detail.contre_lecture = cl;
      if (cl === null || cl.statut === null) {
        detail.resolution = "contre-lecture indisponible ou illisible → tribunal";
        return [null, detail];
      }
      if (cl.statut !== "présence établie") {
        detail.ecarte_cl = traces.length ? traces[0].extrait : null;
        detail.resolution = pyFormat(
          "la convergence (%d lectures) n'a pas résisté à la contre-lecture → tribunal",
          nPasses,
        );
        return [null, detail];
      }
    }
    // sum() CPython ≥ 3.12 : sommation compensée (pySum)
    const confMoy = pySum(lectures.map((le) => asNum(le.conf))) / lectures.length;
    const confiance = pyRound(Math.min(0.9, 0.5 + 0.1 * Math.min(traces.length, 3) + 0.1 * confMoy), 3);
    detail.resolution = pyFormat(
      "%d lectures concordantes%s, %d pièce(s) commune(s) ancrée(s)",
      nPasses,
      cl ? " + contre-lecture" : "",
      traces.length,
    );
    const verdict = {
      code,
      nom,
      dossier_vide: false,
      statut: "présence établie",
      score_preuves: sp,
      score_indices: si,
      confiance: new PyFloat(confiance),
      jury: null,
      traces_probantes: traces,
      prescription: {
        pour_apprenant: pyFormat(
          "Cette journée atteste la compétence : %d lectures rapides indépendantes concordent " +
            "sur les mêmes pièces%s. Pour consolider, une piste serait de documenter une nouvelle situation.",
          nPasses,
          cl ? ", et la contre-lecture les confirme" : "",
        ),
        pour_cartographe: null,
      },
      gardien: null,
      etage: pyFormat("leger-v6x%d%s", nPasses, cl ? "+cl" : ""),
      leger: detail,
    };
    return [verdict, detail];
  }

  if (statuts.size === 1 && statuts.has("présence non établie")) {
    /** @type {Set<number>} */
    const citesSet = new Set();
    for (const le of lectures) {
      for (const p of /** @type {number[]} */ (le.pieces)) {
        if (piecesGreffier.has(p)) citesSet.add(p);
      }
    }
    const cites = Array.from(citesSet).sort((a, b) => a - b);
    detail.ecartes = cites.slice(0, 2).map((num) =>
      cpSlice(/** @type {object} */ (piecesGreffier.get(num)).extrait, 0, 300),
    );
    detail.resolution = pyFormat("%d lectures concordantes : non établie", nPasses);
    const confMoy = pySum(lectures.map((le) => asNum(le.conf))) / lectures.length;
    const verdict = {
      code,
      nom,
      dossier_vide: false,
      statut: "présence non établie",
      score_preuves: 0,
      score_indices: 0,
      confiance: new PyFloat(pyRound(Math.min(0.95, 0.6 + 0.15 * confMoy), 3)),
      jury: null,
      traces_probantes: [],
      prescription: {
        pour_apprenant: pyFormat(
          "Ce dossier ne contient pas encore de pièce établie pour %s (examiné par %d lectures indépendantes).",
          nom,
          nPasses,
        ),
        pour_cartographe: null,
      },
      gardien: null,
      etage: pyFormat("leger-v6x%d", nPasses),
      leger: detail,
    };
    return [verdict, detail];
  }

  detail.resolution = pyFormat(
    "désaccord entre lectures (%s) → tribunal",
    Array.from(statuts).sort(codePointCompare).join(" / "),
  );
  return [null, detail];
}

// ── 6. Verdicts journaliers Schéma 1 ─────────────────────────────────────────
/**
 * Verdict 0 LLM pour une compétence non instruite (minoritaire/non détectée).
 * @param {string} code @param {string} nom
 * @param {{statut: string, ratio: unknown, modeles: string[], spans: object[]}} cons
 * @returns {object}
 */
export function verdictAbsent(code, nom, cons) {
  const minoritaire = cons.statut === "minoritaire";
  return {
    code,
    nom,
    dossier_vide: !pyTruthy(cons.spans),
    statut: "présence non établie",
    score_preuves: 0,
    score_indices: 0,
    confiance: !pyTruthy(cons.spans) ? new PyFloat(1) : new PyFloat(pyRound(1.0 - asNum(cons.ratio), 3)),
    jury: null,
    traces_probantes: [],
    prescription: {
      pour_apprenant: pyFormat("Cette journée ne contient pas encore de trace établie pour %s.", nom),
      pour_cartographe: minoritaire
        ? pyFormat("Détection minoritaire (%s) — versée au registre des graines.", cons.modeles.join(", "))
        : null,
    },
    gardien: null,
    etage: minoritaire ? "minoritaire" : "non-détectée",
  };
}

// ── Registre des suspicions : rien ne se perd (mémoire §2) ────────────────────
const QUESTIONS = {
  "sous-seuil": "Un lecteur a cru voir %s ici, sans certitude — as-tu remarqué ce passage ?",
  minoritaire: "As-tu remarqué que cette journée revient sur ceci ?",
  "leger-ecarte": "Trois lectures rapides ont examiné ceci sans le retenir — le fil reste ouvert.",
  "contre-lecture": "La convergence n'a pas résisté au contre-examen — qu'en dis-tu ?",
  "contestation-jury": "Un juré y a vu un piège — la trace mérite un échange.",
  "detection-jury": "Un juré y a vu quelque chose que les autres n'ont pas confirmé.",
  renvoi: "Le tribunal n'a pas tranché — dossier préparé pour l'enseignant.",
  "support-masque": "Le format écrit masque peut-être cette compétence — à chercher autrement.",
  "scan-global":
    "La lecture du portfolio entier a relié ceci que le découpage en journées avait dispersé — qu'en dis-tu ?",
};

/**
 * Une entrée du registre des suspicions (aussi consommée par scan9, étape 6).
 * @param {string} code @param {string} nom @param {{id: string, date?: unknown}} jr
 * @param {string} source @param {string|null} [extrait] @param {unknown} [detail]
 * @returns {object}
 */
export function suspicion(code, nom, jr, source, extrait = null, detail = null) {
  let q = hasKey(QUESTIONS, source) ? QUESTIONS[source] : "Signal conservé pour le temps long.";
  if (q.includes("%s")) q = pyFormat(q, nom);
  const ext = cpSlice(pyTruthy(extrait) ? /** @type {string} */ (extrait) : "", 0, 300);
  return {
    code,
    nom,
    journee: jr.id,
    date: dictGet(jr, "date", null),
    source,
    detail,
    extrait: ext || null,
    question: q,
  };
}

// ── Pipeline journée ──────────────────────────────────────────────────────────
/**
 * Empreinte du contexte d'analyse d'une journée : texte, roster, seuils,
 * contre-lecture, version du protocole (clé de reprise).
 * @param {{texte: string}} jr @param {object[]} roster @param {object} config
 * @returns {string}
 */
export function empreinteJournee(jr, roster, config) {
  const seuils = { ...SEUILS_CONSENSUS, ...(/** @type {object} */ (dictGet(config, "seuils_consensus", {}))) };
  const bt = dictGet(config, "backend_tribunal", {});
  const brRaw = dictGet(config, "backend_rapide", null);
  const br = pyTruthy(brRaw) ? brRaw : {};
  const jl = dictGet(config, "juge_leger", {});
  const tuples = roster.map((m) => [
    m.name,
    dictGet(m, "model", null),
    dictGet(m, "family", null),
    dictGet(m, "weight", new PyFloat(1)),
    dictGet(m, "kind", null),
  ]);
  tuples.sort(pyTupleCompare);
  return empreinte(
    jr.texte,
    tuples,
    [dictGet(bt, "kind", null), dictGet(bt, "model", null), dictGet(bt, "model_mini", null)],
    [dictGet(br, "kind", null), dictGet(br, "model", null)],
    seuils,
    [pyIntOf(dictGet(jl, "passes", 3)), pyTruthy(dictGet(jl, "contre_lecture", false))],
    dictGet(config, "jury", {}),
    infosPersonas(),
    pyTruthy(dictGet(config, "premiere_impression", true)),
    VERSION_PROTOCOLE,
  );
}

/**
 * Cartographie complète d'une journée. ctx (voir en-tête pour les
 * divergences) : {config, poles, artefacts, protocole?, calquesStore?,
 * logs_dir, journees_dir, base_dir, backend_tribunal, rapide?, incidents,
 * ancrage_stats?, horodatage?}.
 * @param {object} ctx
 * @param {{id: string, date?: string|null, titre?: string|null, texte: string}} jr
 * @param {object[]} roster @param {Record<string, object>} backends
 * @returns {Promise<object>}
 */
export async function cartographierJournee(ctx, jr, roster, backends) {
  const seuils = { ...SEUILS_CONSENSUS, ...(/** @type {object} */ (dictGet(ctx.config, "seuils_consensus", {}))) };
  const jdir = pjoin(ctx.journees_dir, jr.id);
  // calques archivés (exécutions antérieures, texte identique) : ils
  // rejoignent la superposition — l'empreinte de reprise en tient compte
  const archives = chargerCalquesArchives(ctx, jr, idsCalquesLocaux(ctx, jdir));
  const fp = empreinte(
    empreinteJournee(jr, roster, ctx.config),
    archives.map((c) => /** @type {string} */ (c.id)).sort(codePointCompare),
  );
  const cartoPath = pjoin(jdir, "carto_jour.json");
  if (ctx.artefacts.exists(cartoPath)) {
    const carto = /** @type {object} */ (ctx.artefacts.readJson(cartoPath));
    if (dictGet(carto, "empreinte", null) === fp) {
      log(pyFormat("Journée %s : déjà cartographiée (reprise, empreinte identique)", jr.id));
      rehydrater(ctx, carto);
      return carto;
    }
    logWarn(pyFormat("Journée %s : artefact d'un autre contexte (texte/roster/seuils) — recalcul", jr.id));
  }

  const jrX = { ...jr, sentences: sentencesDe(jr.texte, jr.id) };
  /** @type {Record<string, number>} */
  const dayInc = {};
  const inc = (k, n = 1) => {
    dayInc[k] = (dayInc[k] || 0) + n;
  };

  const impression = await premiereImpression(ctx, jrX, inc);
  const authenticite = authenticiteDe(impression);
  const [tags, alertes] = await tagging(ctx, jrX, roster, backends, inc);
  // la superposition = calques de CE run + calques archivés (lecteurs
  // fantômes : leurs dépôts comptent, aucun appel LLM)
  const lecteurs = Array.from(roster);
  for (const cal of archives) {
    lecteurs.push({
      name: cal.id,
      family: pyTruthy(dictGet(cal, "famille", null)) ? cal.famille : cal.id,
      weight: new PyFloat(pyFloatOf(dictGet(cal, "poids", new PyFloat(1)))),
      model: dictGet(cal, "llm", null),
      archive: true,
    });
    const calTags = dictGet(cal, "tags", null);
    tags.set(cal.id, Array.from(pyTruthy(calTags) ? /** @type {object[]} */ (calTags) : []));
  }
  if (archives.length) {
    log(
      pyFormat(
        "Journée %s : %d calque(s) archivé(s) rejoignent la superposition (stigmergie inter-exécutions)",
        jr.id,
        archives.length,
      ),
    );
  }
  let [spans, rejets] = ancrer(jrX.texte, tags, lecteurs);
  /** @type {Map<string, {ancres: number, rejets: number}>} */
  const statsJour = new Map();
  for (const sp of spans) {
    if (!statsJour.has(sp.model)) statsJour.set(sp.model, { ancres: 0, rejets: 0 });
    /** @type {{ancres: number}} */ (statsJour.get(sp.model)).ancres += 1;
  }
  for (const rj of rejets) {
    if (!statsJour.has(rj.model)) statsJour.set(rj.model, { ancres: 0, rejets: 0 });
    /** @type {{rejets: number}} */ (statsJour.get(rj.model)).rejets += 1;
  }
  // sum() CPython ≥ 3.12 : sommation compensée (pySum)
  const poidsTotal = pySum(lecteurs.map((m) => pyFloatOf(dictGet(m, "weight", new PyFloat(1)))));
  let segs = segments(jrX.texte, spans, poidsTotal);
  const cons = consensus(spans, segs, lecteurs, polesDe(ctx), seuils);

  // 5. INSTRUCTION RAPIDE : greffier + juge léger ×N pour chaque compétence à
  // signal — AUCUN PLAFOND, l'économie vient du routage, pas du champ
  /** @type {Map<string, object>} */
  const compParCode = new Map();
  /** @type {Map<string, object>} */
  const poleParCode = new Map();
  for (const p of polesDe(ctx)) {
    for (const c of p.competences) {
      compParCode.set(c.code, c);
      poleParCode.set(c.code, p);
    }
  }
  const aExaminer = Array.from(cons.entries())
    .filter(([, v]) => v.statut === "corroborée" || v.statut === "à instruire")
    .map(([c]) => c)
    .sort((a, b) => asNum(/** @type {object} */ (cons.get(b)).ratio) - asNum(/** @type {object} */ (cons.get(a)).ratio));
  /** @type {Map<string, object>} */
  const verdictsLeger = new Map();
  /** @type {Map<string, object>} */
  const detailsLeger = new Map();
  /** @type {string[]} */
  const auTribunal = [];
  for (const c of aExaminer) {
    // séquentiel dans l'ordre de a_examiner (ordre déterministe des jobs)
    const [v, d] = await jugerLeger(ctx, jrX, poleParCode.get(c), compParCode.get(c), cons.get(c), inc);
    detailsLeger.set(c, d);
    if (v === null) auTribunal.push(c);
    else verdictsLeger.set(c, v);
  }

  // 6. tribunal : TOUS les désaccords du juge léger, par ratio décroissant
  auTribunal.sort(
    (a, b) => asNum(/** @type {object} */ (cons.get(b)).ratio) - asNum(/** @type {object} */ (cons.get(a)).ratio),
  );
  const instruits = new Set(auTribunal);

  /** @type {Map<string, object>} */
  const verdicts = new Map();
  /** @type {object[]} */
  const suspicions = [];
  for (const pole of polesDe(ctx)) {
    for (const comp of pole.competences) {
      const code = comp.code;
      const c = /** @type {object} */ (cons.get(code));
      if (verdictsLeger.has(code)) {
        verdicts.set(code, verdictsLeger.get(code));
      } else if (instruits.has(code)) {
        const tdir = pjoin(ctx.journees_dir, jrX.id, "tribunal", code);
        const verdict = await juger(ctx.backend_tribunal, ctx, tdir, pole, comp, jrX, ctx.config, jrX.sentences, dayInc, {
          premiereImpression: impression,
          rapide: rapideDe(ctx),
          calques: blocCalques(jrX, c),
          authenticite,
        });
        verdicts.set(code, verdict);
        const vTraces = dictGet(verdict, "traces_probantes", null);
        for (const t of pyTruthy(vTraces) ? /** @type {object[]} */ (vTraces) : []) {
          if (!hasKey(t, "date")) t.date = pyTruthy(dictGet(jrX, "date", null)) ? jrX.date : jrX.id;
        }
      } else {
        verdicts.set(code, verdictAbsent(code, comp.nom, c));
      }

      // — registre des suspicions : tout ce qui n'est pas publié est conservé —
      const dl = detailsLeger.has(code) ? /** @type {object} */ (detailsLeger.get(code)) : {};
      const ecartes = dictGet(dl, "ecartes", null);
      for (const ext of pyTruthy(ecartes) ? /** @type {string[]} */ (ecartes) : []) {
        suspicions.push(suspicion(code, comp.nom, jrX, "leger-ecarte", ext));
      }
      const clv = dictGet(dl, "contre_lecture", null);
      if (pyTruthy(clv) && dictGet(/** @type {object} */ (clv), "statut", null) !== null &&
        dictGet(/** @type {object} */ (clv), "statut", null) !== "présence établie") {
        suspicions.push(
          suspicion(code, comp.nom, jrX, "contre-lecture", /** @type {string|null} */ (dictGet(dl, "ecarte_cl", null)),
            dictGet(/** @type {object} */ (clv), "motif", null)),
        );
      }
      if (c.statut === "minoritaire") {
        for (const sp of /** @type {object[]} */ (c.spans).slice(0, 2)) {
          suspicions.push(
            suspicion(code, comp.nom, jrX, "minoritaire", cpSlice(jrX.texte, sp.start, sp.end), sp.model),
          );
        }
      }
      for (const sp of /** @type {object[]} */ (dictGet(c, "sous_seuil", [])).slice(0, 2)) {
        if (/** @type {object} */ (verdicts.get(code)).statut !== "présence établie") {
          suspicions.push(
            suspicion(code, comp.nom, jrX, "sous-seuil", cpSlice(jrX.texte, sp.start, sp.end),
              pyFormat("%s @%.2f", sp.model, asNum(sp.conf))),
          );
        }
      }
      const v = /** @type {object} */ (verdicts.get(code));
      const juryRaw = dictGet(v, "jury", null);
      const jury = pyTruthy(juryRaw) ? /** @type {object} */ (juryRaw) : {};
      if (pyTruthy(jury)) {
        for (const j of /** @type {string[]} */ (dictGet(jury, "contestations", []))) {
          const pieges = dictGet(jury, "pieges_nommes", null);
          suspicions.push(
            suspicion(code, comp.nom, jrX, "contestation-jury", null,
              pyFormat("%s — piège : %s", j, (pyTruthy(pieges) ? /** @type {string[]} */ (pieges) : ["?"])[0])),
          );
        }
        if (v.statut !== "présence établie") {
          for (const j of /** @type {string[]} */ (dictGet(jury, "detections", []))) {
            const dcRaw = dictGet(v, "dossier_cartographe", null);
            const dc = pyTruthy(dcRaw) ? /** @type {object} */ (dcRaw) : {};
            const citations = dictGet(dc, "citations", null);
            const cit = (pyTruthy(citations) ? /** @type {unknown[]} */ (citations) : [null])[0];
            suspicions.push(suspicion(code, comp.nom, jrX, "detection-jury", /** @type {string|null} */ (cit), j));
          }
        }
      }
      const gardienRaw = dictGet(v, "gardien", null);
      const gardien = pyTruthy(gardienRaw) ? /** @type {object} */ (gardienRaw) : {};
      const support = /** @type {object} */ (dictGet(gardien, "support", {}));
      if (dictGet(support, "constat", null) === "masque") {
        suspicions.push(suspicion(code, comp.nom, jrX, "support-masque"));
      }
      if (v.statut === "renvoi au cartographe" && dictGet(v, "etage", null) === "tribunal") {
        const dcRaw = dictGet(v, "dossier_cartographe", null);
        const dc = pyTruthy(dcRaw) ? /** @type {object} */ (dcRaw) : {};
        const citations = dictGet(dc, "citations", null);
        suspicions.push(
          suspicion(code, comp.nom, jrX, "renvoi",
            /** @type {string|null} */ ((pyTruthy(citations) ? /** @type {unknown[]} */ (citations) : [null])[0]),
            dictGet(dc, "motif", null)),
        );
      }
    }
  }

  // — Déclassement stigmergique : les marques du jour des codes rejetés PAR
  // TRIBUNAL sont retirées de la heat opératoire ; suspicions marquées
  // « jugées » ; calques du run élagués —
  /** @type {Set<string>} */
  const rejetesJury = new Set();
  for (const [codeV, v] of verdicts.entries()) {
    if (
      dictGet(v, "statut", null) === "présence non établie" &&
      (dictGet(v, "etage", null) === "tribunal" || dictGet(v, "etage", null) === "tribunal-court-circuit")
    ) {
      rejetesJury.add(codeV);
    }
  }
  /** @type {object[]} */
  let spansEcartes = [];
  if (rejetesJury.size) {
    spansEcartes = spans
      .filter((sp) => rejetesJury.has(sp.code))
      .map((sp) => ({ model: sp.model, code: sp.code, start: sp.start, end: sp.end, conf: sp.conf }));
    if (spansEcartes.length) {
      spans = spans.filter((sp) => !rejetesJury.has(sp.code));
      segs = segments(jrX.texte, spans, poidsTotal);
      inc("spans_declasses_apres_jury", spansEcartes.length);
    }
    const marque = pyFormat(
      "tribunal du %s : non retenue",
      pyTruthy(dictGet(jrX, "date", null)) ? jrX.date : jrX.id,
    );
    for (const s of suspicions) {
      if (rejetesJury.has(s.code)) s.jugee = marque;
    }
    // élagage local au calque : seuls les dépôts de CE run sont retirés
    elaguerCalques(ctx, jrX, rejetesJury, marque, inc);
  }

  // métadonnées de la heat map : la VOIE et le JURY par compétence instruite
  /** @type {Map<string, object>} */
  const validations = new Map();
  for (const [code, v] of verdicts.entries()) {
    const etage = pyStr(dictGet(v, "etage", ""));
    if (etage.startsWith("leger") || etage.startsWith("tribunal")) {
      const jyRaw = dictGet(v, "jury", null);
      const jy = pyTruthy(jyRaw) ? /** @type {object} */ (jyRaw) : {};
      const legerRaw = dictGet(v, "leger", null);
      const lectures = dictGet(pyTruthy(legerRaw) ? /** @type {object} */ (legerRaw) : {}, "lectures", null);
      const nLectures = (pyTruthy(lectures) ? /** @type {object[]} */ (lectures) : []).length;
      const tracesRaw = dictGet(v, "traces_probantes", null);
      validations.set(code, {
        statut: v.statut,
        voie: etage,
        jury: dictGet(jy, "composition", null),
        jury_mode: dictGet(jy, "mode", null),
        lectures_leger: nLectures || null, // 0 → null (len(...) or None)
        n_traces: (pyTruthy(tracesRaw) ? /** @type {object[]} */ (tracesRaw) : []).length,
      });
    }
  }

  const descCalques = persisterCalques(ctx, jrX);
  for (const c of archives) {
    descCalques.push({
      id: c.id,
      lecteur: dictGet(c, "lecteur", null),
      llm: dictGet(c, "llm", null),
      passe: dictGet(c, "passe", null),
      horodatage: dictGet(c, "horodatage", null),
      n_tags: (pyTruthy(dictGet(c, "tags", null)) ? /** @type {object[]} */ (c.tags) : []).length,
      source: "archive", // ⚠ pas de n_elagues pour les archives
    });
  }

  /** @type {Map<string, object>} */
  const consProjection = new Map();
  for (const [codeC, v] of cons.entries()) {
    consProjection.set(codeC, {
      statut: v.statut,
      ratio: v.ratio,
      modeles: v.modeles,
      span_partage: v.span_partage,
    });
  }
  const juryCfgRaw = dictGet(ctx.config, "jury", null);
  const carto = {
    journee: jrX.id,
    date: dictGet(jrX, "date", null),
    titre: dictGet(jrX, "titre", null),
    n_caracteres: cpLen(jrX.texte),
    empreinte: fp,
    premiere_impression: impression,
    authenticite,
    spans_ecartes: spansEcartes,
    calques: descCalques,
    validations,
    jury_mode: pyStr(dictGet(pyTruthy(juryCfgRaw) ? /** @type {object} */ (juryCfgRaw) : {}, "mode", "socle4+1")),
    personas: infosPersonas(),
    verdicts,
    consensus: consProjection,
    legers: detailsLeger,
    segments: segs,
    rejets,
    graines: suspicions,
    alertes_injection: alertes,
    ancrage_stats_jour: statsJour,
    incidents_jour: dayInc,
    etablies: Array.from(verdicts.entries())
      .filter(([, v]) => v.statut === "présence établie")
      .map(([codeV]) => codeV)
      .sort(codePointCompare),
    renvois: Array.from(verdicts.entries())
      .filter(([, v]) => v.statut === "renvoi au cartographe")
      .map(([codeV]) => codeV)
      .sort(codePointCompare),
  };
  ctx.artefacts.writeJson(cartoPath, carto);
  rehydrater(ctx, carto);
  let parLeger = 0;
  let parTribunal = 0;
  for (const v of verdicts.values()) {
    const etage = pyStr(dictGet(v, "etage", ""));
    if (etage.startsWith("leger") && v.statut === "présence établie") parLeger++;
    if (dictGet(v, "etage", null) === "tribunal" && v.statut === "présence établie") parTribunal++;
  }
  logOk(
    pyFormat(
      "Journée %s : %d dossiers examinés — %d établies (%d par juge léger, %d par tribunal), " +
        "%d désaccords instruits, %d renvois, %d suspicions au registre",
      jrX.id,
      aExaminer.length,
      carto.etablies.length,
      parLeger,
      parTribunal,
      instruits.size,
      carto.renvois.length,
      suspicions.length,
    ),
  );
  return carto;
}

/**
 * Reverse les statistiques de la journée dans le contexte du run (y compris
 * à la reprise). ctx.ancrage_stats est une Map (créée au besoin) ;
 * ctx.incidents est un objet ou une Map fourni par l'appelant.
 * @param {object} ctx @param {object} carto
 */
export function rehydrater(ctx, carto) {
  if (ctx.ancrage_stats === undefined || ctx.ancrage_stats === null) ctx.ancrage_stats = new Map();
  const stats = ctx.ancrage_stats; // Map ou objet simple, muté EN PLACE (setdefault)
  const statsRaw = dictGet(carto, "ancrage_stats_jour", null);
  for (const [m, st] of entriesOf(pyTruthy(statsRaw) ? statsRaw : {})) {
    /** @type {{ancres: number, rejets: number}} */
    let g;
    if (stats instanceof Map) {
      if (!stats.has(m)) stats.set(m, { ancres: 0, rejets: 0 });
      g = stats.get(m);
    } else {
      const key = /** @type {string} */ (m);
      if (!Object.prototype.hasOwnProperty.call(stats, key)) stats[key] = { ancres: 0, rejets: 0 };
      g = stats[key];
    }
    g.ancres += /** @type {number} */ (dictGet(/** @type {object} */ (st), "ancres", 0));
    g.rejets += /** @type {number} */ (dictGet(/** @type {object} */ (st), "rejets", 0));
  }
  const incRaw = dictGet(carto, "incidents_jour", null);
  for (const [k, v] of entriesOf(pyTruthy(incRaw) ? incRaw : {})) {
    if (ctx.incidents instanceof Map) {
      ctx.incidents.set(k, (ctx.incidents.get(k) || 0) + /** @type {number} */ (v));
    } else {
      ctx.incidents[/** @type {string} */ (k)] =
        (ctx.incidents[/** @type {string} */ (k)] || 0) + /** @type {number} */ (v);
    }
  }
}
