---
parcours: promptologue
chapitre: 2
titre: "Genèse et logique du prompt de base"
statut: squelette
---

# Genèse et logique du prompt de base

Le prompt de base — protocole Aurora v3 — est né d'un constat : demandé
naïvement, un LLM trouve toutes les compétences dans n'importe quel texte,
parce qu'il cherche à plaire. La réponse est une architecture judiciaire à
deux figures. Le Greffier relève les passages saillants de la feuille et verse
des pièces au dossier de chaque compétence, sans juger. Le pédagogue
adversarial instruit ensuite à charge : présomption d'absence (la compétence
est supposée absente tant qu'aucune pièce n'y résiste), puis présomption de
sycophantie (chaque pièce est attaquée selon la typologie a–h), avant une
conclusion adversariale chiffrée. Le verdict tient en trois statuts —
« présence établie », « présence non établie », « renvoi au cartographe » —
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

## Plan des sections

- **1. Genèse** — des premiers prompts complaisants au protocole adversarial : les échecs qui ont façonné Aurora v3.
- **2. Le Greffier** — extraction des passages saillants (extrait verbatim, contexte, auteur : apprenant ou tiers nommé), versement des pièces au dossier de chaque compétence ; pourquoi extraction et jugement sont séparés.
- **3. La présomption d'absence** — renverser la charge de la preuve ; le raisonnement et les pièces qui résistent.
- **4. La présomption de sycophantie et les attaques a–h** — attaquer chaque pièce survivante ; la typologie des huit attaques et le choix de l'attaque dominante.
- **5. Les trois issues d'une attaque** — « attaque non recevable, pièce confirmée », « pièce affaiblie mais retenue », « pièce disqualifiée » ; effet sur la suite de l'instruction.
- **6. Conclusion adversariale et verdict** — la confiance finale (0 à 1), les trois statuts, le renvoi au cartographe comme aveu d'incertitude assumé ; motif et prescription.
- **7. Le court-circuit** — « aucune pièce extraite par le Greffier » : pas de pédagogue, verdict minimal, prescription minimale ; le coût épargné et le risque de faux négatif.
- **8. Les traces retenues** — qualification finale : type (trace concrète, déclaration étayée, observation tierce) × rôle (preuve décisive, indice corroboratif).
- **9. Au-delà des pôles : le kairos** — la synthèse transversale de la journée, les connexions cross-pôles et les compétences orphelines qui nourrissent les épistémiarques.
- **10. Ce que chaque étage protège** — grille de lecture pour vos futures variantes : que perd-on si l'on affaiblit tel étage ; où les versions précédentes ont échoué.
