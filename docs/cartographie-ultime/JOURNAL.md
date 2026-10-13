# Journal d'avancement — interface ultime de cartographie

Source des exigences : `INDEX/04_specifications.md` du dossier de travail
« Cartographie » de Christian (version 0.1 du 2026-10-13), complété par les
fiches de lecture `01_synthese_phase3.md`, `02_modele_de_donnees_commun.md`,
`03_aurora_chaine_donnees_et_extraits.md`, `03b_lecture_proto.md`,
`03c_lecture_site_humanome.md` et `03d_lecture_react2025.md`, et par
l'inventaire `00_inventaire.xlsx`. Les références « §n » ci-dessous renvoient
aux sections de `04_specifications.md`.

Branche de travail : `feat/ultimate-cartography` (issue de `main` @ `28969a2`).
**Aucun déploiement** sur https://humanome.xyz tant que Christian n'a pas
validé : le déploiement ne se fait que par `scripts/deploy/deploy.mjs`
(identifiants FTP absents de ce poste) ; pousser la branche sur GitHub ne
déclenche rien (la CI `publiable.yml` ne tourne que sur `main` et sur les PR).

---

## 1. Où j'en suis

| Étape | Contenu | Code | Tests développés | Tests validés | Commit |
|---|---|---|---|---|---|
| Installation | dépôt cloné, dépendances, données dérivées, base locale | — | — | ✅ voir §3 | — |
| Cadrage | architecture, modèle, journal | ✅ | — | — | (ce commit) |
| P0 | noyau `core/` : modèle, importeurs, formules §5 | ⏳ | ⏳ | ⏳ | — |
| P1 | soleil, heatmap, gestionnaire, date t, liste, modale | — | — | — | — |
| P2 | lecteur surligné, détail, jury, « Pourquoi ? », animation | — | — | — | — |
| P3 | comparaison A/B (8 vues) | — | — | — | — |
| P4 | tableau de bord des métriques | — | — | — | — |
| P5 | exports JSON / HTML / PDF, anonymisation | — | — | — | — |
| P6 | copie serveur et partage (adultes) | — | — | — | — |
| P7 | dialogue scripté (option) | — | — | — | — |

Légende : ✅ fait · ⏳ en cours · — pas commencé.

---

## 2. Décisions d'implémentation et d'architecture

Chaque décision est numérotée (D-n) pour pouvoir y renvoyer depuis le code et
les commits. Les écarts à la spécification sont signalés **[écart]** et les
choix à faire valider **[à valider]**.

### D-1 — Emplacement : un module autonome dans le front existant

Le code vit dans `web/src/carto/` :

- `web/src/carto/core/` : noyau pur (aucune dépendance à React ni au DOM),
  testé par Vitest (§5, §13 « noyau pur ») ;
- `web/src/carto/ui/` : composants React minces qui ne font que dessiner.

Il réutilise ce que le site a déjà de solide : lecteur ZIP et identifiants de
la V3 (`web/src/v3/core/zip.js`, `ids.js`), segmentation du portfolio
(`engine/src/portfolio/segment.js`), assainissement DOMPurify
(`web/src/lib/narrative.js`), jetons de thème clair/sombre (`global.css`).
Les autres vues du site ne sont pas modifiées (hors périmètre, §15 décision 12).

### D-2 — Routes préfixées par `#/cartographie` **[écart]**

La spécification (§13) liste `#/cartographie`, `#/jour/<date>`,
`#/comparaison`, `#/tableau-de-bord`, `#/gestionnaire`. Or `#/jour/<date>` est
déjà la vue « journée » historique du site (hors périmètre). Pour ne rien
casser, les cinq espaces vivent sous un même préfixe :

`#/cartographie` · `#/cartographie/jour/<date>` · `#/cartographie/comparaison`
· `#/cartographie/tableau-de-bord` · `#/cartographie/gestionnaire` ·
`#/cartographie/export`.

L'interface V3 actuellement servie sur `#/cartographie` reste accessible (elle
sera déplacée sur `#/cartographie-v3` quand la nouvelle interface la
remplacera, en P1).

### D-3 — Conteneur : le master V3 étendu, réorganisé par journée

Conformément au §4, le conteneur garde l'enveloppe du master V3
(`kind: "competency-map-master"`, `datasetId`, variantes avec provenance,
variante active ou « à examiner », droit de réponse, narratifs) avec
`schemaVersion: "4.0.0"`. Différence structurelle : les observations, traces
et passages sont rangés **dans leur journée** (et non en listes plates) pour
satisfaire l'exigence « un enregistrement IndexedDB par journée, chargement
paresseux » (§4.2). Un master V3 (`3.x`) est un format d'entrée parmi
d'autres, converti par migration.

### D-4 — Stockage en deux niveaux

- **Index léger** (toujours chargé) : référentiel embarqué, liste des
  journées avec cases cochées, étiquettes, variantes, verdicts résumés (code,
  statut, confiance, rôles des traces), volumes, ensembles nommés, revues,
  repères, préférences. Tous les calculs du §5 n'utilisent que lui.
- **Détail par journée** (chargé à la demande) : extraits verbatim, ancres de
  surlignage, jury, pédagogue, pièces, rapports de pôle, kairos, texte du
  portfolio du jour.

IndexedDB `humanome-carto-v4` ; l'import est écrit en **une seule
transaction** (tout ou rien, §3). `localStorage` ne sert qu'aux préférences
d'affichage, toujours sous `try/catch`.

### D-5 — Dates

Les jours sont des chaînes `AAAA-MM-JJ`, comparées comme chaînes. Les seuls
calculs calendaires (jour de la semaine, ajout de jours) passent par
`Date.UTC`, jamais par `new Date("AAAA-MM-JJ")` local (défaut de 2025, §3).

---

## 3. État des tests

### Installation (2026-10-13)

Dépôt cloné depuis GitHub, `npm ci` (moteur et front), données dérivées
régénérées (INSTALL.md §2), base MySQL locale migrée et référentiel exporté
(INSTALL.md §3, via Docker).

| Suite | Résultat | Remarque |
|---|---|---|
| Moteur (Vitest) | **1 069 verts**, 17 sautés (60 fichiers) | identique au dernier état documenté dans `STATUS.md` |
| Front (Vitest) | **1 937 verts** ; 2 fichiers non chargés | `referentiel-v710.test.js` exige l'export statique de la base (refait ensuite, voir plus bas) ; `twin6-prompt-package.test.js` exige les trois gabarits Twin6 non versionnés (anomalie connue UC-SYS-04 AN-2, décision en attente) |
| API (PHPUnit, Docker php:8.2 + MySQL 8) | en cours | la suite complète dure plus de 10 minutes |

---

## 4. Questions ouvertes pour Christian

1. (§15, point ouvert 1) Valeur de α (poids d'un indice) : 0,5 retenu par défaut, réglable.
2. Les données personnelles (portfolios, journaux 300 / 200 / GEN1 du dossier
   AuroraCore) ne sont **jamais** versionnées : le dépôt est public. Les tests
   utilisent des données synthétiques ou le corpus déjà public
   (`assets-existants/merge-prototype`).

---

## 5. Chronologie

- **2026-10-13** — Installation, lecture de la spécification et des sources,
  cadrage (D-1 à D-5), création de la branche.
