# Registre des traitements — humanome.xyz (RGPD art. 30)

**Responsable du traitement :** Harmonia Éducation (écosystème RESPIRE).
**Version :** M9 / P12.2 — 2026-07-12.
**Principe transverse (cahier §6) :** aucune donnée de portfolio ni de
cartographie côté serveur par défaut ; tout stockage serveur est un opt-in
explicite et réversible de la personne concernée. Journalisation minimale :
compteurs et identifiants hachés, jamais de contenu ni de secret.

Ce registre décrit un traitement par section. Le croisement table-par-table
avec le schéma de base (migrations 001-009), le sort à la suppression de compte
et la couverture d'export figure dans `docs/rgpd-verification.md`. L'outil
`scripts/rgpd-audit.php` vérifie ces garanties sur un compte réel.

Base légale (rappel des renvois RGPD art. 6.1) : **a** = consentement, **b** =
exécution du service/contrat, **f** = intérêt légitime.

---

## 1. Comptes et rôles

| Élément | Détail |
|---|---|
| Finalité | Authentifier la personne, rattacher ses données à son profil, porter les rôles de l'écosystème (§2). |
| Personnes concernées | Apprenants, cartographes, promptologues, épistémiarques, employeurs, établissements, administrateurs. |
| Données | Email, nom affiché (éditable), **photo de profil / avatar (optionnelle, D6)**, empreinte de mot de passe (Argon2id — jamais le mot de passe en clair), rôles, date de création. |
| Base légale | **b** (exécution du service dès la création de compte) ; **a** (consentement) pour la photo de profil, facultative. |
| Durée | Jusqu'à suppression du compte par la personne (effacement réel). La photo peut être retirée indépendamment à tout moment depuis le profil. |
| Destinataires | Interne uniquement (aucun tiers). La photo, servie par `GET /api/users/{id}/avatar`, est visible par qui dispose du lien (cache privé). |
| Tables | `users` (dont `avatar` MEDIUMBLOB + `avatar_mime`, migration 019), `roles`, `user_roles`, `sessions`. |
| Sort à la suppression | `users` supprimé (avatar inclus, colonnes de la ligne) ; `user_roles`, `sessions` en CASCADE. Retrait indépendant de la photo : `DELETE /api/auth/me/avatar`. |

### 1 bis. Vérification d'email à l'inscription (D5)

| Élément | Détail |
|---|---|
| Finalité | Confirmer que l'adresse email appartient bien à la personne qui s'inscrit (un compte n'est activé qu'après confirmation d'un code à 4 chiffres envoyé par email). |
| Personnes concernées | Toute personne créant un compte. |
| Données | Email (destinataire du message), empreinte du code de confirmation (hash — jamais le code en clair en base), date d'expiration, compteur d'essais, date de vérification. |
| Base légale | **b** (mesure précontractuelle : sécuriser la création du compte demandé). |
| Durée | Code : 30 minutes (expiration), effacé dès l'activation. `email_verified_at` : durée de vie du compte. |
| Destinataires | Transport email : `mail()` de l'hébergeur OVH (l'email transite par l'infrastructure OVH, sous-traitant d'hébergement déjà au registre). Aucun service d'emailing tiers. |
| Tables | Colonnes `users.email_verified_at`, `users.verification_code_hash`, `users.verification_expires_at`, `users.verification_attempts` (migration 018). |
| Sort à la suppression | Colonnes de la ligne `users` : purge en même temps que le compte (aucune table séparée). |

## 2. Portfolios (journal réflexif)

| Élément | Détail |
|---|---|
| Finalité | Servir de source à la production d'une cartographie de compétences. |
| Personnes concernées | Apprenants. |
| Données | Texte libre du journal réflexif, segmenté par journée. |
| Localisation | **Local par défaut** (IndexedDB navigateur) ; transite par le serveur uniquement le temps d'un traitement déclenché, ou lorsqu'il est déposé dans une cohorte d'établissement (§9). |
| Base légale | **a** (consentement) pour tout dépôt/traitement serveur ; le traitement purement local ne relève pas d'un stockage serveur. |
| Durée | Local : tant que la personne ne vide pas son navigateur. Dépôt cohorte : jusqu'au retrait du consentement (quitter la cohorte) ou suppression du compte. |
| Destinataires | Fournisseur de LLM le temps du traitement (§8) ; établissement si dépôt en cohorte (§9). |
| Tables | Aucun stockage serveur en dehors des cohortes : `cohorte_portfolios` (dépôt B2B, §9). |
| Sort à la suppression | `cohorte_portfolios` en CASCADE (compte apprenant et cohorte). |

## 3. Cartographies

| Élément | Détail |
|---|---|
| Finalité | Résultat JSON de l'analyse d'un portfolio ; visualisation, relecture, partage. |
| Personnes concernées | Apprenants. |
| Données | Document JSON de cartographie (jour/merge), métadonnées de run (fournisseur, modèle, coûts estimés — compteurs, jamais de texte de portfolio), versions de prompt et de référentiel utilisées. |
| Localisation | **Local par défaut** ; enregistrement serveur uniquement sur **opt-in daté** (`opt_in_at`), cartographie par cartographie. |
| Base légale | **a** (consentement, opt-in explicite). |
| Durée | Jusqu'à retrait de l'opt-in, suppression de la cartographie, ou suppression du compte. |
| Destinataires | Cartographe lié (si visibilité `cartographe`), employeur (via lien de partage, §5), établissement (cadre cohorte, §9). |
| Tables | `cartographies` (+ `cartography_annotations`, `cartography_revisions`, `cartography_garanties` pour la relecture cartographe). |
| Sort à la suppression | `cartographies` en CASCADE ; annotations CASCADE ; révisions anonymisées (`author_id` SET NULL) car ce sont des données de l'apprenant ; garanties CASCADE. |

## 4. Progression de formation

| Élément | Détail |
|---|---|
| Finalité | Afficher l'avancement d'une personne dans les parcours de formation (§4.6). |
| Personnes concernées | Toute personne connectée suivant un parcours. |
| Données | Parcours + chapitre + date de complétion (aucun contenu). |
| Base légale | **b** (fonctionnalité du compte). |
| Durée | Jusqu'à suppression du compte. |
| Destinataires | Interne. |
| Tables | `training_progress`. |
| Sort à la suppression | CASCADE. |

## 5. Liens de partage employeur

| Élément | Détail |
|---|---|
| Finalité | Partager une cartographie validée avec un employeur (lien + mot de passe), décision individuelle explicite (§3.6). |
| Personnes concernées | Apprenants (émetteurs), employeurs (destinataires). |
| Données | Empreinte (sha256) du jeton de lien, empreinte (Argon2id) du mot de passe de partage, échéance, date de révocation — **jamais** les valeurs en clair. |
| Base légale | **a** (consentement, décision individuelle). |
| Durée | Validité **90 jours par défaut** (réglable 1-365 j à la création, `share.php` `expiresInDays`) ; révocable à tout moment ; liens expirés/révoqués **purgés au plus tard 30 jours** après expiration (`scripts/maintenance.php`). |
| Destinataires | Employeur muni du lien + mot de passe. |
| Tables | `share_links`. |
| Sort à la suppression | CASCADE via la cartographie ; entretien périodique pour les liens dormants. |

## 6. Clés d'API personnelles

| Élément | Détail |
|---|---|
| Finalité | Permettre à une personne d'utiliser sa propre clé d'un fournisseur de LLM. |
| Personnes concernées | Apprenants/utilisateurs avancés ; établissements (clé de cohorte, §9). |
| Données | Clé d'API **chiffrée au repos** (libsodium, clé maîtresse hors webroot, ADR-004) ; jamais réaffichée ni exposée. |
| Base légale | **a**/**b** (fonctionnalité demandée). |
| Durée | Jusqu'à effacement par la personne ou suppression du compte. |
| Destinataires | Le fournisseur choisi par la personne, le temps du traitement. |
| Tables | `user_api_keys` (+ `etablissement_config.encrypted_key` pour le B2B). |
| Sort à la suppression | CASCADE. |

## 7. Démonstration publique (proxy LLM)

| Élément | Détail |
|---|---|
| Finalité | Offrir une démonstration de cartographie à un visiteur sans compte (§3.1). |
| Personnes concernées | Visiteurs anonymes. |
| Données | **Compteurs anonymes uniquement** : tokens et coût estimé par jour (UTC), quotas par IP hachée (sha256, jamais d'IP brute), empreintes de défis anti-abus consommés. Aucun prompt, aucune réponse, aucune IP en clair conservés. |
| Base légale | **f** (intérêt légitime : sécurité et maîtrise du budget). |
| Durée | Compteurs journaliers (fenêtres courtes), purgés par l'entretien ; défis anti-rejeu à TTL de 2 min. |
| Destinataires | Anthropic (le temps du traitement, texte non conservé côté serveur). |
| Tables | `llm_usage_daily`, `llm_pow_challenges`, `rate_limits` (buckets hachés). |
| Sort à la suppression | Sans objet (aucune donnée nominative ; aucune colonne `user_id`). |

## 8. Sous-traitance modèles de langage (LLM)

| Élément | Détail |
|---|---|
| Finalité | Analyse du texte du portfolio pour produire la cartographie. |
| Personnes concernées | Toute personne déclenchant un run. |
| Données transmises | Le texte à analyser + consignes système. Jamais le mot de passe ni les identifiants de compte. |
| Destinataire | **Démo** : Anthropic via le proxy plateforme. **Clé perso** : le fournisseur choisi par la personne. **Établissement** : la clé de l'établissement ou de la plateforme, selon sa configuration. |
| Base légale | **a** (le run est déclenché par la personne). |
| Conservation côté humanome | Aucune, au-delà de ce que la personne a explicitement stocké (§3). |

## 9. Cartographie de masse — établissements (B2B)

| Élément | Détail |
|---|---|
| Finalité | Cartographier les cohortes d'un établissement de formation (§3.7/§4.9). |
| Personnes concernées | Apprenants membres d'une cohorte ; établissement. |
| Données | Adhésion **avec consentement explicite** (`cohorte_membres.consent_at` — rejoindre exige `{"consentement": true}`), portfolio déposé (`cohorte_portfolios`, texte + segments), documents journaliers produits (`mass_jobs.document`), configuration LLM/budget de l'établissement, journaux de run (compteurs). |
| Base légale | **a** (consentement de l'apprenant à deux étages : rejoindre, puis déposer) ; **b** (contrat établissement). |
| Durée | Jusqu'au retrait du consentement (quitter la cohorte : adhésion + portfolio effacés, jobs en attente annulés), suppression du compte apprenant, ou suppression de la cohorte/compte établissement. |
| Destinataires | L'établissement voit les cartographies produites dans ce cadre (tant que l'adhésion est active). |
| Tables | `cohortes`, `cohorte_membres`, `cohorte_portfolios`, `etablissement_config`, `mass_runs`, `mass_jobs`. |
| Sort à la suppression | CASCADE sur le compte apprenant (adhésion, portfolio, jobs) ET sur le compte établissement (tout l'arbre). `mass_jobs.portfolio_id` SET NULL quand le portfolio est effacé (les documents déjà produits survivent au départ, mais sortent de la portée de l'établissement — cf. limite d'accès dans `docs/rgpd-verification.md`). |

## 10. Journal d'audit

| Élément | Détail |
|---|---|
| Finalité | Traçabilité minimale des événements sensibles (création/suppression de compte, partage, adhésion, octroi de rôle…) — §6.5. |
| Personnes concernées | Toute personne effectuant une action tracée. |
| Données | Type d'événement, date, `details` = faits structurés minuscules (identifiants, compteurs, valeurs de liste blanche). **Jamais** de contenu, de mot de passe, de clé, d'email. |
| Base légale | **f** (intérêt légitime : sécurité, obligations de traçabilité). |
| Durée | Conservé au-delà du compte, mais **anonymisé** : `user_id` passe à NULL à la purge — la trace datée subsiste sans identifier personne. |
| Destinataires | Interne. |
| Tables | `audit_events`. |
| Sort à la suppression | `user_id` SET NULL (anonymisation légitime, pas un oubli de purge). |

## 11. Crédit prépayé Twin9

| Élément | Détail |
|---|---|
| Finalité | Facturer l'usage de la clé API plateforme pour les runs Twin9 (ADR-010 §3) : solde prépayé, recharges PayPal, débit par appel. |
| Personnes concernées | Titulaires de compte utilisant Twin9. |
| Données | **Compteurs uniquement** : solde en micro-USD (`twin9_credits`), journal des mouvements (`twin9_credit_events` : montant, étiquette d'étape, modèle, tokens réels, identifiant d'ordre PayPal). **Aucune donnée bancaire** (le paiement se fait chez PayPal), aucun contenu de portfolio ni de prompt. |
| Base légale | **b** (exécution du service prépayé demandé par la personne). |
| Durée | Vie du compte. |
| Destinataires | PayPal (paiement chez eux ; nous ne recevons que l'id d'ordre, le montant, l'état). |
| Tables | `twin9_credits`, `twin9_credit_events`. |
| Sort à la suppression | CASCADE (le solde et son journal appartiennent à la personne). |

---

## Référentiel et système de prompts (donnée non personnelle)

Le référentiel de compétences (`referentiel_versions`) et les prompts
(`prompt_packages`, `prompt_versions`, `settings`) sont des **contenus
collectifs, publics en lecture et immuables une fois publiés**. Ils ne
contiennent pas de donnée personnelle des apprenants. La seule attache à une
personne est `created_by` (l'auteur épistémiarque/promptologue), passée en
**SET NULL** à la suppression de son compte : la version publiée survit
anonymisée, ce qui est cohérent avec son caractère immuable et collectif. Ce
n'est donc pas un traitement de données personnelles d'apprenant.

Il en va de même des gabarits Twin9 (`twin9_protocole`,
`twin9_protocole_versions`, migration 011) : contenu de plateforme
confidentiel (ADR-010), sans donnée personnelle. Les colonnes `updated_by` /
`created_by` (l'administrateur éditeur) passent en **SET NULL** à la
suppression de son compte, comme `golden_grants.granted_by`.
