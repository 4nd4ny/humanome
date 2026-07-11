# ADR-007 — Sanitisation DOMPurify de tout HTML narratif issu des données

## Statut

Accepté — 2026-07-12

## Contexte

Le pipeline de cartographie produit, en plus des structures JSON, des fragments de
**HTML pré-rendu** destinés à l'affichage narratif : champs `feedback`,
`rapport_html`, `kairosHtml` observés dans les formats existants
(`assets-existants/merge-prototype/carto-data.js`, cf. `docs/inventaire-assets.md`). L'interface de visualisation unifiée (§4.4)
injecte ces fragments dans le DOM pour les afficher.

Or ces données ne proviennent pas toujours d'une source de confiance :

- Le plan P2 (module de visualisation du §4.4) prévoit explicitement le
  **chargement d'un JSON local par drag & drop**
  (et bouton d'import) : n'importe quel fichier JSON, d'origine quelconque, peut être
  ouvert dans le visualiseur. Un fichier malveillant peut embarquer du HTML contenant
  des scripts (`<script>`, `onerror=`, `javascript:` …).
- Le partage employeur (§3.2, §3.6) ouvre la visualisation à des tiers via un lien
  public : une cartographie piégée deviendrait un vecteur XSS contre l'employeur.
- Les cartographies peuvent transiter par import d'archive (ADR-006) ou par la base
  serveur (opt-in §6.2) : le contenu HTML est de la donnée, jamais du code de
  confiance.
- Le HTML est en outre généré par un LLM (§4.3) : même sans malveillance, la sortie
  d'un modèle n'est pas garantie saine (injection indirecte via le portfolio).

Une politique « pas de HTML du tout » n'est pas tenable : les rapports narratifs
pré-rendus font partie des artefacts existants à intégrer, pas à recréer (§9).

## Décision

**Tout fragment HTML issu des données est sanitizé au moment du rendu avec
[DOMPurify](https://github.com/cure53/DOMPurify)**, systématiquement et sans
exception : `feedback`, `rapport_html`, `kairosHtml` et tout futur champ HTML des
schémas.

Modalités :

- La sanitisation a lieu **au rendu, côté client** — jamais au stockage. La donnée
  brute reste intacte (archives ADR-006 fidèles) ; c'est la frontière d'affichage
  qui est défendue, quel que soit le chemin d'arrivée du JSON (drag & drop, API,
  import d'archive, lien de partage).
- Un unique point de passage : un composant/utilitaire `SafeHtml` dans `web/`
  encapsule `DOMPurify.sanitize()` ; l'usage direct de `dangerouslySetInnerHTML`
  ou `innerHTML` hors de ce composant est interdit (règle lint).
- Configuration restrictive par défaut : balises de mise en forme et structure
  uniquement ; ni `<script>`, ni gestionnaires d'événements, ni `<iframe>`, ni URI
  `javascript:` ; les liens externes reçoivent `rel="noopener noreferrer"`.
- **DOMPurify est la seule dépendance de rendu ajoutée** au front. Conformément à
  la règle « aucune nouvelle dépendance graphique sans ADR » (P2), le présent ADR
  constitue cette justification. DOMPurify est le standard de facto (Cure53, audité,
  sans dépendance transitive), très inférieur en risque à toute alternative maison.

## Conséquences

**Positives**

- Le vecteur XSS principal du produit (JSON non fiable affiché chez l'utilisateur,
  l'employeur ou le cartographe) est neutralisé en un point unique et testable.
- La visualisation reste autonome et hors-ligne (bundle statique, ADR-003) :
  DOMPurify s'exécute entièrement dans le navigateur, aucun service tiers,
  cohérent avec le RGPD-by-design (§6).
- La CSP stricte prévue en P12 (durcissement) devient une défense en profondeur
  et non l'unique rempart — indispensable puisque le visualiseur doit aussi
  fonctionner ouvert en local, hors de tout en-tête HTTP.
- Les données stockées et exportées ne sont pas altérées : pas de perte
  d'information, la sanitisation est reproductible et améliorable a posteriori.

**Négatives / points de vigilance**

- Certains rendus existants peuvent perdre des attributs ou balises exotiques ;
  chaque écart constaté sur les exemples réels est documenté dans
  `docs/contrats.md` (même discipline que P1), et la liste blanche est ajustée
  par modification de cet ADR si nécessaire.
- Coût de traitement au rendu, négligeable à l'échelle des fragments concernés.
- La règle « un seul point de passage » doit être outillée (lint + revue) : un
  seul `innerHTML` oublié annule la garantie. Un test automatisé vérifie qu'un
  JSON piégé (fixture d'attaque) ne déclenche aucun script dans les deux vues.
- DOMPurify doit être maintenu à jour (`npm audit` en P12).

**Décisions liées** : ADR-002 (stack front React), ADR-003 (bundle statique servi
tel quel — pas d'assainissement serveur possible pour les fichiers ouverts en
local), ADR-006 (l'archive transporte le HTML brut, la défense est au rendu).
