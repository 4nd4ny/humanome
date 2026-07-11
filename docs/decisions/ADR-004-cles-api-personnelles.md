# ADR-004 — Clés API personnelles : localStorage par défaut, stockage serveur opt-in chiffré

## Statut

Accepté — 2026-07 (décision pré-actée AD-4 du plan de construction).

## Contexte

Le cahier des charges prévoit que les utilisateurs avancés enregistrent leur
**propre clé API** pour utiliser un modèle frontière au choix : le profil
utilisateur « stocke [...] clé API personnelle optionnelle (pour utiliser un modèle
frontière au choix : GPT, Gemini, Claude, Grok, etc.) » (§4.5) ; le §5 confirme la
« possibilité d'enregistrer sa propre clé API (rattachée à son profil, non
publique) ».

Une clé API est une donnée hautement sensible : elle donne accès au compte payant de
l'utilisateur chez le fournisseur LLM. Les principes RGPD du projet s'appliquent par
extension :

- minimisation et non-stockage serveur par défaut (§6.1, §6.2 : « stockage
  serveur = option explicite (opt-in) ») ;
- « RGPD à traiter comme contrainte de conception dès la v1 » (§8) ;
- export/suppression de compte en un clic (§6.3) — la clé doit suivre.

L'exécution client-first (ADR-001) rend le stockage serveur inutile dans le cas
nominal : les appels LLM avec clé personnelle partent directement du navigateur.

## Décision

**Par défaut, la clé API personnelle est stockée uniquement dans le `localStorage`
du navigateur de l'utilisateur.**

- Elle n'est jamais transmise au serveur Harmonia dans ce mode ; le moteur
  (ADR-001) l'utilise en transport « direct navigateur ».
- L'interface l'affiche explicitement : « votre clé ne quitte pas ce navigateur ».

**En option (opt-in explicite), l'utilisateur peut demander le stockage serveur de
sa clé** — utile pour la retrouver sur plusieurs appareils. Dans ce cas :

- la clé est **chiffrée avec libsodium** (`sodium_crypto_secretbox` ou équivalent
  authentifié) avant insertion en base (table `user_api_keys`, P3) — jamais en
  clair, jamais en hash simple (elle doit être déchiffrable pour usage) ;
- la **clé maîtresse de chiffrement est stockée hors webroot** (fichier `.env` /
  secret hors de l'arborescence servie par Apache), afin qu'une fuite de la base ou
  une faille d'exposition de fichiers web ne suffise pas à compromettre les clés ;
- la suppression de compte (§6.3) purge la clé chiffrée ; l'événement est journalisé
  dans l'audit RGPD minimal (P3) ;
- l'opt-in est révocable à tout moment (suppression de la clé serveur, retour au
  mode localStorage).

## Conséquences

Positives :

- Cas nominal à risque serveur nul : rien à voler côté serveur, conforme au §6 et à
  la posture « le serveur n'est que proxy + persistance opt-in » (ADR-001).
- L'opt-in chiffré offre le confort multi-appareils sans stockage en clair ; la clé
  maîtresse hors webroot protège contre les vecteurs classiques du mutualisé
  (listing de fichiers, inclusion, dump SQL).
- Cohérent avec le §5 : la clé est « rattachée au profil, non publique ».

Négatives / à assumer :

- `localStorage` est vulnérable au XSS : la CSP stricte et la revue sécurité (P12)
  sont donc des prérequis, et la sandbox des prompt-packages (P10 — code JS tiers
  exécuté chez l'utilisateur) ne doit jamais avoir accès au stockage des clés.
- Une clé stockée seulement en localStorage est perdue si le navigateur est purgé ;
  l'UI doit le dire clairement (la clé reste régénérable chez le fournisseur).
- La gestion de la clé maîtresse (génération, rotation, sauvegarde hors webroot)
  doit être documentée dans la procédure de déploiement (P13) et le registre RGPD
  (P12).

Réversibilité : un éventuel chiffrement côté client (clé dérivée du mot de passe
utilisateur) pourrait renforcer l'opt-in serveur ; ce durcissement ferait l'objet
d'un ADR complémentaire, sans changer le défaut localStorage.
