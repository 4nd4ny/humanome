---
parcours: cartographe
chapitre: 2
titre: "Pourquoi l'humain reste nécessaire"
statut: squelette
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

## Plan des sections

- **1. Les trois familles d'erreurs** — hallucination (pièce ou motif inventé), oubli (trace réelle non extraite par le Greffier), sycophantie (complaisance résiduelle malgré le protocole) ; exemples observés.
- **2. Ce que le protocole adversarial attrape** — présomption d'absence, présomption de sycophantie, attaques a–h, issues d'attaque (confirmée / affaiblie mais retenue / disqualifiée) : le chemin d'une pièce jusqu'au verdict.
- **3. Ce qui lui échappe** — le court-circuit ne distingue pas « rien vécu » de « rien écrit » ni de « mal extrait » ; les biais reproductibles d'un même prompt ; ce que seul le contexte humain permet de savoir.
- **4. Le renvoi au cartographe** — pourquoi le moteur s'abstient, comment instruire ces cas en priorité, et pourquoi un taux de renvoi à zéro serait un signal d'alarme plutôt qu'un progrès.
- **5. La variabilité entre runs** — le même portfolio, le même prompt, des verdicts qui bougent : ce que la consistance multi-run (chapitre 6) apporte à votre vigilance.
- **6. L'argument de fond** — la garantie comme acte social : un employeur fait confiance à une personne qui s'engage, pas à une probabilité ; la relecture humaine comme condition d'existence du produit.
