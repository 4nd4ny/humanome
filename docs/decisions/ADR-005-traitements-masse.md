# ADR-005 — Traitements de masse : file de jobs MySQL + worker cron à ticks courts

## Statut

Accepté — 2026-07 (décision pré-actée AD-5 du plan de construction).

## Contexte

Les établissements de formation doivent pouvoir lancer une « cartographie en masse
de leurs classes (centaines à dizaines de milliers d'élèves) » (§3.7), avec un
« budget maximal configurable » et le choix entre une clé API « qualité
établissement » gérée par Harmonia ou « une infrastructure LLM propre à
l'établissement (serveur local) » (§4.9).

Contraintes :

- L'exécution client-first (ADR-001) ne convient pas à la masse : on ne peut pas
  exiger des milliers de navigateurs ouverts pendant des heures.
- Le mutualisé OVH (§5) interdit les processus longs, alors qu'« un run peut prendre
  plusieurs heures » (§8). Un traitement de masse serveur doit donc être découpé en
  exécutions courtes.
- Le mutualisé OVH offre en revanche un **accès cron** (tâches planifiées à
  intervalle régulier, avec limite de durée par exécution).
- Le moteur `engine/` (ADR-001) est déjà conçu avec découpage journalier,
  checkpoints et reprise (§4.3, §8) : l'unité de travail « une journée de
  portfolio » est naturellement petite et reprenable.

## Décision

**La cartographie de masse passe par une file de jobs en MySQL, consommée par un
worker PHP lancé par le cron OVH à ticks courts, avec reprise incrémentale.**

- **File de jobs** : table `jobs` MySQL (statut, priorité, cohorte, checkpoints par
  journée, compteurs tokens/coût, erreurs). L'unité de travail est fine (une journée
  d'un portfolio, ou un lot borné de journées), jamais « un élève entier ».
- **Worker cron** : `scripts/worker.php`, déclenché par le cron OVH à intervalle
  régulier. Chaque tick : verrouille un lot de travail, traite pendant **moins de
  50 secondes** (marge sous le timeout mutualisé), écrit les checkpoints, libère.
  Un run de plusieurs heures (§8) devient une suite de ticks courts ; toute
  interruption reprend au dernier checkpoint (reprise incrémentale).
- **Budget** : le worker décrémente le compteur de coût de l'établissement et
  s'arrête au plafond (§3.7) — coupe-circuit vérifié à chaque tick.
- **Alternative : runner CLI Node** (`scripts/runner-node/`), fourni aux
  établissements disposant d'une machine ou d'un LLM local (§4.9) : il consomme **la
  même file via l'API** (mêmes jobs, mêmes checkpoints, même moteur `engine/`),
  mais tourne chez l'établissement, sans limite de durée, et peut cibler son
  infrastructure LLM locale (Ollama, endpoint compatible OpenAI). Il ne s'exécute
  jamais sur OVH (ADR-003).

## Conséquences

Positives :

- La masse (§3.7, §4.9) devient possible sur le mutualisé sans violer la contrainte
  des processus longs (§8) : le débit est limité mais le traitement aboutit.
- Un seul moteur (`engine/`, ADR-001) pour trois modes d'exécution : navigateur,
  worker cron, runner CLI — pas de divergence de logique de cartographie.
- La file MySQL donne gratuitement le tableau de suivi de cohorte (avancement,
  erreurs, coût cumulé) et l'arrêt au budget (§3.7).
- Le runner CLI répond au cas « infrastructure LLM propre à l'établissement »
  (§4.9) et prépare la vision long terme du serveur GPU local (§5).

Négatives / à assumer :

- Débit du worker cron limité (fréquence des ticks × 50 s) : pour de très grandes
  cohortes, le runner CLI côté établissement est la voie recommandée ; le
  dimensionnement est étudié dans `docs/plan-masse.md` (P11).
- Le verrouillage des jobs doit être robuste (ticks concurrents, tick tué en plein
  travail) : verrous à expiration + écritures idempotentes par checkpoint.
- Les portfolios traités en masse transitent côté serveur : ce mode est un **opt-in
  contractuel de l'établissement**, avec consentement visible des apprenants,
  à documenter dans le registre RGPD (§6, P12).

Réversibilité : sur l'hébergement cible v2+ (§5), le worker cron peut être remplacé
par un worker résident consommant la même table `jobs`, sans changer le format de la
file ni le moteur.
