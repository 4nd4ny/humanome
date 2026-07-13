---
parcours: promptologue
chapitre: 2
titre: "Genèse et logique du prompt de base"
statut: complet
---

# Genèse et logique du prompt de base

Le prompt de base est né d'un constat : demandé naïvement, un LLM trouve
toutes les compétences dans n'importe quel texte, parce qu'il cherche à
plaire. La réponse est une architecture judiciaire à deux figures. Le
**Greffier** relève les passages saillants de la feuille et verse des pièces
au dossier de chaque compétence, sans juger. Le **pédagogue adversarial**
instruit ensuite à charge : présomption d'absence, puis présomption de
sycophantie, avant une conclusion chiffrée. Le verdict tient en trois statuts
— « présence établie », « présence non établie », « renvoi au cartographe » —
et une règle d'économie : sans pièce extraite, court-circuit, pas d'examen.
Comprendre pourquoi chaque étage existe est le préalable à toute tentative de
faire mieux.

> **Objectifs d'apprentissage**
>
> À l'issue de ce chapitre, vous saurez :
> - retracer la genèse du protocole et le problème de sycophantie qu'il combat ;
> - décrire le rôle de chaque étage : Greffier, double présomption, attaques a–h, conclusion adversariale, verdict, court-circuit ;
> - expliquer la qualification des traces retenues (type et rôle probatoire) et les issues d'une attaque ;
> - identifier, pour chaque étage, ce qu'une modification risque de casser.

## 1. Genèse : combattre la sycophantie

La sycophantie est le biais des modèles de langage à valider ce qu'ils
croient qu'on attend d'eux. Demandez « cette personne fait-elle preuve de
créativité ? » et le modèle trouvera de la créativité, parce que la forme même
de la question suggère une réponse positive. Un prompt naïf de cartographie
produit donc des cartes flatteuses et vides : toutes les compétences
« présentes », toutes faiblement justifiées, aucune décision réelle.

Le protocole de base — que la plateforme appelle **Aurora v3** — répond par un
renversement : au lieu de chercher la compétence, on la suppose absente et on
somme les preuves de résister. Une précision d'honnêteté, importante pour tout
promptologue : **les textes originaux d'Aurora v3 ne figurent pas dans les
assets du projet.** Le paquet embarqué dans le moteur, `aurora-v3-reconstruit`,
a été *reconstruit* par rétro-ingénierie du protocole observé dans les 59
documents `cartographie-jour` réels de la démonstration, et des invariants
qu'ils exhibent. Ce que vous lisez ci-dessous n'est donc pas un texte sacré :
c'est un protocole reconstitué, documenté, et donc questionnable — exactement
ce que votre métier vous invite à améliorer.

## 2. Le Greffier : extraire sans juger

Le premier étage est un **greffier**, pas un juge. Pour chaque pôle, il relève
les passages saillants du texte de la journée, puis verse — compétence par
compétence — des **pièces** au dossier. Une pièce est une unité factuelle
minimale : un identifiant, un numéro, un extrait de contexte.

Le principe cardinal est la **séparation de l'extraction et du jugement**. Le
Greffier ne décide pas si une compétence est présente ; il constitue seulement
le dossier sur lequel l'instruction portera. Cette séparation évite que le
même mouvement mental qui « repère » ne se mette aussitôt à « valider » — la
porte d'entrée de la sycophantie.

> **À retenir** — Le Greffier verse les pièces ; il ne conclut jamais. Un
> prompt qui mêlerait extraction et verdict rouvrirait la porte que tout le
> protocole s'emploie à fermer.

## 3. La présomption d'absence : renverser la charge de la preuve

Vient alors le **pédagogue adversarial**, qui commence par poser la
**présomption d'absence** : chaque compétence est réputée *non démontrée* tant
qu'aucune pièce n'a résisté à l'examen. La question n'est plus « y a-t-il un
indice de cette compétence ? » mais « quelles pièces survivent à
l'hypothèse qu'elle est absente ? ». Le pédagogue identifie, parmi les pièces
versées, celles qui *résistent* à cette présomption — les autres tombent.

Ce renversement est le cœur philosophique du protocole. Il transforme un
biais positif (« je trouve ce que je cherche ») en exigence négative (« je ne
retiens que ce qui survit à ma défiance »).

## 4. La présomption de sycophantie et les attaques a–h

Les pièces qui ont survécu à la première présomption ne sont pas encore
acquises. Le pédagogue applique une seconde présomption — la **présomption de
sycophantie** — et attaque chaque pièce survivante à l'aide d'une typologie de
huit attaques, désignées de `a` à `h`. Pour chaque pièce, il choisit
l'**attaque dominante** (la plus pertinente) et l'instruit.

| Code | Nom | Ce qu'elle reproche à la pièce |
|---|---|---|
| `a` | insuffisance probatoire | la pièce dit moins que ce qu'on lui fait dire : trace brève, cadre posé sans le travail montré |
| `b` | confusion de compétence | la pièce active en réalité une *autre* compétence du référentiel |
| `c` | biais de medium | l'acte s'exerce dans un cadre au rabais (face à une IA, dans le journal lui-même) qui réduit sa portée |
| `d` | glissement lexical | le vocabulaire de la compétence apparaît sans sa charge : mot plaqué, formule sans mécanique |
| `e` | surinterprétation pédagogique | le sens est projeté par l'analyste, non autorisé par le texte de l'apprenant |
| `f` | récit performatif | l'apprenant *raconte* ou nomme l'acte au lieu de le montrer en acte |
| `g` | mouvement-vers | intention, annonce, projet différé : le geste est à venir, pas accompli sur cette feuille |
| `h` | faux positif de fiche | le marqueur est activé à tort : production co-écrite par une IA, coïncidence de surface |

Ces noms ne sont pas décoratifs : ils viennent des raisonnements du corpus
réel, qui citent littéralement « (a) insuffisance probatoire », « (g)
mouvement-vers », etc. Les connaître par cœur vous donne le vocabulaire commun
avec les cartographes et avec les autres promptologues.

## 5. Les trois issues d'une attaque

Une attaque ne « détruit » pas mécaniquement une pièce. Elle produit l'une de
trois issues, qui pèsent différemment sur la suite de l'instruction :

1. **« attaque non recevable, pièce confirmée »** — la pièce résiste
   pleinement ; elle vaut comme preuve.
2. **« pièce affaiblie mais retenue »** — l'attaque touche, mais la pièce
   subsiste avec une portée moindre ; elle vaut comme indice, pas comme preuve
   décisive.
3. **« pièce disqualifiée »** — l'attaque emporte la pièce ; elle sort du
   dossier.

C'est ce filtrage gradué qui distingue une compétence *établie* (des pièces
confirmées) d'une compétence *renvoyée* (des pièces affaiblies, un doute
résiduel) ou *non établie* (rien ne résiste).

## 6. Conclusion adversariale et verdict

Le pédagogue rédige alors une **conclusion adversariale** : un raisonnement
argumenté et une **confiance finale** (entre 0 et 1). Le moteur en tire le
**verdict**, qui prend l'un des trois statuts suivants :

- **présence établie** ;
- **présence non établie** ;
- **renvoi au cartographe**.

Le verdict s'accompagne du **nombre de preuves**, du **nombre d'indices**,
d'une **confiance**, d'un **motif** et d'une **prescription**. Deux invariants
du corpus méritent votre attention, parce qu'ils sont vérifiés structurellement
et qu'une variante qui les casserait produirait des documents suspects : la
`confiance` du verdict égale la `confianceFinale` de la conclusion, et les
compteurs de preuves/indices correspondent au décompte des rôles des traces
retenues (voir §8).

Le troisième statut n'est pas un pis-aller technique : c'est un **aveu
d'incertitude assumé**. Le protocole préfère dire « qu'un humain tranche »
plutôt que forcer une décision douteuse. C'est la traduction, dans le prompt,
du principe du cahier : jamais de cartographie 100 % automatique.

## 7. Le court-circuit : l'économie du protocole

Si le Greffier n'a extrait **aucune pièce** pour une compétence, le pédagogue
n'est pas convoqué. Le moteur produit directement un verdict minimal : pas
d'examen, une confiance de 1 (on est certain qu'il n'y a rien à examiner),
zéro preuve, zéro indice, une prescription minimale. La raison consignée est
toujours la même chaîne : **« aucune pièce extraite par le Greffier »**.

Ce court-circuit a une double portée :

- **Économique.** Sur le corpus de démonstration, il concerne l'écrasante
  majorité des couples (journée × compétence) : convoquer le pédagogue pour un
  dossier vide gaspillerait des appels LLM. Le court-circuit est ce qui rend
  le protocole finançable.
- **Risquée.** Il crée un **faux négatif** possible : si le Greffier rate un
  passage réellement pertinent, la compétence est court-circuitée à tort, sans
  recours. C'est pourquoi la qualité de l'extraction (étage 1) conditionne
  tout le reste — et pourquoi améliorer le Greffier est souvent plus rentable
  qu'affiner le pédagogue.

> **À retenir** — Le court-circuit déplace la charge de qualité vers l'amont.
> Si vous voulez « voir plus de compétences », travaillez d'abord le Greffier,
> pas les seuils du verdict.

## 8. Les traces retenues : type × rôle

Les pièces survivantes deviennent des **traces retenues**, qualifiées sur deux
axes indépendants :

- **Type** — la nature de la trace : *trace concrète* (un fait montré),
  *déclaration étayée* (l'apprenant affirme, mais avec appui), *observation
  tierce* (un tiers nommé rapporte quelque chose sur l'apprenant).
- **Rôle probatoire** — le poids de la trace : *preuve décisive* ou *indice
  corroboratif*.

C'est ce croisement qui alimente les compteurs `nombrePreuves` et
`nombreIndices` du verdict. Une compétence peut être établie sur une seule
preuve décisive, ou sur un faisceau d'indices corroboratifs convergents.

## 9. Au-delà des pôles : le kairos

Après les sept pôles, le protocole émet un **kairos** : une synthèse
transversale de la journée, produite en un seul appel LLM. Il ne réexamine pas
les compétences ; il lit *entre* elles. Le kairos dégage un portrait de
l'apprenant sur la journée, les **connexions cross-pôles** (une même situation
qui active la tête et le cœur), et les **compétences orphelines** — des
émergences que le référentiel actuel ne nomme pas encore. Ces orphelines sont
précieuses : elles remontent, à terme, vers les épistémiarques qui font
évoluer le référentiel.

## 10. Ce que chaque étage protège

Voici la grille de lecture à garder sous les yeux quand vous concevrez vos
variantes. Pour chaque étage, ce qu'on perd si on l'affaiblit :

| Étage | Ce qu'il protège | Ce qu'on casse en l'affaiblissant |
|---|---|---|
| Greffier | La séparation extraction/jugement | On rouvre la sycophantie ; ou, si l'extraction est trop stricte, on multiplie les court-circuits (faux négatifs) |
| Présomption d'absence | La charge de la preuve inversée | La carte se remplit de compétences faiblement justifiées |
| Attaques a–h | La défiance graduée | Les pièces passent sans filtre ; la confiance devient décorative |
| Trois issues | La distinction preuve/indice | On perd le statut « renvoi » et donc le garde-fou humain |
| Court-circuit | L'économie du run | Sans lui, le coût explose ; trop agressif, il masque des compétences |
| Kairos | La lecture transversale et les orphelines | On perd le portrait et la matière des épistémiarques |

Le chapitre suivant — [03-versionner-publier-un-prompt-package.md](03-versionner-publier-un-prompt-package.md) —
montre comment transformer une idée d'amélioration en un brouillon éditable,
puis en une version publiée, immuable et attribuée.
