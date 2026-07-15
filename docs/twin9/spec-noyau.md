# Spec noyau — portage JS de Twin9 (aurora/util.py, templates.py, portfolio.py, referentiel.py)

Contrat de portage bit-à-bit. Le mode mock déterministe (`--salt`) sert d'oracle de
parité : toute divergence (arrondi, ordre d'itération, format de chaîne hashée)
casse la parité. Chaque section documente l'algorithme exact, les cas limites et
les idiomes Python à reproduire.

Convention générale du présent document :

- « code point » = point de code Unicode. **Toutes les longueurs et tous les index
  de chaînes de ce noyau sont en code points** (sémantique Python `len`/`str[i]`),
  pas en unités UTF-16. En JS, tant que les textes restent dans le BMP (cas réel :
  français), `length`/`indexOf` coïncident ; si des caractères astraux (émojis)
  peuvent apparaître dans les portfolios, le porteur DOIT travailler sur un
  tableau de code points (`Array.from(s)`) pour `find_verbatim` et `sentences_of`,
  car les offsets `(start, end)` sont persistés dans les artefacts et comparés
  bit-à-bit.
- Les regex Python sont données telles quelles ; leur traduction JS est précisée
  quand elle n'est pas triviale.

---

## 1. `aurora/util.py`

Rôle : utilitaires communs — logging, IO, extraction JSON depuis réponse LLM,
neutralisation anti-injection, ancrage verbatim (difflib), hash stable, empreinte
de contexte. `stable_hash` est LA fondation de tout le déterminisme du pipeline
(seeds du backend mock, permutations, empreintes de reprise).

### 1.1 Logging — `log(msg, level="INFO")`, `log_ok`, `log_warn`, `log_err`

- Horloge : `_T0` fixé à l'import du module ; `dt = now - _T0` en secondes.
- Format **exact** (stderr) : `"[%7.1fs] %-5s %s\n"` → dt sur 7 caractères,
  1 décimale, cadré à droite (ex. `[    0.3s] WARN  message`) ; level cadré à
  gauche sur 5 caractères. `%.1f` de Python arrondit en **half-even** sur la
  représentation binaire (en pratique : arrondi de `dt` à 0.1 s près ; non
  critique pour la parité des artefacts, mais à reproduire si les logs sont
  comparés). `log_ok`→"OK", `log_warn`→"WARN", `log_err`→"ERR".
- Le logging n'influence AUCUN artefact : hors périmètre de l'oracle de parité.

### 1.2 IO — `read_text`, `write_text`, `read_json`, `write_json`

- Tout en UTF-8. `read_text` : lecture brute, **aucune** normalisation de fins de
  ligne (Python `open(..., "r")` en mode texte fait la *universal newlines* :
  `\r\n` et `\r` sont convertis en `\n` à la lecture — le porteur JS DOIT faire
  `content.replace(/\r\n?/g, "\n")` après lecture pour reproduire ce
  comportement, sinon toutes les regex `^`/`$` et les offsets divergent sur des
  fichiers CRLF).
- `write_text(path, content)` : crée les dossiers parents (mkdir -p) puis écrit.
- `write_json(path, obj)` : sérialisation `json.dump(obj, f, ensure_ascii=False,
  indent=2)` **suivie d'un `"\n"` final**. Règles de sérialisation Python à
  reproduire exactement (voir §1.7 pour le détail) : indentation 2 espaces,
  séparateur d'items `","` + retour ligne + indentation, séparateur clé-valeur
  `": "`, non-ASCII littéral, **ordre des clés = ordre d'insertion du dict**
  (pas de tri ici — l'ordre d'insertion des objets JS doit reproduire celui du
  Python, ce qui impose de construire les objets dans le même ordre partout
  dans le pipeline).

### 1.3 `extract_json(text, last=True)` — extraction JSON d'une réponse LLM

Retourne l'objet JSON parsé, ou `null` si rien n'est parsable. Ne lève jamais.

Algorithme pas-à-pas :

1. `text` vide/None → `null`.
2. **Phase blocs cerclés** : regex `_RE_FENCE = ```(?:json)?\s*\n(.*?)\n``` `
   avec DOTALL (JS : `/```(?:json)?\s*\n([\s\S]*?)\n```/g`, capture non gourmande).
   `findall` = toutes les occurrences non chevauchantes, dans l'ordre du texte,
   contenu = groupe 1 (sans les fences ni les `\n` adjacents).
   - Nota : `\s*` peut absorber des espaces ET des sauts de ligne avant le `\n`
     obligatoire ; un bloc dont le contenu ne contient pas de `\n` final avant
     ` ``` ` ne matche pas.
3. `last=True` → parcourir les candidats **du dernier au premier** ; `last=False`
   → ordre du texte.
4. Pour chaque candidat `c`, deux tentatives dans cet ordre : `c` brut, puis
   `_repair_json(c)`. Première tentative qui parse → retour immédiat.
5. **Phase fallback** (aucun bloc cerclé parsable) : balayage caractère par
   caractère de `text` entier pour collecter les objets `{...}` équilibrés de
   profondeur 0 (les tableaux `[...]` de tête ne sont PAS détectés) :
   - Automate : `depth=0, start=None, in_str=false, esc=false`.
   - Si `in_str` : `esc` vrai → le consommer (`esc=false`) ; sinon `\` →
     `esc=true` ; sinon `"` → `in_str=false` ; tout autre caractère ignoré ;
     `continue` dans tous les cas.
   - Hors chaîne : `"` → `in_str=true` ; `{` → si `depth==0`, `start=i`, puis
     `depth+=1` ; `}` → si `depth>0`, `depth-=1`, et si `depth==0` et `start`
     non nul, empiler `text[start..i]` inclusif dans `spans`.
   - Attention : le suivi `in_str` est actif même à profondeur 0 (un `"` isolé
     dans la prose avant tout `{` ouvre un « faux » état chaîne — comportement à
     reproduire tel quel).
6. Même politique d'ordre (`last`) et de réparation sur `spans`.
7. Rien ne parse → `null`.

`_repair_json(s)` (réparations minimales, dans cet ordre) :

1. Remplacements globaux : U+201C `“` → `"`, U+201D `”` → `"`, U+2019 `’` → `'`.
   (U+2018 `‘` n'est PAS traité ici, contrairement à `_TRANS_TYPO`.)
2. Suppression des virgules finales : `re.sub(r",\s*([}\]])", r"\1", s)` — JS :
   `s.replace(/,\s*([}\]])/g, "$1")`, global.

Parité du parseur JSON : `json.loads` Python vs `JSON.parse` JS —

- Python accepte `NaN`, `Infinity`, `-Infinity` ; `JSON.parse` les rejette.
  Décision de portage : les rejeter aussi (le LLM mock n'en émet pas) mais le
  documenter comme divergence assumée.
- Entiers hors 2^53 : Python les parse exacts, JS en fait des doubles. Les
  sorties du pipeline n'en produisent pas ; divergence assumée.
- Clés dupliquées : les deux gardent la dernière. OK.
- L'objet retourné doit préserver l'**ordre des clés** du JSON source (garanti
  par `dict` Python et par les objets JS pour des clés non entièrement
  numériques — attention aux clés du type `"1"`, `"2"` que JS réordonne en tête :
  si de telles clés existent, utiliser une `Map` ou re-sérialiser avec un ordre
  explicite).

### 1.4 `neutraliser_balises(texte)` — anti-injection

- Regex `_RE_BALISE`, insensible à la casse :
  `</?\s*(PORTFOLIO|FEUILLES|DOSSIER|FICHE|FICHES_POLE|EXTRAITS|BRIEFING|REQUISITOIRE|PLAIDOIRIE|REPLIQUE|AVIS_JURES|RELANCE|MA_POSITION_R1|GARDIENS|VERDICT_CALCULE)\s*>`
  — JS : même motif avec flags `gi`. NB : `FICHE` étant préfixe de `FICHES_POLE`,
  l'ordre de l'alternation compte : Python teste les branches dans l'ordre écrit,
  donc `<FICHES_POLE>` matche bien la branche `FICHE` d'abord… non : `FICHE`
  matche 5 lettres mais le `\s*>` qui suit échoue sur `S`, le moteur backtracke et
  essaie `FICHES_POLE`. Les deux moteurs (Python `re`, JS) backtrackent
  identiquement — comportement identique, mais **conserver l'ordre exact de
  l'alternation**.
- Remplacement : pour chaque match `m`, retourner `m[0]` où **tous** les `<`
  deviennent `‹` (U+2039) et tous les `>` deviennent `›` (U+203A).
- Entrée `null`/vide → chaîne vide (le Python fait `texte or ""`).
- `\s` : Python (Unicode par défaut) matche ` \t\n\r\f\v` + U+001C–001F, U+0085,
  U+00A0, U+1680, U+2000–200A, U+2028, U+2029, U+202F, U+205F, U+3000. JS `\s`
  matche le même ensemble MOINS U+001C–001F et U+0085, PLUS U+FEFF. Entre `<` et
  le nom de balise, seuls des espaces/tabs sont plausibles : divergence
  théorique, à noter mais pas bloquante. Idem pour toutes les autres regex à `\s`
  de ce noyau.

### 1.5 `find_verbatim(source, quote, min_ratio=0.82)` — ancrage verbatim

Localise `quote` dans `source`. Retourne `(start, end, ratio)` — offsets **en
code points dans `source` brut**, `end` exclusif — ou `null`. C'est la fonction
la plus délicate du portage : trois étages successifs.

**Étape 0 — nettoyage de la citation :**

1. `source` ou `quote` vide → `null`.
2. `q = quote.strip()` (strip Unicode Python : retire tous les caractères
   « espace » au sens `str.isspace()` aux deux extrémités — voir liste §1.4,
   plus U+000B, U+000C, U+001C–001F, U+0085),
   puis `.strip("«»\"' ")` : retire aux deux extrémités, répétitivement, tout
   caractère appartenant à l'ensemble `{«, », ", ', espace}`,
   puis suppression de **toutes** les occurrences littérales de `[...]`
   (`replace("[...]", "")`), puis `strip()` final.
3. `q` vide → `null`.

**Étape 1 — recherche exacte :** `i = source.indexOf(q)` (code points). Si
trouvé : retour `(i, i + len(q), 1.0)`.

**Étape 2 — normalisation espaces + typographie avec carte d'index :**

Table `_TRANS_TYPO` (code points exacts, vérifiés dans la source) :

| entrée | sortie |
|---|---|
| U+2019 `’` | `'` |
| U+2018 `‘` | `'` |
| U+201C `“` | `"` |
| U+201D `”` | `"` |
| U+00AB `«` | `"` |
| U+00BB `»` | `"` |
| U+2013 `–` | `-` |
| U+2014 `—` | `-` |
| U+00A0 (espace insécable) | espace |
| U+202F (espace fine insécable) | espace |

`_typo(ch)` : mappe le caractère, sinon identité.

Construction de `flat` (source aplatie) et `idx_map` (index normalisé → index
source) :

```
idx_map=[], buf=[], prev_space=true
pour j, ch de source (code points) :
    ch = _typo(ch)
    si ch est un espace (au sens Python str.isspace(), APRÈS _typo — donc
        U+00A0/U+202F déjà devenus " ", mais \n, \t, U+2028… comptent aussi) :
        si non prev_space : buf += " " ; idx_map += j
        prev_space = true
    sinon :
        buf += ch ; idx_map += j
        prev_space = false
flat = join(buf)
```

Effets à reproduire : les espaces en tête de source sont absorbés sans émettre
d'espace (`prev_space` initial vrai) ; une suite d'espaces est réduite à UN
espace dont l'index source est celui du **premier** espace de la suite ; un
espace final éventuel reste dans `flat` (pas de rstrip).

Normalisation de la citation : `qn = q` passé caractère par caractère dans
`_typo`, puis `re.sub(r"\s+", " ", ...)` (toute suite d'espaces → un espace ;
PAS de strip supplémentaire — `q` a déjà été strippé).

Recherche insensible à la casse : `i = flat.lower().indexOf(qn.lower())`.
Python `str.lower()` ≈ JS `toLowerCase()` (identiques sur le français ; cas
exotiques comme U+0130 se comportent pareil dans les deux). Si trouvé et
`i + len(qn) - 1 < idx_map.length` : retour
`(idx_map[i], idx_map[i + len(qn) - 1] + 1, 0.99)`. Le ratio est le littéral
**0.99**.

**Étape 3 — approximatif difflib (fenêtre) :**

1. `words = qn.split(" ")` (split simple sur espace) ; si `words.length < 4` →
   `null`.
2. `sm = SequenceMatcher(a=qn.lower(), b=flat.lower(), autojunk=false)` ;
   `m = sm.find_longest_match(0, len(a), 0, len(b))` → triplet `(a_idx=m.a,
   b_idx=m.b, size=m.size)`.
3. Seuil : `m.size >= max(20, floor(len(qn) * min_ratio * 0.6))` — `int()`
   Python = troncature vers zéro (valeurs positives : `Math.floor`). Avec
   `min_ratio=0.82` : `floor(len(qn) * 0.492)`. **Ordre des opérations
   flottantes** : `len(qn) * min_ratio` d'abord, puis `* 0.6`, puis troncature —
   reproduire tel quel (IEEE 754 double dans les deux langages → identique si
   l'ordre est identique).
4. `b0 = max(0, m.b - m.a)` ; `b1 = min(len(flat), b0 + len(qn))`.
5. `ratio = SequenceMatcher(a=qn.lower(), b=flat[b0:b1].lower()).ratio()` —
   **ATTENTION : ce second matcher est construit SANS `autojunk=false`, donc
   `autojunk=true` (défaut Python)**. Voir spécification difflib ci-dessous.
6. Si `ratio >= min_ratio` et `b1 - 1 < idx_map.length` : retour
   `(idx_map[b0], idx_map[b1 - 1] + 1, ratio)`. Sinon `null`.
7. Le `ratio` retourné est un double IEEE ; s'il est persisté dans un artefact
   JSON, sa sérialisation doit suivre les règles Python (§1.7, point flottants).

**Spécification difflib.SequenceMatcher (sous-ensemble requis)** — le porteur
DOIT réimplémenter fidèlement (algorithme CPython, `difflib.py`) :

- Construction : `b2j = {élément de b → liste croissante de ses indices dans b}`.
  Pas de `isjunk` ici. **autojunk** : si `autojunk` vrai ET `len(b) >= 200`,
  tout élément dont le nombre d'occurrences dans b est `> floor(len(b)/100) + 1`
  (« populaire ») est retiré de `b2j` (ses indices deviennent invisibles aux
  correspondances). Avec `autojunk=false` : aucune élimination.
- `find_longest_match(alo, ahi, blo, bhi)` :

  ```
  besti, bestj, bestsize = alo, blo, 0
  j2len = {}
  pour i de alo à ahi-1 :
      newj2len = {}
      pour j dans b2j.get(a[i], []) :
          si j < blo : continue
          si j >= bhi : break
          k = j2len.get(j-1, 0) + 1
          newj2len[j] = k
          si k > bestsize : besti, bestj, bestsize = i-k+1, j-k+1, k
      j2len = newj2len
  ```

  (La phase d'extension par éléments junk du CPython est sans effet ici car
  l'ensemble junk est vide dans les deux usages — `isjunk=None` ; les éléments
  « populaires » de l'autojunk ne sont PAS étendus non plus dans CPython via
  `bjunk`, ils sont dans `bpopular` : l'extension junk ne s'applique qu'à
  `bjunk`, vide. Donc l'algorithme ci-dessus suffit, y compris avec autojunk.)
  Départage : premier `k > bestsize` rencontré gagne → plus petit `i`, puis plus
  petit `j`. Strictement supérieur (`>`), pas `>=`.
- `get_matching_blocks()` (nécessaire à `ratio()`) : file de travail
  `[(0, la, 0, lb)]` ; pour chaque quadruplet, `find_longest_match` ; si
  `size > 0`, empiler le bloc et les deux sous-problèmes gauche/droite ; trier
  les blocs par `(i, j)` croissant ; fusionner les blocs adjacents
  (`i1+k1 == i2 et j1+k1 == j2`) ; terminer par le sentinel `(la, lb, 0)`.
- `ratio()` : `M = somme des tailles des matching blocks` ;
  `ratio = 2.0 * M / (len(a) + len(b))` (division flottante ; dénominateur > 0
  garanti ici car qn non vide).

### 1.6 `stable_hash(s)` — LE hash fondation

Algorithme exact, bit-à-bit :

1. Encoder `s` en UTF-8.
2. MD5 des octets → hexdigest (32 caractères hex minuscules).
3. Prendre les **12 premiers caractères hex** (= 48 bits de poids fort).
4. Parser en entier base 16.

Résultat : entier non signé sur 48 bits, `0 ≤ h < 2^48`. En JS : `Number` suffit
(2^48 < 2^53, `parseInt(hex.slice(0, 12), 16)` est exact). Il faut une
implémentation MD5 embarquée (pas de MD5 natif synchrone côté navigateur ;
`crypto.subtle` ne fait pas MD5). Vecteur de test (vérifié contre CPython) :
`stable_hash("") = parseInt("d41d8cd98f00", 16) = 233223382208256`.

**Piège JS majeur : ne JAMAIS appliquer d'opérateur bit-à-bit (`>>`, `&`, `%`
via `|0`…) sur `h`** — les opérateurs binaires JS tronquent à 32 bits. Partout
où le Python fait `h >> 8`, faire `Math.floor(h / 256)` ; `h % n` reste correct
avec l'opérateur `%` de JS sur Number (opérandes positifs).

### 1.7 `empreinte(*parts)` — empreinte de contexte

`"%x" % stable_hash(json.dumps(parts, sort_keys=True, ensure_ascii=False, default=str))`

- Sortie : hex **minuscule sans zéros de tête** (`h.toString(16)`), donc
  longueur ≤ 12.
- La chaîne hashée est la sérialisation `json.dumps` **compacte par défaut de
  Python**, qu'il faut reproduire OCTET par OCTET :
  - `parts` (tuple variadique) → tableau JSON `[...]`.
  - Séparateurs Python par défaut (sans `indent`) : **`", "` entre items et
    `": "` entre clé et valeur — avec un espace après la virgule et après les
    deux-points**. `JSON.stringify` n'en met pas : sérialiseur custom
    obligatoire.
  - `sort_keys=True` : clés des objets triées par comparaison de chaînes Python
    (ordre des code points, équivalent au tri JS par défaut `<` sur chaînes
    BMP ; pour l'astral, comparer par code points, pas par unités UTF-16).
  - `ensure_ascii=False` : les non-ASCII restent littéraux. Échappements dans
    les chaînes : `\"`, `\\`, `\n`, `\r`, `\t`, `\b`, `\f`, et `\u00XX` pour les
    autres caractères de contrôle < 0x20. Rien d'autre n'est échappé (ni `/`,
    ni U+2028/U+2029).
  - Booléens → `true`/`false`, `None` → `null`.
  - Entiers → décimal sans point. **Flottants → `repr` Python** (plus court
    round-trip) : identique à `Number.prototype.toString` de JS pour la
    mantisse, MAIS les formats exponentiels divergent (Python `1e+16`, JS
    `10000000000000000` ; JS ne passe en notation exponentielle qu'à 1e21, et
    écrit `1e+21` sans le `.0`). Règle de portage : **interdire les flottants
    non triviaux dans les appels à `empreinte`** (audit des appelants requis) ;
    si inévitable, implémenter le formatage Python : notation exponentielle si
    exposant < -4 ou ≥ 16, mantisse minimale round-trip, exposant signé sans
    zéro de tête sauf `e-05`… (documenter chaque valeur réelle rencontrée dans
    l'oracle).
  - `default=str` : tout objet non sérialisable est remplacé par `str(obj)`
    Python (ex. tuple imbriqué déjà converti en liste par dumps — non, les
    tuples SONT sérialisés en tableaux ; `default` ne s'applique qu'aux types
    inconnus, ex. `Path`, `datetime`). Le porteur doit vérifier les appelants :
    idéalement seuls str/int/list/dict/bool/None transitent.
- Usage : la reprise (`resume`) ne réutilise un artefact que si son empreinte
  correspond — toute divergence de sérialisation invalide silencieusement les
  caches croisés Python/JS (acceptable) mais casse l'oracle de parité (pas
  acceptable) : tester `empreinte` sur les entrées réelles du pipeline mock.

### 1.8 Dépendances

`util.py` ne dépend d'aucun autre module aurora. Tous les autres en dépendent.

---

## 2. `aurora/templates.py`

Rôle : résolution des gabarits de prompts. Les fichiers `protocole/*.md`
(CONFIDENTIELS — ne jamais recopier leur texte dans les specs ni le code JS
commité ; les charger comme données) contiennent des placeholders `{$VARIABLE}`.

### 2.1 `resolve(text, variables, strict=False)`

- Regex : `\{\$([A-Z_][A-Z0-9_]*)\}` — nom en MAJUSCULES/chiffres/underscore,
  premier caractère non-chiffre. JS : `/\{\$([A-Z_][A-Z0-9_]*)\}/g`.
- Chaque occurrence : si `VAR` est une clé de `variables` →
  **`str(variables[VAR])`**. Sémantique `str()` Python à reproduire si des
  non-chaînes transitent : `True`→`"True"`, `False`→`"False"`, `None`→`"None"`,
  entiers en décimal, flottants en repr Python (voir §1.7). Recommandation :
  convertir en amont et n'accepter que des chaînes/entiers ; sinon implémenter
  `pyStr()`.
- Variable absente : le placeholder est laissé **tel quel** dans la sortie, et
  la clé est collectée dans un ensemble `missing`.
- **Piège JS** : utiliser la forme fonctionnelle de `replace` — la valeur
  substituée peut contenir `$&`, `$1`… qui seraient interprétés par la forme
  chaîne. Aucune ré-analyse de la valeur substituée (une valeur contenant
  `{$X}` reste littérale : `re.sub` ne repasse pas sur le remplacement).
- Fin de traitement : si `missing` non vide, message
  `"Variables non résolues : " + tri lexicographique + join ", "` ; en mode
  `strict` → lever une erreur (KeyError) avec ce message ; sinon → `log_warn`.
- La présence de la clé se teste par **appartenance** (`key in variables`) : une
  clé présente avec valeur `None` est substituée par `"None"`, PAS considérée
  manquante.

### 2.2 `resolve_file(path, variables, strict=False)`

`resolve(read_text(path), ...)`. Rappel §1.2 : normalisation universal newlines
à la lecture.

### 2.3 Dépendances

`util.read_text`, `util.log_warn`.

---

## 3. `aurora/portfolio.py`

Rôle : découpage du portfolio (markdown) en « feuilles » datées, blocs pour
prompts, extraction de phrases candidates (utilisées par le backend mock — donc
**critiques pour la parité** : la liste `(feuille_id, phrase)` alimente les
tirages déterministes).

### 3.1 Regex

- `_RE_DATE_TITLE = r"^#{2,3}\s+.*?(\d{1,2}\.\d{1,2}\.\d{2,4}|\d{4}-\d{2}-\d{2})"`,
  MULTILINE. JS : flag `m`. Attention : `.*?` ne franchit pas `\n`, mais le
  `\s+` initial PEUT absorber des sauts de ligne (un titre `##` seul suivi d'une
  date en début de ligne suivante matcherait) — reproduire tel quel.
  `m.group(0)` s'étend du `#` jusqu'à la fin de la date (match minimal).
- `_RE_ANY_TITLE = r"^#{2,3}\s+(.+)$"`, MULTILINE. Différence de moteurs : `.`
  Python exclut seulement `\n` ; `.` JS exclut aussi `\r`, U+2028, U+2029 ; et
  `$` multiline JS s'arrête aussi avant `\r`. Après la normalisation universal
  newlines (§1.2) il ne reste que des `\n` : comportements identiques. **La
  normalisation des fins de ligne à la lecture est donc un prérequis dur.**
- Titres `#` (h1) et `####`+ (h4+) : jamais reconnus comme séparateurs.

### 3.2 `_iso(raw)`

- Si `raw` matche `^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$` (ancré fin par `$` ;
  `re.match` ancre le début) : année à 4 chiffres gardée, sinon `2000 + année`
  (donc `3` chiffres : `123` → `2123` ? Non — `\d{2,4}` avec 3 chiffres :
  `len==3` ≠ 4 → `2000 + 123 = 2123` ; comportement voulu ou non, reproduire).
  Sortie : `"%04d-%02d-%02d" % (y, mo, d)` — zéro-padding à 4/2/2.
- Aucune validation calendaire (`99.99.99` → `2099-99-99`).
- Sinon : `raw` inchangé (cas `YYYY-MM-DD`).

### 3.3 `split_portfolio(path)` → `{journal_id, raw, feuilles}`

1. `raw = read_text(path)`.
2. `journal_id` : nom de fichier sans répertoire ni **dernière** extension
   (`os.path.splitext` : coupe au dernier `.`, sauf si le nom commence par `.`
   sans autre point), puis `re.sub(r"[^A-Za-z0-9_-]+", "_", ...)` (toute suite
   de caractères hors `[A-Za-z0-9_-]` → UN `_`), puis strip des `_` aux deux
   extrémités.
3. `matches = _RE_DATE_TITLE` sur `raw` ; `dated = (len(matches) >= 2)`. Si non
   daté : `matches = _RE_ANY_TITLE`.
4. Si `len(matches) >= 2` — découpage :
   - Pour chaque match `i` : `start = m.start()` ; `end = début du match
     suivant`, ou `len(raw)` pour le dernier. **Le texte avant le premier titre
     est donc IGNORÉ** (ni feuille, ni rattachement).
   - `titre = m.group(0).lstrip("# ").strip()` — retire `#` et espaces en tête
     (jeu de caractères `{#, espace}`, répétitif), puis strip Unicode des deux
     côtés. Pour la variante non datée, group(0) = ligne de titre entière (sans
     `\n` final).
   - `date = _iso(m.group(1))` si daté, sinon `null`.
   - `fid = date` si daté, sinon `"F%02d" % (i+1)` (F01, F02, … zéro-paddé à 2,
     F100 possible sans troncature).
   - **Déduplication des ids** (deux entrées le même jour) via dict `vus` :
     première occurrence → fid nu, `vus[fid]=0` ; occurrence suivante →
     `vus[fid] += 1` puis `fid = fid + "_" + chr(ord('a') + vus[fid])`. Donc la
     2e occurrence reçoit le suffixe **`_b`** (pas `_a`), la 3e `_c`, etc.
     (11e occurrence → `_k`… 27e → dépasse `z` : `chr(123)='{'` ; théorique).
     NB : les ids suffixés ne sont PAS eux-mêmes réinsérés dans `vus`
     (collision `2024-01-01_b` préexistante théoriquement possible, non gérée).
   - Feuille : `{id, date, titre, start, end, texte: raw[start:end].strip()}`.
     `start`/`end` sont des offsets code points dans `raw` AVANT strip (le strip
     ne s'applique qu'à `texte`).
   - Si daté ET toutes les feuilles ont une date : **tri stable** par clé
     `(date, id)` — comparaison lexicographique de chaînes (code points). JS :
     `Array.prototype.sort` est stable (ES2019) ; comparateur
     `(a,b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)`.
5. Si `matches` a 0 **ou 1** élément : `feuilles` reste vide → fallback feuille
   unique `{id:"F01", date:null, titre:journal_id, start:0, end:len(raw),
   texte:raw.strip()}`.

### 3.4 `feuilles_block(feuilles)`

Pour chaque feuille : `"═══ Feuille : %s ═══\n%s\n" % (id, texte)` — `═` =
U+2550 répété 3 fois de chaque côté, espaces exacts (`═══ Feuille : ID ═══`).
Jointure par `"\n"` → une ligne vide entre feuilles, et le bloc se termine par
un `\n` final (celui du dernier gabarit).

### 3.5 `sentences_of(portfolio, min_len=60, max_len=400)`

Retourne la liste ordonnée `[(feuille_id, phrase)]` — **l'ordre et le contenu
exacts alimentent le mock : parité stricte requise**.

1. Itérer les feuilles dans l'ordre de `portfolio["feuilles"]` (post-tri).
2. Pour chaque feuille : `texte.splitlines()`. **Python `splitlines` coupe sur**
   `\n`, `\r`, `\r\n`, `\v`, `\f`, U+001C–001E, U+0085, U+2028, U+2029 — sans
   garder les terminateurs. Après normalisation §1.2 il ne reste que `\n`, mais
   si le portfolio contient U+2028/U+0085 en plein texte, `split("\n")` JS
   diverge : implémenter le split Python (regex
   `/\r\n|[\n\r\v\f\x1c\x1d\x1e\x85  ]/`).
3. `line = raw_line.strip()` (strip Unicode). Ignorer si `line` commence par
   `#` OU `len(line) < min_len` (**test sur la ligne entière strippée**, avant
   découpe en phrases : une ligne de 59 caractères est ignorée même si elle
   contient une phrase valide ; une ligne courte `# titre` est doublement
   filtrée).
4. Découpe en phrases : `re.split(r"(?<=[.!?])\s+", line)` — lookbehind : coupe
   après `.`, `!` ou `?` suivis d'espace(s), le délimiteur `\s+` est consommé.
   JS supporte le lookbehind (ES2018) : `line.split(/(?<=[.!?])\s+/)`.
5. Chaque phrase : `strip()`, garder si `min_len <= len <= max_len` (longueurs
   en code points, bornes incluses).

### 3.6 Dépendances

`util.read_text`. Consommé par le backend mock (tirages sur `sentences_of`) et
le tribunal (`feuilles_block`).

---

## 4. `aurora/referentiel.py`

Rôle : chargement des fiches de pôle `P1.md` … `P7.md` du référentiel RESPIRE v7.
Chaque fiche = un préambule (avant la première compétence) + des sections de
compétence `## X.YY — Nom`.

### 4.1 Constantes

```
POLE_NOMS = {1:"TÊTE — Penser & Comprendre", 2:"CŒUR — Relier & Naviguer",
             3:"MAIN — Créer & Incarner", 4:"ÂME — Discerner & Juger",
             5:"RACINES — Évoluer & Résister", 6:"CITÉ — Gouverner & S'ouvrir",
             7:"FLAMBEAU — Transmettre & Piloter"}
```
(tirets = U+2014 ; apostrophe de "S'ouvrir" = U+0027 apostrophe droite —
vérifier à l'octal près lors du portage des chaînes).

- `_RE_COMP = r"^##\s+(\d\.\d{2})\s*—\s*(.+?)\s*$"`, MULTILINE. Le tiret est
  **U+2014 obligatoire** (pas `-` ni `–`). Code = 1 chiffre + `.` + 2 chiffres
  (ex. `3.07`). `(.+?)` non gourmand + `\s*$` : le nom est capturé sans espaces
  de fin. Exactement `##` (pas `###` : `\s+` exige un espace après `##`, donc
  `###` ne matche pas car le 3e `#` n'est pas un espace).

### 4.2 Classe `Pole`

Champs : `num` (int), `nom` (`POLE_NOMS[num]`, fallback `"Pôle %d"`), `header`
(texte AVANT la première compétence, **non strippé** — conserve le `\n` final
et d'éventuels espaces), `competences` (liste ordonnée de
`{code, nom, fiche_md}`).

- `fiche_complete(ordre=None)` : si `ordre` fourni (liste d'indices,
  typiquement une permutation §4.5), réordonner `competences` selon ces
  indices. Sortie exacte :
  `header.rstrip() + "\n\n" + join("\n\n---\n\n", fiches strippées) + "\n"`.
  (`rstrip`/`strip` Unicode Python.)
- `competence(code)` : recherche linéaire par égalité stricte de `code`,
  première trouvée, sinon `null`.

### 4.3 `parse_pole(path, num)`

1. `text = read_text(path)` (universal newlines, §1.2).
2. `matches = _RE_COMP` sur tout le texte. Zéro match → erreur
   `"Aucune section '## X.YY — Nom' dans %s"`.
3. `header = text[0 .. premier match.start()[`.
4. Pour chaque match `i` : `end = début du match suivant` ou `len(text)` ;
   compétence `{code: group(1), nom: group(2).strip(), fiche_md:
   text[m.start():end].strip()}`. (`group(2)` est déjà sans espaces de fin via
   la regex ; le `.strip()` supplémentaire retire d'éventuels espaces de tête.)

### 4.4 `load_referentiel(leger_dir)` → `{num: Pole}`

- Boucle `n = 1..7` dans l'ordre ; fichier `leger_dir/P{n}.md` ; fichier
  manquant → erreur d'IO (propagée).
- Unicité **globale** des codes sur les 7 fiches : doublon → erreur
  `"Code dupliqué dans le référentiel : %s"`.
- Résultat : map `{1: Pole, …, 7: Pole}`. En JS, utiliser une `Map` à clés
  numériques ou un objet ; l'itération doit toujours se faire via un ordre
  numérique explicite (voir §4.5).

`all_competences(poles)` : pour `n` dans `sorted(poles)` (**tri numérique
croissant des clés** — en JS ne PAS se fier à l'ordre d'insertion : trier
explicitement), concaténer les tuples `(n, code, nom)` dans l'ordre des
compétences de chaque fiche.

### 4.5 `permutation(n_items, seed_key)` — décorrélation déterministe

```
h = stable_hash(str(seed_key))
idx = [0, 1, …, n_items-1]
rot = n_items ? h % n_items : 0
idx = idx[rot:] + idx[:rot]          # rotation à gauche de rot
si (h >> 8) % 2 : idx.reverse()      # inversion si bit sélectionné
retour idx
```

- **`str(seed_key)`** : sémantique Python — chaîne inchangée ; int en décimal ;
  tuple → repr Python avec parenthèses, virgules-espace et quotes simples (ex.
  `str(("a", 3))` = `"('a', 3)"`). **Auditer tous les appelants** pour
  connaître les types réellement passés et implémenter `pyStr` pour exactement
  ces types ; c'est un point de rupture de parité silencieux.
- `h % n_items` : `h ≥ 0` donc pas de piège de modulo négatif ; en JS `%` sur
  Number positif est exact (h < 2^53).
- **`h >> 8` : NE PAS utiliser `>>` en JS** (troncature 32 bits sur un h de
  48 bits) → `Math.floor(h / 256) % 2`.
- `n_items == 0` → liste vide (la rotation et l'inversion sont sans effet).
- La rotation `idx[rot:] + idx[:rot]` avec `rot == 0` rend la liste inchangée.

### 4.6 Dépendances

`util.read_text`, `util.stable_hash`. Consommé par l'étage léger (fiches
concaténées/permutées) et le tribunal (fiches individuelles).

---

## 5. Points de vigilance parité (synthèse transverse)

1. **`stable_hash`** : MD5(UTF-8), 12 premiers hex, base 16 → entier 48 bits.
   Jamais d'opérateur binaire JS dessus (`>>`, `&`) : arithmétique
   (`Math.floor(h/256)`).
2. **`empreinte`** : sérialiseur `json.dumps` Python à réimplémenter
   (séparateurs `", "` / `": "`, sort_keys par code points, ensure_ascii=False,
   échappements Python, flottants en repr Python) ; sortie `%x` minuscule sans
   padding.
3. **difflib** : `find_longest_match` (départage plus petit i puis j, `>`
   strict) et `ratio()` (`2M/T` via get_matching_blocks + fusion des blocs
   adjacents) ; **premier matcher `autojunk=false`, second `autojunk=true`**
   (élimination des éléments « populaires » si `len(b) ≥ 200`,
   seuil `> floor(len(b)/100)+1`).
4. **Universal newlines** : toute lecture texte convertit `\r\n`/`\r` → `\n`
   AVANT regex et offsets.
5. **Sémantiques Python** : `strip()`/`isspace()`/`splitlines()` Unicode
   (ensembles de caractères plus larges que JS), `str()` (True/None/repr des
   tuples) dans `templates.resolve` et `permutation`, longueurs/index en code
   points, tri stable par tuples `(date, id)`, `int()` = troncature.
6. **Ordre d'insertion des objets** : `write_json` n'ordonne pas les clés —
   construire les objets JS dans le même ordre que le Python ; attention aux
   clés numériques (`"1"`) que les objets JS réordonnent.
7. **Ids de feuilles dupliqués** : 2e occurrence → suffixe `_b` (pas `_a`).
8. **`extract_json`** : ordre des tentatives (fences reversées si `last`, brut
   puis réparé), fallback objets `{}` seulement, automate chaîne actif à
   profondeur 0.
9. **Prompts protocole/*.md** : confidentiels — chargés comme données, jamais
   recopiés dans le code ni les specs.
