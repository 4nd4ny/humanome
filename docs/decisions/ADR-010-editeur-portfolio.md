# ADR-010 — Éditeur du module Portfolio : repli sur une textarea améliorée (Sqilium non intégrable)

- **Statut** : accepté
- **Date** : 2026-07-12
- **Contexte** : P7.3 (plan-prompts) et cahier §4.2 — « Édition du portfolio : en v1,
  éditeur texte basique réutilisant un projet open source existant plutôt qu'un
  développement propriétaire (https://github.com/4nd4ny/Sqilium) », avec la consigne
  explicite « intègre Sqilium […] ; si blocage technique réel, ADR de repli sur une
  textarea améliorée — mais essaie sérieusement d'abord ».

## Évaluation de Sqilium (faite avant décision, 2026-07-12)

Source : dépôt GitHub `4nd4ny/Sqilium` (README + arborescence complète via l'API GitHub,
910 fichiers examinés).

| Critère | Constat |
|---|---|
| Nature | **Application web complète Ruby on Rails**, pas un composant éditeur. C'est un fork de *Sqily* (HEP Vaud) : plateforme de communication scolaire et de validation mutuelle des compétences (parcours, communautés, défis, messagerie, évaluations). |
| Techno | Ruby ~54,5 %, HTML 27,5 %, CSS 10,9 %, JS 6,9 % (jQuery/Sprockets `app/assets/javascripts/`, aucun package npm, aucun module ESM exportable). L'édition de texte y repose sur **Trix/ActionText côté Rails**, avec upload serveur (`lib/trix_uploader.js`). |
| Licence | AGPL-3.0 — compatible avec humanome (AGPL-3.0), ce n'est **pas** le blocage. |
| Poids | ~910 fichiers : base de données, migrations, authentification, communautés… disproportionné pour « un éditeur de texte v1 ». |
| Intégrabilité Vite/React sans serveur | **Nulle.** Il n'existe ni build embarquable, ni composant isolable : il faudrait un serveur Rails, exclu par l'hébergement OVH mutualisé (ADR-003 : artefacts statiques + PHP uniquement) et par le principe client-first (ADR-001). |
| Adéquation fonctionnelle | L'éditeur interne (Trix) produit du **HTML riche**, alors que le contrat `archive-export.segmentation` (P1) exige des **offsets de caractères stables dans un texte brut** — un WYSIWYG HTML casserait la segmentation journalière. |

## Décision

**Ne pas intégrer Sqilium.** Le blocage est architectural (application serveur Rails
complète, pas un composant), pas un manque d'effort d'intégration. Aucune alternative
n'impose de nouvelle dépendance : l'éditeur v1 est une **textarea améliorée** maison
(`web/src/components/PortfolioEditor.jsx`), conforme au repli prévu par P7.3 :

1. **Auto-agrandissement** : la zone suit la hauteur du texte (pas de double ascenseur).
2. **Compteurs** mots / caractères en continu.
3. **Sauvegarde continue** : chaque modification est persistée localement (IndexedDB,
   base `humanome-portfolios`) après une courte pause de saisie, avec horodatage affiché.
4. **Mode plein écran** (touche Échap pour sortir), pour écrire confortablement.

Le texte reste du **texte brut** (.md accepté tel quel) : les offsets de la segmentation
journalière (`engine/src/portfolio/segment.js`) restent exacts, et l'export `.md`
restitue le document à l'octet près.

## Conséquences

- Zéro dépendance ajoutée (ni Rails, ni Trix, ni éditeur npm) ; bundle inchangé en pratique.
- La piste « réutiliser Sqilium » reste documentée ici pour l'écosystème RESPIRE :
  le projet est pertinent comme *plateforme* pédagogique, pas comme *brique* d'édition.
- Si un besoin d'édition riche apparaît (post-v1), le candidat devra être un composant
  embarquable produisant du texte brut ou du Markdown avec correspondance d'offsets
  (nouvel ADR à ce moment-là).
