# -*- coding: utf-8 -*-
"""Vecteurs de parité (CPython = oracle) pour heatmap.js / tribunal.js /
journee.js (étape 4/7). Trois blobs : heatmap.vec.json, tribunal.vec.json,
journee.vec.json, injectés dans les tests par inject_journee_vectors.py.

Neutralisation du non-déterminisme Python (spec-journee §7.9) :
  - ThreadPoolExecutor/as_completed remplacés par une exécution séquentielle
    dans l'ordre de soumission (équivaut à l'ordre des jobs du port JS) ;
  - datetime.now() figé (horodatage des calques) ;
  - ctx["base_dir"] = chaîne fixe (marque_run).

Les sorties structurées sont figées en TEXTE (json.dumps ensure_ascii=False,
indent=2, + "\\n" final = profil write_json) : la comparaison JS se fait sur
pyJsonDumpsWriteJson(résultat), donc à l'octet près, int/float compris.
"""
import json
import os
import shutil
import sys
import tempfile
import types

HERE = os.path.dirname(os.path.abspath(__file__))
TWIN = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "..", "..", "..", "Twin_v9")
sys.path.insert(0, TWIN)

import datetime  # noqa: E402

import aurora.journee as J  # noqa: E402
import aurora.heatmap as H  # noqa: E402
import aurora.tribunal9 as T  # noqa: E402
from aurora.backends import MockBackend  # noqa: E402
from aurora.referentiel import Pole  # noqa: E402
from aurora.util import empreinte, read_text, stable_hash  # noqa: E402


def txt(obj):
    """Profil write_json : la comparaison de parité se fait sur ce texte."""
    return json.dumps(obj, ensure_ascii=False, indent=2) + "\n"


# ── Neutralisation du non-déterminisme ────────────────────────────────────────
class _Fut(object):
    def __init__(self, fn, a, k):
        self._fn, self._a, self._k = fn, a, k
        self._done = False

    def result(self):
        if not self._done:
            self._r = self._fn(*self._a, **self._k)
            self._done = True
        return self._r


class _SeqExecutor(object):
    def __init__(self, max_workers=None):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def submit(self, fn, *a, **k):
        return _Fut(fn, a, k)


class _FixedDT(datetime.datetime):
    @classmethod
    def now(cls, tz=None):
        return cls(2026, 1, 2, 3, 4, 5)


J.ThreadPoolExecutor = _SeqExecutor
J.as_completed = lambda futs: list(futs)
J.datetime = types.SimpleNamespace(datetime=_FixedDT)

HORODATAGE = "2026-01-02T03:04:05"
BASE_DIR = "/twin9/mockbase"  # marque_run = empreinte(base_dir)[:6], chemin jamais créé


# ── Mini-référentiel (scénarios mock choisis : h = stable_hash("scn|c")%10) ──
def build_poles(spec):
    poles = []
    for num, codes in spec:
        comps = [{"code": c, "nom": "Comp %s" % c,
                  "fiche_md": "## %s — Comp %s\n\nFiche %s." % (c, c, c)} for c in codes]
        poles.append(Pole(num, "# Pôle %d — Test\n\n" % num, comps))
    return poles


for c, h in (("1.07", 6), ("1.02", 7), ("1.16", 0), ("1.04", 5),
             ("2.06", 6), ("2.04", 8), ("2.20", 4), ("2.01", 1),
             ("1.03", 2), ("1.06", 3)):
    assert stable_hash("scn|" + c) % 10 == h, c
assert stable_hash("l8|2.04") % 2 == 0  # h=8 résolu sans tribunal

GABARITS = {
    "tagger/1-tag-pole.md": "TAG {$POLE_NUM} {$POLE_NOM} {$JOURNEE}\n{$POLE_FICHES}\n{$PORTFOLIO}\n",
    "lourd/10-premiere-impression.md": "IMPR {$JOURNEE}\n{$PORTFOLIO}\n",
    "lourd/20-greffier.md": "GREF {$CODE} {$NOM} P{$POLE_NUM} {$POLE_NOM}\n{$COMPETENCE_FICHE}\n{$CALQUES}\n{$FEUILLES}\n",
    "lourd/20b-juge-leger.md": "LEGER {$CODE} {$PASSE}/{$PASSES}\n{$COMPETENCE_FICHE}\n{$DOSSIER}\n",
    "lourd/20c-contre-lecture.md": "CL {$CODE} {$PASSES}\n{$COMPETENCE_FICHE}\n{$DOSSIER}\n",
}

TEXTE_A = """# Journal de la semaine — serre et semis

Lundi matin, j'ai préparé les bacs de semis en mesurant la température du terreau avec le thermomètre prêté par Malik. Ensuite j'ai noté dans mon carnet les trois variétés retenues, avec la date et la profondeur de semis pour chacune d'elles.
Fin.
Mardi, la buse d'arrosage s'est bouchée et j'ai démonté le circuit goutte-à-goutte pour retrouver le joint fendu avant de le remplacer. J'ai douté de mon diagnostic, alors j'ai refait le test avec un seau gradué pour vérifier le débit réel sur dix minutes exactement.
Le mercredi, Mme Okonkwo est passée voir la serre et m'a demandé d'expliquer mon calendrier de semis devant les élèves de sixième. J'ai dessiné un tableau au feutre sur la porte vitrée, puis chacun a repéré sa semaine de garde et signé dans la marge correspondante.
Jeudi soir, j'ai relu mes notes de la semaine et j'ai remarqué que deux mesures de température se contredisaient, sans savoir laquelle croire. Plutôt que de trancher au hasard, j'ai décidé de refaire la mesure vendredi à la même heure avec deux thermomètres différents posés côte à côte.
"""

TEXTE_B = """# Une matinée au fournil

Avant l'aube, j'ai pesé la farine et l'eau en suivant la fiche de recette affichée au-dessus du pétrin, puis j'ai corrigé l'hydratation. Le levain semblait paresseux, alors j'ai noté l'heure exacte du rafraîchi et la température ambiante pour comprendre son rythme réel.
Pendant la cuisson, j'ai tenu le registre des fournées : numéro du four, durée, couleur de croûte, et la remarque du client sur la mie d'hier. À la fermeture, j'ai rangé le plan de travail et j'ai écrit trois lignes sur ce que je referais autrement demain matin sans faute.
"""

TEXTE_C = """# Chantier de la rampe d'accès

Nous avons mesuré la pente de la rampe avec le niveau laser emprunté à l'atelier, puis reporté chaque cote sur le plan quadrillé du couloir. J'ai vérifié deux fois l'angle avant de couper la première planche, parce que la scie circulaire ne pardonne pas les erreurs d'étourderie.
Ensuite j'ai poncé les bords, posé les vis de fixation en quinconce, et demandé à Sofia de contrôler la solidité en montant dessus avec son fauteuil. Elle a proposé d'ajouter une bande antidérapante près du seuil, et nous avons noté cette idée dans le cahier de suivi du chantier.
"""


# ── Backend scripté data-driven (MIROIR JS dans journee.test.js) ─────────────
class ScriptedBackend(object):
    def __init__(self, script):
        self.script = script

    def call(self, prompt, model=None, temperature=None, seed=None, task=None,
             meta=None, label=None):
        meta = meta or {}
        sc = self.script

        def _texte(spec):
            if spec is None:
                raise RuntimeError("script absent")
            if isinstance(spec, dict) and "raise" in spec:
                raise RuntimeError(spec["raise"])
            return spec["text"] if isinstance(spec, dict) else spec

        if task == "tagger":
            tags = []
            for code, _nom in meta["codes"]:
                for spec in (sc.get("tags_par_code") or {}).get(code, []):
                    t = {"competence": code, "extrait": meta["sentences"][spec["si"]][1]}
                    if "conf" in spec:
                        t["confiance"] = spec["conf"]
                    if "just" in spec:
                        t["justification"] = spec["just"]
                    tags.append(t)
            tags.extend(sc.get("tags_invalides") or [])
            alertes = sc.get("alertes") if model == sc.get("alerte_si_model") else []
            return "```json\n" + json.dumps({"tags": tags, "alertes": alertes or []},
                                            ensure_ascii=False) + "\n```"
        if task == "greffier":
            return _texte(sc.get("greffier"))
        if task == "leger":
            arr = sc["leger"]
            return _texte(arr[(meta["passe"] - 1) % len(arr)])
        if task == "contre_lecture":
            return _texte(sc.get("contre_lecture"))
        raise RuntimeError("task inattendue: %s" % task)


# ── ctx de run (dirs temporaires réels côté Python) ──────────────────────────
def make_ctx(root, poles, config, backend, rapide_model="mock-rapide"):
    proto = os.path.join(root, "protocole")
    for rel, contenu in GABARITS.items():
        path = os.path.join(proto, rel.replace("/", os.sep))
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(contenu)
    logs = os.path.join(root, "logs")
    journees = os.path.join(root, "journees")
    calques = os.path.join(root, "calques")
    for d in (logs, journees, calques):
        os.makedirs(d, exist_ok=True)
    return {"config": config, "poles": poles, "protocole_dir": proto,
            "logs_dir": logs, "journees_dir": journees, "calques_dir": calques,
            "base_dir": BASE_DIR, "backend_tribunal": backend,
            "rapide": (backend, rapide_model), "incidents": {}}


VEC_H = {}
VEC_T = {}
VEC_J = {}

# ═══ heatmap.vec.json ═════════════════════════════════════════════════════════
# ancrer + segments : exact / normalisé (typographie) / approché (difflib) /
# rejeté / tronqué (> 1200 caractères)
LONG = ("Le grand inventaire de fin d'année occupe tout un paragraphe sans ponctuation forte "
        "car chaque objet compte et je recopie la liste complète du matériel de la serre ") * 9
TEXTE_HM = (
    "Nous avons rangé l’atelier —  vraiment  bien — avant la nuit tombée.\n"
    "Lundi, j'ai mesuré la pente de la rampe avec le niveau laser avant de couper la planche.\n"
    + LONG + "\n"
    "Mardi, Sofia a contrôlé la solidité de la rampe en montant dessus avec son fauteuil roulant.\n"
)
TAGS_HM = {
    "alpha": [
        {"competence": "3.01",
         "extrait": "j'ai mesuré la pente de la rampe avec le niveau laser avant de couper la planche.",
         "confiance": 0.9, "justification": "exact"},
        {"competence": "3.02",
         "extrait": "« Nous avons range l'atelier - vraiment bien - avant la nuit tombee. »",
         "confiance": 1.0, "justification": "normalisé (typographie, sans accents ? non : accents gardés)"},
        {"competence": "3.03", "extrait": LONG[:1250], "confiance": 0.35, "justification": "tronqué"},
    ],
    "beta": [
        {"competence": "3.01",
         "extrait": "Lundi, j'ai mesuré la pente de la rampe avec le niveau [...] avant de couper la planche.",
         "confiance": 0.62, "justification": "crochets"},
        {"competence": "3.04",
         "extrait": "Sofia a vérifié la solidité de la rampe en montant dessus avec son fauteuil roulant",
         "confiance": 0.55, "justification": "approché"},
        {"competence": "3.05", "extrait": "Une phrase totalement absente du texte source de cette journée.",
         "confiance": 0.8, "justification": "rejet"},
    ],
}
# ⚠ le cas « normalisé » : la citation ASCII doit matcher le texte typographique
TAGS_HM["alpha"][1]["extrait"] = "Nous avons rangé l'atelier - vraiment bien - avant la nuit tombée."
ROSTER_HM = [{"name": "alpha", "family": "A", "weight": 1.0},
             {"name": "beta", "family": "B", "weight": 2.0}]
spans_hm, rejets_hm = H.ancrer(TEXTE_HM, {k: list(v) for k, v in TAGS_HM.items()}, ROSTER_HM)
segs_hm = H.segments(TEXTE_HM, spans_hm, 3.0)
VEC_H["texte"] = TEXTE_HM
VEC_H["tags"] = TAGS_HM
VEC_H["roster"] = ROSTER_HM
VEC_H["poids_total"] = 3.0
VEC_H["spans_txt"] = txt(spans_hm)
VEC_H["rejets_txt"] = txt(rejets_hm)
VEC_H["segs_txt"] = txt(segs_hm)

# segments : chevauchements imbriqués + bornes partagées + heat plafonnée à 1.0
SPANS_SEG = [
    {"start": 0, "end": 30, "model": "alpha", "code": "1.01", "conf": 0.9, "poids": 1.0,
     "justification": "", "ratio": 1.0, "tronque": False},
    {"start": 10, "end": 40, "model": "beta", "code": "1.02", "conf": 0.5, "poids": 2.0,
     "justification": "", "ratio": 0.99, "tronque": False},
    {"start": 10, "end": 30, "model": "alpha", "code": "1.02", "conf": 1.0, "poids": 1.0,
     "justification": "", "ratio": 1.0, "tronque": False},
    {"start": 40, "end": 50, "model": "beta", "code": "1.01", "conf": 0.2, "poids": 2.0,
     "justification": "", "ratio": 1.0, "tronque": False},
]
VEC_H["spans_seg"] = SPANS_SEG
VEC_H["segs_seg_txt"] = txt(H.segments("x" * 60, [dict(s) for s in SPANS_SEG], 1.5))

# fusion + marks + sorties + viewer
fus = H._fusion_spans_modele([sp for sp in spans_hm if sp["model"] == "alpha"])
VEC_H["fusion_alpha_txt"] = txt([[s, e, sorted(codes), conf] for s, e, codes, conf in fus])
MARKS = [[5, 9, 'data-a="1"'], [0, 4, 'data-b="2"'], [3, 8, 'data-c="3"'], [9, 12, 'data-d="4"']]
VEC_H["marks"] = MARKS
VEC_H["marks_out"] = H._inserer_marks("abcdefghijklmnop", [tuple(m) for m in MARKS])

root_hm = tempfile.mkdtemp(prefix="twin9hm")
ctx_hm = {"base_dir": os.path.join(root_hm, "out"), "journal_id": "HM01", "date": "2026-02-01",
          "impl_dir": os.path.join(root_hm, "impl")}
rollup = H.ecrire_sorties(ctx_hm, TEXTE_HM, spans_hm, segs_hm, rejets_hm, ROSTER_HM)
VEC_H["rollup_txt"] = txt(rollup)
VEC_H["tagged_alpha"] = read_text(os.path.join(ctx_hm["base_dir"], "tagged", "alpha.md"))
VEC_H["tagged_beta"] = read_text(os.path.join(ctx_hm["base_dir"], "tagged", "beta.md"))
VEC_H["heat_md"] = read_text(os.path.join(ctx_hm["base_dir"], "portfolio.heat.md"))
VEC_H["heatmap_json"] = read_text(os.path.join(ctx_hm["base_dir"], "heatmap.json"))
H.ecrire_viewer(ctx_hm, TEXTE_HM, segs_hm, ROSTER_HM, {"3.01": "Comp 3.01"},
                {"3.01": {"statut": "corroborée"}})
VEC_H["viewer_js"] = read_text(os.path.join(ctx_hm["base_dir"], "viewer", "heatmap-data.js"))
shutil.rmtree(root_hm)

# ═══ tribunal.vec.json ════════════════════════════════════════════════════════
VEC_T["personas_txt"] = txt(T.infos_personas())
DOSSIERS = [
    ("standard", """# Greffier — 1.06 Comp

### Pièces extraites

#### Pièce 1
- **Extrait** : « Nous avons mesuré la pente
de la rampe. »
- **Date** : 2026-03-02
- **Type** : trace concrète

#### Pièce 2
- **Extrait** : ligne simple sans guillemets
- **Type** : déclaration étayée

#### pièce 3
- **Extrait** : «  espaces  autour  »
- **Date** : hier
"""),
    ("sans_extrait", "#### Pièce 1\n- **Date** : 2026-01-01\n- **Type** : indice\n"),
    ("vide", "DOSSIER VIDE — rien.\n"),
    ("long_extrait", "#### Pièce 7\n- **Extrait** : « %s »\n- **Type** : x\n" % ("é" * 700)),
]
VEC_T["parse_pieces"] = [{"nom": n, "dossier": d, "out_txt": txt(T.parse_pieces(d))}
                         for n, d in DOSSIERS]
TYPES = ["trace concrète", "Trace  concrete", "observation tierce (adulte)",
         "déclaration étayée", "déclaration nue", "simple intention", "autre", "", None]
VEC_T["type_role"] = [{"type": t, "out": list(T._type_role(t))} for t in TYPES]
VEC_T["verdict_dossier_vide_txt"] = txt(T.verdict_dossier_vide("1.03", "Comp 1.03", "DOSSIER VIDE — x"))

# constituer_dossier : appel + cache + détection « vide » (mock)
root_cd = tempfile.mkdtemp(prefix="twin9cd")
mb_cd = MockBackend({"salt": "vec9", "model": "mock-lourd"})
pole_cd = build_poles([(1, ["1.06"])])[0]
jr_cd = {"id": "JCD", "date": None, "texte": TEXTE_C}
sents_cd = J._sentences_de(TEXTE_C, "JCD")
config_cd = {"backend_tribunal": {"model": "mock-lourd", "model_mini": "mock-mini"}}
tdir_cd = os.path.join(root_cd, "trib", "1.06")
dossier_cd, vide_cd = T.constituer_dossier(mb_cd, os.path.join(root_cd, "proto"), tdir_cd,
                                           pole_cd, pole_cd.competences[0], jr_cd, config_cd,
                                           sents_cd, rapide=(mb_cd, "mock-rapide"), calques="")
VEC_T["constituer"] = {"texte": TEXTE_C, "dossier": dossier_cd, "vide": vide_cd,
                       "cache": read_text(os.path.join(tdir_cd, "20-greffier.md"))}
shutil.rmtree(root_cd)

# ═══ journee.vec.json ═════════════════════════════════════════════════════════
VEC_J["sentences"] = [
    {"texte": t, "jid": jid, "out_txt": txt(J._sentences_de(t, jid))}
    for t, jid in ((TEXTE_A, "J01"), (TEXTE_B, "J02"), (TEXTE_C, "JX"),
                   ("# titre seulement\ncourt.\n", "J00"),
                   ("Une phrase qui fait exactement la bonne longueur pour être retenue ici. "
                    "Court ! Une seconde phrase assez longue elle aussi pour dépasser le seuil "
                    "des soixante caractères requis ?", "J03"))]

PARSE_LEGER_CASES = [
    "**Statut** : présence établie\n**Pièces retenues** : P1, P2 et P 3\n**Confiance** : 0.85",
    "**statut** : PRÉSENCE NON ÉTABLIE\n**Pièces** : P2 (examinée puis écartée)\n**Confiance** : 0,7",
    "**Statut** : renvoi au cartographe\n**Confiance** : 1",
    "**Statut** : presence etablie (sans accents)\n**Pièces citées** : P10, P2, P10\n**Confiance** : 0",
    "**Statut** : illisible au sens strict\n**Confiance** : 0.9",
    "rien d'exploitable",
    "**Statut** : non etablie\n**Pièces** : aucune\n**Confiance** : 2",
]
VEC_J["parse_leger"] = [{"texte": t, "out_txt": txt(J._parse_leger(t))} for t in PARSE_LEGER_CASES]

VEC_J["authenticite"] = [
    {"impression": "## Authenticité\n**Indicateur** : `habitée`\nsuite", "out": "habitée"},
    {"impression": "**Indicateur**: Mixte", "out": "mixte"},
    {"impression": "** Indicateur ** :  produite", "out": "produite"},
    {"impression": "pas d'indicateur ici", "out": None},
    {"impression": None, "out": None},
]
for c in VEC_J["authenticite"]:
    assert J._authenticite_de(c["impression"]) == c["out"], c

# consensus : réutilise l'ancrage heatmap + variantes de seuils
poles_cons = build_poles([(3, ["3.01", "3.02", "3.03", "3.04", "3.05"])])
lecteurs_cons = ROSTER_HM + [{"name": "gamma@arch", "family": "A", "weight": 1.0, "archive": True}]
tags_cons = {k: list(v) for k, v in TAGS_HM.items()}
tags_cons["gamma@arch"] = [
    {"competence": "3.01",
     "extrait": "j'ai mesuré la pente de la rampe avec le niveau laser avant de couper la planche.",
     "confiance": 0.45, "justification": "fantôme"},
    {"competence": "3.04",
     "extrait": "Mardi, Sofia a contrôlé la solidité de la rampe en montant dessus",
     "confiance": 0.18, "justification": "sous-seuil"},
]
spans_cons, _rj = H.ancrer(TEXTE_HM, tags_cons, lecteurs_cons)
segs_cons = H.segments(TEXTE_HM, spans_cons, 4.0)
seuils_def = dict(J.SEUILS_CONSENSUS)
cons_out = J._consensus(spans_cons, segs_cons, lecteurs_cons, poles_cons, seuils_def)
VEC_J["consensus"] = {
    "tags": tags_cons, "lecteurs": lecteurs_cons, "poids_total": 4.0,
    "seuils": seuils_def, "out_txt": txt(cons_out),
    "out_surcharge_txt": txt(J._consensus(spans_cons, segs_cons, lecteurs_cons, poles_cons,
                                          dict(J.SEUILS_CONSENSUS, corrobore=0.3,
                                               instruire_min_modeles=1))),
}

VEC_J["verdict_absent"] = [
    {"cons": {"statut": "minoritaire", "ratio": 0.25, "modeles": ["alpha"],
              "spans": [{"start": 0, "end": 5, "model": "alpha", "conf": 0.7}]},
     "out_txt": txt(J._verdict_absent("1.01", "Comp 1.01",
                                      {"statut": "minoritaire", "ratio": 0.25, "modeles": ["alpha"],
                                       "spans": [{"start": 0, "end": 5, "model": "alpha", "conf": 0.7}]}))},
    {"cons": {"statut": "non détectée", "ratio": 0.0, "modeles": [], "spans": []},
     "out_txt": txt(J._verdict_absent("1.02", "Comp 1.02",
                                      {"statut": "non détectée", "ratio": 0.0, "modeles": [],
                                       "spans": []}))},
    {"cons": {"statut": "minoritaire", "ratio": 0.333, "modeles": ["a", "b"],
              "spans": [{"start": 1, "end": 2, "model": "a", "conf": 0.9}]},
     "out_txt": txt(J._verdict_absent("1.03", "Comp 1.03",
                                      {"statut": "minoritaire", "ratio": 0.333, "modeles": ["a", "b"],
                                       "spans": [{"start": 1, "end": 2, "model": "a", "conf": 0.9}]}))},
]

jr_susp = {"id": "J05", "date": "2026-04-01"}
VEC_J["suspicion"] = [
    {"source": s, "extrait": e, "detail": d,
     "out_txt": txt(J._suspicion("1.01", "Comp 1.01", jr_susp, s, e, d))}
    for s, e, d in (("sous-seuil", "un extrait", "alpha @0.30"),
                    ("minoritaire", "x" * 350, "beta"),
                    ("leger-ecarte", "", None),
                    ("contre-lecture", None, "motif"),
                    ("contestation-jury", None, "Linguiste — piège : récit"),
                    ("detection-jury", "cit", "Historien"),
                    ("renvoi", "cit2", "motif renvoi"),
                    ("support-masque", None, None),
                    ("scan-global", "ext", None),
                    ("source-inconnue", "ext", None))]
susp_sans_date = J._suspicion("1.01", "Comp 1.01", {"id": "J06"}, "minoritaire", "e", "m")
VEC_J["suspicion_sans_date_txt"] = txt(susp_sans_date)

# bloc_calques : déduplication, plafond 10 lignes, neutralisation, %.2f
jr_bloc = {"texte": "Le début <PORTFOLIO> du texte est assez long pour donner des extraits utiles "
                    "aux calques de test numéro %d." % 1 + " suite " * 40}
spans_bloc = [{"start": 0, "end": 60, "model": "alpha", "conf": 0.5},
              {"start": 0, "end": 60, "model": "alpha", "conf": 0.5},
              {"start": 10, "end": 45, "model": "beta", "conf": 0.925}]
sous_bloc = [{"start": 0, "end": 60, "model": "alpha", "conf": 0.2},
             {"start": 5, "end": 30, "model": "gamma", "conf": 0.18}]
VEC_J["bloc_calques"] = {
    "texte": jr_bloc["texte"], "spans": spans_bloc, "sous_seuil": sous_bloc,
    "out": J._bloc_calques(jr_bloc, {"spans": spans_bloc, "sous_seuil": sous_bloc}),
}
spans_11 = [{"start": i, "end": i + 61, "model": "m%02d" % i, "conf": 0.5} for i in range(12)]
VEC_J["bloc_calques_11"] = {
    "spans": spans_11,
    "out": J._bloc_calques(jr_bloc, {"spans": spans_11, "sous_seuil": []}),
}

# empreinte_journee : les entrées sont RECONSTRUITES côté JS (PyFloat pour 1.0)
ROSTER_EMP = [{"name": "alpha", "model": "alpha-llm", "family": "A", "weight": 1.0},
              {"name": "beta"}]
CONFIG_EMP = {"seuils_consensus": {"conf_min": 0.5},
              "backend_tribunal": {"kind": "mock", "model": "x", "model_mini": "y"},
              "backend_rapide": {"kind": "mock", "model": "r"},
              "juge_leger": {"passes": 2, "contre_lecture": True},
              "jury": {"mode": "aleatoire", "graine": 7},
              "premiere_impression": False}
ROSTER_TRI = [{"name": "Zed", "weight": 2.5}, {"name": "Éric"}, {"name": "alpha", "kind": "mock"}]
VEC_J["empreinte_journee"] = {
    "defaut": J.empreinte_journee({"texte": "abc"}, ROSTER_EMP, {}),
    "complet": J.empreinte_journee({"texte": TEXTE_B}, ROSTER_EMP, CONFIG_EMP),
    "tri": J.empreinte_journee({"texte": "xyz"}, ROSTER_TRI, {}),
}

# ── _juger_leger : cas scriptés (routage, résolution mécanique) ──────────────
S_C0 = J._sentences_de(TEXTE_C, "JX")
DOSSIER_OK = ("# Greffier — dossier\n\n#### Pièce 1\n- **Extrait** : « Nous avons mesuré la pente de "
              "la rampe avec le niveau laser emprunté à l'atelier, puis reporté chaque cote sur le "
              "plan quadrillé du couloir. »\n- **Date** : 2026-03-02\n- **Type** : trace concrète\n\n"
              "#### Pièce 2\n- **Extrait** : « Ensuite j'ai poncé les bords, posé les vis de fixation "
              "en quinconce, et demandé à Sofia de contrôler la solidité en montant dessus avec son "
              "fauteuil. »\n- **Date** : —\n- **Type** : déclaration étayée\n")
DOSSIER_NUES = DOSSIER_OK.replace("trace concrète", "déclaration nue").replace(
    "déclaration étayée", "simple intention")
DOSSIER_NON_ANCRE = DOSSIER_OK.replace(
    "Nous avons mesuré la pente de la rampe avec le niveau laser emprunté à l'atelier, "
    "puis reporté chaque cote sur le plan quadrillé du couloir.",
    "Phrase du greffier introuvable dans le texte source de la journée du chantier de la rampe.")
LEGER_ET = "**Statut** : présence établie\n**Pièces retenues** : P1, P2\n**Confiance** : 0.9\n"
LEGER_NON = "**Statut** : présence non établie\n**Pièces** : P1\n**Confiance** : 0,7\n"
LEGER_RENVOI = "**Statut** : renvoi au cartographe\n**Pièces** : —\n**Confiance** : 0.5\n"
CL_OK = "**Statut** : présence établie\n**Confiance** : 0.82\n**Motif du verdict** : les pièces survivent.\n"
CL_KO = "**Statut** : présence non établie\n**Confiance** : 0.74\n**Motif du verdict** : récit performatif.\n"

JL_CASES = {
    "etablie_2p": {"script": {"greffier": DOSSIER_OK, "leger": [LEGER_ET, LEGER_ET]},
                   "contre_lecture": False, "passes": 2},
    "etablie_cl": {"script": {"greffier": DOSSIER_OK, "leger": [LEGER_ET, LEGER_ET],
                              "contre_lecture": CL_OK},
                   "contre_lecture": True, "passes": 2},
    "cl_cassee": {"script": {"greffier": DOSSIER_OK, "leger": [LEGER_ET, LEGER_ET],
                             "contre_lecture": CL_KO},
                  "contre_lecture": True, "passes": 2},
    "cl_panne": {"script": {"greffier": DOSSIER_OK, "leger": [LEGER_ET, LEGER_ET],
                            "contre_lecture": {"raise": "boom cl"}},
                 "contre_lecture": True, "passes": 2},
    "garde_fou": {"script": {"greffier": DOSSIER_NUES, "leger": [LEGER_ET, LEGER_ET]},
                  "contre_lecture": False, "passes": 2},
    "trace_non_ancree": {"script": {"greffier": DOSSIER_NON_ANCRE, "leger": [LEGER_ET, LEGER_ET]},
                         "contre_lecture": False, "passes": 2},
    "non_etablie": {"script": {"greffier": DOSSIER_OK, "leger": [LEGER_NON, LEGER_NON]},
                    "contre_lecture": False, "passes": 2},
    "desaccord": {"script": {"greffier": DOSSIER_OK, "leger": [LEGER_ET, LEGER_RENVOI]},
                  "contre_lecture": False, "passes": 2},
    "illisible": {"script": {"greffier": DOSSIER_OK, "leger": ["rien d'exploitable"]},
                  "contre_lecture": False, "passes": 1},
    "greffier_panne": {"script": {"greffier": {"raise": "boom greffier"}, "leger": [LEGER_ET]},
                       "contre_lecture": False, "passes": 1},
    "dossier_vide": {"script": {"greffier": "un mot puis DOSSIER VIDE dans l'entête.",
                                "leger": [LEGER_ET]},
                     "contre_lecture": False, "passes": 1},
}
VEC_J["juger_leger"] = {}
for nom, case in JL_CASES.items():
    root = tempfile.mkdtemp(prefix="twin9jl")
    poles = build_poles([(1, ["1.06"])])
    config = {"juge_leger": {"passes": case["passes"], "contre_lecture": case["contre_lecture"]},
              "backend_tribunal": {"model": "m-lourd", "model_mini": "m-mini"}}
    sb = ScriptedBackend(case["script"])
    ctx = make_ctx(root, poles, config, sb, rapide_model="m-rapide")
    jr = {"id": "JX", "date": None, "titre": None, "texte": TEXTE_C, "sentences": S_C0}
    day_inc = {}

    def inc(k, n=1, _d=day_inc):
        _d[k] = _d.get(k, 0) + n

    v, d = J._juger_leger(ctx, jr, poles[0], poles[0].competences[0],
                          {"spans": [], "sous_seuil": []}, inc)
    VEC_J["juger_leger"][nom] = {"case": case, "out_txt": txt([v, d]), "inc_txt": txt(day_inc)}
    shutil.rmtree(root)

# ── Intégrations : pipeline complet cartographier_journee ────────────────────
ROSTER_INT = [{"name": "alpha", "model": "alpha-llm", "family": "A", "weight": 1.0},
              {"name": "beta", "model": "beta-llm", "family": "B", "weight": 1.0}]


def run_integration(nom, poles_spec, jr, config, script=None, runs=1):
    root = tempfile.mkdtemp(prefix="twin9int")
    poles = build_poles(poles_spec)
    backend = ScriptedBackend(script) if script else MockBackend({"salt": "vec9", "model": "mock-lourd"})
    ctx = make_ctx(root, poles, config, backend)
    backends = {"alpha": backend, "beta": backend}
    out = {"runs": []}
    for _ in range(runs):
        carto = J.cartographier_journee(ctx, dict(jr), list(ROSTER_INT), backends)
        carto_txt = read_text(os.path.join(ctx["journees_dir"], jr["id"], "carto_jour.json"))
        assert txt(carto) == carto_txt or carto.get("empreinte")  # cohérence write_json
        cpath = os.path.join(ctx["calques_dir"], "%s.json" % jr["id"])
        out["runs"].append({
            "carto_txt": carto_txt,
            "carto_ret_txt": txt(carto),
            "calques_store_txt": read_text(cpath) if os.path.exists(cpath) else None,
        })
    tags_p1 = os.path.join(ctx["logs_dir"], jr["id"], "tags_alpha_P%d.json" % poles_spec[0][0])
    out["tags_alpha_txt"] = read_text(tags_p1) if os.path.exists(tags_p1) else None
    out["incidents_txt"] = txt(ctx["incidents"])
    out["ancrage_stats_txt"] = txt(ctx.get("ancrage_stats", {}))
    shutil.rmtree(root)
    return out


CONFIG_A = {"max_workers": 1, "premiere_impression": True,
            "juge_leger": {"passes": 3, "contre_lecture": False},
            "calques": {"accumulation": True, "max_archives": 12},
            "backend_tribunal": {"kind": "mock", "model": "mock-lourd", "model_mini": "mock-mini"},
            "backend_rapide": {"kind": "mock", "model": "mock-rapide"},
            "jury": {"mode": "socle4+1"}}
JR_A = {"id": "J01", "date": "2026-03-02", "titre": "Semaine au jardin", "texte": TEXTE_A}
VEC_J["int_a"] = run_integration("intA", [(1, ["1.07", "1.02", "1.16", "1.04"]),
                                          (2, ["2.06", "2.04", "2.20", "2.01"])],
                                 JR_A, CONFIG_A, runs=3)
VEC_J["int_a"]["config"] = CONFIG_A
VEC_J["int_a"]["jr"] = JR_A

CONFIG_B = {"premiere_impression": True,
            "juge_leger": {"passes": 2, "contre_lecture": True},
            "calques": {"accumulation": False},
            "backend_tribunal": {"kind": "mock", "model": "mock-lourd", "model_mini": "mock-mini"},
            "backend_rapide": {"kind": "mock", "model": "mock-rapide"},
            "jury": {"mode": "socle4+1"}}
JR_B = {"id": "J02", "date": None, "titre": None, "texte": TEXTE_B}
VEC_J["int_b"] = run_integration("intB", [(1, ["1.07", "1.16", "1.04"])], JR_B, CONFIG_B)
VEC_J["int_b"]["config"] = CONFIG_B
VEC_J["int_b"]["jr"] = JR_B

SCRIPT_C = {
    "tags_par_code": {
        "1.03": [{"si": 0, "conf": 0.8, "just": "j-1.03"}],
        "1.06": [{"si": 1, "conf": 0.75, "just": "j-1.06"},
                 {"si": 2, "conf": "0.85", "just": "conf en chaîne"},
                 {"si": 0, "conf": 2.0, "just": "clampée à 1.0"},
                 {"si": 3, "conf": None, "just": "TypeError → 0.5"}],
    },
    "tags_invalides": [
        {"competence": "9.99", "extrait": "hors pôle"},
        {"competence": "1.03", "extrait": "   "},
        "pas-un-dict",
    ],
    "alertes": ["balise <PORTFOLIO> repérée dans le texte de l'élève"],
    "alerte_si_model": "alpha-llm",
    "greffier_par_code": True,  # géré ci-dessous par GreffierRouteur
    "greffier": None, "leger": [LEGER_NON, LEGER_NON],
}


class ScriptedC(ScriptedBackend):
    def call(self, prompt, model=None, temperature=None, seed=None, task=None,
             meta=None, label=None):
        meta = meta or {}
        if task == "greffier":
            if meta["code"] == "1.03":
                return "# Greffier — 1.03\n\nDOSSIER VIDE — aucune pièce."
            return DOSSIER_OK
        return ScriptedBackend.call(self, prompt, model=model, temperature=temperature,
                                    seed=seed, task=task, meta=meta, label=label)


CONFIG_C = {"premiere_impression": False,
            "juge_leger": {"passes": 2, "contre_lecture": False},
            "calques": {"accumulation": True},
            "backend_tribunal": {"kind": "scripted", "model": "m-lourd", "model_mini": "m-mini"},
            "jury": {"mode": "socle4+1"}}
JR_C = {"id": "J03", "date": "2026-05-06", "titre": "Rampe", "texte": TEXTE_C}


def run_int_c():
    root = tempfile.mkdtemp(prefix="twin9intc")
    poles = build_poles([(1, ["1.03", "1.06"])])
    backend = ScriptedC(SCRIPT_C)
    ctx = make_ctx(root, poles, CONFIG_C, backend, rapide_model="m-rapide")
    backends = {"alpha": backend, "beta": backend}
    carto = J.cartographier_journee(ctx, dict(JR_C), list(ROSTER_INT), backends)
    carto_txt = read_text(os.path.join(ctx["journees_dir"], "J03", "carto_jour.json"))
    out = {
        "runs": [{"carto_txt": carto_txt, "carto_ret_txt": txt(carto),
                  "calques_store_txt": read_text(os.path.join(ctx["calques_dir"], "J03.json"))}],
        "tags_alpha_txt": read_text(os.path.join(ctx["logs_dir"], "J03", "tags_alpha_P1.json")),
        "incidents_txt": txt(ctx["incidents"]),
        "ancrage_stats_txt": txt(ctx.get("ancrage_stats", {})),
        "script": SCRIPT_C, "config": CONFIG_C, "jr": JR_C,
        "dossier_ok": DOSSIER_OK,
    }
    shutil.rmtree(root)
    return out


VEC_J["int_c"] = run_int_c()
VEC_J["textes"] = {"A": TEXTE_A, "B": TEXTE_B, "C": TEXTE_C}
VEC_J["gabarits"] = GABARITS
VEC_J["horodatage"] = HORODATAGE
VEC_J["base_dir"] = BASE_DIR
VEC_J["roster_int"] = ROSTER_INT
VEC_J["jl_dossiers"] = {"ok": DOSSIER_OK, "nues": DOSSIER_NUES, "non_ancre": DOSSIER_NON_ANCRE}
VEC_J["seuils_defaut_txt"] = txt(J.SEUILS_CONSENSUS)
VEC_J["version_protocole"] = J.VERSION_PROTOCOLE

for name, vec in (("heatmap.vec.json", VEC_H), ("tribunal.vec.json", VEC_T),
                  ("journee.vec.json", VEC_J)):
    with open(os.path.join(HERE, name), "w", encoding="utf-8") as f:
        json.dump(vec, f, ensure_ascii=False, indent=1)
    print("écrit", name, os.path.getsize(os.path.join(HERE, name)), "octets")
