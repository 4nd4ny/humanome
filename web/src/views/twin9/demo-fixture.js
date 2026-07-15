// Jeu de démonstration Twin9 — permet de dérouler TOUT le parcours (devis,
// run mock complet, résultats) SANS serveur ni LLM (moteur en mode mock, ADR-010
// §3). Rien ici n'est confidentiel : référentiel réduit fictif, portfolio fictif,
// réglages de pipeline non secrets (les GABARITS restent côté serveur et ne sont
// jamais requis par le mock). Tout ce que ce mode produit est une DÉMONSTRATION à
// données fictives — l'UI l'affiche comme telle, jamais comme l'analyse d'un vrai
// portfolio (cf. MEMORY : risque de fabrication).

/** Référentiel réduit (3 pôles × 3 compétences) — structure attendue par le moteur. */
export const DEMO_REFERENTIEL = [
  {
    num: 1,
    nom: 'TÊTE — Penser & Comprendre',
    competences: [
      { code: '1.01', nom: 'Pensée critique' },
      { code: '1.02', nom: 'Cadrage de l’intention' },
      { code: '1.03', nom: 'Synthèse intégrative' },
    ],
  },
  {
    // Numérotation alignée sur les 7 pôles RESPIRE (le moteur indexe les pôles
    // par NUMÉRO : 1 TÊTE, 2 CŒUR, 3 MAIN, …) pour un rendu de démo cohérent.
    num: 2,
    nom: 'CŒUR — Relier & Coopérer',
    competences: [
      { code: '2.01', nom: 'Écoute active' },
      { code: '2.02', nom: 'Coopération située' },
      { code: '2.03', nom: 'Éthique de la parole' },
    ],
  },
  {
    num: 3,
    nom: 'MAIN — Faire & Réaliser',
    competences: [
      { code: '3.01', nom: 'Itération concrète' },
      { code: '3.02', nom: 'Documentation du geste' },
      { code: '3.03', nom: 'Rigueur d’exécution' },
    ],
  },
]

/** Portfolio fictif à journées datées (format markdown attendu par le découpage). */
export const DEMO_PORTFOLIO = `# Journal de démonstration — Projet fictif

### 2026-03-02

Aujourd'hui j'ai lancé le projet de capteur météo. J'ai d'abord vérifié les
sources avant d'affirmer quoi que ce soit sur les seuils d'humidité, puis j'ai
noté chaque mesure dans mon carnet daté. Une camarade a proposé une autre
méthode et je l'ai écoutée avant de trancher ensemble.

### 2026-03-05

J'ai repris le montage : trois essais successifs, chacun documenté avec la date
et le résultat. Le troisième tient. J'ai expliqué ma démarche au groupe sans
couper la parole, et on a réparti les tâches pour la suite.

### 2026-03-09

Rédaction du compte rendu. J'ai recoupé mes notes, écarté une hypothèse qui ne
tenait pas, et synthétisé les trois journées en une page. J'ai relu à voix haute
pour vérifier que chaque affirmation renvoyait à une trace concrète.
`

/**
 * Réglages de pipeline non secrets pour la démonstration (mêmes clés que le
 * config.json de Twin9 ; en production ils viennent de meta.pipeline, édités
 * par l'admin). Le mock ignore les gabarits : seuls le routage et les étages
 * comptent.
 */
export const DEMO_PIPELINE = {
  seuils_consensus: {
    conf_min: 0.4,
    corrobore: 0.6,
    instruire: 0.25,
    instruire_min_modeles: 2,
    suspicion_min: 0.15,
  },
  juge_leger: { passes: 2, contre_lecture: true },
  jury: { mode: 'socle4+1', taille_aleatoire: 5, graine: 1, archiviste_si_produite: true },
  premiere_impression: true,
  backend_tribunal: { kind: 'claude-cli', model: 'demo-tribunal', model_mini: 'demo-mini' },
  backend_rapide: { kind: 'claude-cli', model: 'demo-mini' },
  merge: { relectures: true, second_ressort: true, seuil_faisceau_journees: 2, rapporteur: true },
  scan_global: { enabled: false },
}

/** Modèle fictif de démonstration, forme identique à meta.modeles[id]. */
export const DEMO_MODELES = {
  'demo-sonnet': { etages: ['taggers', 'rapide', 'tribunal'], prix_usd_mtok: [3.3, 16.5] },
}

/** meta de démonstration, forme identique au retour de fetchTwin9Meta. */
export const DEMO_META = {
  enabled: true,
  demonstration: true,
  etapes: [],
  modeles: DEMO_MODELES,
  packs: [],
  pipeline: DEMO_PIPELINE,
  referentiel: DEMO_REFERENTIEL,
  paypalConfigured: false,
  solde_microusd: 0,
  cle_privee_disponible: false,
}
