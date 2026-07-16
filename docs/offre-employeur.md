# Offre employeur — moteur de recherche de compétences

**Statut : à venir (présentation seulement, v1.1).** Le moteur de recherche
lui-même reste au backlog « marketplace » (décision AD-D6) : la v1.1 se contente
de **présenter l'offre** et de recueillir les manifestations d'intérêt. Ce
document est la **source de vérité du modèle tarifaire** — toute mention côté
front (tuile employeur, aide contextuelle, chapitre de formation) en dérive.

## Principe

Moyennant un **abonnement payant**, un employeur accède à un **moteur de
recherche de compétences** portant sur les **profils PUBLIÉS par les
utilisateurs consentants** (jamais sur une cartographie non publiée, jamais sans
le consentement explicite de l'apprenant). L'abonnement **finance l'accès
gratuit à l'API** pour les pays émergents : payer pour chercher, c'est ouvrir
l'outil ailleurs.

## Modèle tarifaire

- **Unité facturée** : la **cartographie remontée** par une recherche.
- **Prix de base** : **1 USD par cartographie remontée**.
- **Dégressivité** : le prix unitaire décroît **à partir de 10, 100 et 1000
  cartographies** remontées (paliers). Le barème dégressif ci-dessous est
  **indicatif** — les taux exacts restent à arrêter avant l'ouverture du moteur
  (le seul engagement ferme du modèle est : base 1 USD, dégressif à ces trois
  seuils).

  | Cartographies remontées | Prix unitaire (indicatif, à confirmer) |
  |---|---|
  | 1 – 9      | 1,00 USD |
  | 10 – 99    | dégressif (palier 1) |
  | 100 – 999  | dégressif (palier 2) |
  | ≥ 1000     | dégressif (palier 3) |

- **Facturation forfaitaire AVANT les recherches** : l'employeur provisionne un
  forfait en début de mois. Les recherches consomment ce forfait.
- **Ajustement le mois suivant sur la consommation réelle** : à la clôture du
  mois, la facture est ajustée à ce qui a effectivement été remonté. **Les
  crédits restants du mois passé sont utilisés** (reportés), jamais perdus tant
  que l'abonnement court.

## Garde-fous (rappel)

- Recherche uniquement sur les cartographies **publiées et consenties** ; le
  partage employeur individuel (lien + mot de passe) reste le seul canal en v1.
- Aucune donnée personnelle compilée hors du périmètre du consentement (RGPD,
  cahier §6).
- Le moteur n'est **pas** disponible : la communication doit rester au futur
  (« à venir »), sans promesse de disponibilité immédiate.

## Contact

Manifestation d'intérêt : **contact@humanome.xyz** (constante `CONTACT_EMPLOYEUR`
côté front, `web/src/components/FamilyTiles.jsx`).

> Question ouverte Q2 (plan v1.1) : adresse de contact définitive (mailto simple
> vs formulaire). Défaut retenu : `contact@humanome.xyz` en `mailto:`.
