---
parcours: epistemiarque
chapitre: 1
titre: "Le rôle de l'épistémiarque"
statut: complet
---

# Le rôle de l'épistémiarque

Toutes les cartographies produites sur humanome.xyz reposent sur un même socle : le référentiel RESPIRE, ses **7 pôles** et ses **61 compétences**. Ce socle n'est pas une donnée technique parmi d'autres. C'est la définition, publique et discutable, de ce que la plateforme accepte d'appeler une « compétence humaine ». Quand le moteur cherche dans une feuille de portfolio la trace de la compétence `1.04 Métacognition & Humilité Épistémique`, il cherche exactement ce que le référentiel dit qu'elle est — ni plus, ni moins. Décider ce que le référentiel dit, le faire évoluer sans le trahir, et le garantir stable dans le temps : c'est le métier de l'épistémiarque.

C'est un rôle de gouvernance, pas de production. L'épistémiarque ne cartographie pas d'apprenant, n'écrit pas de prompt, ne relit pas de dossier. Il tient le vocabulaire commun sur lequel tous les autres rôles s'appuient. Une responsabilité discrète et lourde : un mot changé dans une définition de compétence se répercute, potentiellement, sur des dizaines de milliers de cartographies à venir.

> **Objectifs d'apprentissage**
>
> À l'issue de ce chapitre, vous saurez :
> - situer l'épistémiarque parmi les huit rôles de la plateforme et dire ce qu'il tient que les autres ne tiennent pas ;
> - expliquer pourquoi un référentiel *commun*, *public* et *versionné* est la condition de cartographies justes et comparables ;
> - décrire l'articulation entre le référentiel (dans humanome) et l'espace participatif Decidim (hors humanome) ;
> - énoncer la responsabilité propre du rôle : stabilité, traçabilité, honnêteté épistémique.

## 1. Pourquoi un référentiel commun

Une cartographie de compétences n'a de valeur que si elle est **lisible par un autre que son auteur**. Un apprenant construit sa cartographie pour la comprendre, mais aussi pour la partager — avec un cartographe qui la garantit, avec un employeur qui la reçoit par lien. Pour que « `2.02 Communication Authentique` » veuille dire la même chose dans la cartographie de Léa à Genève et dans celle d'un apprenant à Dakar, il faut un référentiel unique, dont la définition ne dépend ni de la personne, ni de l'école, ni du moment.

Trois propriétés rendent ce socle utilisable, et ce sont elles que l'épistémiarque garde :

- **Commun.** Un seul référentiel fait autorité pour toute la plateforme. On ne duplique pas, on ne « fork » pas par établissement : la comparabilité des cartographies en dépend directement.
- **Public en lecture.** N'importe qui — apprenant, employeur, visiteur sans compte — peut lire l'intégralité du référentiel à la route `#/referentiel`. Rien n'est caché : ce que la plateforme mesure est exposé et critiquable. C'est une exigence éthique du projet, pas une option.
- **Versionné.** Le référentiel évolue, mais aucune version publiée n'est jamais modifiée en place. Chaque cartographie mémorise *la version du référentiel utilisée au moment de son run*. On peut donc toujours relire une cartographie ancienne à la lumière du référentiel qui l'a produite. Sans cette immuabilité, une cartographie de l'an dernier deviendrait illisible dès la première correction du référentiel.

L'en-tête de la vue publique le dit d'ailleurs mot pour mot : « Public en lecture, édité par les épistémiarques, versionné : aucune version publiée n'est modifiée en place. »

## 2. Où vit le référentiel dans la plateforme

Pour prendre la mesure du rôle, commencez par lire ce que tout le monde voit. Ouvrez `#/referentiel`. Vous y trouvez :

- un **en-tête** qui rappelle l'identité et la version courante — aujourd'hui « RESPIRE v7 — version 7.0.0 · 7 pôles, 61 compétences » ;
- un **bandeau** sobre vers l'espace participatif : « Le référentiel s'édite collectivement : l'espace participatif Decidim d'Harmonia Éducation nourrit et critique le référentiel, il ne le remplace pas », avec un bouton *Participer sur participer.harmonia.education* ;
- un champ **Rechercher une compétence** (recherche plein-texte sur le code et le nom, insensible aux accents ; essayez `1.01` ou `pensée critique`) ;
- les **7 pôles**, chacun à sa couleur, dépliés en la liste de ses compétences ;
- pour chaque compétence, un **code cliquable** (par exemple `1.04`) qui fabrique un **permalien** `#/referentiel/1.04` : la page défile jusqu'à la compétence et la met en surbrillance. C'est ce lien que vous partagerez dans un débat pour désigner sans ambiguïté la compétence dont il est question.

Retenez une chose essentielle pour tout ce parcours : **cette vue est en lecture seule, y compris pour vous.** Il n'existe pas, dans humanome, de bouton « éditer le référentiel », ni de formulaire pour ajouter une compétence. Le travail d'édition et de délibération se fait ailleurs (le chapitre 3 le détaille), et la publication d'une nouvelle version est un acte de gouvernance, pas un clic dans l'interface (chapitre 4). L'épistémiarque n'a pas de « super-pouvoir » caché dans la page : il a une **responsabilité** sur ce qui finit par y être publié.

## 3. L'épistémiarque parmi les huit rôles

humanome distingue huit profils. Les situer les uns par rapport aux autres, c'est comprendre ce que l'épistémiarque tient — et ce qu'il ne tient pas.

- Le **visiteur** essaie une démo sans compte.
- L'**apprenant** construit sa cartographie à partir de son portfolio réflexif.
- Le **cartographe** relit, corrige et *garantit* de sa signature la cartographie d'un apprenant : c'est le garde-fou humain qui empêche une cartographie 100 % automatisée.
- Le **promptologue** conçoit, teste et versionne les prompts (et le code) qui scannent les portfolios.
- L'**épistémiarque** — vous — édite collectivement le référentiel de compétences et pilote son évolution.
- L'**employeur** consulte des cartographies partagées.
- L'**établissement** cartographie ses cohortes.
- L'**administrateur** gère les paramètres système et le Golden Prompt.

La ligne de partage la plus importante pour vous est celle qui vous sépare du **promptologue**. Le promptologue décide *comment on cherche* une compétence dans un texte ; l'épistémiarque décide *ce qu'est* cette compétence et *si elle existe* dans le référentiel. Un prompt suppose toujours une structure de pôles et de codes ; c'est vous qui la fixez. Quand vous ajoutez ou renommez une compétence, vous obligez le promptologue à revoir son paquet et à déclarer sa compatibilité avec la nouvelle version — d'où l'importance de ne jamais bouger le référentiel à la légère.

## 4. La responsabilité propre du rôle

Trois exigences résument l'éthos de l'épistémiarque.

**La stabilité.** Un référentiel qui change tous les mois est inexploitable : les cartographies deviennent incomparables, les promptologues courent après les versions, les apprenants ne savent plus ce qu'on a mesuré chez eux. Votre premier réflexe n'est donc pas d'ajouter, mais de résister à l'ajout — de vérifier qu'une évolution est vraiment nécessaire, et qu'elle vaut son coût de propagation. Le référentiel actuel compte 61 compétences ; ce nombre est un équilibre, pas une frontière à faire grossir.

**La traçabilité.** Toute évolution doit pouvoir être expliquée, des mois plus tard, à quelqu'un qui n'était pas dans la discussion : pourquoi cette compétence a été ajoutée, quel débat l'a précédée, quelle version l'a introduite. Le versionnement sémantique et le lien permanent vers l'espace participatif servent exactement cela.

**L'honnêteté épistémique.** C'est le cœur du métier — et le sujet du dernier chapitre. Le référentiel prétend nommer « ce qui rend un humain irremplaçable » à l'ère de l'IA. C'est une prétention forte, faillible, jamais définitive. L'épistémiarque la porte avec humilité : il sait que le référentiel est un *modèle* — une paire de lunettes pour mieux voir, pas une vérité gravée. Ce doute méthodique n'est pas une faiblesse du rôle : c'est sa condition d'exercice honnête.

## 5. Ce que fait concrètement un épistémiarque

Au quotidien, le travail se déroule en quatre gestes, que les chapitres suivants reprennent un à un :

- **Connaître le socle.** Maîtriser les 7 pôles, les 61 compétences et la structure d'une compétence, pour parler juste et repérer les recouvrements — voir « [L'anatomie du référentiel](02-anatomie-du-referentiel.md) ».
- **Faire remonter et instruire.** Recueillir les besoins de la société civile, des métiers et des écoles ; ouvrir et animer les débats sur l'espace participatif — voir « [Proposer et débattre](03-proposer-et-debattre.md) ».
- **Versionner sans casser.** Décider d'une version, mesurer son impact sur les cartographies existantes, organiser leur régénération rétrospective — voir « [Versionner le référentiel](04-versionner-le-referentiel.md) ».
- **Tenir la doctrine.** Savoir ce qui fait, ou non, une compétence humaine : c'est le socle théorique du rôle — voir « [Principes de noésiologie](05-principes-de-noesiologie.md) ».

Ces chapitres se lisent dans l'ordre depuis le [hub des guides](#/guides). Le suivant ouvre le référentiel et le décortique compétence par compétence.
