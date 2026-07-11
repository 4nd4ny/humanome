# ADR-009 — Routing par hash dans l'application front

## Statut

Accepté — 2026-07-12

## Contexte

L'application de visualisation unifiée (§4.4, P2) doit fonctionner dans des
environnements très différents avec le **même bundle statique** (ADR-003) :

1. **Ouverte en local, en `file://`** : le visualiseur est autonome (« npm run build
   produit un bundle statique ouvrable tel quel », P2) — c'est la conséquence directe
   du RGPD-by-design (§6.1 : le portfolio et les cartographies restent locaux par
   défaut) et de l'archive pivot (ADR-006) qui doit rester consultable hors ligne.
2. **Servie en statique sur le mutualisé OVH** (§5, ADR-008) : fichiers déposés en
   FTP dans `~/www/`, sans garantie de pouvoir maintenir des règles de réécriture
   `.htaccess` fiables ni volonté d'en dépendre.

Un routing « history » (`/merge`, `/jour/2026-07-12`) exige que le serveur réécrive
toute URL profonde vers `index.html` : impossible en `file://` (chaque chemin serait
résolu comme un fichier inexistant) et fragile sur mutualisé (dépendance à
`mod_rewrite` et à une configuration `.htaccess` par répertoire, en conflit potentiel
avec le front-controller PHP de l'API, ADR-008).

Parallèlement, le produit a besoin de **deep-links partageables** : le §3.2 prévoit le
partage d'une cartographie avec un employeur via lien, et la navigation P2 (« clic sur
un jour dans la chronologie → vue Journée ») doit produire des URL restaurables —
revenir sur un état précis de la visualisation (une journée donnée, une compétence
mise en avant).

## Décision

**Le routing de l'application front est intégralement basé sur le fragment (hash) de
l'URL.** Exemples canoniques :

```
#/merge                          vue chronologique (agrégat multi-jours)
#/jour/2026-03-15                vue Journée à une date ISO 8601
#/jour/2026-03-15?focus=<code>   idem, compétence <code> mise en évidence
```

Règles :

- Le fragment encode **l'état de navigation** : vue courante, date ISO, paramètres
  de focus (`?focus=<code de compétence du référentiel>`), sous forme de
  pseudo-chemin + query string interne au hash.
- Le routeur est minimal (écoute de `hashchange`, parsing du fragment) — pas de
  bibliothèque de routing lourde, conformément à la règle « aucune dépendance non
  justifiée par un ADR » (P0) et à la sobriété d'ADR-002.
- Toute vue accessible par navigation doit être restaurable depuis son URL seule
  (deep-link = source de vérité de l'état de navigation) ; les données, elles,
  proviennent du JSON chargé (fixtures de démo, drag & drop ou lien de partage).
- Les liens de partage employeur (§3.2, P8) réutilisent ce format : le serveur ne
  résout que la route d'entrée du lien, le fragment cible ensuite la vue précise —
  le fragment n'étant **jamais envoyé au serveur**, l'état de consultation ne fuit
  pas dans les logs (cohérent avec la minimisation §6).

## Conséquences

**Positives**

- **Fonctionne partout à l'identique** : `file://` (archive locale, démo hors
  ligne, clone consulté sans serveur), statique OVH sans aucune réécriture
  `.htaccess`, et n'importe quel hébergeur du « clone déployable » (§5).
- **Deep-links partageables** (§3.2) : une URL suffit à rouvrir exactement la même
  vue — un jour précis, une compétence en focus — y compris dans un lien envoyé à
  un employeur ou à son cartographe.
- Aucune configuration serveur : le déploiement ADR-008 dépose des fichiers, rien
  de plus ; pas de couplage entre le routeur front et Apache.
- Confidentialité : le fragment reste côté client, les journaux serveur ne voient
  jamais quelle journée ou compétence est consultée.

**Négatives / points de vigilance**

- URLs moins « propres » qu'en history routing ; assumé pour la v1, purement
  cosmétique au regard des contraintes.
- Le référencement des vues profondes par les moteurs de recherche est limité —
  sans objet : les cartographies sont privées par défaut (§6), seules les pages
  publiques (accueil, référentiel, démo) ont vocation à être indexées et disposent
  de leurs propres points d'entrée.
- Le hash étant aussi utilisé pour les ancres HTML classiques, les ancres internes
  de contenu (formation §4.6) devront passer par le routeur (`?focus=` ou défilement
  programmatique) plutôt que par des `#ancre` bruts.
- Ne jamais placer de donnée sensible (mot de passe de lien de partage, contenu)
  dans le fragment : il persiste dans l'historique du navigateur.

**Décisions liées** : ADR-003 (bundle statique — le routing hash en est la condition
de portabilité), ADR-006 (archive consultable hors ligne), ADR-008 (aucune règle de
réécriture requise côté OVH). Réversible : si la v2+ migre vers un hébergement
contrôlé (§5), un passage en history routing restera possible via un ADR de
remplacement, les routes hash étant alors redirigées.
