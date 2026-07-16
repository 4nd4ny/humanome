---
titre: Confidentialité et protection des données
maj: 2026-07-12
---

# Confidentialité et protection des données

humanome.xyz est un service de l'écosystème RESPIRE, porté par **Harmonia
Éducation**. Cette page explique, en clair, quelles données nous traitons,
pourquoi, où elles sont conservées et quels sont vos droits. Le principe de
conception est simple : **par défaut, vos données ne quittent pas votre
navigateur** ; tout stockage sur nos serveurs est un choix explicite de votre
part (opt-in), que vous pouvez retirer à tout moment.

Responsable du traitement : Harmonia Éducation. Contact : voir la section
« Contact et réclamation » en bas de page.

## En bref

- Votre **portfolio** (votre journal réflexif) reste dans votre navigateur tant que vous ne demandez pas explicitement à le déposer sur le serveur.
- Vos **cartographies** ne sont enregistrées sur le serveur que si vous cochez l'option de stockage serveur, cartographie par cartographie.
- Vous pouvez à tout moment **exporter** l'ensemble de vos données en un fichier local, et **supprimer** votre compte en un clic (effacement réel).
- Nous ne déposons **aucun traceur** ni cookie publicitaire : seul un cookie de session strictement nécessaire est utilisé quand vous êtes connecté.
- Nos **journaux techniques** ne contiennent jamais le texte de votre portfolio, de vos cartographies, ni vos mots de passe ou vos clés d'API.

## Quelles données, et pourquoi

Selon votre usage, nous pouvons traiter :

- **Compte** : votre adresse email, un nom affiché de votre choix, et une empreinte de votre mot de passe (jamais le mot de passe en clair). Finalité : vous authentifier et rattacher vos données à votre profil.
- **Portfolio** : le texte de votre journal réflexif. Par défaut il reste **dans votre navigateur** (stockage local IndexedDB) et ne transite par nos serveurs que le temps d'un traitement que vous déclenchez, ou s'il est déposé dans une cohorte d'établissement (voir plus bas). Finalité : produire votre cartographie de compétences.
- **Cartographies** : le résultat JSON de l'analyse de votre portfolio. Enregistré sur le serveur **uniquement si vous l'y autorisez** (opt-in daté), sinon conservé localement et dans vos exports.
- **Progression de formation** : les chapitres de formation que vous avez parcourus, pour afficher votre avancement.
- **Clés d'API personnelles** : si vous choisissez d'utiliser votre propre clé d'un fournisseur de modèle de langage, elle est **chiffrée au repos** et n'est jamais réaffichée ni exposée.
- **Liens de partage** : lorsque vous partagez une cartographie avec un employeur, nous conservons une empreinte (hachage) du lien et du mot de passe de partage — jamais leur valeur en clair.
- **Journaux et compteurs anti-abus** : des compteurs techniques (par exemple le nombre d'appels par heure), avec des identifiants **hachés** — jamais votre adresse IP en clair, jamais le contenu de vos textes.

## Où sont vos données : local par défaut, serveur sur option

C'est le cœur de notre approche « RGPD dès la conception » :

- **Par défaut, local.** Portfolio et cartographies vivent dans votre navigateur. Si vous videz votre navigateur sans avoir exporté, ces données sont perdues — d'où l'export local systématique que nous proposons.
- **Sur option, serveur.** Vous pouvez décider d'enregistrer une cartographie sur nos serveurs (pour la partager, la faire relire par un cartographe, ou la retrouver ailleurs). Ce choix est explicite, daté, et réversible.
- **En établissement.** Si vous rejoignez la cohorte d'un établissement de formation, vous donnez un **consentement explicite** au moment de rejoindre, puis, en déposant votre portfolio, vous autorisez son traitement côté serveur au sein de cette cohorte. L'établissement voit les cartographies produites dans ce cadre. Quitter la cohorte retire ce partage et efface le portfolio déposé.

## Base légale

- **Consentement** (RGPD art. 6.1.a) pour tout stockage serveur de votre portfolio et de vos cartographies, pour l'adhésion à une cohorte d'établissement, et pour le partage d'une cartographie avec un employeur.
- **Exécution du service** (art. 6.1.b) pour la gestion de votre compte (email, nom affiché, authentification) dès lors que vous en créez un.
- **Intérêt légitime** (art. 6.1.f), strictement limité, pour la sécurité du service : compteurs anti-abus à identifiants hachés, journaux techniques minimisés.

Vous pouvez **retirer votre consentement** à tout moment : en dé-cochant le
stockage serveur d'une cartographie, en quittant une cohorte, en révoquant un
lien de partage, ou en supprimant votre compte.

## Durées de conservation

- **Compte et données rattachées** : conservés jusqu'à ce que vous supprimiez votre compte. La suppression est un **effacement réel**, pas une simple désactivation.
- **Liens de partage** : un lien de partage est valable **90 jours par défaut** (durée réglable de 1 à 365 jours au moment du partage), et peut être révoqué à tout moment. Une fois expiré ou révoqué, il est **purgé** par une tâche d'entretien au plus tard 30 jours après.
- **Sessions** : un cookie de session strictement nécessaire, expirant après une période d'inactivité ; l'enregistrement serveur de la session disparaît avec votre compte.
- **Compteurs anti-abus** : fenêtres courtes (à l'heure ou à la journée), à identifiants hachés, sans lien avec votre profil.

## Vos droits

Conformément au RGPD, vous disposez des droits d'**accès**, de **rectification**,
d'**effacement**, de **limitation**, d'**opposition** et de **portabilité**.
Concrètement, sur humanome.xyz :

- **Accès et portabilité** : depuis votre [espace](#/espace) ou la page [Mon compte](#/compte), vous **exportez** en un clic une archive locale contenant votre portfolio, vos cartographies et le référentiel associé, dans un format JSON réutilisable.
- **Effacement** : depuis [Mon compte](#/compte), vous **supprimez votre compte** en un clic. Toutes vos données personnelles sont réellement effacées. Seule subsiste une trace d'audit **anonyme** et datée (le fait qu'une suppression a eu lieu), sans aucune donnée permettant de vous identifier.
- **Rectification** : votre nom affiché et le contenu de vos portfolios/cartographies sont modifiables directement depuis votre espace.

## Sous-traitants et fournisseurs de modèles de langage

L'analyse d'un portfolio fait appel à un **modèle de langage (LLM)**. Selon le
mode d'usage, le texte transmis et le destinataire changent :

- **Démonstration publique** : le proxy de la plateforme transmet le texte que vous collez à **Anthropic** (modèle Claude) pour produire la démonstration. Aucune donnée n'est conservée côté serveur au-delà de compteurs anonymes.
- **Assistant tuteur** : l'assistant (bouton « 💬 ») transmet à **Anthropic** (modèle Claude Haiku) **uniquement votre question et la rubrique que vous consultez** — jamais votre portfolio ni vos cartographies. **Aucune conversation n'est stockée côté serveur** (compteurs anonymes seulement) ; l'historique n'existe que dans votre navigateur, le temps de la session.
- **Clé personnelle** : si vous enregistrez votre propre clé d'API, **vous choisissez** votre fournisseur (Anthropic, OpenAI, Google, etc.). Le texte est transmis au fournisseur que vous avez sélectionné, sous votre propre relation contractuelle avec lui.
- **Établissement** : le traitement utilise soit la **clé de l'établissement**, soit la clé de la plateforme, selon la configuration choisie par l'établissement ; le texte est transmis au fournisseur correspondant.

Ces fournisseurs agissent comme sous-traitants pour le seul temps du traitement.
Nous ne leur transmettons jamais votre mot de passe ni vos identifiants de
compte, et nous ne stockons pas votre texte au-delà de ce que vous avez
explicitement autorisé.

### Analyse approfondie Twin9

L'**analyse approfondie Twin9** est une exception au principe « tout reste dans
le navigateur ». Contrairement aux analyses classiques (qui s'exécutent
localement), Twin9 fait **transiter le texte de votre portfolio par notre
serveur puis par le fournisseur du modèle choisi**, le temps de l'analyse. Ce
texte n'est **pas conservé côté serveur** : les appels sont sans état, seuls des
compteurs (nombre d'appels, tokens, modèle — jamais de contenu) sont journalisés
pour la facturation. L'état de l'analyse et ses résultats restent en local dans
votre navigateur. Chaque lancement requiert un **consentement explicite**. Pour
des journaux d'élèves réels soumis à des exigences renforcées de protection des
données, l'outil local (hors ligne) reste la réponse appropriée.

## Cookies

- **Cookie de session** : strictement nécessaire, déposé uniquement lorsque vous êtes connecté, pour maintenir votre session authentifiée. Sans lui, vous ne pourriez pas rester connecté.
- **Aucun traceur** : pas de cookie publicitaire, pas de mesure d'audience tierce, pas de pistage inter-sites.

## Sécurité

Les échanges sont chiffrés en transit (HTTPS). Les mots de passe sont conservés
sous forme d'empreintes robustes (Argon2id). Les clés d'API personnelles sont
**chiffrées au repos**. Les secrets du service sont conservés hors de la racine
web, inaccessibles publiquement.

## Contact et réclamation

Pour exercer vos droits ou pour toute question relative à vos données, contactez
Harmonia Éducation via [respire.school](https://respire.school) ou l'espace
participatif [participer.harmonia.education](https://participer.harmonia.education).
Vous avez également le droit d'introduire une réclamation auprès de l'autorité de
protection des données compétente.

*Dernière mise à jour : 12 juillet 2026.*
