# Plan de fusion visualisation (P2)

**Objectif** (cahier §4.4, §9) : fusionner la vue chronologique/merge et la vue « cartographie
d'une journée » en une application React unifiée, autonome (aucun serveur requis), consommant
les schémas P1. Pièce maîtresse de la démo publique.

## Analyse des implémentations existantes

| Source | Verdict | Ce qu'on en prend |
|---|---|---|
| `assets-existants/merge-prototype/cartographie.html` | **Spec exécutable du rendu** : sunburst SVG 2 anneaux fonctionnant sur les données réelles, panneau détails, responsive JS, `@media print` (l.644) | Portage fonction-par-fonction : `generateData()` (l.765), `createSectorPath()` (l.1028), cœur de `renderCircularDiagram()` (l.844), logique de `renderDetailsPanel()` (l.1043), libellés niveaux, facteurs de rayon, CSS print |
| `prototypes-react/UnifiedCartographyInterface.tsx` et famille | Format XML incompatible, niveaux 1-4 faux, Tailwind/lucide non actés | **Idées d'UI uniquement** : heatmap calendrier type GitHub (`GitHubCalendar`), onglets mobiles (`cartography-viewer-responsive`), synchronisation vue↔date (`filterNodesByDate`) |
| `feuilles/<date>/carto-day.html` (référencés par les liens des feedbacks) | **N'existent pas** dans les assets | Vue Journée reconstruite depuis les documents `cartographie-jour` (extracted/ converti) |

## Architecture retenue

- **Lib pure sans DOM** `web/src/lib/sunburst/` : `buildTree(mergeDoc | dayDoc)` (équivalent
  `generateData`), `layoutSectors(tree, options)` → liste de `{path, fill, opacity, meta}`
  (équivalents `renderSectors`/`createSectorPath`). Testable en snapshot : les attributs `d`
  générés depuis `merge.json` réel doivent être identiques à ceux de l'original (mêmes maths).
- **Composants minces** : `<Sunburst sectors onSelect onHover>`, `<DetailsPanel html>` (via
  DOMPurify, ADR-007), `<HeatmapCalendar feuilles onPickDay>`, `<EvolutionChart profilMeta>`.
- **Vues** : `MergeView` (sunburst cumulé + panneau + heatmap de navigation) ; `DayView`
  (sunburst du jour : largeur = preuves+indices, longueur = confiance ; panneau verdict/
  pedagogue/traces/audit du pôle ; paramètre `?focus=<code>`).
- **Routing hash** (ADR-009) : `#/` (accueil démo) → `#/merge` → `#/jour/<iso>?focus=<code>`.
  Les liens `feuilles/<date>/carto-day.html?focus=X` contenus dans le HTML narratif sont
  **réécrits au rendu** (post-sanitization) vers `#/jour/<date>?focus=X`.
- **Données** : chargement du document merge au boot (~650 Ko, gzippé en prod) ; documents
  jour en fetch paresseux via `data/demo/jours/index.json`. Chargement local par drag & drop
  ou bouton fichier (aucune donnée envoyée nulle part) ; jeu de démonstration intégré =
  données réelles converties + fixtures P1.
- **Mobile 360 px** : bascule en onglets (diagramme / détails) sous 768 px, interactions
  tactiles (tap = sélection), pas de survol requis.
- **Impression** : CSS print portée depuis l'original puis étendue — une cartographie = un
  document (sunburst pleine page + panneau détails de la sélection ou synthèse).

## Mapping formats → schémas P1

Déjà réalisé par les convertisseurs (`scripts/convert/`) : l'app ne consomme QUE des documents
conformes à `cartographie-merge.schema.json` / `cartographie-jour.schema.json`. Un fichier
`carto-data.js` legacy glissé en drag & drop est refusé avec un message clair (conversion via
script documentée), un JSON non conforme affiche les erreurs de validation (ajv, engine).

## Vue Journée — dimensions visuelles

`carto_P*.json` ne porte ni `points` ni `niveau` : mapping documenté (docs/contrats.md) :
- Largeur angulaire du secteur ∝ `verdict.nombrePreuves*2 + verdict.nombreIndices` (bornée min).
- Longueur radiale : quintile de `verdict.confiance` (0..1 → niveau 1..5) pour les présences
  établies ; rendu hachures/réduit (facteur 0.35, comme l'original `RENVOI_RADIUS_FACTOR`)
  pour `renvoi au cartographe` ; secteur éteint pour `présence non établie` non court-circuitée.
- Compétences en court-circuit : absentes du diagramme, listées dans le panneau du pôle.

## Risques

1. **Parité géométrique** : divergence flottants JS ↔ original — mitigé par le test snapshot
   sur les `d=` réels (tolérance stricte : chaîne identique, mêmes arrondis).
2. **Poids des 59 jours** (15 Mo au total) : jamais chargés d'un bloc — fetch par jour.
3. **XSS via HTML narratif** : DOMPurify systématique, testé avec payload hostile.
4. **Réécriture des liens** : regex sur `href` post-sanitization, testée sur le corpus réel
   (tous les liens `feuilles/...` du merge réel doivent devenir des routes internes valides).

## Étapes

1. Lib sunburst pure + tests snapshot de parité sur `merge.json` réel.
2. MergeView complète (panneau, heatmap, évolution) sur données réelles.
3. DayView + navigation + focus + réécriture des liens.
4. Drag & drop + validation + jeu de démo intégré.
5. Responsive 360 px + impression.
6. Build statique `file://`-compatible, vérification navigateur (desktop/mobile/print).
