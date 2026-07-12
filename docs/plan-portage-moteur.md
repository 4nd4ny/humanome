# Plan de portage du moteur de cartographie (P5 / M4)

**Contexte.** Le cahier (§4.3, §5) prévoit le portage du système de prompts Python en moteur
JavaScript navigateur (ADR-001). **Le pipeline Python n'est pas disponible** (ni
`carto_merge.py`, ni les prompts d'extraction journalière). Le moteur est donc **rétro-conçu**
depuis les artefacts observables, en deux étages à oracle indépendant.

## Cartographie du pipeline reconstitué

```
portfolio (texte)                                        [amont, non disponible]
  └─ prompts d'extraction par pôle (×7) + kairos  →  extracted/<date>/carto_P1..P7.json + kairos.json
        [ÉTAGE C — à RECRÉER sans oracle de prompt : seuls les FORMATS de sortie font foi]
extracted/*  ─┬─ agrégation numérique par compétence/pôle/global/ipsatif
              │   [ÉTAGE A — oracle : intermediate/carto_merge.json, parité 100 % exigée]
              └─ génération des prompts narratifs (61 compétences + 7 pôles + 1 kairos)
                  [ÉTAGE B1 — oracle : intermediate/prompts/*.prompt.md, diff normalisé]
llm_outputs/*.md (réponses narratives)  →  injection dans feedback/rapport_html/kairosHtml
carto_merge.json + narratifs  →  carto-data.js → document cartographie-merge
                  [ÉTAGE B2 — oracle : carto-data.js réel converti (quintiles niveau,
                   archetype, filtrage 54/61, largeurs=fréquence)]
```

## Étages et critères de sortie

- **Étage A — merge numérique** (`engine/src/pipeline/merge.js`) : à partir de N documents
  `cartographie-jour`, produire les agrégats (`par_competence`, `par_pole`, `global`,
  `ipsatif`, `evolution_globale`, Herfindahl). **Oracle : `carto_merge.json` réel (59 jours),
  parité numérique 100 %** (tolérance : représentation flottante d'affichage uniquement).
- **Étage B1 — génération des prompts narratifs** (`engine/src/pipeline/narrative-prompts.js`) :
  produire les 69 prompts depuis les agrégats. **Oracle : diff normalisé contre
  `intermediate/prompts/`** (normalisation : espaces finaux, fins de ligne).
- **Étage B2 — document merge final** (`engine/src/pipeline/merge-document.js`) : quintiles →
  `niveau`, heuristique `archetype` (à retrouver sur les 54 exemples entrée→sortie ; si
  indécidable, la classer sortie LLM et documenter), filtrage des non-établies, assemblage
  narratifs → document `cartographie-merge` valide. **Oracle : `merge.json` converti du réel.**
- **Étage C — extraction journalière** (`engine/src/pipeline/extract.js`) : prompts
  d'extraction par pôle à RECRÉER (aucun oracle amont). Contraintes : sortie stricte au schéma
  `cartographie-jour` (protocole adversarial observé : presomptionAbsence → presomptionSycophantie
  avec attaques a..h → conclusionAdversariale → verdict à 3 statuts + court-circuit), référentiel
  injecté depuis la version choisie, découpage journalier en amont (module portfolio P7).
  Vérification : structurelle (schéma + invariants), pas de parité de contenu possible.
- **Providers** (`engine/src/providers/`) : abstraction unique {Anthropic, OpenAI, Google, xAI,
  OpenRouter, Ollama} × 2 transports (direct navigateur avec clé utilisateur ; proxy
  `POST /api/llm` implémenté en P6/M5). Mock déterministe pour les tests.
- **Runs** (`engine/src/runs/`) : journal (horodatages, modèle, tokens, coût estimé),
  checkpoints par journée via adaptateur de stockage injectable (IndexedDB côté web, mémoire
  côté tests), reprise après interruption (un run de plusieurs heures survit à un rechargement
  d'onglet), `estimate()` tokens/coût/durée avant lancement.
- **Consistance** (`engine/src/consistency.js`) : multi-run N× même prompt/portfolio →
  compétences communes/divergentes, distance structurelle entre JSON (base cartographe §3.3
  et promptologue §3.4).

## Points de non-parité assumés

1. Contenu des narratifs LLM (feedback, kairosHtml…) : non reproductible, seule la *structure
   de prompt* est testée (B1).
2. Étage C : prompts d'extraction réécrits (les originaux n'existent pas dans les assets) —
   qualité validée par schéma + banc d'essai P10, pas par diff.
3. Horodatages/context volatile de `carto_merge.json` (`date_construction`) : exclus du diff.

## Ordre d'exécution M4

1. Étage A (le plus contraint par l'oracle) → rapport de parité intermédiaire.
2. Étage B1 (prompts narratifs) puis B2 (document final) → rapport de parité complet.
3. Providers + runs/checkpoints/estimate + consistance (mock).
4. Étage C (extraction) + run bout-en-bout mock sur la fixture 3 journées, interruption/reprise.
5. **Gate M4 : rapport `docs/rapport-parite-moteur.md`** publié avant d'ouvrir M5.
