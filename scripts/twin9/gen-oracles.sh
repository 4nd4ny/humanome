#!/bin/sh
# Génère les oracles de parité Twin_v9 (ADR-010) dans engine/test/twin9-oracles/
# (gitignoré). Exige le dossier source local ../Twin_v9 (hors dépôt, confidentiel)
# et python3. Les tests de parité JS se SAUTENT proprement si ce dossier manque.
#
# Chaque oracle est un run --mock --sans-etat à sel FIXE : déterministe,
# reproductible, sans réseau. On copie carto_evolutive.json, profil_ipsatif.json
# et journees_index.json (le contrat de contenu), plus un extrait de métriques
# STRUCTURELLES (nombre d'appels par étape — indépendant des longueurs de
# gabarits, donc comparable au moteur JS sans les gabarits).
set -eu

HERE=$(cd "$(dirname "$0")/../.." && pwd)
TWIN=${TWIN_V9_DIR:-"$HERE/../Twin_v9"}
OUT="$HERE/engine/test/twin9-oracles"

if [ ! -f "$TWIN/twin9.py" ]; then
  echo "Twin_v9 introuvable ($TWIN) — oracles non générés (les tests de parité seront sautés)." >&2
  exit 0
fi

mkdir -p "$OUT"

gen() {
  pf="$1"; salt="$2"; name="$3"; shift 3
  tmp=$(mktemp -d)
  (cd "$TWIN" && python3 twin9.py --portfolio "tests/portfolios/$pf" \
      --mock --sans-etat --salt "$salt" --out "$tmp" "$@" >/dev/null 2>&1)
  mkdir -p "$OUT/$name"
  cp "$tmp/carto_evolutive.json" "$tmp/profil_ipsatif.json" \
     "$tmp/journees_index.json" "$OUT/$name/"
  python3 - "$tmp/metrics_v9.json" "$OUT/$name/structurel.json" <<'PY'
import json, sys
m = json.load(open(sys.argv[1]))
json.dump({
    "appels_llm": m["appels_llm"],
    "par_etape_appels": {k: v["appels"] for k, v in sorted(m["par_etape"].items())},
    "tribunaux_sieges": m["tribunaux_sieges"],
    "statuts_finaux": m["statuts_finaux"],
    "n_journees": m["n_journees"],
    "roster": m["roster"],
    "jury_mode": m["jury_mode"],
}, open(sys.argv[2], "w"), ensure_ascii=False, indent=1, sort_keys=True)
PY
  cp "$TWIN/tests/portfolios/$pf" "$OUT/$name/portfolio.md"
  rm -rf "$tmp"
  echo "oracle $name : ok"
}

# Le corpus de parité : le portfolio planté multi-journées + deux synthétiques,
# plus des variantes d'options qui exercent les chemins de routage.
gen PLANT-01.md parite-1 plant01
gen PLANT-01.md parite-1 plant01-sans-contre-lecture --sans-contre-lecture
gen PLANT-01.md parite-1 plant01-jury-aleatoire --jury aleatoire --jury-taille 3
gen PLANT-01.md parite-1 plant01-scan-global --scan-global
gen SYNTH-01.md parite-2 synth01
gen SYNTH-06.md parite-3 synth06

# La config et le roster de référence utilisés par ces runs (contrat d'entrée).
cp "$TWIN/config.json" "$OUT/config.json"
cp "$TWIN/models.json" "$OUT/models.json"

# Le référentiel PARSÉ, structure SANS le texte des fiches (confidentiel) :
# vérifié dans les sources Python — journee/tribunal/merge/scan n'utilisent des
# fiches que num/nom de pôle et code/nom de compétence pour les ARTEFACTS ;
# header/fiche_md n'alimentent que les prompts, que le mock ignore (seul
# prompt_chars en dépend, exclu de structurel.json). Le moteur JS reçoit cette
# structure injectée (referentiel.polesFromStructure).
python3 - "$TWIN" "$OUT/referentiel.json" <<'PY'
import json, os, sys
sys.path.insert(0, sys.argv[1])
from aurora.referentiel import load_referentiel
poles = load_referentiel(os.path.join(sys.argv[1], "protocole", "tagger"))
out = [{"num": n, "nom": p.nom,
        "competences": [{"code": c["code"], "nom": c["nom"]} for c in p.competences]}
       for n, p in sorted(poles.items())]
with open(sys.argv[2], "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
    f.write("\n")
PY
echo "oracle referentiel.json : ok"

echo "Oracles écrits dans $OUT"
