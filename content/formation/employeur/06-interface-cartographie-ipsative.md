---
parcours: employeur
chapitre: 6
titre: "Lire une cartographie dans l'interface V3"
statut: complet
---

# Lire une cartographie dans l'interface V3

Vous recevez un fichier JSON de cartographie partagée, ou vous consultez une cartographie en
lecture seule. Ce chapitre décrit ce que l'interface vous montre — et, tout aussi important, ce
qu'elle ne vous montrera jamais.

## Ce dont vous avez besoin, en tant qu'employeur

1. **Un résumé des forces choisies** par la personne candidate, lisible en une minute.
2. **Des preuves contextualisées** : pas une note, mais des extraits datés de travail réel.
3. **La provenance et la récence** au niveau que la personne a choisi de partager (jour, mois, ou
   sans dates).
4. **Le périmètre exact du partage** : version du référentiel, métrique, date de génération.
5. **L'assurance d'intégrité** : un fichier altéré est refusé à l'ouverture (empreinte SHA-256).

## Ce que vous voyez

- **La liste des forces** : chaque compétence partagée avec sa famille (couleur + symbole), une
  barre proportionnelle et le compte exact — « n journées documentées », « n mois documentés » ou
  « au moins un soutien public » selon la précision temporelle choisie par la personne. Ce compte
  mesure la **documentation**, jamais un niveau de maîtrise ni un score d'employabilité.
- **Les preuves** : les extraits de portfolio explicitement autorisés, avec leur contexte quand il
  est partagé, et le **rôle réel** ou le **résultat** si la personne les a renseignés.
- **Les synthèses déclarées** : certaines forces peuvent être présentées « sur déclaration de
  l'apprenant », sans document source — elles sont étiquetées comme telles et ne comptent aucune
  journée documentée.
- **Le cartouche du périmètre** : référentiel et version, métrique publique, date technique de
  génération.

Si vous consultez l'espace interactif ([Cartographie](#/cartographie)), la vue préconfigurée
**« Employeur »** dispose l'écran pour cette lecture : soleil, indicateurs, légende, preuves.

## Ce que vous ne verrez jamais — par conception

- Aucune mention de ce qui a été retiré ou non partagé : l'absence d'une compétence ne signifie
  **rien** (ni faiblesse, ni dissimulation — simplement « non documentée dans ce périmètre »).
- Aucun raisonnement adversarial interne, aucune « présence non établie », aucun audit privé.
- Aucune date plus fine que la précision choisie : une projection mensuelle ne permet pas de
  reconstruire des jours ; une projection sans dates ne porte aucune trace temporelle.
- Aucun classement, score global ou profil de personnalité : la cartographie est **ipsative** —
  elle compare la personne à ses propres états antérieurs, jamais à une cohorte.

## Bon usage

Utilisez la cartographie comme **support d'entretien** : « Pourquoi ce rayon ? » sur une force
vous donne les journées et les preuves — d'excellentes questions concrètes. Ne convertissez jamais
les comptes en note : deux personnes ne partagent jamais le même périmètre.
