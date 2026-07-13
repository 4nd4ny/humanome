---
parcours: etablissement
chapitre: 3
titre: "Configurer le moteur LLM et le budget"
statut: complet
---

# Configurer le moteur LLM et le budget

Avant de cartographier une classe entière, deux décisions vous reviennent : **quel
moteur** analyse les portfolios, et **jusqu'à combien** vous acceptez de dépenser.
Ces deux réglages vivent au même endroit — la section « Configuration LLM et
budget » de l'accueil de votre espace — et ils commandent tout ce qui suit. Le
choix du moteur engage la confidentialité (où partent les textes des apprenants ?)
et le coût (à quel tarif chaque appel est-il facturé ?). Le plafond de budget, lui,
est votre frein de sécurité : il garantit qu'un run lancé sur des centaines de
portfolios ne peut pas déraper au-delà d'un montant que vous avez fixé à l'avance.
Ce chapitre explique chaque option, comment la remplir, et comment lire la dépense.

> **Objectifs d'apprentissage**
>
> À l'issue de ce chapitre, vous saurez :
> - choisir entre le service humanome et votre propre infrastructure LLM ;
> - renseigner une URL de point d'accès, un modèle et une clé API en sachant comment la clé est protégée ;
> - fixer un plafond de dépense et comprendre ce qui se passe quand il est atteint ;
> - lire la dépense courante et anticiper le coût d'un run.

## 1. Où se règle la configuration

Depuis l'accueil de votre espace (**#/etablissement**), faites défiler jusqu'à la
section **« Configuration LLM et budget »**. Vous y trouvez un formulaire unique
qui rassemble le choix du fournisseur, ses paramètres, et le plafond de budget. Un
bouton **« Enregistrer la configuration »** valide l'ensemble. Cette configuration
est propre à votre établissement et s'applique à tous les runs que vous lancerez.

## 2. Choisir le fournisseur LLM

Le formulaire propose deux options, sous « Fournisseur LLM ».

### Option A — Service humanome

C'est le choix par défaut : « Service humanome — clé « qualité établissement »
gérée par Harmonia, facturée à l'usage ». Vous n'avez aucune clé à fournir :
Harmonia met à disposition une clé API de bonne qualité, et vous êtes facturé à
l'usage. C'est l'option la plus simple, adaptée si vous ne disposez pas de votre
propre infrastructure LLM. Le modèle de référence utilisé pour l'estimation dans ce
mode est un modèle de la gamme Claude Sonnet.

### Option B — Mon infrastructure

Second choix : « Mon infrastructure — URL compatible OpenAI (serveur local,
Ollama…) ». Il s'adresse aux établissements qui hébergent leur propre moteur, par
exemple un serveur local ou une instance Ollama, exposant une API **compatible
OpenAI**. C'est l'option la plus protectrice pour la confidentialité, puisque les
textes des apprenants sont traités sur votre infrastructure. Elle ouvre trois
champs supplémentaires :

- **URL du point d'accès** — l'adresse de votre API, par exemple
  `https://llm.mon-etablissement.fr/v1`. Ce champ est obligatoire dès que vous
  choisissez cette option ; sans lui, l'enregistrement est refusé avec le message
  « Indiquez l'URL de votre point d'accès compatible OpenAI. »
- **Modèle** — le nom du modèle à interroger, par exemple `llama3.1:70b`.
- **Clé API** — la clé d'accès à votre point d'accès.

## 3. La clé API et sa protection

La clé mérite une explication à part, car sa manipulation est délibérément
prudente :

- elle est **chiffrée côté serveur** (avec libsodium) : elle n'est jamais stockée
  en clair ;
- elle n'est **jamais réaffichée ni renvoyée** par l'interface. Le champ reste
  vide, et le formulaire signale seulement qu'une clé est déjà enregistrée
  (« Une clé est enregistrée (jamais réaffichée) — saisir pour remplacer ») ;
- pour **conserver** la clé actuelle, laissez le champ vide en enregistrant : rien
  ne change. Pour la **remplacer**, saisissez la nouvelle valeur.

Autrement dit, vous ne relirez jamais une clé saisie : notez-la ailleurs si vous en
avez besoin. Ce comportement est volontaire — une clé qu'on ne peut pas relire est
une clé qu'on ne peut pas exfiltrer par l'écran.

## 4. Fixer le plafond de budget

Sous « Plafond de dépense (USD) », saisissez un montant en dollars (0 ou plus).
C'est le montant maximal que vos runs sont autorisés à consommer. Le champ n'accepte
qu'un montant valide : une saisie négative ou non numérique déclenche le message
« Le plafond de budget doit être un montant en dollars (0 ou plus). »

Ce plafond n'est pas une simple alerte : c'est un frein matériel. **Au plafond, les
traitements s'arrêtent automatiquement.** Les jobs qui ne peuvent plus être payés
passent au statut « budget dépassé » au lieu de continuer à dépenser. Vous pouvez
les réactiver plus tard en **augmentant le plafond** puis en relançant — mais rien
ne dépense au-delà du montant que vous avez inscrit. Fixez-le donc en conscience,
en vous aidant de l'estimation décrite ci-dessous.

## 5. Lire la dépense courante

Sous le champ de budget, une ligne vous informe en permanence : **« Dépense
courante : … »**, suivie, si un plafond est défini, de « sur un plafond de … ».
C'est le cumul de ce que vos runs ont déjà consommé. Surveillez cet écart entre la
dépense et le plafond : c'est votre marge restante pour les prochains runs.

## 6. Anticiper le coût avant de lancer

La configuration fixe le cadre ; l'estimation fine se fait au moment du lancement,
sur la page de la cohorte. Avant de confirmer un run, la plateforme calcule pour
vous une **estimation du coût** en fonction du nombre de membres sélectionnés, du
nombre total de journées, et du modèle configuré. Elle raisonne sur l'extraction —
huit appels par journée (les sept pôles du référentiel plus une synthèse), la
fusion étant calculée sans appel LLM. Deux points d'honnêteté à connaître dès
maintenant :

- si votre modèle n'est pas dans la table de prix de la plateforme (cas fréquent
  d'un modèle local ou Ollama), le coût s'affiche **« inconnu (modèle hors table de
  prix) »** : la plateforme ne devine pas un tarif qu'elle ignore ;
- l'estimation reste une estimation, accompagnée d'un avertissement à ce sujet ;
  le plafond de budget est là précisément pour la borne dure.

Le détail de cette estimation et du lancement fait l'objet du chapitre suivant —
voir « 04-lancer-et-suivre-un-run.md ». Vous avez ici posé les deux réglages
structurants : le moteur qui lira vos apprenants, et la limite que vous ne
dépasserez pas.
