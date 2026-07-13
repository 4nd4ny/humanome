---
parcours: cartographe
chapitre: 2
titre: "Pourquoi l'humain reste nécessaire"
statut: complet
---

# Pourquoi l'humain reste nécessaire

Le moteur de cartographie est construit pour se méfier de lui-même : chaque
compétence y est examinée à charge, sous présomption d'absence puis sous
présomption de sycophantie, chaque pièce attaquée selon une typologie de huit
attaques avant tout verdict. Ce protocole adversarial réduit fortement les
deux dérives connues des LLM — l'hallucination (affirmer ce qui n'est pas dans
le texte) et la sycophantie (complaire à l'apprenant) — mais il ne les élimine
pas, et il en crée une troisième : l'excès de sévérité, qui court-circuite ou
rejette des compétences pourtant réelles. C'est précisément parce que le
moteur connaît ses limites qu'il dispose d'un statut « renvoi au cartographe » :
l'arbitrage humain n'est pas un supplément de confort, il est prévu par le
protocole lui-même.

> **Objectifs d'apprentissage**
>
> À l'issue de ce chapitre, vous saurez :
> - décrire les trois familles d'erreurs à surveiller : hallucinations, oublis (faux négatifs), sycophantie résiduelle ;
> - expliquer le fonctionnement de la double présomption et des attaques a–h, et ce qu'elles couvrent ;
> - identifier ce qui échappe structurellement au protocole (courts-circuits abusifs, biais systématiques, contexte hors texte) ;
> - justifier, auprès d'un tiers, pourquoi une cartographie 100 % IA ne peut pas être présentée comme validée.

## 1. Les trois familles d'erreurs

Un modèle de langage qui lit un portfolio peut se tromper de trois façons, et
vous devez les avoir en tête en permanence.

**L'hallucination.** Le moteur affirme ce qui n'est pas dans le texte : il
cite un passage que l'apprenant n'a jamais écrit, invente une « pièce », ou
prête à une trace une portée qu'elle n'a pas. C'est l'erreur la plus grave,
parce qu'elle fabrique de la preuve. *Exemple :* un verdict « présence
établie » sur une compétence de médiation, motivé par une citation qui ne
figure nulle part dans la feuille de la journée.

**L'oubli (faux négatif).** Une trace réelle existe dans le portfolio, mais
elle n'a pas été extraite : le Greffier ne l'a pas relevée, donc le Pédagogue
n'avait rien à examiner. La compétence est alors « court-circuitée » —
déclarée sans examen faute de pièce. *Exemple :* l'apprenant décrit longuement
comment il a réorganisé un travail de groupe qui s'enlisait, mais la compétence
correspondante ressort en court-circuit parce que le passage n'a pas été
relevé.

**La sycophantie résiduelle.** Malgré le protocole, le modèle penche parfois
vers la complaisance : il accorde une présence sur une trace mince parce que
l'apprenant a « bien raconté ». C'est le miroir de l'hallucination, en plus
discret. *Exemple :* un verdict favorable qui s'appuie sur une intention
généreuse (« je voulais aider ») plutôt que sur un acte montré.

À ces trois familles s'ajoute leur revers, l'**excès de sévérité** : le
protocole, en attaquant tout, finit parfois par disqualifier une pièce
valable. Votre rôle n'est donc pas seulement de retirer du faux positif, mais
aussi de restituer du vrai positif indûment écarté.

## 2. Ce que le protocole adversarial attrape

Comprendre ce que le moteur fait déjà vous évite de refaire son travail et
concentre votre attention là où il est faillible. Le chemin d'une compétence,
sur une feuille de journée, suit toujours le même circuit.

1. **Le Greffier** relève les passages saillants du pôle et verse, compétence
   par compétence, les *pièces* candidates.
2. **Le Pédagogue adversarial** examine ces pièces en deux temps :
   - **présomption d'absence** — on suppose d'abord que la compétence n'est
     *pas* là, et on cherche les pièces qui « résistent » à cette présomption ;
   - **présomption de sycophantie** — sur les pièces qui ont résisté, on
     suppose ensuite qu'on est trop complaisant, et on les attaque une à une
     selon une typologie de huit attaques (voir ci-dessous).
3. Chaque attaque reçoit l'un de trois **verdicts d'attaque** : « attaque non
   recevable, pièce confirmée », « pièce affaiblie mais retenue », ou « pièce
   disqualifiée ».
4. De cet examen sort une **conclusion adversariale**, puis le **verdict** de
   compétence, à trois statuts : « présence établie », « présence non établie »,
   « renvoi au cartographe ».

Les **huit attaques** (a–h) du protocole Aurora v3 sont :

| Code | Nom | En bref |
|---|---|---|
| a | insuffisance probatoire | la pièce dit moins que ce qu'on lui fait dire (trace brève, cadre sans le travail montré). |
| b | confusion de compétence | la pièce active en réalité une *autre* compétence du référentiel. |
| c | biais de medium | l'acte s'exerce dans un cadre au rabais (face à une IA, dans le journal lui-même) qui réduit sa portée. |
| d | glissement lexical | le vocabulaire de la compétence est là sans sa charge : mot plaqué, formule sans mécanique. |
| e | surinterprétation pédagogique | le sens est projeté par l'analyste, non autorisé par le texte de l'apprenant. |
| f | récit performatif | l'apprenant *nomme* ou *raconte* l'acte au lieu de le montrer en acte. |
| g | mouvement-vers | intention ou projet différé : le geste est annoncé, pas accompli sur cette feuille. |
| h | faux positif de fiche | le marqueur est activé à tort (production co-écrite par une IA, coïncidence de surface). |

Retenez cette grille : elle est aussi la vôtre. Quand vous instruisez un
renvoi, vous vous demandez la même chose que le Pédagogue — cette pièce
résiste-t-elle, ou tombe-t-elle sous l'une de ces attaques ?

## 3. Ce qui échappe au protocole

Le protocole est puissant sur ce qu'il voit ; il est aveugle à ce qu'il ne
voit pas. Trois angles morts justifient votre relecture.

**Le court-circuit ne distingue pas trois situations très différentes.**
Quand une compétence ressort avec la raison « aucune pièce extraite par le
Greffier », cela peut vouloir dire : *rien vécu* (l'apprenant n'a pas mobilisé
cette compétence), *rien écrit* (il l'a vécue mais ne l'a pas racontée), ou
*mal extrait* (il l'a racontée mais le Greffier l'a manquée). Le moteur ne les
sépare pas ; vous, en relisant la source, vous le pouvez souvent.

**Les biais systématiques d'un même prompt.** Un prompt donné peut, de façon
reproductible, sous-évaluer un pôle ou sur-attaquer un type de trace. Un seul
run ne le révèle pas ; la consistance multi-run (chapitre 6), si.

**Le contexte hors texte.** Vous savez parfois des choses que la feuille ne dit
pas — le contexte d'une école, la teneur réelle d'un projet mené en
micro-classe. Le moteur n'a que le texte ; vous avez, parfois, davantage. C'est
exactement pour ces cas que le renvoi au cartographe existe.

## 4. Le renvoi au cartographe

Le statut « renvoi au cartographe » n'est pas un échec du moteur : c'est une
abstention lucide. Le protocole s'arrête quand il estime ne pas pouvoir trancher
seul, et il vous passe la main. Ces cas sont votre priorité de relecture
(chapitre 3) : ils sont peu nombreux, explicitement signalés, et ce sont ceux
où votre valeur ajoutée est maximale.

Un point contre-intuitif mérite d'être posé ici : **un taux de renvoi à zéro
n'est pas un bon signe.** Si un prompt ne renvoie jamais rien au cartographe,
ce n'est probablement pas qu'il a tout compris — c'est qu'il a cessé de douter.
Un moteur qui tranche tout, tout le temps, a soit trop d'assurance, soit trop
de complaisance. Le renvoi est la trace visible de l'humilité du système ; sa
disparition serait un signal d'alarme, pas un progrès.

## 5. La variabilité entre runs

Le même portfolio, passé deux fois dans le même prompt, ne donne pas exactement
la même cartographie : les modèles de langage sont non déterministes. Une
compétence peut basculer d'un run à l'autre entre « présence établie » et
« renvoi au cartographe ». Cette variabilité n'est pas un défaut à cacher —
c'est une information. Le rapport de consistance multi-run (chapitre 6) la
mesure et vous dit *où* le système hésite : ces zones d'hésitation sont
précisément celles que votre relecture doit couvrir en priorité.

## 6. L'argument de fond

Tout cela converge vers une raison simple, que vous devez pouvoir énoncer à un
tiers — un employeur, un apprenant, un collègue sceptique.

Une cartographie 100 % automatisée reste une *probabilité* : un modèle a estimé,
avec une certaine confiance, que telle trace établit telle compétence. Une
probabilité n'engage personne. La **garantie** transforme cette probabilité en
un acte social : une personne identifiée déclare avoir relu et répond de sa
relecture. Un employeur ne fait pas confiance à un score ; il fait confiance à
quelqu'un qui s'engage.

C'est ce qui fait exister le produit. Sans relecture humaine, humanome.xyz ne
serait qu'un générateur de plus ; avec elle, c'est un document dont un humain
répond. Le chapitre suivant vous donne la méthode pour tenir cet engagement
sans vous noyer dans les soixante et un verdicts d'une feuille.
