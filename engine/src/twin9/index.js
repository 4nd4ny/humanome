// Port de twin9.py `executer()` — l'ORCHESTRATEUR du pipeline Twin_v9.
// Enchaîne les modules du package dans l'ordre STRICT de twin9.py, SANS
// argparse, SANS système de fichiers et SANS API Node : le moteur tourne en
// navigateur. Parité bit-à-bit avec le mode mock Python (spec-contrats.md §9 =
// contrat de comportement ; twin9.py = source de vérité en cas de doute).
//
// Divergences ASSUMÉES (spec-index §2/§4, spec-contrats §9.2) :
//   - pas de fs : les artefacts (carto_evolutive.json, profil_ipsatif.json,
//     rapports, viewer, journees_index.json, scan_global.json) sont écrits
//     dans un store en mémoire (ctx.artefacts) ET renvoyés ; l'état persistant
//     est un OBJET JS passé IN/OUT (jamais un fichier .json sur disque) ;
//   - pas d'horloge : `date` et l'horodatage des calques viennent de `nowIso`
//     (injectable) — datetime.date.today() / datetime.now() neutralisés ;
//   - pas de ThreadPool : exécution SÉQUENTIELLE dans l'ordre de soumission
//     des jobs, l'ordre déterministe que l'oracle mock fige (équivaut à
//     Python max_workers=1 ; empiriquement le mock instantané préserve
//     l'ordre de soumission, donc les oracles générés à max_workers=6 sont
//     bit-à-bit reproductibles et servent de cible).
//
// Trois étages de modèles, comme twin9.py :
//   TAGGERS = backends du roster (models.json) ; RAPIDE = backend_rapide
//   (sinon model_mini du tribunal) ; PROFOND = backend_tribunal.

import { splitPortfolio } from "./portfolio.js";
import { polesFromStructure } from "./referentiel.js";
import { makeBackend as defaultMakeBackend } from "./backends.js";
import { cartographierJournee, empreinteJournee, rehydrater } from "./journee.js";
import { ecrireSorties, fusionner, relectures, secondRessort } from "./merge.js";
import { arpenter, verser as verserScan } from "./scan.js";
import { infosPersonas } from "./tribunal.js";
import { empreinte, log, logWarn, stableHash } from "./util.js";
import { deepCopyPy, memArtefacts, pjoin } from "./artefacts.js";
import { dictGet, pyIntOf, pyTruthy } from "./py/pyDict.js";
import { codePointCompare } from "./py/pyJson.js";
import { pyFormat, pyStr } from "./py/pyStr.js";
import { cpLen } from "./py/pyText.js";

const MOD_31 = 2 ** 31 - 1; // 2**31 − 1, comme les seeds Python

// ── petites horloges locales (production ; en test/parité `nowIso` est fourni) ──
function nowLocalDate() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function nowLocalDateTime() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${nowLocalDate()}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** dict.setdefault(k, dflt) Python — pose dflt si absent, renvoie la valeur. */
function setdefault(obj, k, dflt) {
  if (!Object.prototype.hasOwnProperty.call(obj, k) || obj[k] === undefined) obj[k] = dflt;
  return obj[k];
}

/**
 * _charger_roster porté. `rosterData` = models.json (objet {modeles:[…]} ou
 * tableau d'entrées). `only` = null | Map<string, number|null> (passes par
 * modèle) | Set<string> | objet {name: true}. Filtres enabled/only, expansion
 * des passes (name#k, seed décorrélé), pose de kind/salt en mock, suffixe
 * `|passeK` du salt. La garde nLPD (donnees_reelles) ne s'applique qu'aux
 * backends réseau (hors mock) : ignorée ici.
 * @returns {object[]}
 */
export function chargerRoster(rosterData, only, mock, salt) {
  const modeles = Array.isArray(rosterData)
    ? rosterData
    : /** @type {object[]} */ (dictGet(rosterData, "modeles", []) || []);
  const onlyIsMap = only instanceof Map;
  const onlyActif = only !== null && only !== undefined;
  const onlyHas = (name) => {
    if (onlyIsMap || only instanceof Set) return only.has(name);
    return Object.prototype.hasOwnProperty.call(only, name);
  };
  /** @type {object[]} */
  const roster = [];
  for (const m of modeles) {
    if (!pyTruthy(dictGet(m, "enabled", true))) continue;
    if (onlyActif && !onlyHas(dictGet(m, "name", null))) continue;
    let passes = onlyIsMap ? only.get(m.name) : null;
    if (passes === null || passes === undefined) passes = pyIntOf(dictGet(m, "passes", 1));
    if (passes <= 1) {
      roster.push({ ...m });
    } else {
      for (let k = 1; k <= passes; k++) {
        const c = { ...m };
        c.name = pyFormat("%s#%d", m.name, k);
        c.passe = k;
        c.seed = stableHash(pyFormat("%s|passe%d", m.name, k)) % MOD_31;
        roster.push(c);
      }
    }
  }
  if (!roster.length) throw new Error("Roster vide après filtrage — vérifier models.json");
  if (mock) for (const m of roster) m.kind = "mock";
  if (pyTruthy(salt)) for (const m of roster) m.salt = salt;
  for (const m of roster) {
    // décorrélation des passes, y compris en mock (sans salt de run → "|passeK")
    if (pyTruthy(dictGet(m, "passe", null))) {
      m.salt = pyFormat("%s|passe%d", pyStr(dictGet(m, "salt", "")), m.passe);
    }
  }
  return roster;
}

/** _etape_de porté : route une étiquette d'appel vers son étape métrique. */
function etapeDe(label) {
  const p = String(label).split("_")[0];
  if (p === "tag") return "tagging";
  if (p === "lecteur") return "premiere-impression";
  if (p === "greffier" || p === "leger" || p === "contre-lecture") {
    return label.includes("_faisceau_") ? "second-ressort" : "instruction-rapide";
  }
  if (
    p === "accusation" || p === "defense" || p === "replique" || p === "briefing" ||
    p === "jure" || p === "jure2" || p === "relance" || p === "gardien" || p === "president"
  ) {
    return label.includes("_faisceau_") ? "second-ressort" : "tribunal";
  }
  if (p === "condense" || p === "arpenteur" || p === "retour") return "scan-global";
  if (p === "merge") return "relectures";
  return "autre";
}

/**
 * executer() porté — le pipeline complet, sans fs ni argparse.
 *
 * @param {object} opts
 * @param {string} opts.portfolioTexte — texte brut du portfolio (multi-journées).
 * @param {string} [opts.nomJournal] — nom de fichier logique (→ journal_id).
 * @param {object[]} opts.referentiel — structure des pôles
 *   [{num, nom, competences:[{code, nom}]}] (referentiel.polesFromStructure).
 * @param {object|object[]} opts.roster — models.json ({modeles:[…]}) ou tableau.
 * @param {object} [opts.config] — config.json parsé.
 * @param {((spec: object) => object)|null} [opts.backends] — fabrique de backends
 *   injectée (makeBackend) ; défaut : la fabrique mock du package.
 * @param {boolean} [opts.mock] — mode mock (parité) : force kind="mock" partout.
 * @param {object|null} [opts.etat] — état persistant IN/OUT (objet, pas de fs) ;
 *   null = --sans-etat.
 * @param {string|null} [opts.salt] — sel de run (reproductibilité mock).
 * @param {object} [opts.options] — {jours, sansRelectures, rescan, juryMode,
 *   juryTaille, scanGlobal, legerPasses, sansContreLecture, modeleTribunal,
 *   modeleRapide, only}.
 * @param {((etape: string, fait: number, total: number) => void)|null} [opts.onProgress]
 * @param {string|null} [opts.nowIso] — horloge injectée (date/horodatage).
 * @param {string|null} [opts.baseDir] — préfixe des chemins d'artefacts.
 * @returns {Promise<{cartoEvolutive: object, profilIpsatif: object,
 *   statuts: Map<string, number>, metrics: object, etat: object|null,
 *   artefacts: object}>}
 */
export async function executerTwin9({
  portfolioTexte,
  nomJournal = "",
  referentiel,
  roster: rosterData,
  config: configIn = {},
  backends: makeBackendInj = null,
  mock = true,
  etat = null,
  salt = null,
  options = {},
  onProgress = null,
  nowIso = null,
  baseDir = null,
} = {}) {
  const {
    jours = null,
    sansRelectures = false,
    rescan = false,
    juryMode = null,
    juryTaille = null,
    scanGlobal = false,
    legerPasses = null,
    sansContreLecture = false,
    modeleTribunal = null,
    modeleRapide = null,
    only = null,
  } = options || {};
  const makeBackend = typeof makeBackendInj === "function" ? makeBackendInj : defaultMakeBackend;
  const progress = typeof onProgress === "function" ? onProgress : () => {};

  // 1. config : COPIE PROFONDE (jamais muter l'objet de l'appelant ni laisser
  //    une surcharge fuir d'un run à l'autre) + surcharges "CLI" dans l'ordre
  //    EXACT de twin9.py.executer().
  const config = /** @type {Record<string, any>} */ (deepCopyPy(configIn) || {});
  if (sansRelectures) setdefault(config, "merge", {}).relectures = false;
  if (pyTruthy(modeleTribunal)) setdefault(config, "backend_tribunal", {}).model = modeleTribunal;
  if (pyTruthy(modeleRapide)) {
    if (pyTruthy(dictGet(config, "backend_rapide", null))) config.backend_rapide.model = modeleRapide;
    else setdefault(config, "backend_tribunal", {}).model_mini = modeleRapide;
  }
  if (pyTruthy(juryMode)) setdefault(config, "jury", {}).mode = juryMode;
  if (pyTruthy(juryTaille)) {
    const t = Math.max(2, Math.min(6, pyIntOf(juryTaille)));
    if (t !== pyIntOf(juryTaille)) {
      logWarn(pyFormat("--jury-taille %s hors plage [2, 6] — ramené à %d", pyStr(juryTaille), t));
    }
    setdefault(config, "jury", {}).taille_aleatoire = t;
  }
  if (scanGlobal) setdefault(config, "scan_global", {}).enabled = true;
  if (pyTruthy(legerPasses)) {
    const p = Math.max(1, pyIntOf(legerPasses));
    setdefault(config, "juge_leger", {}).passes = p;
  }
  if (sansContreLecture) setdefault(config, "juge_leger", {}).contre_lecture = false;

  // 2. découpage + horloge injectée
  const pf = splitPortfolio(portfolioTexte, nomJournal);
  const date = (pyTruthy(nowIso) ? String(nowIso) : nowLocalDate()).slice(0, 10);
  const hIso = (pyTruthy(nowIso) ? String(nowIso) : nowLocalDateTime()).slice(0, 19);
  const suffixe = rescan ? "_" + hIso.slice(11).replace(/:/g, "") : "";
  const base = pyTruthy(baseDir)
    ? String(baseDir)
    : pjoin("resultats_v9", pyFormat("%s_%s%s", pf.journal_id, date, suffixe));
  const journeesDir = pjoin(base, "journees");

  // 3. roster + backends (un par entrée ; tribunal PROFOND ; rapide optionnel)
  const roster = chargerRoster(rosterData, only, mock, salt);
  const famillesRoster = Array.from(
    new Set(roster.map((m) => (pyTruthy(dictGet(m, "family", null)) ? m.family : String(m.name).split("#")[0]))),
  ).sort(codePointCompare);
  if (famillesRoster.length < 2) {
    logWarn(pyFormat("Collège MONO-FAMILLE (%s, %d lecteur(s)) : la convergence mesure la stabilité",
      famillesRoster.join(", "), roster.length));
  }

  /** @type {Record<string, object>} */
  const backends = {};
  for (const entry of roster) {
    const spec = { ...entry };
    if (!pyTruthy(dictGet(spec, "kind", null))) spec.kind = "mock";
    backends[entry.name] = makeBackend(spec);
  }
  const btSpec = { ...(pyTruthy(dictGet(config, "backend_tribunal", null)) ? config.backend_tribunal : { kind: "claude-cli" }) };
  if (mock) btSpec.kind = "mock";
  if (pyTruthy(salt)) btSpec.salt = salt;
  config.backend_tribunal = btSpec; // réinjection : entre dans l'empreinte de reprise
  const backendTribunal = makeBackend(btSpec);

  let backendRapide = null;
  let modeleRapideEff = null;
  const brSpecSrc = dictGet(config, "backend_rapide", null);
  if (pyTruthy(brSpecSrc)) {
    const brSpec = { ...brSpecSrc };
    if (mock) brSpec.kind = "mock";
    if (pyTruthy(salt)) brSpec.salt = salt;
    config.backend_rapide = brSpec;
    backendRapide = makeBackend(brSpec);
    modeleRapideEff = dictGet(brSpec, "model", null);
  }

  // 4. référentiel → pôles (liste triée par numéro, comme [poles_all[n] for n in sorted])
  const polesMap = polesFromStructure(referentiel);
  const poles = Array.from(polesMap.keys())
    .sort((a, b) => a - b)
    .map((n) => polesMap.get(n));

  // 5. ctx : calques_dir null (état isolé → pas d'accumulation dans le magasin
  //    du projet), pas de calquesStore, protocole absent (le mock ignore les
  //    gabarits confidentiels), horodatage figé par nowIso.
  const ctx = {
    base_dir: base,
    logs_dir: journeesDir,
    journees_dir: journeesDir,
    journal_id: pf.journal_id,
    date,
    config,
    poles,
    backend_tribunal: backendTribunal,
    rapide: backendRapide !== null ? [backendRapide, modeleRapideEff] : null,
    calques_dir: null,
    incidents: {},
    textes_journees: new Map(),
    ancrage_stats: new Map(),
    artefacts: memArtefacts(),
    horodatage: () => hIso,
  };

  // 6. journées (limitées à `jours` si fourni) + état + index de découpage
  let journees = pf.feuilles;
  if (pyTruthy(jours)) journees = journees.slice(0, pyIntOf(jours));
  for (const jr of journees) ctx.textes_journees.set(jr.id, jr.texte);

  const etatData = etat !== null && etat !== undefined ? etat : null;
  if (etatData !== null) {
    setdefault(etatData, "journal_id", pf.journal_id);
    setdefault(etatData, "journees", {});
  }

  ctx.artefacts.writeJson(
    pjoin(base, "journees_index.json"),
    journees.map((j) => ({
      id: j.id,
      date: dictGet(j, "date", null),
      titre: dictGet(j, "titre", null),
      caracteres: cpLen(j.texte),
    })),
  );

  // 7. boucle par journée (reprise par empreinte si état inchangé)
  /** @type {object[]} */
  const cartos = [];
  let reprises = 0;
  const totalJ = journees.length;
  for (let i = 0; i < journees.length; i++) {
    const jr = journees[i];
    /** @type {object} */
    let carto;
    if (etatData !== null) {
      const fp = empreinteJournee(jr, roster, config);
      const ent = rescan ? null : dictGet(etatData.journees, jr.id, null);
      if (pyTruthy(ent) && dictGet(ent, "empreinte", null) === fp) {
        reprises += 1;
        carto = /** @type {object} */ (ent).carto;
        rehydrater(ctx, carto);
      } else {
        carto = await cartographierJournee(ctx, jr, roster, backends);
        etatData.journees[jr.id] = {
          empreinte: fp,
          date: dictGet(jr, "date", null),
          titre: dictGet(jr, "titre", null),
          texte: jr.texte,
          carto,
        };
      }
    } else {
      carto = await cartographierJournee(ctx, jr, roster, backends);
    }
    cartos.push(carto);
    progress("journees", i + 1, totalJ);
  }
  if (reprises) log(pyFormat("État persistant : %d journée(s) inchangée(s) reprises sans relecture", reprises));

  // 8. carte additive : les journées d'état ABSENTES du fichier courant restent
  //    (tri final par (date or journee, journee)) — SEULEMENT si état actif.
  if (etatData !== null) {
    const idsCourants = new Set(journees.map((j) => j.id));
    for (const jid of Object.keys(etatData.journees).sort(codePointCompare)) {
      const ent = /** @type {object} */ (etatData.journees[jid]);
      if (!idsCourants.has(jid) && pyTruthy(dictGet(ent, "carto", null))) {
        cartos.push(ent.carto);
        if (!ctx.textes_journees.has(jid)) ctx.textes_journees.set(jid, dictGet(ent, "texte", ""));
      }
    }
    cartos.sort((a, b) => {
      const ka = pyStr(pyTruthy(dictGet(a, "date", null)) ? a.date : a.journee);
      const kb = pyStr(pyTruthy(dictGet(b, "date", null)) ? b.date : b.journee);
      return codePointCompare(ka, kb) || codePointCompare(pyStr(a.journee), pyStr(b.journee));
    });
  }

  // 9. Merge_v3 : fusion → (scan global 9bis AVANT le second ressort) →
  //    second ressort → relectures → écriture des sorties.
  ctx.etat_faisceaux = etatData !== null ? setdefault(etatData, "faisceaux", {}) : null;
  const competences = fusionner(ctx, cartos);
  progress("merge", 1, 4);

  const scanCfg = dictGet(config, "scan_global", null) || {};
  if (pyTruthy(dictGet(scanCfg, "enabled", false))) {
    ctx.etat_scan = etatData !== null ? setdefault(etatData, "scan_global", {}) : null;
    await arpenter(ctx, cartos, competences, backendTribunal);
  } else if (etatData !== null && pyTruthy(dictGet(dictGet(etatData, "scan_global", null) || {}, "observations", null))) {
    ctx.etat_scan = etatData.scan_global;
    verserScan(ctx, competences, ctx.etat_scan);
  }
  progress("merge", 2, 4);

  await secondRessort(ctx, cartos, competences, backendTribunal);
  progress("merge", 3, 4);
  const rel = await relectures(ctx, cartos, competences, backendTribunal);
  const sorties = ecrireSorties(ctx, cartos, competences, rel, roster);
  progress("merge", 4, 4);

  // 10. métriques par étape (collecte des CallRecord des trois étages)
  /** @type {object[]} */
  const recs = [];
  for (const name of Object.keys(backends)) {
    for (const r of backends[name].records) {
      const d = r.asDict();
      d.backend = name;
      recs.push(d);
    }
  }
  for (const r of backendTribunal.records) {
    const d = r.asDict();
    d.backend = "_tribunal";
    recs.push(d);
  }
  if (backendRapide !== null) {
    for (const r of backendRapide.records) {
      const d = r.asDict();
      d.backend = "_rapide";
      recs.push(d);
    }
  }

  /** @type {Record<string, {appels: number, tokens_estimes: number, echecs: number}>} */
  const parEtape = {};
  for (const r of recs) {
    const e = etapeDe(r.label);
    const d = parEtape[e] || (parEtape[e] = { appels: 0, tokens_estimes: 0, echecs: 0 });
    d.appels += 1;
    d.tokens_estimes += r.tokens_estimes;
    if (!r.ok) d.echecs += 1;
  }
  const tribunauxSieges = recs.filter(
    (r) => String(r.label).startsWith("president_") && !String(r.label).includes("_faisceau_"),
  ).length;

  const juryRaw = dictGet(config, "jury", null) || {};
  /** @type {Map<string, number>} */
  const statuts = sorties.statuts;
  const statutsObj = Object.fromEntries(statuts);

  const metrics = {
    journal_id: pf.journal_id,
    date,
    n_journees: cartos.length,
    n_journees_reprises_etat: reprises,
    roster: roster.map((m) => dictGet(m, "name", null)),
    familles_roster: famillesRoster,
    mono_famille: famillesRoster.length < 2,
    jury_mode: pyStr(dictGet(juryRaw, "mode", "socle4+1")),
    jury_taille_aleatoire: pyIntOf(dictGet(juryRaw, "taille_aleatoire", 5)),
    personas: infosPersonas(),
    appels_llm: recs.length,
    tokens_estimes_total: recs.reduce((a, r) => a + r.tokens_estimes, 0),
    par_etape: parEtape,
    tribunaux_sieges: tribunauxSieges,
    scan_global: dictGet(ctx, "scan_global", null),
    statuts_finaux: statutsObj,
    appels_detail: recs,
  };

  return {
    cartoEvolutive: sorties.cartoEvolutive,
    profilIpsatif: sorties.profilIpsatif,
    statuts,
    metrics,
    etat: etatData,
    artefacts: ctx.artefacts,
  };
}
