# -*- coding: utf-8 -*-
"""Vecteurs de parité (CPython = oracle) pour merge.js / scan.js (étape 6/7).

Deux blobs figés : merge.vec.json, scan.vec.json. Aucun python à l'exécution
des tests : ce script tourne UNE fois, ses sorties sont gelées dans les tests.

Neutralisation (minimale — merge3/scan9 n'ont ni ThreadPool ni horloge) :
  - logs silencieux (n'affectent aucune valeur de retour) ;
  - base_dir/date fixés ; protocole_dir = fichiers factices (le mock ignore le
    prompt : seule (salt, task, meta, model) pilote sa sortie — les gabarits
    confidentiels ne sont donc PAS nécessaires) ; impl_dir = viewer factice.

Les sorties structurées sont figées en TEXTE (json.dumps ensure_ascii=False,
indent=2 + "\\n" = profil write_json) : parité JS sur pyJsonDumpsWriteJson,
à l'octet, int/float compris. Les fixtures d'ENTRÉE sont marquées :
type(x) is float -> {"__f__": x}, hydratées côté JS par pyf().
"""
import json
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
TWIN = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "..", "..", "..", "Twin_v9")
sys.path.insert(0, TWIN)

import aurora.merge3 as M  # noqa: E402
import aurora.scan9 as S  # noqa: E402
import aurora.tribunal9 as T  # noqa: E402
from aurora.backends import MockBackend  # noqa: E402
from aurora.referentiel import Pole  # noqa: E402

# ── logs silencieux (aucun effet sur les valeurs de retour) ──────────────────
_noop = lambda *a, **k: None  # noqa: E731
for _mod in (M, S, T):
    for _nm in ("log", "log_ok", "log_warn", "log_err"):
        if hasattr(_mod, _nm):
            setattr(_mod, _nm, _noop)

SALT = "vecms"
DATE = "2026-02-01"
JOURNAL_ID = "plant-merge"
BASE_DIR = None  # rempli avec un tempdir


def txt(obj):
    return json.dumps(obj, ensure_ascii=False, indent=2) + "\n"


def mark(o):
    """Fixture d'entrée : float -> {"__f__": x} (bool/int laissés plats)."""
    if isinstance(o, bool):
        return o
    if isinstance(o, float):
        return {"__f__": o}
    if isinstance(o, dict):
        return {k: mark(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [mark(x) for x in o]
    return o


# ── Référentiel factice (pôles 1 = TETE, 4 = AME pour le profil ipsatif) ──────
POLES_SPEC = [
    {"num": 1, "comps": [
        {"code": "1.01", "nom": "Analyse critique"},
        {"code": "1.03", "nom": "Synthèse écrite"},
        {"code": "1.05", "nom": "Curiosité méthodique"}]},
    {"num": 4, "comps": [
        {"code": "4.03", "nom": "Discernement éthique"},
        {"code": "4.07", "nom": "Débat contradictoire"}]},
]


def build_poles():
    poles = []
    for spec in POLES_SPEC:
        comps = [{"code": c["code"], "nom": c["nom"],
                  "fiche_md": "## %s — %s\n\nFiche %s." % (c["code"], c["nom"], c["code"])}
                 for c in spec["comps"]]
        poles.append(Pole(spec["num"], "# Pôle %d\n\n" % spec["num"], comps))
    return poles


def poles_spec_out():
    """Spec émise pour le JS (num + comps avec fiche_md)."""
    out = []
    for spec in POLES_SPEC:
        comps = [{"code": c["code"], "nom": c["nom"],
                  "fiche_md": "## %s — %s\n\nFiche %s." % (c["code"], c["nom"], c["code"])}
                 for c in spec["comps"]]
        out.append({"num": spec["num"], "header": "# Pôle %d\n\n" % spec["num"],
                    "competences": comps})
    return out


def dummy_protocole(root):
    # le mock IGNORE le contenu du prompt : ces fichiers factices existent
    # seulement pour que resolve_file (côté Python) ne lève pas — dont les
    # gabarits `lourd/*` du tribunal appelé par juger_faisceau (second ressort).
    lourd = ("10-premiere-impression", "20-greffier", "20b-juge-leger",
             "20c-contre-lecture", "21a-accusation", "21b-defense",
             "22a-replique", "22b-briefing", "23-jure", "23b-relance",
             "23c-second-tour", "24-president", "25a-gardien-support",
             "25b-gardien-raisonnement", "1-tag-pole")
    rels = ["merge/01-kairos-evolutif.md", "merge/02-pole-evolutif.md",
            "merge/03-competence-evolution.md", "merge/04-rapporteur.md",
            "scan/00-condense-fidele.md", "scan/01-arpenteur.md",
            "scan/02-retour-aux-sources.md"] + ["lourd/%s.md" % n for n in lourd]
    for rel in rels:
        p = os.path.join(root, *rel.split("/"))
        os.makedirs(os.path.dirname(p), exist_ok=True)
        # contenu ignoré par le mock ; on met les {$VAR} pour rester réaliste
        with open(p, "w", encoding="utf-8") as f:
            f.write("Gabarit factice {$JOURNAL_ID} {$DONNEES}\n")


VIEWER_HTML = "<!doctype html>\n<html><body><script src=\"carto-evolutive-data.js\"></script></body></html>\n"


# ── Verdicts factices : couvrent les branches de fusionner ───────────────────
def verdict_etabli(conf, sp, si, extrait):
    return {"statut": "présence établie", "etage": "leger-direct", "confiance": conf,
            "score_preuves": sp, "score_indices": si,
            "traces_probantes": [{"extrait": extrait, "date": None}],
            "prescription": {"pour_apprenant": "Continue ainsi.", "pour_cartographe": None}}


def graine_d(code, nom, jid, extrait, jugee=None):
    g = {"code": code, "nom": nom, "journee": jid, "date": None, "source": "leger-ecarte",
         "detail": None, "extrait": extrait, "question": "As-tu remarqué ?"}
    if jugee is not None:
        g["jugee"] = jugee
    return g


# Textes bruts assez longs pour que _sentences_de rende des phrases (>= 60 pts).
TXT1 = ("# Journal du premier jour\n"
        "Note copiée : <script>alert('x')</script> collée par erreur.\n"  # verrouille l'échappement </→<\\/ du viewer
        "L'élève a présenté son prototype de four solaire devant la classe entière du matin.\n"
        "Ensuite l'équipe a mesuré patiemment l'angle des miroirs avec un rapporteur artisanal.\n"
        "Le soir chacun a rédigé une synthèse honnête des erreurs commises pendant la séance.\n")
TXT2 = ("# Journal du deuxième jour\n"
        "La discussion éthique sur le partage des tâches a duré toute la matinée sans trancher.\n"
        "L'élève a documenté chaque étape du montage dans un carnet daté avec beaucoup de soin.\n"
        "Un débat contradictoire a opposé deux hypothèses sur la meilleure orientation possible.\n")
TXT3 = ("# Journal du troisième jour\n"
        "L'élève a repris la synthèse écrite de la veille pour la corriger point par point.\n"
        "La curiosité méthodique de l'équipe a permis de tester une configuration inattendue.\n"
        "Chacun a présenté ses conclusions devant le groupe en argumentant calmement ses choix.\n")


def build_cartos():
    return [
        {"journee": "J01", "date": "2026-01-05", "titre": "Prototype",
         "authenticite": "authentique",
         "premiere_impression": "Impression rapide.\n## Question spontanée\nComment mesures-tu ?",
         "segments": [{"comps": ["1.01"], "heat": 0.9}, {"comps": ["1.01", "1.03"], "heat": 0.72}],
         "verdicts": {
             "1.01": verdict_etabli(0.9, 3, 2, "L'élève a présenté son prototype de four solaire devant la classe entière du matin."),
             "1.03": {"statut": "présence non établie", "etage": "tribunal-court-circuit",
                      "confiance": 0.3, "motif": "dossier vide",
                      "prescription": {"pour_apprenant": "Documente davantage."}},
             "4.03": {"statut": "renvoi au cartographe", "etage": "tribunal",
                      "confiance": 0.5, "motif": "désaccord",
                      "prescription": {"pour_apprenant": "À revoir ensemble.",
                                       "pour_cartographe": "La pièce P1 relève-t-elle de 4.03 ?"},
                      "dossier_cartographe": {"motif": "désaccord jury", "desaccord": "1 contre 1",
                                              "pieges_envisages": ["récit performatif"],
                                              "citations": ["extrait litigieux"]},
                      "jury": {"positions_finales": {"Linguiste": "détection", "Historien": "contestation"},
                               "second_tour": True, "relance_par": "Linguiste"}},
         },
         "etablies": ["1.01"], "renvois": ["4.03"],
         "graines": [graine_d("4.07", "Débat contradictoire", "J01", "Un débat sur l'orientation."),
                     graine_d("1.05", "Curiosité méthodique", "J01", "Une curiosité isolée.")],
         "consensus": {}, "legers": {}, "validations": {}, "spans_ecartes": [],
         "calques": [], "rejets": [], "alertes_injection": ["injection suspecte"]},

        {"journee": "J02", "date": "2026-01-12", "titre": "Éthique",
         "authenticite": "produite",
         "premiere_impression": "Texte produit.",
         "segments": [{"comps": ["1.01"], "heat": 0.55}],
         "verdicts": {
             "1.01": verdict_etabli(0.8, 2, 3, "L'élève a documenté chaque étape du montage dans un carnet daté avec beaucoup de soin."),
             "4.07": {"statut": "présence non établie", "etage": "minoritaire", "confiance": 0.4},
             "4.03": {"statut": "renvoi au cartographe", "etage": "tribunal",
                      "confiance": 0.45, "motif": "doute",
                      "prescription": {"pour_apprenant": "Malheureusement à revoir.",
                                       "pour_cartographe": "Question plus récente pour 4.03 ?"}},
         },
         "etablies": ["1.01"], "renvois": ["4.03"],
         "graines": [graine_d("4.07", "Débat contradictoire", "J02", "Un débat contradictoire a opposé deux hypothèses sur la meilleure orientation possible."),
                     graine_d("1.05", "Curiosité méthodique", "J02", "curiosité méthodique de l'équipe.")],
         "consensus": {}, "legers": {}, "validations": {}, "spans_ecartes": [],
         "calques": [], "rejets": [], "alertes_injection": []},

        {"journee": "J03", "date": "2026-01-19", "titre": "Synthèse",
         "authenticite": "authentique",
         "premiere_impression": None,
         "segments": [{"comps": ["1.03"], "heat": 0.6}],
         "verdicts": {
             "1.03": verdict_etabli(0.7, 2, 1, "L'élève a repris la synthèse écrite de la veille pour la corriger point par point."),
             "1.05": {"statut": "présence non établie", "etage": "non-détectée", "confiance": 0.1},
         },
         "etablies": ["1.03"], "renvois": [],
         "graines": [graine_d("4.07", "Débat contradictoire", "J03", "argumentant calmement ses choix."),
                     graine_d("1.05", "Curiosité méthodique", "J03", "La curiosité méthodique de l'équipe a permis de tester une configuration inattendue.")],
         "consensus": {}, "legers": {}, "validations": {}, "spans_ecartes": [],
         "calques": [], "rejets": [], "alertes_injection": []},
    ]


def new_ctx(base_dir, proto_dir, impl_dir, etat_scan=None, etat_faisceaux=None):
    return {"config": {
                "merge": {"second_ressort": True, "seuil_faisceau_journees": 2,
                          "relectures": True, "rapporteur": True, "max_histoires": 12},
                "scan_global": {"retour_max_caracteres": 30000},
                "jury": {"mode": "socle4+1"},
                "backend_tribunal": {"kind": "mock", "model": "mock-lourd"}},
            "poles": build_poles(),
            "base_dir": base_dir, "protocole_dir": proto_dir, "impl_dir": impl_dir,
            "journal_id": JOURNAL_ID, "date": DATE,
            "incidents": {},
            "textes_journees": {"J01": TXT1, "J02": TXT2, "J03": TXT3},
            "etat_scan": {} if etat_scan is None else etat_scan,
            "etat_faisceaux": {} if etat_faisceaux is None else etat_faisceaux,
            "rapide": None}


def read_file(base, rel):
    p = os.path.join(base, *rel.split("/"))
    with open(p, "r", encoding="utf-8") as f:
        return f.read()


# ═══════════════════════════════════════════════════════════════════════════
VEC_M = {}
VEC_S = {}

# ── Tables unitaires : _statut_temporel ──────────────────────────────────────
VEC_M["statut_temporel"] = [
    {"ne": ne, "nr": nr, "out": M._statut_temporel(ne, nr)}
    for ne, nr in [(2, 0), (3, 5), (1, 0), (1, 3), (0, 1), (0, 4), (0, 0)]
]

# ── Tables unitaires : _trajectoire (n ∈ {1,4,7} → tiers 1,2,3) ──────────────
_traj_cases = [
    ([], [], 3), ([], [0], 3), ([], [0, 2], 3),         # aucune établie
    ([2], [], 3), ([0], [], 3),                          # une établie (in/out dernier tiers, n=3)
    ([0], [], 7), ([6], [], 7),                          # une établie n=7
    ([0, 1, 2], [], 3),                                  # multi, toutes, consolidation
    ([0, 3], [], 4),                                     # multi n=4 : ecart 3 > tiers 2 → intermittence
    ([0, 1], [], 7),                                     # multi n=7 : aucune dans dernier tiers → en sommeil
    ([4, 5, 6], [], 7),                                  # multi n=7 : consolidation
    ([1, 6], [], 7),                                     # multi n=7 : ecart 5 > tiers 3 → intermittence
]
VEC_M["trajectoire"] = [
    {"je": je, "js": js, "n": n, "out": M._trajectoire(je, js, n)}
    for je, js, n in _traj_cases
]


# ── Tables unitaires : profil_ipsatif ────────────────────────────────────────
def comp_ips(code, nom, pole, statut, sp, si, sc):
    return {"code": code, "nom": nom, "pole": pole, "statut_temporel": statut,
            "cumul_preuves": sp, "cumul_indices": si, "score_cumule": sc}


def ordered_comps(lst):
    d = {}
    for c in lst:
        d[c["code"]] = c
    return d


_ips_cases = {
    # 3 établies même pôle : verrouille l'arrondi intermédiaire ; 1 égalité de score départagée par code
    "meme_pole": ordered_comps([
        comp_ips("1.01", "A", 1, "présence consolidée", 3, 2, 7.0),
        comp_ips("1.03", "B", 1, "présence établie (à confirmer)", 2, 1, 3.5),
        comp_ips("1.05", "C", 1, "présence consolidée", 1, 1, 3.5),
        comp_ips("4.03", "D", 4, "présence non établie", 0, 0, 0.0),
    ]),
    "vide": ordered_comps([
        comp_ips("1.01", "A", 1, "présence non établie", 0, 0, 0.0),
        comp_ips("4.03", "D", 4, "renvoi au cartographe", 0, 0, 0.0),
    ]),
    "faisceau": ordered_comps([
        comp_ips("1.01", "A", 1, M.STATUT_FAISCEAU, 0, 4, 2.4),
        comp_ips("4.07", "E", 4, "présence consolidée", 5, 3, 9.1),
    ]),
}
VEC_M["profil_ipsatif"] = {
    name: {"comps": mark(comps), "out": txt(M.profil_ipsatif(comps))}
    for name, comps in _ips_cases.items()
}

# ── fusionner : cumuls (bool EST un int → compte 1 ; "R"/float exclus) ───────
_fe_poles = [Pole(1, "# Pôle 1\n\n", [{"code": "1.01", "nom": "A", "fiche_md": "f"}])]
_fe_ctx = {"poles": _fe_poles}
_fe_cartos = [
    {"journee": "F1", "date": None, "segments": [{"comps": ["1.01"], "heat": 0.9}],
     "graines": [], "verdicts": {"1.01": {
         "statut": "présence établie", "etage": "leger", "confiance": 0.8,
         "score_preuves": True, "score_indices": "R",       # True→1 ; "R" exclu
         "traces_probantes": [{"extrait": "Trace une.", "date": None}]}}},
    {"journee": "F2", "date": None, "segments": [{"comps": ["1.01", "1.03"], "heat": 0.6},
                                                 {"comps": ["1.01"], "heat": 0.75}],
     "graines": [], "verdicts": {"1.01": {
         "statut": "présence établie", "etage": "leger", "confiance": True,   # True→1.0
         "score_preuves": 3, "score_indices": 2.0,          # 2.0 float → exclu de si
         "traces_probantes": [{"extrait": "Trace deux.", "date": None}]}}},
]
VEC_M["fusionner_edge"] = {
    "poles": poles_spec_out()[:0] + [{"num": 1, "header": "# Pôle 1\n\n",
                                      "competences": [{"code": "1.01", "nom": "A", "fiche_md": "f"}]}],
    "cartos": mark(_fe_cartos),
    "out": txt(M.fusionner(_fe_ctx, _fe_cartos)),
}

# ── gardien_formulations : doublon insuffisant⊂insuffisante, variantes ' / ' ──
_gf_cartos = [
    {"journee": "G1",
     "verdicts": {
         "1.01": {"statut": "présence établie", "etage": "leger",
                  "prescription": {"pour_apprenant": "Ceci est insuffisante et malgré tout."}},
         "1.03": {"statut": "présence non établie", "etage": "minoritaire",
                  "prescription": {"pour_apprenant": "l'apprenant est en retard."}},
         "1.05": {"statut": "présence non établie", "etage": "non-détectée",
                  "prescription": {"pour_apprenant": "manque de rien à signaler ici."}}}},
]
_gf_comps = ordered_comps([
    comp_ips("1.01", "A", 1, "renvoi au cartographe", 0, 0, 0.0),
    comp_ips("1.03", "B", 1, "renvoi au cartographe", 0, 0, 0.0),
    comp_ips("1.05", "C", 1, "renvoi au cartographe", 0, 0, 0.0),
    comp_ips("4.03", "D", 4, "présence non établie", 0, 0, 0.0),
    comp_ips("4.07", "E", 4, "présence non établie", 0, 0, 0.0),
])
_gf_comps["4.03"]["graines"] = [graine_d("4.03", "D", "G1", "x")]
_gf_comps["4.07"]["graines"] = [graine_d("4.07", "E", "G1", "y")]
for _c in _gf_comps.values():
    _c.setdefault("graines", [])
# pôle 4 : 0 établies + 4 graines → alerte découragement ; pôle 1 : 3 renvois → alerte
_gf_comps["4.03"]["graines"] += [graine_d("4.03", "D", "G2", "x2"), graine_d("4.03", "D", "G3", "x3")]
_gf_comps["4.07"]["graines"] += [graine_d("4.07", "E", "G2", "y2")]
_gf_rel = {"kairos_evolutif": "Une lacune ici.", "poles": {"1": "Rien"}, "histoires": {"1.01": "il faudrait que ce soit mieux"}}
_gf_sig, _gf_al = M.gardien_formulations(_gf_cartos, _gf_comps, _gf_rel)
VEC_M["gardien_formulations"] = {
    "cartos": mark(_gf_cartos), "comps": mark(_gf_comps), "rel": mark(_gf_rel),
    "out": txt([_gf_sig, _gf_al]),
}

# ── resume_jour / registre_tenu (unités) ─────────────────────────────────────
_rj_cj = build_cartos()[0]
VEC_M["resume_jour"] = {"cj": mark(_rj_cj), "out": M._resume_jour(_rj_cj)}

_rt_comps = ordered_comps([
    comp_ips("4.07", "Débat", 4, "présence non établie", 0, 0, 0.0),
    comp_ips("1.05", "Curiosité", 1, "présence non établie", 0, 0, 0.0),
    comp_ips("1.01", "Analyse", 1, "présence consolidée", 3, 2, 7.0),
])
_rt_comps["4.07"]["graines"] = [graine_d("4.07", "Débat", "J01", "ext a"),
                                graine_d("4.07", "Débat", "J02", "ext b", jugee="second ressort : non retenu")]
_rt_comps["1.05"]["graines"] = [graine_d("1.05", "Curiosité", "J01", "ext c")]
_rt_comps["1.01"]["graines"] = []
VEC_M["registre_tenu"] = {"comps": mark(_rt_comps), "out": M._registre_tenu(_rt_comps)}

# ── scan units : _resoudre_journees (date partagée : PREMIER gagne) ──────────
_rj_jours = [
    {"id": "A", "date": "2026-03-01", "texte": "ta"},
    {"id": "B", "date": "2026-03-01", "texte": "tb"},   # même date que A
    {"id": "C", "date": "2026-03-02", "texte": "tc"},
]
_rj_refs = ["2026-03-01", "C", "A", "inconnu", "2026-03-02"]
_rj_out = S._resoudre_journees(_rj_refs, _rj_jours)
VEC_S["resoudre_journees"] = {
    "jours": mark(_rj_jours), "refs": _rj_refs,
    "out": txt([j["id"] for j in _rj_out]),
}

# ── scan units : _cle_obs ────────────────────────────────────────────────────
VEC_S["cle_obs"] = [
    {"o": mark(o), "out": txt(list(S._cle_obs(o)))}
    for o in [
        {"type": "graine-referentiel", "code": "1.01", "titre": "X"},
        {"type": "graine-referentiel", "titre": "X"},          # code absent → None
        {"type": "hors-referentiel", "titre": "  Titre Mixte  "},
        {"type": "continuite", "titre": None},
    ]
]

# ═══ Chaîne complète : fusionner → arpenter → second_ressort → relectures →
#     ecrire_sorties, sur UNE fixture riche (le verrou principal) ═════════════
with tempfile.TemporaryDirectory() as tmp:
    base = os.path.join(tmp, "base")
    proto = os.path.join(tmp, "proto")
    impl = os.path.join(tmp, "impl")
    os.makedirs(base, exist_ok=True)
    dummy_protocole(proto)
    os.makedirs(os.path.join(impl, "viewer"), exist_ok=True)
    with open(os.path.join(impl, "viewer", "carto_evolutive.html"), "w", encoding="utf-8") as f:
        f.write(VIEWER_HTML)

    cartos = build_cartos()
    ctx = new_ctx(base, proto, impl)
    backend = MockBackend({"salt": SALT, "model": "mock-lourd"})
    roster = [{"name": "Linguiste"}, {"name": "Historien"}, {"name": "Sociologue"}]

    chain = {}
    chain["poles"] = poles_spec_out()
    chain["cartos"] = mark(cartos)
    chain["textes"] = ctx["textes_journees"]
    chain["config"] = mark(ctx["config"])
    chain["roster"] = roster
    chain["salt"] = SALT
    chain["date"] = DATE
    chain["journal_id"] = JOURNAL_ID
    chain["viewer_html"] = VIEWER_HTML

    # 1. fusionner (avant scan)
    competences = M.fusionner(ctx, cartos)
    chain["fusionner"] = txt(competences)

    # 2. arpenter (scan global) — mute competences + ctx.scan_global + etat_scan
    resume = S.arpenter(ctx, cartos, competences, backend)
    chain["scan_resume"] = txt(resume)
    chain["scan_global_json"] = read_file(base, "scan_global.json")
    chain["comps_after_scan"] = txt(competences)
    chain["etat_scan"] = txt(ctx["etat_scan"])
    chain["incidents_after_scan"] = txt(ctx["incidents"])

    # 3. second_ressort — chose jugée stockée dans etat_faisceaux
    sr_out = M.second_ressort(ctx, cartos, competences, backend)
    chain["sr_out"] = txt(sr_out)
    chain["comps_after_sr"] = txt(competences)
    chain["etat_faisceaux"] = txt(ctx["etat_faisceaux"])

    # 4. relectures
    rel = M.relectures(ctx, cartos, competences, backend)
    chain["rel"] = txt(rel)
    chain["incidents_after_rel"] = txt(ctx["incidents"])

    # 5. ecrire_sorties
    carto_evo = M.ecrire_sorties(ctx, cartos, competences, rel, roster)
    chain["carto_evo_ret"] = txt(carto_evo)
    chain["carto_evolutive_json"] = read_file(base, "carto_evolutive.json")
    chain["profil_ipsatif_json"] = read_file(base, "profil_ipsatif.json")
    chain["rapport_md"] = read_file(base, "rapport.md")
    chain["rapport_evolutif_md"] = read_file(base, "rapport_evolutif.md")
    chain["viewer_data_js"] = read_file(base, "viewer/carto-evolutive-data.js")
    chain["incidents_final"] = txt(ctx["incidents"])

VEC_M["chain"] = chain

# ═══ Reprise scan (chose vue) + second ressort (chose jugée) : 2e run ════════
with tempfile.TemporaryDirectory() as tmp:
    base = os.path.join(tmp, "base")
    proto = os.path.join(tmp, "proto")
    impl = os.path.join(tmp, "impl")
    os.makedirs(base, exist_ok=True)
    dummy_protocole(proto)

    etat_scan = {}
    etat_faisceaux = {}
    backend = MockBackend({"salt": SALT, "model": "mock-lourd"})

    # run 1
    cartos1 = build_cartos()
    ctx1 = new_ctx(base, proto, impl, etat_scan=etat_scan, etat_faisceaux=etat_faisceaux)
    comps1 = M.fusionner(ctx1, cartos1)
    S.arpenter(ctx1, cartos1, comps1, backend)
    M.second_ressort(ctx1, cartos1, comps1, backend)

    # run 2 : MÊME état persistant, dossier inchangé → chose vue / chose jugée
    cartos2 = build_cartos()
    ctx2 = new_ctx(base, proto, impl, etat_scan=etat_scan, etat_faisceaux=etat_faisceaux)
    comps2 = M.fusionner(ctx2, cartos2)
    resume2 = S.arpenter(ctx2, cartos2, comps2, backend)
    sr2 = M.second_ressort(ctx2, cartos2, comps2, backend)

    VEC_S["reprise"] = {
        "poles": poles_spec_out(),
        "cartos": mark(build_cartos()),
        "textes": {"J01": TXT1, "J02": TXT2, "J03": TXT3},
        "config": mark(ctx2["config"]),
        "salt": SALT, "date": DATE, "journal_id": JOURNAL_ID,
        "run2_scan_resume": txt(resume2),
        "run2_scan_global_json": read_file(base, "scan_global.json"),
        "run2_incidents": txt(ctx2["incidents"]),
        "run2_comps": txt(comps2),
        "run2_sr_out": txt(sr2),
        "run2_etat_faisceaux": txt(etat_faisceaux),
    }

# ── retour_aux_sources : découpage en lots par points de code ────────────────
# lot technique = retour_max_caracteres ; une journée seule plus longue forme
# quand même son lot ; frontière cur_len + len(j) > max_c.
with tempfile.TemporaryDirectory() as tmp:
    proto = os.path.join(tmp, "proto")
    dummy_protocole(proto)
    ctx = new_ctx(os.path.join(tmp, "base"), proto, os.path.join(tmp, "impl"))
    ctx["config"]["scan_global"]["retour_max_caracteres"] = 50
    backend = MockBackend({"salt": SALT, "model": "mock-lourd"})
    # 3 journées : longueurs 40, 20, 60 → lots [J1], [J2? cur_len 20 +? ] selon algo
    jL = [
        {"id": "L1", "date": None, "texte": "x" * 40},
        {"id": "L2", "date": None, "texte": "y" * 20},
        {"id": "L3", "date": None, "texte": "z" * 60},  # seule > max_c
    ]
    obs = {"titre": "Test lots", "description": "d", "indices": ["i1"], "code": None}
    ancres, issues = S._retour_aux_sources(ctx, obs, "hors-referentiel", jL, backend, "hors01")
    VEC_S["retour_lots"] = {
        "jours": mark(jL), "obs": mark(obs), "max_c": 50,
        "config": mark(ctx["config"]),
        "poles": poles_spec_out(), "salt": SALT,
        "ancres": txt(ancres), "issues": txt(issues),
        "incidents": txt(ctx["incidents"]),
        "ancrage_stats": txt(ctx.get("ancrage_stats", {})),
    }

with open(os.path.join(HERE, "merge.vec.json"), "w", encoding="utf-8") as f:
    json.dump(VEC_M, f, ensure_ascii=False, indent=1)
with open(os.path.join(HERE, "scan.vec.json"), "w", encoding="utf-8") as f:
    json.dump(VEC_S, f, ensure_ascii=False, indent=1)
print("OK merge.vec.json + scan.vec.json")
