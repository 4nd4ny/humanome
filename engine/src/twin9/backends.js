// Port de aurora/backends.py — backends LLM interchangeables derrière
// backend.call(prompt, opts) → Promise<string>. Le MockBackend est l'ORACLE
// de parité (mode --salt) : reproduction bit-à-bit de CPython (spec-backends.md).
//
// Différences assumées avec backends.py (documentées dans spec-backends.md) :
//   - les backends réseau Python (claude-cli, anthropic, openai, ollama) ne
//     sont PAS portés : en production le rendu des prompts (confidentiels) et
//     l'appel LLM sont côté serveur — voir fetchBackend() plus bas ;
//   - call() est async (interface navigateur) ; le mock reste purement
//     déterministe et ne dépend JAMAIS du texte du prompt (métadonnées seules).

import { stableHash } from "./py/stableHash.js";
import { PyRandom } from "./py/mt19937.js";
import { pyJsonDumps, PyFloat } from "./py/pyJson.js";
import { pyRound, pyMod, formatFixed } from "./py/pyRound.js";
import { pyStr } from "./py/pyStr.js";
import { cpLen } from "./py/pyText.js";
import { log, logWarn } from "./util.js";

export const DEFAULT_TIMEOUT = 600; // secondes (informative — fetch côté hôte)
export const RETRIES = 2;

// ── dict.get(key, default) Python : une clé PRÉSENTE à valeur null reste null.
function mGet(meta, key, dflt) {
  if (meta instanceof Map) return meta.has(key) ? meta.get(key) : dflt;
  return Object.prototype.hasOwnProperty.call(meta, key) ? meta[key] : dflt;
}

/** int() Python pour les entiers du mock (nombre → troncature, chaîne → décimal). */
function pyIntOf(v) {
  if (typeof v === "number") return Math.trunc(v);
  if (typeof v === "string") {
    const t = v.trim();
    if (!/^[+-]?\d+$/.test(t)) {
      throw new TypeError(`int() : littéral invalide « ${v} »`);
    }
    return parseInt(t, 10);
  }
  if (v instanceof PyFloat) return Math.trunc(v.value);
  if (v === true) return 1;
  if (v === false) return 0;
  throw new TypeError("int() : type non porté");
}

// ── CallRecord ────────────────────────────────────────────────────────────────
export class CallRecord {
  /**
   * @param {string} label @param {string} model @param {number} seconds
   * @param {number} promptChars @param {number} responseChars @param {boolean} ok
   */
  constructor(label, model, seconds, promptChars, responseChars, ok) {
    this.label = label;
    this.model = model;
    this.seconds = seconds;
    this.promptChars = promptChars;
    this.responseChars = responseChars;
    this.ok = ok;
  }

  /**
   * as_dict() Python — ordre des clés contractuel (metrics_v9.json).
   * `seconds` est un float Python (PyFloat : "0.0" et non "0" en JSON).
   * tokens_estimes = int((p + r) / 4) — troncature (p, r ≥ 0 → floor).
   */
  asDict() {
    return {
      label: this.label,
      model: this.model,
      seconds: new PyFloat(pyRound(this.seconds, 2)),
      prompt_chars: this.promptChars,
      response_chars: this.responseChars,
      tokens_estimes: Math.trunc((this.promptChars + this.responseChars) / 4),
      ok: this.ok,
    };
  }
}

// ── Backend abstrait ──────────────────────────────────────────────────────────
export class Backend {
  /** @param {Record<string, unknown>|null} [spec] */
  constructor(spec) {
    this.kind = "abstract";
    this.spec = spec || {};
    /** @type {CallRecord[]} */
    this.records = [];
  }

  /** Pause entre tentatives (surchargée par les tests ; le mock n'échoue jamais). */
  async _sleep(seconds) {
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }

  /**
   * 3 tentatives (RETRIES + 1), pauses 2 s / 4 s / 6 s (la 3e a lieu même
   * après l'ultime échec), UN CallRecord par appel (succès ou échec final),
   * `seconds` couvrant toutes les tentatives. `label or task or "call"`
   * Python : chaîne vide = absente → || (jamais ??).
   * prompt_chars / response_chars en POINTS DE CODE (len Python).
   * @param {string} prompt
   * @param {{model?: string|null, temperature?: number|null, seed?: number|null,
   *          task?: string|null, meta?: object|null, label?: string|null}} [opts]
   * @returns {Promise<string>}
   */
  async call(prompt, { model = null, temperature = null, seed = null, task = null, meta = null, label = null } = {}) {
    const t0 = Date.now();
    let lastErr = null;
    const recLabel = label || task || "call";
    const recModel = model || mGet(this.spec, "model", "?");
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      try {
        const out = await this._call(prompt, { model, temperature, seed, task, meta });
        this.records.push(
          new CallRecord(recLabel, recModel, (Date.now() - t0) / 1000, cpLen(prompt), cpLen(out || ""), true),
        );
        return out;
      } catch (e) {
        lastErr = e;
        const msg = e && e.message !== undefined ? e.message : String(e);
        logWarn(`Backend ${this.kind} : tentative ${attempt + 1} échouée (${msg})`);
        await this._sleep(2 * (attempt + 1));
      }
    }
    this.records.push(new CallRecord(recLabel, recModel, (Date.now() - t0) / 1000, cpLen(prompt), 0, false));
    const msg = lastErr && lastErr.message !== undefined ? lastErr.message : String(lastErr);
    throw new Error(`Backend ${this.kind} : échec après ${RETRIES + 1} tentatives : ${msg}`);
  }

  /* eslint-disable-next-line no-unused-vars */
  async _call(prompt, opts) {
    throw new Error("NotImplementedError");
  }
}

// ── Mock déterministe (oracle de parité) ──────────────────────────────────────
// Scénarios par compétence (h = md5(code) % 10) :
//   0-3 : court-circuit (aucune pièce)          → concordance-absence
//   4-5 : pièces disqualifiées, confiance basse → concordance-absence
//   6-7 : présence stable (confiance ~0.85+)    → disculpé-présence
//   8   : DIVERGENT entre les passes            → escalade tribunal
//   9   : ambigu (confiance médiane)            → escalade tribunal
export class MockBackend extends Backend {
  constructor(spec) {
    super(spec);
    this.kind = "mock";
  }

  /** random.Random(stable_hash(salt + "|" + "|".join(str(k)))) — MT19937 CPython. */
  _rng(...keys) {
    const salt = pyStr(mGet(this.spec, "salt", ""));
    return new PyRandom(stableHash(salt + "|" + keys.map(pyStr).join("|")));
  }

  _scenario(code) {
    return stableHash("scn|" + code) % 10;
  }

  /**
   * Dispatch sur `task` (jamais sur label ni sur le contenu du prompt).
   * Toute la sortie dépend exclusivement de (salt, task, meta, model).
   */
  async _call(prompt, { model = null, task = null, meta = null } = {}) {
    meta = meta || {};
    model = model || mGet(this.spec, "model", "mock-llm");
    if (task === "leger_scan") return this._leger(meta, model);
    if (task === "kairos") return this._kairos(meta);
    if (task === "tagger") return this._tagger(meta, model);
    if (task === "premiere_impression") {
      const jid = pyStr(mGet(meta, "journee", "?"));
      const ind = ["habitée", "habitée", "mixte", "produite"][stableHash("imp|" + jid) % 4];
      return (
        `# Lecteur — Première impression — ${jid}\n\n## Voix\nRegistre narratif, ` +
        "doute utilisé comme moteur (mock).\n\n## Texture\nDétails situés et datés, " +
        `quelques passages génériques (mock).\n\n## Authenticité\n**Indicateur** : \`${ind}\`\n` +
        "**Justification** : marqueurs concrets datés observés (mock).\n\n" +
        "## Question spontanée\nQu'est-ce qui t'a surpris ce jour-là ? (mock)"
      );
    }
    if (task === "greffier" || task === "accusation" || task === "defense" || task === "replique" || task === "briefing") {
      return this._tribunalTexte(task, meta);
    }
    if (task === "jure" || task === "jure2") return this._jureV9(meta, task === "jure" ? 1 : 2);
    if (task === "relance") return this._relance(meta);
    if (task === "gardien_support") return this._gardienSupport(meta);
    if (task === "gardien_raisonnement") return this._gardienRaisonnement(meta);
    if (task === "leger") return this._legerV9(meta);
    if (task === "contre_lecture") return this._contreLectureV9(meta);
    if (task === "president") return this._president(meta);
    // — scan global (l'Arpenteur) : condensé / passe globale / retour aux sources —
    if (task === "condense") {
      const jid = pyStr(mGet(meta, "journee", "?"));
      const sents = mGet(meta, "sentences", []) || [];
      let peps = [];
      if (sents.length) {
        const k = stableHash("pep|" + jid) % sents.length;
        peps = [sents[k][1]];
        if (sents.length > 1) peps.push(sents[(k + 3) % sents.length][1]);
      }
      const cj = {
        condense_fidele: {
          resume: `Journée ${jid} : travail décrit et daté, avec un passage réflexif (mock).`,
          pepites: peps,
          forme: "Récit daté, longueur ordinaire, ton posé (mock).",
          singularites: "Un détail concret revient en fin de journée (mock).",
        },
      };
      return "```json\n" + pyJsonDumps(cj) + "\n```";
    }
    if (task === "arpenteur") {
      const jours = mGet(meta, "jours", []) || []; // [(id, date)]
      const codes = mGet(meta, "codes", []) || [];
      const peps = mGet(meta, "pepites", {}) || {};
      const ids = jours.map((j) => j[0]);
      const cite2 = ids.length >= 2 ? ids.slice(0, 2) : ids;
      const indices = [];
      for (const j of cite2) {
        const p = peps instanceof Map ? peps.get(j) : mGet(peps, j, null);
        if (p && p.length) indices.push(p[0]); // if peps.get(j) : liste vide exclue
      }
      const arp = {
        arpentage: {
          observationsHorsReferentiel: [
            {
              titre: "Cartographie personnelle du temps (mock)",
              description: "Un système de repérage temporel propre revient sur toute la période (mock).",
              journeesCitees: cite2,
              indices: indices.length ? indices : ["passage daté récurrent (mock)"],
              pourquoiHorsReferentiel: "Aucune des 61 ne couvre ce geste (mock).",
              hypotheseFalsifiable: "Si les prochaines journées n'en portent aucune trace, l'hypothèse tombe (mock).",
              testEntretien: "Peux-tu montrer comment tu organises tes dates ? (mock)",
              codesLesPlusProches: codes.slice(0, 1),
            },
          ],
          continuites:
            ids.length >= 2
              ? [
                  {
                    titre: "Le fil du projet long (mock)",
                    description: "Le même chantier traverse les journées, invisible au jour le jour (mock).",
                    journeesCitees: cite2,
                    indices: indices.length ? indices : ["reprise du même chantier (mock)"],
                    codesRelies: codes.slice(1, 2),
                  },
                ]
              : [],
          grainesReferentiel: ids.length
            ? [
                {
                  code: codes.length > 2 ? codes[2] : codes.length ? codes[0] : "1.01",
                  journeesCitees: cite2,
                  indices: indices.length ? indices : ["trace répétée (mock)"],
                  pourquoiInvisibleAuJour: "Chaque occurrence est trop ténue isolément (mock).",
                },
              ]
            : [],
        },
      };
      return "```json\n" + pyJsonDumps(arp) + "\n```";
    }
    if (task === "retour_sources") {
      const sents = mGet(meta, "sentences", []) || []; // [(journee_id, phrase)]
      const jids = mGet(meta, "jours", []) || [];
      const extraits = [];
      if (sents.length) {
        // str(meta.get("titre")) : titre absent → "None" (chaîne hachée telle quelle)
        const k = stableHash("ret|" + pyStr(mGet(meta, "titre", null))) % sents.length;
        for (const kk of [k, (k + 5) % sents.length]) {
          const [f, s] = sents[kk];
          // `e not in extraits` : égalité STRUCTURELLE (dédoublonne les petits lots)
          if (!extraits.some((x) => x.journee === f && x.verbatim === s)) {
            extraits.push({ journee: f, verbatim: s });
          }
        }
        // un verbatim halluciné EXPRÈS : il doit être rejeté à l'ancrage
        // (le taux d'hallucination du scan doit se mesurer, même en mock)
        extraits.push({
          journee: jids.length ? jids[0] : "?",
          verbatim: "Phrase inventée absente du journal (mock halluciné).",
        });
      }
      const rj = {
        retour_aux_sources: {
          issue: sents.length ? "retrouvée" : "non retrouvée",
          extraits,
          commentaire: "Vérification mock sur le texte brut fourni.",
        },
      };
      return "```json\n" + pyJsonDumps(rj) + "\n```";
    }
    if (task === "merge_kairos") {
      const synthese =
        "## Portrait\n\nAu fil des journées, le travail montre une pratique qui se précise (mock).\n\n" +
        "## La forme de votre profil\n\nUn massif central qui se consolide, des avant-postes récents (mock).\n\n" +
        "## Ce qui relie vos pôles\n\nLe geste de vérification revient de journée en journée (mock).\n\n" +
        "## Ce qui émerge entre les lignes\n\nUne attention récurrente aux détails, hors référentiel (mock).\n\n" +
        "## Invitations pour la suite\n\n> Pour prolonger cette trajectoire, un chemin possible serait de documenter un projet collectif (mock).";
      const kj = {
        kairos: {
          apprenant: {
            portrait: "Le travail montre une pratique réflexive qui se précise (mock).",
            formeProfil: "Un massif central, des avant-postes récents (mock).",
            ceQuiRelieLesPoles: "Le geste de vérification traverse les pôles (mock).",
            ceQuiEmergeEntreLesLignes: "Une attention au détail, hors référentiel (mock).",
            invitationsPourLaSuite: [
              "Pour prolonger cette trajectoire, un chemin possible serait de documenter un projet collectif (mock).",
            ],
            syntheseCompleteMarkdown: synthese,
          },
        },
        emergencesCrossPoles: {
          competencesOrphelines: [
            {
              titre: "Documentation photographique (mock)",
              description: "Des traces visuelles régulières hors des 61 (mock).",
              extraitsPortfolio: ["extrait mock"],
              pourquoiOrpheline: "Aucune des 61 ne couvre ce geste (mock).",
              hypothese: "Si le prochain portfolio n'en contient plus, l'hypothèse tombe (mock).",
              testEntretien: "Peux-tu montrer tes photos de travail ? (mock)",
              enRelationAvecCodes: ["3.06"],
            },
          ],
          connexionsTransversales: [
            {
              titre: "Vérifier avant d'affirmer (mock)",
              description: "Le même geste relie critique et éthique (mock).",
              codesRelies: ["1.01", "4.07"],
              extraitsPartages: ["extrait mock"],
              metaPattern: "La preuve avant la parole (mock).",
            },
          ],
          noeudsConceptuels: [],
          patternTemporel: { type: "escalier", evidence: "Plateaux puis sauts datés (mock)." },
          coherenceImpressionsVerdicts: {
            convergences: "Impressions et verdicts alignés (mock).",
            divergences: "",
          },
        },
      };
      return "```json\n" + pyJsonDumps(kj) + "\n```";
    }
    if (task === "merge_rapporteur") {
      const rj = {
        rapport: {
          journal_id: "mock",
          date: "2026-01-01",
          portrait: "Le travail montre une manière de penser qui vérifie avant d'affirmer (mock).",
          forme_profil: "Un relief à massif central et vallées calmes (mock).",
          territoires_denses: [
            {
              competence_nom: "Pensée critique (mock)",
              description: "Habitée par des actes datés (mock).",
              extrait_portfolio: "extrait mock",
            },
          ],
          non_trouve:
            "Le dossier ne contient pas encore de traces de certaines dimensions — pour rouvrir la question, documenter une situation vécue (mock).",
          emergences: "Des fils reviennent entre les lignes ; pistes à explorer (mock).",
          pistes: ["Pour que le tribunal puisse statuer, documenter un cas concret (mock)."],
          pour_cartographe: {
            renvois: [
              {
                competence_code: "1.05",
                question_entretien: "La pièce P1 relève-t-elle de 1.05 ? (mock)",
              },
            ],
            alertes_gardien: [],
            incoherences: null,
            vigilance_gaming: null,
            profil_ipsatif_complet: "voir profil_ipsatif.json",
          },
          rapport_complet_markdown:
            "## Portrait\n\nLe travail montre une pratique qui se précise (mock).\n\n## La forme de votre profil\n\nUn massif central (mock).\n\n## Vos territoires les plus denses\n\n- Pensée critique (mock)\n\n## Ce que le tribunal n'a pas trouvé\n\nTerritoires non visités (mock).\n\n## Ce qui émerge entre les lignes\n\nPistes (mock).\n\n## Pistes pour enrichir votre portfolio\n\n> Documenter un cas concret (mock).\n\n## Pour le Cartographe\n\n1.05 : question d'entretien (mock).",
        },
      };
      return "```json\n" + pyJsonDumps(rj) + "\n```";
    }
    if (task === "merge_pole") {
      return (
        `## Évolution du pôle ${pyStr(mGet(meta, "pole", "?"))}\n\nSur la période, ce pôle montre une progression ` +
        "d'abord exploratoire puis consolidée (mock)."
      );
    }
    if (task === "merge_competence") {
      return (
        "Attestée d'abord de façon isolée, cette compétence s'est précisée au fil des " +
        "journées : les traces passent de la déclaration à l'acte situé, et la confiance " +
        "du collège s'est consolidée (mock)."
      );
    }
    return "OK (mock)";
  }

  // — étage léger (cartographie de pôle v8, task "leger_scan") —
  _leger(meta, model) {
    const pole = mGet(meta, "pole", 1);
    const run = mGet(meta, "run", 1);
    const codes = mGet(meta, "codes", []) || []; // [(code, nom)]
    const sents = mGet(meta, "sentences", []) || []; // [(feuille_id, phrase)]
    const passages = [];
    const competences = [];
    let pid = 0;
    for (const [code, nom] of codes) {
      const h = this._scenario(code);
      const rng = this._rng("leger", code, run, model);
      const noise = (rng.random() - 0.5) * 0.06;
      if (h <= 3 || !sents.length) {
        competences.push({
          code,
          courtCircuit: true,
          pieces: [],
          pedagogue: null,
          tracesRetenues: [],
          verdict: {
            statut: "présence non établie",
            nombrePreuves: 0,
            nombreIndices: 0,
            confiance: new PyFloat(1), // 1.0 Python — sérialisé "1.0", pas "1"
            raison: "aucune pièce extraite par le Greffier",
            prescriptionMinimale: `Documenter une situation concrète illustrant ${nom}.`,
          },
        });
        continue;
      }
      // sélection de phrases réelles, stable par compétence (convergence) :
      const k = stableHash("sent|" + code) % sents.length;
      const [f1, s1] = sents[k];
      const [f2, s2] = sents[(k + 7) % sents.length];
      pid += 1;
      const p1 = pid;
      pid += 1;
      const p2 = pid;
      passages.push({
        pid: p1,
        feuille: f1,
        extraitVerbatim: s1,
        contexte: `Passage relevé pour ${code}.`,
        auteur: "apprenant",
      });
      passages.push({
        pid: p2,
        feuille: f2,
        extraitVerbatim: s2,
        contexte: `Second passage relevé pour ${code}.`,
        auteur: "apprenant",
      });
      let conf;
      let statut;
      let nbp;
      let nbi;
      let traces;
      if (h === 4 || h === 5) {
        conf = Math.max(0.05, 0.14 + noise);
        statut = "présence non établie";
        nbp = 0;
        nbi = 0;
        traces = [];
      } else if (h === 6 || h === 7) {
        conf = Math.min(0.98, (h === 6 ? 0.88 : 0.84) + noise);
        statut = "présence établie";
        if (h === 6) {
          nbp = 1;
          nbi = 1;
        } else {
          nbp = 0;
          nbi = 2;
        }
        traces = [
          { pieceId: 1, type: "trace concrète", role: "preuve décisive" },
          { pieceId: 2, type: "déclaration étayée", role: "indice corroboratif" },
        ];
        if (h === 7) traces[0] = { pieceId: 1, type: "déclaration étayée", role: "indice corroboratif" };
      } else if (h === 8) {
        conf = [0.25, 0.82, 0.55][pyMod(run - 1, 3)] + noise;
        statut = conf < 0.45 ? "présence non établie" : conf >= 0.7 ? "présence établie" : "renvoi au cartographe";
        if (statut === "présence établie") {
          nbp = 1;
          nbi = 0;
        } else {
          nbp = 0;
          nbi = 0;
        }
        traces =
          statut === "présence établie" ? [{ pieceId: 1, type: "trace concrète", role: "preuve décisive" }] : [];
      } else {
        // h == 9
        conf = 0.55 + noise;
        statut = "renvoi au cartographe";
        nbp = 0;
        nbi = 1;
        traces = [{ pieceId: 2, type: "déclaration étayée", role: "indice corroboratif" }];
      }
      competences.push({
        code,
        courtCircuit: false,
        pieces: [
          { numero: 1, pid: p1, extraitVerbatim: s1, contexte: `Pertinent pour ${code}.`, auteur: "apprenant" },
          { numero: 2, pid: p2, extraitVerbatim: s2, contexte: `Pertinent pour ${code}.`, auteur: "apprenant" },
        ],
        pedagogue: {
          presomptionAbsence: {
            raisonnement: "Lecture sceptique (mock) ; certaines pièces résistent.",
            piecesQuiResistent: [{ pieceId: 1, motifResistance: "acte daté décrit" }],
          },
          presomptionSycophantie: {
            raisonnement: "Relecture critique (mock).",
            examenPieces: [
              {
                pieceId: 1,
                attaqueDominante: "a",
                verdictAttaque: "attaque non recevable, pièce confirmée",
                motifAttaque: "dispositif décrit et daté",
              },
            ],
          },
          conclusionAdversariale: {
            raisonnement: "Après les deux retournements (mock), le verdict suit.",
            confianceFinale: new PyFloat(pyRound(conf, 3)),
          },
        },
        verdict: {
          statut,
          nombrePreuves: nbp,
          nombreIndices: nbi,
          confiance: new PyFloat(pyRound(conf, 3)),
          motif: "Conclusion adversariale (mock).",
          prescription: `Pour prolonger, documenter une nouvelle situation liée à ${nom}.`,
        },
        tracesRetenues: traces,
      });
    }
    const carto = {
      poleNum: pyStr(pole),
      passagesSaillants: passages,
      competences,
      auditPole: {
        competencesTotales: codes.length,
        competencesNonCourtCircuit: competences.filter((c) => !c.courtCircuit).length,
        presencesEtablies: competences.filter((c) => c.verdict.statut === "présence établie").length,
        renvoisCartographe: competences.filter((c) => c.verdict.statut === "renvoi au cartographe").length,
        nonEtablies: competences.filter((c) => c.verdict.statut === "présence non établie" && !c.courtCircuit).length,
        courtCircuits: competences.filter((c) => c.courtCircuit).length,
      },
      rapport: {
        portraitPole: `Portrait du pôle ${pyStr(pole)} (mock) : le travail montre un ancrage concret.`,
        territoiresDenses: [],
        territoiresNonVisites: "Territoires non visités (mock).",
        emergencesPole: "Émergences (mock).",
        pistes: ["Pour enrichir ce pôle, un chemin possible serait de documenter un cas vécu."],
        rapportCompletMarkdown: `## Portrait du pôle\n\nRapport de pôle ${pyStr(pole)} généré par le backend mock.\n`,
      },
    };
    return "```json\n" + pyJsonDumps(carto) + "\n```";
  }

  // — tribunal (greffier + textes de l'arène) —
  _tribunalTexte(task, meta) {
    const code = mGet(meta, "code", "?");
    const nom = mGet(meta, "nom", "?");
    const sents = mGet(meta, "sentences", []) || [];
    if (task === "greffier") {
      if (!sents.length) {
        return `# Greffier — ${code} ${nom}\n\nDOSSIER VIDE — Aucune pièce identifiée pour ${code}.`;
      }
      const k = stableHash("sent|" + code) % sents.length;
      const lines = [`# Greffier — ${code} ${nom}`, "", "### Pièces extraites", ""];
      const picks = [sents[k], sents[(k + 7) % sents.length], sents[(k + 3) % sents.length]];
      picks.forEach(([f, s], i) => {
        const n = i + 1;
        lines.push(
          `#### Pièce ${n}`,
          `- **Extrait** : « ${s} »`,
          `- **Date** : ${f}`,
          `- **Localisation** : feuille ${f}`,
          `- **Type** : ${n === 1 ? "trace concrète" : "déclaration étayée"}`,
          "- **Vigilance** : aucune",
          "",
        );
      });
      lines.push(
        "### Bilan",
        "- Traces concrètes : 1",
        "- Déclarations étayées : 2",
        "- Déclarations nues : 0",
        "- Intentions : 0",
        "- Observations tierces : 0",
        "- Alertes authenticité : 0",
      );
      return lines.join("\n");
    }
    const titres = {
      accusation: "Accusation",
      defense: "Défense",
      replique: "Réplique",
      briefing: "Briefing juré",
    };
    const corps = {
      accusation:
        "## Thèse\nLes pièces P1-P3 montrent des actes datés.\n\n## Arguments\n### Argument 1 — Acte documenté\nPièces : P1. L'acte décrit correspond aux manifestations de la fiche.\n\n## Auto-évaluation de la force du dossier\nmodérée — dossier réel mais étroit.",
      defense:
        "## Position générale\nLe dossier est étroit.\n\n## Attaques\n### Attaque 1 — Insuffisance probatoire — vise Argument 1 / Pièces P2, P3\nDeux pièces sont déclaratives, sans dispositif.\n\n## Ce que la Défense concède\nP1 décrit un acte réel.\n\n## Conclusion\nContestation partielle : la présence repose sur P1 seule.",
      replique:
        "### Réponse à l'Attaque 1\npartiellement concédée — P2 reste un indice, P3 est abandonnée.\n\n## État final du réquisitoire\nP1 (preuve) + P2 (indice) tiennent.",
      briefing:
        "## Ce que soutient l'Accusation\nP1 acte daté ; P2 indice.\n\n## Ce que soutient la Défense\nP2-P3 déclaratives.\n\n## Issue de la réplique\nP3 abandonnée.\n\n## Points de convergence\nP1 est un acte réel.\n\n## Questions à trancher par le jury\n1. P1 suffit-elle seule ? (P1)\n2. P2 est-elle étayée ? (P2)",
    };
    return `# ${titres[task]} — ${code} ${nom}\n\n${corps[task]}`;
  }

  // — jury v9 : détection / contestation / abstention, deux tours —
  // Positions déterministes par scénario — couvrent : contestation concédée au
  // second tour (h=8), désaccord irréductible (h=9), détection convergente
  // (h=6/7), contestation seule (h=4), détection isolée puis contestée (h=5).
  // Les jurés hors socle suivent le scénario sans le piloter.
  _posJure(code, nj, tour) {
    const h = this._scenario(code);
    if (nj !== "Linguiste" && nj !== "Historien" && nj !== "Pédagogue" && nj !== "Sociologue") {
      return h === 6 || h === 7 || h === 8 ? "détection" : "abstention";
    }
    let r1;
    let r2;
    if (h === 8) {
      r1 = nj === "Historien" ? "contestation" : "détection";
      r2 = "détection";
    } else if (h === 9) {
      r1 = nj === "Linguiste" ? "détection" : nj === "Pédagogue" ? "contestation" : "abstention";
      r2 = r1;
    } else if (h === 6) {
      r1 = nj === "Sociologue" ? "abstention" : "détection";
      r2 = r1;
    } else if (h === 7) {
      // la contre-lecture avait raison : le tribunal conclut l'absence
      r1 = nj === "Linguiste" ? "contestation" : "abstention";
      r2 = r1;
    } else if (h === 4) {
      // contestation concédée au second tour → détection isolée non contestée
      r1 = nj === "Linguiste" ? "contestation" : nj === "Historien" ? "détection" : "abstention";
      r2 = nj === "Linguiste" ? "abstention" : nj === "Historien" ? "détection" : "abstention";
    } else if (h === 5) {
      r1 = nj === "Sociologue" ? "détection" : "abstention";
      r2 = nj === "Pédagogue" ? "contestation" : r1;
    } else {
      r1 = nj === "Historien" ? "détection" : "abstention";
      r2 = r1;
    }
    return tour === 1 ? r1 : r2;
  }

  _jureV9(meta, tour) {
    const code = mGet(meta, "code", "?");
    const nom = mGet(meta, "nom", "?");
    const nj = mGet(meta, "jure", "?");
    const pos = this._posJure(code, nj, tour);
    const pieces = { détection: "P1, P2", contestation: "P2, P3", abstention: "—" }[pos];
    const piege = pos === "contestation" ? "récit performatif (déclaration sans acte)" : "—";
    const entete =
      tour === 1 ? `# Juré ${nj} — ${code} ${nom}` : `# Second tour — ${nj} — ${code} ${nom}`;
    return (
      `${entete}\n\n**Position** : ${pos}\n**Pièces** : ${pieces}\n**Piège visé** : ${piege}\n\n` +
      "## Raisonnement\nDepuis mon angle (mock), P1 pèse le plus.\n\n" +
      "## Ce que mon angle révèle que les autres pourraient manquer\n" +
      "Un détail de formulation (mock)."
    );
  }

  _relance(meta) {
    const code = mGet(meta, "code", "?");
    const nom = mGet(meta, "nom", "?");
    const nj = mGet(meta, "jure", "?");
    const pos = this._posJure(code, nj, 2);
    const pieces = { détection: "P1, P2", contestation: "P2, P3", abstention: "—" }[pos];
    const piege = pos === "contestation" ? "récit performatif (déclaration sans acte)" : "—";
    return (
      `# Relance — ${nj} — ${code} ${nom}\n\n**Position maintenue** : ${pos}\n**Pièces** : ${pieces}\n` +
      `**Piège visé** : ${piege}\n\n## L'argument qui justifie la réouverture\n` +
      "Mon angle éclaire P1 autrement (mock).\n\n## Questions précises aux autres jurés\n" +
      "1. P1 décrit-elle un acte daté ? (P1)\n2. P2 est-elle étayée ? (P2)"
    );
  }

  _gardienSupport(meta) {
    const code = mGet(meta, "code", "?");
    const nom = mGet(meta, "nom", "?");
    const r = stableHash("gsupport|" + code) % 11;
    const constat = r === 0 ? "le support gonfle" : r === 1 ? "le support masque" : "neutre";
    return (
      `# Gardien du support — ${code} ${nom}\n\n**Constat** : ${constat}\n\n## Motif\n` +
      "Constat sur le canal écrit, pas sur l'élève (mock)."
    );
  }

  _gardienRaisonnement(meta) {
    const code = mGet(meta, "code", "?");
    const nom = mGet(meta, "nom", "?");
    const drapeau = stableHash("grais|" + code) % 17 === 0 ? "vice de raisonnement" : "aucun";
    const motif = drapeau !== "aucun" ? "Une position croit l'élève sur parole" : "Le raisonnement du collège tient";
    return `# Gardien du raisonnement — ${code} ${nom}\n\n**Drapeau** : ${drapeau}\n\n## Motif\n${motif} (mock).`;
  }

  // — juge léger v6 (mouvement 3 temps), une lecture par passe. Scénarios :
  // h 6/7 → 3 lectures concordantes « établie » (publication sans tribunal) ;
  // h 8/9 → désaccord entre lectures → tribunal ; autres → non établie.
  _legerV9(meta) {
    const code = mGet(meta, "code", "?");
    const nom = mGet(meta, "nom", "?");
    const k = pyIntOf(mGet(meta, "passe", 1));
    const h = this._scenario(code);
    let statut;
    let pieces;
    let conf;
    if (h === 6 || h === 7) {
      statut = "présence établie";
      pieces = "P1, P2";
      conf = 0.86;
    } else if (h === 8) {
      if (stableHash("l8|" + code) % 2 === 0) {
        // la moitié se résout sans tribunal
        statut = "présence établie";
        pieces = "P1, P2";
        conf = 0.8;
      } else {
        statut = ["présence établie", "présence établie", "présence non établie"][pyMod(k - 1, 3)];
        pieces = statut === "présence établie" ? "P1, P2" : "P2 (examinée puis écartée)";
        conf = 0.62;
      }
    } else if (h === 9) {
      statut = ["présence établie", "renvoi au cartographe", "présence non établie"][pyMod(k - 1, 3)];
      pieces = statut === "présence établie" ? "P1" : "—";
      conf = 0.55;
    } else {
      statut = "présence non établie";
      pieces = "P2 (examinée puis écartée)";
      conf = 0.8;
    }
    return (
      `# Juge léger — ${code} ${nom} — lecture ${k}\n\n**Statut** : ${statut}\n` +
      `**Pièces retenues** : ${pieces}\n**Confiance** : ${formatFixed(conf, 2)}\n\n` +
      "## Temps 1 — ce qui résiste à la présomption d'absence\nP1 décrit un acte daté (mock).\n\n" +
      "## Temps 2 — ce qui cède sous la présomption de sycophantie\nP3 tombe : déclaration nue (mock).\n\n" +
      "## Temps 3 — conclusion\nLe mouvement conduit au statut ci-dessus (mock)."
    );
  }

  // — contre-lecture 20c (présomption de présence puis démolition), aveugle aux
  // lectures du juge léger. h == 7 : la convergence ne résiste pas (récit
  // performatif) → tribunal ; tout le reste : convergence confirmée.
  _contreLectureV9(meta) {
    const code = mGet(meta, "code", "?");
    const nom = mGet(meta, "nom", "?");
    const h = this._scenario(code);
    let statut;
    let pieces;
    let conf;
    let motif;
    if (h === 7) {
      statut = "présence non établie";
      pieces = "—";
      conf = 0.74;
      motif =
        "attaque (f) récit performatif : les pièces racontent la compétence " +
        "sans la montrer en acte (mock)";
    } else {
      statut = "présence établie";
      pieces = "P1, P2";
      conf = 0.82;
      motif = "attaques non recevables : les pièces survivent à la démolition (mock)";
    }
    return (
      `# Contre-lecture — ${code} ${nom}\n\n**Statut** : ${statut}\n` +
      `**Pièces retenues** : ${pieces}\n**Confiance** : ${formatFixed(conf, 2)}\n\n` +
      "## Temps 1 — présomption de présence\nLecture favorable construite : " +
      "P1 et P2 portées au meilleur de ce qu'elles autorisent (mock).\n\n" +
      "## Temps 2 — présomption de sycophantie\nDémolition de la lecture " +
      "favorable, attaque dominante par pièce (mock).\n\n" +
      "## Temps 3 — conclusion adversariale\nLe mouvement conduit au statut " +
      `ci-dessus (mock).\n\n**Motif du verdict** : ${motif}`
    );
  }

  // — porte-parole : récit + prescription — le statut est CALCULÉ par la procédure.
  _president(meta) {
    const code = mGet(meta, "code", "?");
    const nom = mGet(meta, "nom", "?");
    const statut = mGet(meta, "statut", "présence établie");
    const pres = {
      prescription: {
        pour_apprenant:
          "Pour consolider ce dossier, une piste serait de documenter " +
          "une nouvelle situation vécue (mock).",
        pour_cartographe:
          statut === "renvoi au cartographe"
            ? `Question à explorer en entretien : la pièce P1 relève-t-elle de ${code} ? (mock)`
            : null,
      },
    };
    const md =
      `# Président — ${code} ${nom}\n\n## Délibération\n### Synthèse des positions\n` +
      `(récit mock du porte-parole — le statut calculé est : ${statut})\n\n## Prescription\n`;
    return md + "\n```json\n" + pyJsonDumps(pres) + "\n```";
  }

  _kairos(_meta) {
    const k = {
      kairos: {
        apprenant: {
          portrait: "Le portfolio montre un travail régulier, ancré dans des situations vécues (mock).",
          formeProfil: "Un massif central et quelques avant-postes (mock).",
          ceQuiRelieLesPoles: "Le geste de vérification traverse plusieurs pôles (mock).",
          ceQuiEmergeEntreLesLignes: "Une attention au détail non couverte par le référentiel (mock).",
          invitationsPourLaSuite: [
            "Pour prolonger l'exploration, un chemin possible serait de documenter un projet collectif.",
          ],
          syntheseCompleteMarkdown: "## Synthèse\n\nSynthèse inter-pôles générée par le backend mock.\n",
        },
      },
      emergencesCrossPoles: { competencesOrphelines: [], connexionsTransversales: [], noeudsConceptuels: [] },
    };
    return "```json\n" + pyJsonDumps(k) + "\n```";
  }

  // — Twin_v8 : tagger stigmergique —
  _tagger(meta, model) {
    const codes = mGet(meta, "codes", []) || [];
    const sents = mGet(meta, "sentences", []) || [];
    const tags = [];
    const jid = pyStr(mGet(meta, "journee", "")); // ⚠ défaut "", pas "?"
    for (const [code] of codes) {
      const h = this._scenario(code);
      if (h <= 3 || !sents.length) continue; // court-circuite AUSSI l'hallucination
      const rng = this._rng("tag", model, code, jid);
      if (h === 6 || h === 7) {
        // consensus : tous les modèles pointent la même phrase.
        // Fréquence de saut propre à chaque compétence (0.30-0.95) → rng SÉPARÉ,
        // un seul tirage, ne consomme pas le rng principal.
        if (jid) {
          const pSkip = 0.3 + (stableHash("freq|" + code) % 66) / 100.0;
          if (this._rng("jour", code, jid).random() < pSkip) continue;
        }
        const k = stableHash("sent|" + code) % sents.length;
        tags.push({
          competence: code,
          extrait: sents[k][1],
          confiance: new PyFloat(pyRound(0.8 + rng.random() * 0.15, 2)), // tirage n° 1
          justification: `Acte daté correspondant aux manifestations de ${code}.`,
        });
        if (rng.random() > 0.5) {
          // tirage n° 2
          const k2 = (k + 7) % sents.length;
          tags.push({
            competence: code,
            extrait: sents[k2][1],
            confiance: new PyFloat(pyRound(0.6 + rng.random() * 0.2, 2)), // tirage n° 3
            justification: "Indice corroboratif.",
          });
        }
      } else if (h === 8 || h === 9) {
        // divergence : chaque modèle voit une phrase différente
        const k = stableHash("sent|" + code + "|" + model) % sents.length;
        if (rng.random() > 0.35) {
          // tirage n° 1
          tags.push({
            competence: code,
            extrait: sents[k][1],
            confiance: new PyFloat(pyRound(0.45 + rng.random() * 0.3, 2)), // tirage n° 2
            justification: "Trace possible, lecture propre à ce modèle.",
          });
        }
      } else if (h === 4 || h === 5) {
        // soupçons ténus : sous le seuil → registre des graines
        if (rng.random() > 0.5) {
          // tirage n° 1
          const k = stableHash("sent|" + code + "|" + model) % sents.length;
          tags.push({
            competence: code,
            extrait: sents[k][1],
            confiance: new PyFloat(pyRound(0.18 + rng.random() * 0.18, 2)), // tirage n° 2
            justification: "Soupçon ténu, confiance honnête (mock).",
          });
        }
      }
      // hallucination simulée (rng séparé, un tirage)
      if (this._rng("hallu", model, code, jid).random() < 0.09) {
        tags.push({
          competence: code,
          extrait: "Cette phrase n'existe pas dans le portfolio (hallucination simulée).",
          confiance: new PyFloat(0.7),
          justification: "Citation non ancrée (test).",
        });
      }
    }
    return "```json\n" + pyJsonDumps({ tags, alertes: [] }) + "\n```";
  }
}

// ── Backend de PRODUCTION : POST /api/twin9/appel ─────────────────────────────
// Le rendu des gabarits (confidentiels) et l'appel LLM sont côté serveur : le
// client n'envoie que des métadonnées. Aucune logique métier ici — injectable.
/**
 * @param {string} [url="/api/twin9/appel"]
 * @param {typeof fetch} [fetchImpl] — fetch injectable (tests : fetch mocké).
 * @returns {{call: (payload: {etape: string, variables: object, modele?: string,
 *            etage?: string, facturation?: object}) => Promise<{text: string}>}}
 */
export function fetchBackend(url = "/api/twin9/appel", fetchImpl = null) {
  const doFetch = fetchImpl || ((...args) => globalThis.fetch(...args));
  return {
    async call({ etape, variables, modele, etage, facturation } = {}) {
      const res = await doFetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ etape, variables, modele, etage, facturation }),
      });
      if (!res.ok) {
        throw new Error(`twin9/appel : HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data && data.erreur) {
        throw new Error(`twin9/appel : ${data.erreur}`);
      }
      return { text: (data && data.sortie) || "" };
    },
  };
}

// ── Fabrique ──────────────────────────────────────────────────────────────────
// Seul « mock » est porté (les backends réseau Python vivent côté serveur).
export const KINDS = { mock: MockBackend };

/**
 * make_backend(spec) → instance exposant {call, records}. Défaut : mock.
 * @param {Record<string, unknown>|null} spec
 * @returns {Backend}
 */
export function makeBackend(spec) {
  const s = spec || {};
  const kind = mGet(s, "kind", "mock");
  if (!Object.prototype.hasOwnProperty.call(KINDS, kind)) {
    throw new Error(`Backend inconnu : ${pyStr(kind)} (choix : ${Object.keys(KINDS).sort().join(", ")})`);
  }
  const b = new KINDS[kind](s);
  log(`Backend initialisé : ${kind} (modèle par défaut : ${pyStr(mGet(s, "model", "-"))})`);
  return b;
}
