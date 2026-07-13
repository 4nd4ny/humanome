# Spec de portage — `aurora/tribunal9.py` (Twin_v9 → JavaScript)

> Source : `/Twin_v9/aurora/tribunal9.py` (691 lignes, portage INTÉGRAL).
> Contrat : parité bit-à-bit avec le Python en mode mock (`--salt`).
> Les prompts `protocole/lourd/*.md` sont CONFIDENTIELS : ils ne sont jamais
> recopiés ici — on les référence par nom de fichier, variables de gabarit
> (`{$VAR}`) et contrat de sortie (format Markdown attendu par les parseurs).

---

## 1. Rôle du module

Le tribunal est l'étage lourd du protocole Aurora : pour une compétence donnée
(sur une journée, ou sur un « faisceau » inter-journées), il orchestre une
arène contradictoire (accusation / défense / réplique / briefing), un jury de
personas à angles fixes (positions : détection / contestation / abstention),
un éventuel second tour mené par le juré minoritaire, deux gardiens de
l'instrument, puis calcule MÉCANIQUEMENT le statut (personne ne vote, aucun
appel modèle ne décide). Les traces probantes sont ré-ancrées verbatim dans le
texte source. Le président (24) n'est qu'un porte-parole : le statut est
intangible, il rédige récit et prescription.

Statuts possibles (constante `STATUTS`, set exporté) :
`"présence établie"`, `"présence non établie"`, `"renvoi au cartographe"`.

Toutes les sorties d'étapes sont mises en cache fichier dans `tdir` (reprise :
si le fichier existe, on le relit au lieu de rappeler le backend).

---

## 2. Constantes et personas (noms EXACTS, accents compris)

### 2.1 `JURES_SOCLE` — liste ordonnée de 4 tuples `(nom, angle)`

Ordre EXACT (l'ordre du socle est l'ordre d'itération du jury partout) :

1. `"Linguiste"` — angle : lit la LANGUE (précision sémantique, glissements de
   sens, registres, marqueurs d'appropriation).
2. `"Historien"` — angle : lit le TEMPS à l'échelle du dossier (mouvement
   avant/après vs état figé).
3. `"Pédagogue"` — angle : lit l'APPRENTISSAGE (erreur travaillée, compétence
   émergente ≠ absence, état ≠ mouvement).
4. `"Sociologue"` — angle : lit le RELATIONNEL (rôle donné, ajustement sans
   éclat, l'ordinaire n'est pas l'absence).

**IMPORTANT parité** : les textes d'angle sont injectés dans les prompts ET
entrent dans l'empreinte `infos_personas()` — ils doivent être recopiés
CARACTÈRE PAR CARACTÈRE depuis le Python (lignes 38–48 ; le code Python peut
être cité librement, contrairement aux prompts). Idem pour toutes les
constantes ci-dessous (lignes 52–97).

### 2.2 `SPECIALISTES_POLE` — dict `{int: (nom, angle)}`, clés 1..7

| Pôle | Nom exact |
|---|---|
| 1 | `"Ingénieur"` (le DISPOSITIF) |
| 2 | `"Interprète"` (les PASSAGES DE FRONTIÈRE) |
| 3 | `"Artisan"` (le GESTE et la matière) |
| 4 | `"Éthicien"` (le DISCERNEMENT) |
| 5 | `"Clinicien du récit"` (la TRANSFORMATION) |
| 6 | `"Politiste"` (la CITÉ) |
| 7 | `"Compagnon"` (la TRANSMISSION et le PILOTAGE) |

### 2.3 Transversaux

- `ARCHIVISTE = ("Archiviste", angle MATÉRIALITÉ des pièces…)`
- `PORTRAITISTE = ("Portraitiste", angle L'ÉCART À SOI…)`

### 2.4 `BANQUE_ANGLES` — dict nom → angle

Construit par : `dict(JURES_SOCLE)` puis update avec les 7 spécialistes, puis
Archiviste, puis Portraitiste. Total : **13 personas**. En JS : un objet/Map
dont l'ordre d'insertion n'importe pas (tous les usages trient explicitement).

### 2.5 `PERSONAS_VERSION = "personas-v1"`

### 2.6 `PAIRES_2PLUS2` — dict `{int: (nom1, nom2)}`

```
1: ("Ingénieur", "Historien")      5: ("Clinicien du récit", "Portraitiste")
2: ("Interprète", "Sociologue")    6: ("Politiste", "Sociologue")
3: ("Artisan", "Historien")        7: ("Compagnon", "Historien")
4: ("Éthicien", "Archiviste")
```

---

## 3. Fonctions publiques

### 3.1 `infos_personas() → {version, empreinte}`

```
{"version": "personas-v1",
 "empreinte": hex_minuscule(stable_hash("|".join("NOM=ANGLE" pour NOM trié)))}
```

Algorithme exact :
1. Trier les 13 noms de `BANQUE_ANGLES` par **ordre de points de code Unicode**
   (tri Python par défaut sur `str`). Ordre résultant EXACT :
   `Archiviste, Artisan, Clinicien du récit, Compagnon, Historien, Ingénieur,
   Interprète, Linguiste, Politiste, Portraitiste, Pédagogue, Sociologue,
   Éthicien`
   (les accents pèsent : `é`=U+00E9 > `o`, donc `Pédagogue` APRÈS
   `Portraitiste` ; `É`=U+00C9 > `S`, donc `Éthicien` en dernier).
   **JS : NE PAS utiliser `localeCompare`** — comparer par `<`/`>` natif sur
   chaînes (ordre UTF-16 = points de code ici, aucun caractère hors BMP).
2. Pour chaque nom : `"%s=%s" % (nom, angle)` → `nom + "=" + angle`.
3. Joindre par `"|"`.
4. `stable_hash(chaîne)` (cf. §6.1) puis formater `"%x"` : hexadécimal
   **minuscule sans zéros de tête** (ex. `Number(n).toString(16)` — sûr car
   stable_hash < 2^48).

### 3.2 `composer_jury(pole_num, config, authenticite=None, faisceau=False, code=None, contexte=None) → [(nom, angle), ...]`

Composition CALCULÉE. `cfgj = config["jury"] ?? {}` (un `jury: null` compte
comme `{}` : le Python fait `config.get("jury", {}) or {}`).
`mode = String(cfgj.mode ?? "socle4+1").toLowerCase()`.
**Attention parité** : `str.lower()` Python = Unicode lowercase ; en JS
`toLowerCase()` équivaut pour les valeurs attendues.

**Mode aléatoire** (`mode ∈ {"aleatoire", "random"}`) :
1. `taille = max(2, min(6, int(cfgj.taille_aleatoire ?? 5)))` — `int()` Python
   tronque vers zéro sur nombre, parse strict sur chaîne (accepter `"5"`,
   `" 5 "` ; lever une erreur sinon).
2. `noms =` les 13 noms triés (même ordre exact qu'en §3.1).
3. Graine : `stable_hash("jury|G|CODE|CTX|POLE")` où la chaîne est construite
   par `"jury|%s|%s|%s|%s" % (cfgj.get("graine", 1), code, contexte, pole_num)`.
   **`%s` de `None` produit `"None"`** (pas `"null"` ni `""`) ; `graine`
   absente → `1` → `"1"` ; `pole_num` entier → décimal.
4. `rng = random.Random(seed)` puis `rng.sample(noms, min(taille, len(noms)))`
   — reproduction BIT-À-BIT du Mersenne Twister CPython requise, cf. §6.2.
5. Retourner `[(n, BANQUE_ANGLES[n]) for n in échantillon]` — **dans l'ordre
   du tirage**, pas retrié.
6. Le `return` est immédiat (ligne 145) : en mode aléatoire, AUCUNE règle
   transversale (ni Portraitiste, ni Archiviste), aucune surcharge
   `par_competence`/`specialistes` et aucun dédoublonnage ne s'appliquent.

**Hors aléatoire** — surcharge du spécialiste :
```
nom_spec = (cfgj.par_competence ?? {})[code]  // prioritaire
        || (cfgj.specialistes ?? {})[String(pole_num)]   // clé CHAÎNE
```
(le Python fait `or` : chaîne vide / null → on passe au suivant).

**Mode `socle2+2`** (`mode ∈ {"socle2+2", "2+2"}`) :
1. `jures = ` les entrées de `JURES_SOCLE` dont le nom est `"Linguiste"` ou
   `"Pédagogue"` (donc `[Linguiste, Pédagogue]` dans cet ordre).
2. `variables = PAIRES_2PLUS2[pole_num]` en liste (`[]` si pôle inconnu).
3. Si `nom_spec` non vide ET présent dans `BANQUE_ANGLES` :
   `variables = [nom_spec].concat(variables.slice(1))` — remplace le
   **premier** élément (sur liste vide : `[nom_spec]`).
4. Pour chaque `n` de `variables` : si `n ∈ BANQUE_ANGLES`, push `(n, angle)`.

**Mode `socle4+1`** (défaut, et TOUT autre libellé de mode) :
1. `jures = copie de JURES_SOCLE` (4 entrées).
2. Si `nom_spec` non vide et dans `BANQUE_ANGLES` : push `(nom_spec, angle)`.
   Sinon, si `pole_num ∈ SPECIALISTES_POLE` : push le spécialiste du pôle.

**Règles transversales** (dans CET ordre, après le mode) :
1. Si `faisceau` ET `cfgj.portraitiste_au_second_ressort ?? true` (truthy
   Python : `false`, `0`, `""`, `null` désactivent) : push `PORTRAITISTE`.
2. Si `authenticite === "produite"` ET `cfgj.archiviste_si_produite ?? true` :
   push `ARCHIVISTE`.

**Dédoublonnage final** : parcours en ordre, garder la PREMIÈRE occurrence de
chaque nom (ex. socle2+2 pôle 5 avec faisceau : Portraitiste déjà présent via
la paire → pas re-poussé ; pôle 4 socle2+2 + authenticite "produite" :
Archiviste déjà via la paire).

### 3.3 `parse_position(texte) → {position, pieces, piege}`

Parseur mécanique de l'avis d'un juré (sorties 23/23b/23c).

1. **position** : première occurrence (`.search`) de la regex
   `\*\*\s*Position(?:\s+maintenue|\s+finale)?\s*\*\*\s*:\s*([^\n]+)` (flag i)
   sur `texte ?? ""`. Le groupe 1 passe par `_norm_position` :
   - slug (cf. §6.3) puis, DANS CET ORDRE :
     `"detection"` inclus → `"détection"` ;
     `"contestation"` → `"contestation"` ;
     `"abstention"` OU `"sans eclairage"` → `"abstention"` ;
     `"non etablie"` → `"contestation"` (tolérance ancien vocabulaire) ;
     `"etablie"` → `"détection"` ; sinon `null`.
   - Pas de ligne Position trouvée → `position = null`.
2. **pieces** : chercher la ligne `\*\*\s*Pi[èe]ces\s*\*\*\s*:\s*([^\n]+)`
   (flag i). Zone = groupe 1 si trouvé, **sinon le texte ENTIER**. Extraire
   tous les `\bP\s*(\d+)\b` de la zone (flag g), convertir en entiers,
   dédoublonner (Set), **trier numériquement croissant**.
   Attention JS : `\b` fonctionne pareil ici (P = mot). `\s` Python (Unicode)
   ≈ `\s` JS ; acceptable.
3. **piege** : chercher `\*\*\s*Pi[èe]ge[^*]*\*\*\s*:\s*([^\n]+)` (flag i).
   `val = groupe1.trim()` (trim Python = espaces Unicode ; `trim()` JS ok).
   Si `val` non vide et `val ∉ {"—", "-", "aucun", "Aucun"}` :
   `piege = val` tronqué à **200 points de code** (cf. §6.4). Sinon `null`.

Retour : `{position, pieces, piege}`.

### 3.4 `parse_pieces(dossier_md) → [{num, extrait, date, type}]`

Découpe le dossier du Greffier en blocs de pièces.

- Regex de bloc (flags s+i, global) :
  `####\s*Pi[èe]ce\s+(\d+)\s*\n(.*?)(?=####\s*Pi[èe]ce\s+\d|\Z)`
  — en JS : `/####\s*Pi[èe]ce\s+(\d+)\s*\n([\s\S]*?)(?=####\s*Pi[èe]ce\s+\d|$)/gi`
  (remplacer `\Z` par `$` SANS flag m ; ne pas utiliser le flag `s` avec `$`
  multiligne).
- Dans chaque bloc (groupe 2) :
  - extrait : d'abord `\*\*Extrait\*\*\s*:\s*«\s*(.*?)\s*»` (flag s,
    **sans** i) ; à défaut `\*\*Extrait\*\*\s*:\s*([^\n]+)` (sans flags).
  - date : `\*\*Date\*\*\s*:\s*([^\n]+)` (sans flags).
  - type : `\*\*Type\*\*\s*:\s*([^\n]+)` (sans flags).
- Une pièce n'est retenue QUE si extrait trouvé. Objet :
  `{num: int(groupe1), extrait: extrait.trim() tronqué à 600 points de code,
    date: date.trim() ou null, type: type.trim() ou ""}`.
  **Nota** : la troncature `[:600]` s'applique APRÈS `.strip()`.

### 3.5 `resoudre(jures, finaux, gardien_support, gardien_drapeau) → (statut, motif)`

`finaux : {nom: {position, ...}}`. `D` = noms des jurés (DANS L'ORDRE de la
liste `jures`) dont `finaux[nom].position === "détection"` ; `C` idem
`"contestation"`. Un nom absent de `finaux` compte comme sans position
(le Python fait `finaux.get(n, {}).get("position")`).

Règles, DANS CET ORDRE (le premier qui matche gagne) :
1. `gardien_drapeau` vrai → `("renvoi au cartographe",
   "drapeau du gardien du raisonnement")`.
2. `D` vide → `("présence non établie", "aucune détection survivante")`.
3. `C` non vide → `("renvoi au cartographe",
   "détection et contestation subsistent après le second tour")`.
4. `gardien_support === "gonfle"` ET `D.length < 2` →
   `("renvoi au cartographe",
   "résolution durcie (le support gonfle) : détection isolée")`.
5. Sinon → `("présence établie", "détection(s) que personne ne conteste")`.

### 3.6 `constituer_dossier(backend, protocole_dir, tdir, pole, comp, journee, config, sentences, rapide=None, calques=None) → (dossier_md, vide)`

1. `mkdir -p tdir`. Cache : si `tdir/20-greffier.md` existe → le relire.
2. Sinon : variables de gabarit pour `protocole/lourd/20-greffier.md` :
   `CODE`, `NOM` (de `comp.code`/`comp.nom`), `POLE_NUM` (=`pole.num`),
   `POLE_NOM` (=`pole.nom`), `COMPETENCE_FICHE` (=`comp.fiche_md`),
   `CALQUES` (= `calques` ou la chaîne exacte
   `"(aucun surlignage vivant pour cette compétence)"`),
   `FEUILLES` = `"═══ Feuille : %s ═══\n%s\n" % (journee.id,
   neutraliser_balises(journee.texte))` (U+2550 ×3 de part et d'autre,
   **newline final**).
3. Appel backend : `(bk_rapide || backend).call(prompt,
   model = modele_rapide || bk.model_mini || bk.model, task="greffier",
   meta={code, nom, sentences}, label="greffier_<journee.id>_<code>")` où
   `bk = config.backend_tribunal ?? {}` et `rapide = (bk_rapide, modele_rapide)`
   ou `null`.
4. Écrire le cache, retourner `(dossier, vide)` avec
   `vide = dossier.slice(0,400 points de code).toUpperCase().includes("DOSSIER VIDE")`.
   (`upper()` Python : pour ce motif ASCII, `toUpperCase()` JS suffit.)

### 3.7 `verdict_dossier_vide(code, nom, dossier) → verdict`

Objet EXACT (ordre de clés à préserver si sérialisé) :
```json
{"code": code, "nom": nom, "dossier_vide": true,
 "statut": "présence non établie", "score_preuves": 0, "score_indices": 0,
 "confiance": 0.9, "jury": null, "traces_probantes": [],
 "prescription": {"pour_apprenant":
    "Cette journée ne contient pas encore de pièce pour <nom>.",
    "pour_cartographe": null},
 "gardien": null, "etage": "tribunal-court-circuit",
 "deliberation": {"greffier_md": dossier}}
```

### 3.8 `juger(backend, protocole_dir, tdir, pole, comp, journee, config, sentences, incidents, premiere_impression=None, rapide=None, calques=None, authenticite=None) → verdict`

Tribunal journalier complet.

1. `mkdir -p tdir` ; `meta = {code, nom, sentences}`.
2. `base_vars` : `CODE`, `NOM`, `POLE_NUM`, `POLE_NOM`, `COMPETENCE_FICHE`,
   `PREMIERE_IMPRESSION` = `premiere_impression` ou
   `"(pas de première impression disponible pour cette journée)"`,
   `CALQUES` = `calques` ou `"(aucun surlignage vivant pour cette compétence)"`,
   `FEUILLES` = même format qu'en §3.6.
3. Fonction d'ancrage `_ancrer(extrait, date)` :
   - `loc = find_verbatim(journee.texte, extrait)` (util.py, seuil 0.82) ;
     `null` si introuvable.
   - Sinon retourne `(journee.texte.slice(s, e), dateFinale)` où
     `dateFinale = date` si `date` truthy ET `String(date)` COMMENCE par
     `\d{4}-\d{2}-\d{2}` (`re.match` = ancré au début, pas à la fin) ;
     sinon `journee.date || journee.id`.
4. `constituer_dossier(...)` ; si `vide` →
   `return verdict_dossier_vide(...)` (ligne 608) : sortie IMMÉDIATE de la
   fonction, la ligne finale `verdict["etage"] = "tribunal"` n'est pas
   exécutée — l'`etage` reste `"tribunal-court-circuit"`.
5. Sinon : `_proces(...)` avec `date_defaut = journee.date || journee.id`,
   `contexte = journee.id`, et
   `jures = composer_jury(pole.num, config, authenticite, code=code,
   contexte=journee.id)` (faisceau=false).
6. **Toute exception** (dossier OU procès) → incident
   `tribunal_echec_technique` (compteur `incidents[k] = (incidents[k]||0)+1`),
   `log_warn("Tribunal <code>@<journee.id> : échec technique (<e>) → renvoi")`
   et verdict de panne :
   ```json
   {"code", "nom", "dossier_vide": false, "statut": "renvoi au cartographe",
    "score_preuves": "R", "score_indices": "R", "confiance": 0.0,
    "jury": null, "traces_probantes": [],
    "prescription": {"pour_apprenant":
       "Ce dossier appelle un échange avec l'enseignant.",
       "pour_cartographe": "Tribunal interrompu (panne technique) : <e>"},
    "gardien": null, "dossier_cartographe": null}
   ```
7. `verdict.etage = "tribunal"` (sur le verdict de `_proces` OU de panne),
   puis retour.

### 3.9 `juger_faisceau(backend, protocole_dir, tdir, pole, comp, suspicions, periode, config, incidents, textes_par_journee, rapide=None) → verdict`

Second ressort : instruit la trajectoire (signaux faibles récurrents).

1. `mkdir -p tdir` ; `meta.sentences = [(s.journee, s.extrait ?? "") pour
   chaque s de suspicions AYANT un extrait truthy]` (tuples → paires JS).
2. **Dossier assemblé mécaniquement** (chaînes EXACTES, jointes par `"\n"`) :
   ```
   # Dossier de faisceau — <code> <nom>
   (ligne vide)
   Pièces réunies mécaniquement sur la période <periode> : signaux individuellement trop faibles pour la carte, conservés parce qu'ils reviennent. La question à instruire : forment-ils ENSEMBLE un faisceau probant ?
   (ligne vide)
   ### Pièces extraites
   (ligne vide)
   ```
   **Attention** : en Python cette phrase est une concaténation implicite de
   3 littéraux — c'est UNE SEULE ligne logique (un seul élément de liste),
   sans retours à la ligne internes.
3. `avec_extrait = suspicions.filter(s => s.extrait truthy)` puis **tri
   STABLE** par clé `(bool(s.jugee), s.journee || "")` : les jamais jugés
   (`false`) d'abord, puis par id de journée croissant (ordre points de
   code) ; à clé égale, ordre d'origine préservé (`Array.prototype.sort` est
   stable — mais implémenter la comparaison de tuple : d'abord le booléen
   `false < true`, ensuite la chaîne).
4. Pour `i` de 1 à `min(8, avec_extrait.length)` (les 8 premiers) — bloc :
   ```
   #### Pièce <i>
   - **Extrait** : « <neutraliser_balises(s.extrait[:400 points de code])> »
   - **Date** : <s.date || s.journee || "-">
   - **Localisation** : journée <s.journee || "-">
   - **Type** : signal de faisceau (source : <s.source ?? "?">)
   - **Vigilance** : <vigilance>
   (ligne vide)
   ```
   `vigilance` = si `s.jugee` truthy :
   `"déjà instruite (<s.jugee>) — fait ancien, versé pour contexte"` ;
   sinon `"signal faible — à instruire en constellation"`.
   **Nota** : la troncature `[:400]` s'applique AVANT `neutraliser_balises`.
5. `base_vars` : `CODE`, `NOM`, `POLE_NUM`, `POLE_NOM`, `COMPETENCE_FICHE`,
   `FEUILLES` = le dossier assemblé, `PREMIERE_IMPRESSION` =
   `"(dossier de faisceau inter-journées : pas de première impression unique)"`,
   `CALQUES` = `"(dossier de faisceau : les pièces ci-dessous SONT la
   superposition, réunie mécaniquement)"` (une seule ligne, concaténation
   Python).
6. `par_j = {s.journee: s}` — en cas de doublon de journée, **la DERNIÈRE
   suspicion gagne** (sémantique dict).
7. `_ancrer(extrait, date)` : itérer `textes_par_journee` dans **l'ordre
   d'insertion** (Map ou objet à clés chaînes non entières — attention : si
   les ids de journées sont des chaînes purement numériques, un objet JS les
   réordonnerait ; utiliser une **Map**). Premier texte où
   `find_verbatim(texte, extrait)` réussit → retourner
   `(texte.slice(s0, e0), sus?.date || jid)` où `sus = par_j[jid]`
   (la date de la suspicion de CETTE journée si présente, sinon l'id).
   Aucun match → `null`. **Le paramètre `date` est ignoré** dans cette
   variante.
8. `_proces(...)` avec `date_defaut = periode`, `contexte = "faisceau"`,
   `rapide`, et `jures = composer_jury(pole.num, config, faisceau=true,
   code=code, contexte="faisceau")` (authenticite non passée → jamais
   d'Archiviste par la règle « produite » ici).
9. Exception → incident `faisceau_echec_technique`,
   `log_warn("Second ressort <code> : échec technique (<e>) → renvoi")`,
   verdict de panne identique à §3.8.6 sauf `pour_cartographe =
   "Second ressort interrompu : <e>"`.
10. `verdict.etage = "faisceau"`.

---

## 4. Le cœur : `_proces(...)` (privé mais LE contrat central)

Signature :
`_proces(backend, protocole_dir, tdir, comp, base_vars, dossier, config, meta,
incidents, ancrer, date_defaut, contexte, rapide=None, jures=None)`.
`jures = jures || JURES_SOCLE` (garde-fou).

`bk = config.backend_tribunal ?? {}` ;
`(bk_rapide, modele_rapide) = rapide || (null, null)` ;
`m_rapide = modele_rapide || bk.model_mini || bk.model`.

### 4.1 Helper `etape(fichier, template, variables, task, model?, meta_extra?, bk_obj?)`

1. `path = tdir/<fichier>` ; si existe → `read_text(path)` (cache/reprise).
2. Sinon `prompt = resolve_file(protocole_dir + "/lourd/" + template,
   variables)` — résolution `{$VAR}` (cf. §5.4), variables manquantes
   laissées telles quelles + warning.
3. `out = (bk_obj || backend).call(prompt, model = model || bk.model,
   task=task, meta = {...meta, ...meta_extra},
   label = task + "_" + contexte + "_" + code)`.
4. `write_text(path, out)` ; retour `out`.

### 4.2 Arène (séquentiel, chaque étape voit les précédentes)

`v = {...base_vars, DOSSIER: dossier}` puis, en accumulant dans `v` :
- `v.REQUISITOIRE = etape("21a-accusation.md", "21a-accusation.md", v, "accusation")`
- `v.PLAIDOIRIE  = etape("21b-defense.md", "21b-defense.md", v, "defense")`
- `v.REPLIQUE    = etape("22a-replique.md", "22a-replique.md", v, "replique")`
- `v.BRIEFING    = etape("22b-briefing.md", "22b-briefing.md", v, "briefing")`

Variables consommées par les gabarits (contrat, sans citer les prompts) :
- `21a` : CODE, NOM, COMPETENCE_FICHE, DOSSIER
- `21b` : + REQUISITOIRE ; `22a` : CODE, NOM, DOSSIER, REQUISITOIRE,
  PLAIDOIRIE ; `22b` : CODE, NOM, REQUISITOIRE, PLAIDOIRIE, REPLIQUE.

### 4.3 Premier tour du jury

Pour chaque juré `(nj, angle)` :
`vj = {...v, JURE_NOM: nj, JURE_ANGLE: angle}` →
`etape("23-" + _slug(nj) + ".md", "23-jure.md", vj, "jure",
meta_extra={jure: nj, tour: 1})`.
Gabarit `23-jure.md` : BRIEFING, CODE, COMPETENCE_FICHE, DOSSIER, JURE_ANGLE,
JURE_NOM, NOM, PREMIERE_IMPRESSION.

**Noms de fichiers cache** (via `_slug`, espaces CONSERVÉS) :
`23-linguiste.md`, `23-historien.md`, `23-pedagogue.md`, `23-sociologue.md`,
`23-ingenieur.md`, `23-interprete.md`, `23-artisan.md`, `23-ethicien.md`,
`23-clinicien du recit.md`, `23-politiste.md`, `23-compagnon.md`,
`23-archiviste.md`, `23-portraitiste.md`.

Parallélisme : si `config.parallel_jures ?? true`, appels concurrents
(ThreadPoolExecutor, `max_workers = max(2, jures.length)`) ; **le résultat ne
dépend PAS de l'ordre d'achèvement** : `avis_r1` est indexé par nom, puis les
positions sont parsées en itérant `jures` dans l'ordre. En JS :
`Promise.all` convient.

Parse : pour chaque juré (ordre `jures`), `p = parse_position(avis_r1[nj])`.
Si `p.position === null` : incident `jure_position_illisible` (+1) et
`p.position = "abstention"` (les `pieces`/`piege` parsés sont CONSERVÉS).
→ `pos_r1[nj] = p`.

### 4.4 Second tour (UN seul), mené par le minoritaire

`D1/C1/A1` = noms en détection/contestation/abstention, **dans l'ordre de la
liste `jures`**.

Choix du relanceur :
- Si `D1` ET `C1` non vides : `camp = (D1.length < C1.length) ? D1 : C1`
  (**à égalité → C1**, « au doute ») ; `relanceur = camp[0]` (premier dans
  l'ordre du jury).
- Sinon si `D1.length === 1` ET `C1` vide ET `A1` non vide :
  `relanceur = D1[0]`.
- Sinon pas de second tour.

Si relanceur :
1. `vr = {...v, JURE_NOM: relanceur, MA_POSITION: pos_r1[relanceur].position,
   MA_POSITION_R1: avis_r1[relanceur]}` →
   `relance = etape("23b-relance.md", "23b-relance.md", vr, "relance",
   meta_extra={jure: relanceur, tour: 2})`.
   Gabarit `23b` : CODE, NOM, DOSSIER, JURE_NOM, MA_POSITION, MA_POSITION_R1.
2. `pr = parse_position(relance)` ; si `pr.position` truthy →
   `finaux[relanceur] = pr` (remplacement COMPLET : pieces et piege aussi).
   Sinon la position R1 reste.
   `avis_finaux[relanceur] = avis_r1[relanceur] + "\n\n" + relance`.
3. Chaque AUTRE juré reprend la parole une fois :
   `vj = {...v, JURE_NOM, JURE_ANGLE, RELANCEUR_NOM: relanceur,
   POSITION_RELANCEUR: pos_r1[relanceur].position,
   MA_POSITION_R1: avis_r1[nj], RELANCE: relance}` →
   `etape("23c-" + _slug(nj) + ".md", "23c-second-tour.md", vj, "jure2",
   meta_extra={jure: nj, tour: 2, relanceur: relanceur})`.
   Gabarit `23c` : CODE, NOM, COMPETENCE_FICHE, DOSSIER, JURE_NOM, JURE_ANGLE,
   PREMIERE_IMPRESSION, RELANCEUR_NOM, RELANCE, POSITION_RELANCEUR,
   MA_POSITION_R1.
   Parse : `p2 = parse_position(texte)` ; si `p2.position` truthy →
   `finaux[nj] = p2` ; `avis_finaux[nj] = avis_r1[nj] + "\n\n" + texte`.
   (Parallélisable, même remarque qu'en §4.3.)

`finaux` part de `{...pos_r1}` ; `avis_finaux` de `{...avis_r1}`.
`avis_bloc = jures.map(([nj]) => avis_finaux[nj]).join("\n\n---\n\n")`
(ordre du jury, PAS ordre d'achèvement).

### 4.5 Gardiens (jamais de position sur la présence)

`vg = {...v, AVIS_JURES: avis_bloc}`.
- `g_support = etape("25a-gardien-support.md", "25a-gardien-support.md", vg,
  "gardien_support", model = m_rapide, bk_obj = bk_rapide)` — **backend/modèle
  rapide**. Gabarit 25a : AVIS_JURES, CODE, COMPETENCE_FICHE, DOSSIER, NOM,
  PREMIERE_IMPRESSION.
- `g_raison = etape("25b-gardien-raisonnement.md", ..., vg,
  "gardien_raisonnement")` — backend/modèle par défaut. Gabarit 25b :
  AVIS_JURES, CODE, COMPETENCE_FICHE, DOSSIER, NOM, PLAIDOIRIE, REQUISITOIRE.

Parsing :
- `_parse_gardien_support(t)` : `s = _slug(t ?? "")` (texte ENTIER slugifié,
  les `**` survivent au slug) ; chercher
  `\*\*\s*constat\s*\*\*\s*:\s*([^\n]+)` sur `s` (déjà minuscule/sans
  accents) ; zone = groupe 1 ou `s` entier. `"gonfle"` inclus → `"gonfle"` ;
  sinon `"masque"` inclus → `"masque"` ; sinon `"neutre"`.
- `_parse_gardien_raisonnement(t)` : idem avec
  `\*\*\s*drapeau\s*\*\*\s*:\s*([^\n]+)` ; retour booléen :
  `zone.includes("vice")`.

### 4.6 Résolution calculée et confiance

`(statut, motif_regle) = resoudre(jures, finaux, support, drapeau)` (§3.5).
`D/C/A` recalculés sur `finaux` (ordre du jury).

`_confiance(statut, n_d, n_c, n_a, n_preuves)` — appelée à la FIN (§4.7 :
`n_preuves = sp`, le nombre de preuves décisives ancrées) :
- établie : `round3(min(0.95, 0.55 + 0.10*min(n_d,3) + 0.05*min(n_preuves,3)
  - 0.05*n_a))`
- non établie : `round3(min(0.95, 0.60 + 0.10*n_c + 0.05*n_a))`
- renvoi : `0.5`

**`round(x, 3)` Python = arrondi bancaire (half-even) SUR LE DOUBLE BINAIRE**,
pas décimal. Reproduire exactement (cf. §6.5). Avec les pas de 0.05 en jeu,
les cas limites existent (ex. `0.55+0.10*3-0.05*1 = 0.7999999999999999` →
round3 = 0.8 ; `0.60+0.05` = 0.65 exact binaire ? non : 0.6500000000000000222…
→ 0.65). Utiliser l'algorithme de CPython (§6.5), ne pas improviser avec
`toFixed`.

### 4.7 Traces probantes (ré-ancrage) et garde-fous

1. `pieces = parse_pieces(dossier)` ; `par_num = {num: pièce}` (dernier
   gagne en cas de doublon de numéro).
2. `cites` = union des `finaux[j].pieces` pour `j ∈ D`, filtrée sur
   `num ∈ par_num`, **triée numériquement croissant**.
3. **Seulement si `statut === "présence établie"`** : pour chaque `num` de
   `cites` :
   - `(t_type, role) = _type_role(pièce.type)` :
     slug du type puis, dans l'ordre : contient `"trace concrete"` →
     `("trace_concrete", "preuve décisive")` ; `"observation tierce"` →
     `("observation_tierce", "preuve décisive")` ; `"declaration etayee"` →
     `("declaration_etayee", "indice corroboratif")` ; contient `"nue"` OU
     `"intention"` → `(null, null)` (déclaration nue : jamais probante,
     `continue`) ; sinon `("indice", "indice corroboratif")`.
   - `loc = ancrer(pièce.extrait, pièce.date)` ; si `null` :
     `non_ancrees++`, incident `trace_tribunal_non_ancree` (+1), `continue`.
   - Sinon push `{piece: num, extrait: extrait_verbatim[:400 pts de code],
     date: date || date_defaut, type: t_type, role: role}` ;
     **arrêt dès 5 traces** (break après le push du 5e).
   - Si à la fin AUCUNE trace : `statut = "renvoi au cartographe"` ;
     `motif_regle = "détection sans pièce ancrable (<non_ancrees>
     citation(s) introuvable(s))"` (`%d` décimal).
4. `sp` = nb de traces `role === "preuve décisive"` ; `si = traces.length - sp`.
5. **Garde-fou du barème** : si `statut === "présence établie"` ET NON
   (`sp >= 1` OU `si >= 2`) : `statut = "renvoi au cartographe"` ;
   `motif_regle = "garde-fou du barème : un dossier ne se publie pas sur un
   indice unique (<sp> preuve, <si> indice)"`.
6. Scores : `(score_p, score_i)` = `(sp, si)` si établie ; `("R", "R")` si
   renvoi ; `(0, 0)` si non établie.
7. `confiance = _confiance(statut, D.length, C.length, A.length, sp)` —
   APRÈS les requalifications (un statut devenu renvoi → 0.5).

### 4.8 Blocs `jury`, `gardien`, `dossier_cartographe`

`pieges` = valeurs `finaux[j].piege` truthy pour `j ∈ C`, dédoublonnées,
**triées par points de code**.

```json
jury = {
  "mode": String((config.jury ?? {}).mode ?? "socle4+1"),   // PAS lowercasé ici
  "personas": infos_personas(),
  "detections": D, "contestations": C, "abstentions": A,
  "second_tour": Boolean(relanceur), "relance_par": relanceur|null,
  "composition": [noms dans l'ordre du jury],
  "positions_r1": {nom: position R1, ordre du jury},
  "positions_finales": {nom: position finale, ordre du jury},
  "pieges_nommes": pieges,
  "consensus": D non vide ET C vide,
  "dissidences": ["<j> : contestation (<piege ou 'sans piège nommé'>)" pour j ∈ C]
}
gardien = {"support": {"constat": support}, "raisonnement": {"drapeau": drapeau}}
```
**Nota `mode`** : ici `config.get("jury") or {}` — un `jury: null` → `{}` →
`"socle4+1"` ; la valeur N'EST PAS passée en minuscules (contrairement à
`composer_jury`).

`dossier_cartographe` (seulement si `statut === "renvoi au cartographe"`,
sinon `null`) :
```json
{"motif": motif_regle,
 "desaccord": "détections : <D join ', ' ou 'aucune'> — contestations : <C join ', ' ou 'aucune'>",
 "pieges_envisages": pieges,
 "citations": [par_num[n].extrait[:300 pts] pour n dans les 5 premiers de cites_tous]}
```
`cites_tous` = union triée croissante des pièces citées par `D ⧺ C`
(concaténation D puis C, mais le tri/set efface l'ordre), filtrée sur
`par_num`.

### 4.9 Président porte-parole

`verdict_calcule` — chaîne EXACTE (gabarit `%`) :
```
Statut calculé : <statut> (<motif_regle>)
Détections : <D join ", " ou "—"> | Contestations : <C ... ou "—"> | Abstentions : <A ... ou "—">
Second tour : <"oui, relancé par <relanceur>" ou "non">
Gardien du support : <support> — Gardien du raisonnement : <"vice signalé" ou "aucun drapeau">
Traces ancrées : <traces.length> (preuves <score_p>, indices <score_i>) — confiance <%.2f>
```
`%.2f` : deux décimales, arrondi half-even du double (cf. §6.5 — pour les
valeurs produites par `_confiance` déjà arrondies à 3 déc., `toFixed(2)` peut
diverger sur les .xx5 ; utiliser le même algorithme d'arrondi). `score_p/i`
formatés `%s` (donc `R` ou entier).

`vp = {...v, AVIS_JURES: avis_bloc, VERDICT_CALCULE: verdict_calcule,
GARDIENS: g_support + "\n\n---\n\n" + g_raison}`.
`pres = etape("24-president.md", "24-president.md", vp, "president",
meta_extra={statut})`. Gabarit 24 : AVIS_JURES, CODE, DOSSIER, GARDIENS, NOM,
PLAIDOIRIE, POLE_NUM, REPLIQUE, REQUISITOIRE, VERDICT_CALCULE. Contrat de
sortie : Markdown avec un objet JSON (le DERNIER du texte) contenant
`prescription: {pour_apprenant, pour_cartographe?}`.

Extraction : `data = extract_json(pres, last=true)` (util.py). Si `data` est
un objet ET `data.prescription` un objet :
```
prescription = {
  pour_apprenant: String(data.prescription.pour_apprenant ?? "")[:800 pts],
  pour_cartographe: data.prescription.pour_cartographe truthy
                    ? String(...)[:800 pts] : null }
```
**Toute exception** (appel backend, extraction) est avalée :
`log_warn("Président indisponible pour <code>@<contexte> (<e>) — prescription
par défaut")` — le récit ne bloque JAMAIS le verdict.

Si `prescription` absente OU `pour_apprenant` vide : incident
`president_recit_indisponible` (+1) et défauts par statut :
- établie : `"Cette journée atteste <nom> après contre-examen du tribunal.
  Pour consolider, une piste serait de documenter une nouvelle situation."`
- non établie : `"Ce dossier ne contient pas encore de pièce établie pour <nom>."`
- renvoi : `"Ce dossier appelle un échange avec l'enseignant."`
avec `pour_cartographe = motif_regle` si renvoi, sinon `null`.

### 4.10 Verdict retourné (Schéma 1 + délibération)

```json
{"code", "nom", "dossier_vide": false, "statut", "score_preuves",
 "score_indices", "confiance", "jury", "traces_probantes": traces,
 "prescription", "gardien", "motif_regle",
 "dossier_cartographe", "deliberation"}
```
`deliberation` :
```json
{"greffier_md": dossier,
 "arene": {"accusation_md", "defense_md", "replique_md", "briefing_md"},
 "jures": {nom: {"r1_md", "r2_md": texte 23c ou null (null aussi pour le
                  relanceur), "position_r1", "position_finale",
                  "pieces", "piege"}, ordre du jury},
 "relance_md": texte 23b ou null, "relance_par": relanceur ou null,
 "gardiens": {"support_md", "raisonnement_md"},
 "president_md": pres_txt ou null}
```
**Nota** : `r2_md` vient de `textes_r2` qui ne contient QUE les jurés autres
que le relanceur — pour le relanceur, `r2_md = null` et sa réponse est dans
`relance_md`.

---

## 5. Dépendances vers les autres modules

| Import | Module | Contrat utilisé |
|---|---|---|
| `resolve_file(path, vars)` | `templates.py` | remplace chaque `{$VAR}` (regex `\{\$([A-Z_][A-Z0-9_]*)\}`) par `String(vars[VAR])` ; variable absente → laissée telle quelle + `log_warn("Variables non résolues : <noms triés joints par ', '>")` |
| `stable_hash(s)` | `util.py` | cf. §6.1 |
| `find_verbatim(source, quote, min_ratio=0.82)` | `util.py` | localisation floue (difflib) → `(start, end, ratio)` en indices POINTS DE CODE du source, ou `null` — spec dédiée du module util |
| `extract_json(text, last=true)` | `util.py` | dernier objet JSON du texte |
| `neutraliser_balises(texte)` | `util.py` | neutralisation des balises de prompt dans le texte élève |
| `read_text` / `write_text` | `util.py` | I/O UTF-8 |
| `log_warn(msg)` | `util.py` | journal WARN |

Appelants : `journee.py` importe `_type_role`, `constituer_dossier`,
`infos_personas`, `juger`, `juger_faisceau` (et le second ressort). Le mock
backend (backends.py) fournit l'oracle de parité : mêmes prompts → mêmes
sorties → mêmes verdicts.

`pole` est un objet à attributs `num` (int) et `nom` (str) ; `comp` un dict
`{code, nom, fiche_md}` ; `journee` un dict `{id, texte, date?}` ;
`incidents` un dict-compteur muté en place ; `suspicions` une liste de dicts
`{journee?, extrait?, date?, source?, jugee?}`.

---

## 6. Points de vigilance parité (Python → JS)

### 6.1 `stable_hash(s)` (util.py, rappel)

`parseInt(md5(utf8(s)).hexdigest().slice(0, 12), 16)` — entier 48 bits, tient
dans un `Number` JS sans perte. Formatage `"%x"` → `n.toString(16)`
(minuscules, sans padding).

### 6.2 `random.Random(seed).sample(noms, k)` — Mersenne Twister CPython

Le bras « aleatoire » exige une réimplémentation BIT-À-BIT :
1. **Seed entier** : `Random(n)` avec `n` entier positif < 2^48 →
   `init_by_array(key)` où `key` = les mots de 32 bits de `n` en
   little-endian (`[n & 0xffffffff, n >>> 32]`, en omettant… NON : CPython
   découpe n en mots de 32 bits, ET si n < 2^32 le tableau a 1 élément,
   sinon 2). Implémenter `init_genrand(19650218)` + boucles `init_by_array`
   standard MT19937 (32 bits).
2. **`getrandbits(k)`** (k ≤ 32) : `genrand_uint32() >>> (32 - k)`.
3. **`_randbelow(n)`** : `k = bitLength(n)` ; tirer `r = getrandbits(k)`
   tant que `r >= n`.
4. **`sample(pop, k)`** : ici `n = 13 ≤ setsize` (21, ou 21 + 4^ceil(log4(3k))
   si k > 5 — pour k ≤ 6 on reste toujours en méthode « pool ») :
   ```
   pool = copie de pop
   pour i de 0 à k-1 :
     j = _randbelow(n - i)
     result[i] = pool[j]
     pool[j] = pool[n - i - 1]
   ```
   L'ordre du résultat EST l'ordre de sortie du jury.
   Valider contre CPython sur plusieurs graines avant de livrer.

### 6.3 `_slug(s)` — normalisation NFD + strip ASCII

`s.normalize("NFD")` puis suppression de tout point de code > 127 (équivalent
de `encode("ascii","ignore")` : filtrer `c.charCodeAt(0) <= 127` APRÈS NFD),
puis `toLowerCase()`. Exemples contractuels :
`"Éthicien"` → `"ethicien"` ; `"Clinicien du récit"` → `"clinicien du recit"`
(l'espace RESTE : noms de fichiers avec espaces) ; `"Pièges"` → `"pieges"`.
Sert : noms de fichiers 23-/23c-, `_norm_position`, `_type_role`, gardiens.

### 6.4 Troncatures `[:N]` = POINTS DE CODE, pas unités UTF-16

Python découpe par points de code. En JS, `String.prototype.slice` compte en
unités UTF-16 : divergence si le texte contient des caractères hors BMP
(émojis…). Implémenter un helper `sliceCodepoints(s, n)`
(`Array.from(s).slice(0, n).join("")` ou itération par `for..of`).
Concerne : piege 200, extrait de pièce 600, trace 400, extrait faisceau 400,
citations cartographe 300, prescriptions 800, préfixe « DOSSIER VIDE » 400.

### 6.5 Arrondis : `round(x, 3)` et `%.2f` = half-even SUR DOUBLE BINAIRE

CPython : `round(x, 3)` = `_Py_dg_dtoa`-correct — le double le plus proche de
la valeur décimale arrondie half-even de la représentation décimale la plus
courte du double. Implémentation JS sûre : formater le double en décimal
exact (ou via une lib décimale), arrondir half-even à 3 chiffres, reparser en
double. Ne PAS utiliser `Math.round(x*1000)/1000` (half-up, faux sur .0005)
ni `toFixed` (half-even non garanti selon moteurs pour l'affichage, et
`toFixed` arrondit différemment sur certaines valeurs). Même exigence pour le
`%.2f` de `verdict_calcule`.

### 6.6 Ordres d'itération et de tri

- Tout objet-résultat (jury.positions_r1, deliberation.jures…) suit **l'ordre
  de la liste `jures`** — jamais l'ordre d'achèvement parallèle.
- `_ancrer` du faisceau suit **l'ordre d'insertion de `textes_par_journee`**
  (première journée qui matche gagne) → utiliser une `Map` (les clés
  numériques d'un objet JS seraient réordonnées).
- Tris de chaînes (`sorted`) = points de code (§3.1) — pieges_nommes, noms de
  la banque, variables manquantes de resolve. JAMAIS `localeCompare`.
- Tris numériques : pieces, cites, cites_tous → comparateur `(a,b)=>a-b`.
- Tri du faisceau (§3.9.3) : STABLE, clé tuple `(bool, string)`.
- Dédoublonnages : jury (première occurrence gagne) ; `par_j`/`par_num`
  (dernière occurrence gagne).

### 6.7 Regex Python → JS

- `re.IGNORECASE` avec `Pi[èe]ce` : le flag `i` JS gère `è/È` correctement
  (Unicode simple case folding) — OK.
- `re.DOTALL` → `[\s\S]` ou flag `s` JS ; `\Z` → `$` sans flag `m`.
- `re.match` (ancré au DÉBUT seulement) → `/^…/.test(s)` — utilisé pour la
  validation de date `\d{4}-\d{2}-\d{2}` (un suffixe est toléré :
  `"2024-05-03 matin"` passe).
- `.search` = PREMIÈRE occurrence ; `.finditer` = flag `g` avec `exec` en
  boucle (attention au `lastIndex`).
- `\d` Python (str) matche les chiffres Unicode (arabo-indiens compris) ;
  `\d` JS = ASCII seulement. Risque théorique faible ; pour la parité
  stricte, accepter que `parse_position`/`parse_pieces` ne voient que
  l'ASCII **sauf si l'oracle mock révèle un écart** (le mock n'émet que de
  l'ASCII décimal).

### 6.8 Truthiness Python

`or` / `if x` Python : `0`, `""`, `null`, `[]`, `{}` sont falsy — attention,
en JS `[]` et `{}` sont truthy. Points sensibles : `calques or "(aucun…)"`
(liste vide → défaut en Python), `config.get("jury", {}) or {}`,
`pr["position"]` (chaîne non vide), `s.get("extrait")`,
`data["prescription"].get("pour_cartographe")`. Écrire des helpers ou des
tests explicites plutôt que `||` aveugle quand la valeur peut être `[]`/`{}`.

### 6.9 Formatage `%s` / `%d`

`"%s" % None` → `"None"` (graine du jury §3.2.3 — critique pour le hash !) ;
`"%s" % 3` → `"3"` ; `%d` → entier décimal. Reproduire à l'identique dans
toutes les chaînes assemblées (labels backend, motifs, verdict_calcule,
dossier de faisceau).

### 6.10 Cache fichiers = contrat de reprise

Les noms d'étape sont contractuels : `20-greffier.md`, `21a-accusation.md`,
`21b-defense.md`, `22a-replique.md`, `22b-briefing.md`, `23-<slug>.md`,
`23b-relance.md`, `23c-<slug>.md`, `25a-gardien-support.md`,
`25b-gardien-raisonnement.md`, `24-president.md`. Une reprise JS doit relire
les caches produits par le Python (et inversement).

---

## 7. Récapitulatif des incidents émis

| Clé | Déclencheur |
|---|---|
| `jure_position_illisible` | position R1 non parsable (→ abstention) |
| `trace_tribunal_non_ancree` | citation d'une détection introuvable dans le source |
| `president_recit_indisponible` | prescription absente/vide (→ défauts) |
| `tribunal_echec_technique` | exception dans `juger` |
| `faisceau_echec_technique` | exception dans `juger_faisceau` |
