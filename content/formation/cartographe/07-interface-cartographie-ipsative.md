---
parcours: cartographe
chapitre: 7
titre: "Relire dans l'interface V3"
statut: complet
---

# Relire dans l'interface V3

L'interface de [cartographie](#/cartographie) V3 outille votre travail de relecture : provenance,
anomalies d'import, arbitrage des variantes et états de revue y sont des objets de première
classe. Ce chapitre part de vos besoins de cartographe.

## Ce dont vous avez besoin, en tant que cartographe

1. **La provenance de chaque observation** : de quel run, de quelle journée, de quel document
   vient-elle ? Avec quelle confiance de verdict — qui n'est jamais un niveau de maîtrise ?
2. **Les anomalies d'import** : références de preuve pendantes, numéros de pièces dupliqués,
   statuts inconnus, journées incomplètes — signalés, jamais résolus en silence.
3. **L'arbitrage des variantes** : deux analyses concurrentes d'une même journée ne s'additionnent
   jamais ; c'est un humain qui choisit la variante active, ou « à examiner ».
4. **La file de revue** : les renvois au cartographe et les associations contestées par
   l'apprenant, à instruire.
5. **Le référentiel complet** : l'arbre montre les 61 compétences, y compris non documentées —
   contrairement au soleil, qui ne montre pas les manques.

La vue préconfigurée **« Cartographe »** (sélecteur *Mode*) dispose l'écran pour ce travail :
arbre et portfolio côte à côte, audit d'import et soleil en appui. Réorganisez librement les
tuiles (poignée ⠿, coin ◢) — votre disposition est mémorisée.

## Les panneaux, du point de vue de la relecture

- **Arbre (Référentiel)** — votre table des matières : les 7 familles et 61 compétences, le compte
  de journées documentées par compétence, et les feuilles datées. Sélectionner une feuille ouvre
  la journée ET filtre la compétence — le chemin le plus court vers une preuve précise. Le titre
  « Référentiel » réinitialise la sélection.
- **Portfolio** — l'unité de relecture. Pour chaque observation : la provenance (run, statut brut,
  confiance du verdict présentée comme confiance dans le verdict), les passages retenus et l'état
  de revue de chaque association (« non revue », « confirmée », « nuancée », « contestée »).
  Attention : contester retire uniquement CE lien du soutien actif ; l'observation tient tant
  qu'un autre lien valide la soutient.
- **Audit d'import** — le rapport à quatre gravités : *bloquant* (fichier invalide, en
  quarantaine), *à arbitrer* (variantes concurrentes, numéro dupliqué, statut inconnu),
  *avertissement* (référence pendante, rapport nul), *information*. Une référence pendante ne
  devient jamais une preuve : l'observation qu'elle soutenait n'entre ni dans le soleil ni dans un
  partage tant qu'elle n'est pas réparée.
- **Arbitrage des variantes** — sous l'audit : pour chaque journée à variantes multiples,
  choisissez le run actif ou laissez « à examiner » (la journée ne contribue alors à rien).
- **Soleil / Heatmap** — vos vues de contrôle : le rayon compte les journées documentées
  admissibles (établie + non court-circuitée + au moins une preuve résolue non contestée +
  variante active). Si un secteur vous surprend, `w` (« Pourquoi ce rayon ? ») liste les journées ;
  la heatmap vous mène à chacune.
- **Indicateurs** — le compte « en attente de révision » est votre pile de travail.

## Méthode de relecture suggérée

1. Ouvrez l'**audit d'import** : traitez d'abord les « à arbitrer » (variantes, doublons), puis
   examinez les avertissements.
2. Parcourez les **renvois** depuis les indicateurs : chaque « renvoi au cartographe » attend une
   instruction en entretien.
3. Sur chaque observation douteuse : arbre → feuille → portfolio → lire le verbatim → confirmer,
   nuancer ou contester — votre décision est datée, réversible et tracée par révision.

Le dossier reste privé : votre relecture n'expose rien tant que l'apprenant n'a pas construit et
publié un partage.
