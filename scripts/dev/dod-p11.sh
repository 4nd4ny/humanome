#!/usr/bin/env bash
# P11 operational DoD rehearsal (M8) — replays docs/plan-masse.md §8 OUTSIDE
# PHPUnit, against the running dev stack (docker compose up -d + migrations):
#
#   1. establishment account (grant-role), LLM/budget config, cohorte;
#   2. 20 fixture learners join WITH explicit consent (422 without) and each
#      deposits a 3-day portfolio (the de-facto opt-in, plan-masse §6);
#   3. mass run -> REAL CLI cron ticks (php scripts/worker.php, mock provider,
#      5 LLM calls per tick) -> INTERRUPTED at ~40 % -> resumed -> 100 % done;
#      proofs: 60 jobs done, EXACTLY 480 LLM calls (no re-called checkpoint),
#      coherent cumulated cost, 60 schema-valid documents (engine validator);
#   4. second run: budget cap LOWERED mid-run -> clean budget_exceeded stop,
#      reactivation by raising the cap;
#   5. machine runner (scripts/runner-node) in --once mode with the engine
#      mock provider injected drains the remaining jobs through /api/worker/*.
#
# Local dev only: fixture accounts (dod-p11-*@example.org) are recreated on
# each run, the register rate-limit is reset between fixture registrations.
#
# Usage: bash scripts/dev/dod-p11.sh   (from anywhere; needs jq, curl, node)

set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"

API=${API:-http://localhost:8080}
MIGRATE_TOKEN=${MIGRATE_TOKEN:-dev_migrate_token}
PASSWORD='dod-p11-motdepasse'
PACKAGE_ID='aurora-v3-reconstruit'
PACKAGE_VERSION='1.0.0'
DAYS=('2026-01-05' '2026-01-06' '2026-01-07')
ACTIVITES=('réparé un vélo' 'animé le conseil de classe' 'écrit un conte' 'mesuré le potager')

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
FAILURES=0

# ----------------------------------------------------------------- helpers

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \342\234\223 %s\n' "$*"; }
ko()   { printf '  \342\234\227 %s\n' "$*"; FAILURES=$((FAILURES + 1)); }

check() { # label expected actual
  if [ "$2" = "$3" ]; then ok "$1 : $3"; else ko "$1 : attendu $2, obtenu $3"; fi
}

sql() { docker compose exec -T -e MYSQL_PWD=humanome_dev mysql mysql -N -B -uhumanome humanome -e "$1"; }

# call <jar> <csrf|-> <method> <path> [json] -> RESP_CODE + RESP_BODY
call() {
  local jar=$1 csrf=$2 method=$3 path=$4 data=${5:-} out
  local args=(-s -S -X "$method" -H 'Content-Type: application/json' -b "$jar" -c "$jar" -w $'\n%{http_code}')
  [ "$csrf" != "-" ] && args+=(-H "X-CSRF-Token: $csrf")
  [ -n "$data" ] && args+=(--data "$data")
  out=$(curl "${args[@]}" "$API$path")
  RESP_CODE=${out##*$'\n'}
  RESP_BODY=${out%$'\n'*}
}

expect() { # code label -> aborts on mismatch (fixture plumbing, not a proof)
  if [ "$RESP_CODE" != "$1" ]; then
    echo "ABANDON — $2 : HTTP $RESP_CODE (attendu $1)" >&2
    echo "$RESP_BODY" >&2
    exit 1
  fi
}

register() { # email displayName jar -> prints csrf
  sql 'DELETE FROM rate_limits;' >/dev/null # fixture registrations, not a quota test
  call "$3" - POST /api/auth/register \
    "$(jq -cn --arg e "$1" --arg p "$PASSWORD" --arg n "$2" '{email:$e,password:$p,displayName:$n}')"
  expect 201 "inscription $1"
  jq -r '.csrfToken' <<<"$RESP_BODY"
}

# One REAL CLI cron tick (mock provider, 5 LLM calls) -> JSON counters line.
tick() {
  docker compose exec -T -w /var/www/html -e WORKER_PROVIDER=mock -e WORKER_TICK_MAX_CALLS=5 \
    php php scripts/worker.php
}

jobs_done()   { sql "SELECT COUNT(*) FROM mass_jobs WHERE run_id = $1 AND status = 'done';"; }
job_statuses() { sql "SELECT status, COUNT(*) FROM mass_jobs WHERE run_id = $1 GROUP BY status ORDER BY status;" | tr '\t' ':' | paste -sd ' ' -; }
run_status()  { sql "SELECT status FROM mass_runs WHERE id = $1;"; }
spent_usd()   { sql "SELECT spent_usd FROM etablissement_config WHERE user_id = $ETAB_ID;"; }

dump_documents() { # run_id -> JSONL on stdout (PDO returns the JSON column verbatim)
  docker compose exec -T -w /var/www/html php php -r '
    $pdo = new PDO(sprintf("mysql:host=%s;dbname=%s;charset=utf8mb4", getenv("DB_HOST"), getenv("DB_NAME")),
                   getenv("DB_USER"), getenv("DB_PASSWORD"));
    $stmt = $pdo->query("SELECT document FROM mass_jobs WHERE status = \"done\" AND run_id = " . (int) $argv[1]);
    foreach ($stmt as $row) { echo $row[0], "\n"; }
  ' -- "$1"
}

# ----------------------------------------------------------- 0. préambule

say '0. Préambule — pile locale'
HEALTH=$(curl -sf "$API/api/health")
check 'API /api/health db' 'ok' "$(jq -r '.db' <<<"$HEALTH")"
PKG=$(sql "SELECT COUNT(*) FROM prompt_versions v JOIN prompt_packages p ON p.id = v.package_id
           WHERE p.slug = '$PACKAGE_ID' AND v.semver = '$PACKAGE_VERSION' AND v.status = 'published';")
check "paquet $PACKAGE_ID@$PACKAGE_VERSION publié" '1' "$PKG"
REF=$(sql "SELECT COUNT(*) FROM referentiel_versions WHERE referentiel_id = 'respire' AND status = 'published';")
[ "$REF" -ge 1 ] && ok "référentiel respire publié ($REF version(s))" || ko 'référentiel respire absent'

# idempotence: purge any previous rehearsal (FK cascade = RGPD purge path)
sql "DELETE FROM users WHERE email LIKE 'dod-p11-%';"
# the call counters below referee the DoD: no residual dev job may leak in
ORPHANS=$(sql "SELECT COUNT(*) FROM mass_jobs WHERE status IN ('queued','running');")
if [ "$ORPHANS" -gt 0 ]; then
  sql "UPDATE mass_jobs SET status = 'cancelled' WHERE status IN ('queued','running');"
  ok "$ORPHANS job(s) résiduels de dev annulés (isolement des compteurs)"
fi

# ------------------------------------------- 1. établissement + config

say '1. Établissement — compte, rôle, config LLM/budget, cohorte'
ETAB_JAR="$WORK/etab.jar"
ETAB_CSRF=$(register 'dod-p11-etab@example.org' 'Lycée DoD' "$ETAB_JAR")
GRANT=$(curl -sf -X POST -H "X-Migrate-Token: $MIGRATE_TOKEN" -H 'Content-Type: application/json' \
  --data '{"email":"dod-p11-etab@example.org","role":"etablissement"}' "$API/api/admin/grant-role")
check 'grant-role etablissement' 'granted' "$(jq -r '.status' <<<"$GRANT")"
ETAB_ID=$(sql "SELECT id FROM users WHERE email = 'dod-p11-etab@example.org';")

call "$ETAB_JAR" "$ETAB_CSRF" PUT /api/etablissement/config \
  '{"provider":"humanome","model":"claude-sonnet-4-5","budgetCapUsd":50}'
expect 200 'config établissement'
check 'config provider' 'humanome' "$(jq -r '.provider' <<<"$RESP_BODY")"
check 'config plafond ($)' '50' "$(jq -r '.budgetCapUsd | floor' <<<"$RESP_BODY")"

call "$ETAB_JAR" "$ETAB_CSRF" POST /api/etablissement/cohortes '{"nom":"Promotion DoD 2026"}'
expect 201 'création cohorte'
COHORTE_ID=$(jq -r '.id' <<<"$RESP_BODY")
CODE=$(jq -r '.codeInvitation' <<<"$RESP_BODY")
ok "cohorte $COHORTE_ID créée, code d'invitation $CODE"

# ------------------------- 2. 20 apprenants : consentement + dépôt 3 jours

say '2. Apprenants — 20 × (rejoindre avec consentement + dépôt 3 journées)'
for i in $(seq 1 20); do
  JAR="$WORK/l$i.jar"
  CSRF=$(register "dod-p11-apprenant$i@example.org" "Apprenant DoD $i" "$JAR")

  if [ "$i" = 1 ]; then
    # explicit consent is REQUIRED in the body (plan-masse §6)
    call "$JAR" "$CSRF" POST "/api/cohortes/$CODE/rejoindre" '{}'
    check 'rejoindre SANS consentement' '422' "$RESP_CODE"
  fi
  call "$JAR" "$CSRF" POST "/api/cohortes/$CODE/rejoindre" '{"consentement":true}'
  expect 201 "jointure apprenant $i"
  if [ "$i" = 1 ]; then
    call "$JAR" "$CSRF" POST "/api/cohortes/$CODE/rejoindre" '{"consentement":true}'
    check 're-jointure idempotente' '200' "$RESP_CODE"
  fi

  SEGMENTS='[]'
  for d in 0 1 2; do
    TEXTE="Feuille $d de l'apprenant $i : aujourd'hui j'ai ${ACTIVITES[$(((i + d) % 4))]} avec les autres, puis noté ce que j'en retire."
    SEGMENTS=$(jq -c --arg date "${DAYS[$d]}" --arg texte "$TEXTE" '. + [{date:$date,texte:$texte}]' <<<"$SEGMENTS")
  done
  call "$JAR" "$CSRF" POST "/api/cohortes/$COHORTE_ID/portfolio" \
    "$(jq -cn --arg t "Portfolio DoD $i" --argjson s "$SEGMENTS" '{titre:$t,segments:$s}')"
  expect 201 "dépôt apprenant $i"
  printf '.'
done
printf '\n'
MEMBRES=$(sql "SELECT COUNT(*) FROM cohorte_membres WHERE cohorte_id = $COHORTE_ID AND consent_at IS NOT NULL;")
check 'membres consentis (consent_at)' '20' "$MEMBRES"
DEPOTS=$(sql "SELECT COUNT(*) FROM cohorte_portfolios WHERE cohorte_id = $COHORTE_ID;")
check 'portfolios déposés' '20' "$DEPOTS"

# ---------------- 3. run de masse : ticks cron réels, interruption, reprise

say "3. Run de masse — boucle de ticks CLI (php scripts/worker.php, mock)"
call "$ETAB_JAR" "$ETAB_CSRF" POST "/api/etablissement/cohortes/$COHORTE_ID/runs" \
  "{\"promptPackageId\":\"$PACKAGE_ID\",\"promptPackageVersion\":\"$PACKAGE_VERSION\"}"
expect 201 'lancement du run'
RUN1=$(jq -r '.runId' <<<"$RESP_BODY")
check 'jobs enfilés (20 membres × 3 journées)' '60' "$(jq -r '.jobs' <<<"$RESP_BODY")"

PH1_CALLS=0 PH1_TICKS=0
while :; do
  T=$(tick)
  PH1_TICKS=$((PH1_TICKS + 1))
  PH1_CALLS=$((PH1_CALLS + $(jq -r '.calls' <<<"$T")))
  [ "$(jobs_done "$RUN1")" -ge 24 ] && break
  [ "$PH1_TICKS" -gt 200 ] && { ko 'phase 1 : > 200 ticks sans atteindre 40 %'; break; }
done
DONE_MID=$(jobs_done "$RUN1")
PARTIALS=$(sql "SELECT COUNT(*) FROM mass_jobs WHERE run_id = $RUN1 AND status = 'queued' AND checkpoint IS NOT NULL;")
ok "INTERRUPTION après $PH1_TICKS ticks / $PH1_CALLS appels LLM — $DONE_MID/60 journées produites (~40 %)"
ok "états à l'interruption : $(job_statuses "$RUN1")"
[ "$PARTIALS" -ge 1 ] && ok "$PARTIALS job(s) en file AVEC checkpoint partiel (reprise mi-journée à prouver)" \
                      || ko 'aucun job avec checkpoint partiel à l'\''interruption'

PH2_CALLS=0 PH2_TICKS=0
while :; do
  T=$(tick)
  PH2_TICKS=$((PH2_TICKS + 1))
  PH2_CALLS=$((PH2_CALLS + $(jq -r '.calls' <<<"$T")))
  [ "$(jq -r '.jobsTouched' <<<"$T")" -eq 0 ] && break
  [ "$PH2_TICKS" -gt 300 ] && { ko 'phase 2 : file non drainée après 300 ticks'; break; }
done
ok "REPRISE : $PH2_TICKS ticks / $PH2_CALLS appels LLM supplémentaires"

check 'jobs done'            'done:60' "$(job_statuses "$RUN1")"
check 'statut du run'        'done'    "$(run_status "$RUN1")"
check 'appels LLM totaux (60 jobs × 8 — 0 double-appel)' '480' "$((PH1_CALLS + PH2_CALLS))"

SPENT=$(spent_usd)
SUM_JOBS=$(sql "SELECT ROUND(SUM(cost_usd), 6) FROM mass_jobs WHERE run_id = $RUN1;")
call "$ETAB_JAR" "$ETAB_CSRF" GET "/api/etablissement/runs/$RUN1"
expect 200 'tableau de suivi'
BOARD_COST=$(jq -r '.coutUsd' <<<"$RESP_BODY")
BOARD_DONE=$(jq -r '.jobs.done' <<<"$RESP_BODY")
check 'tableau de suivi : jobs done' '60' "$BOARD_DONE"
if awk -v a="$SPENT" -v b="$SUM_JOBS" -v c="$BOARD_COST" \
     'BEGIN { exit (a-b < 0.000001 && b-a < 0.000001 && a-c < 0.000001 && c-a < 0.000001) ? 0 : 1 }'; then
  ok "coût cumulé cohérent : spent_usd=$SPENT = somme des jobs=$SUM_JOBS = tableau de suivi=$BOARD_COST \$"
else
  ko "coût incohérent : spent_usd=$SPENT, somme jobs=$SUM_JOBS, tableau=$BOARD_COST"
fi

VALID=$(dump_documents "$RUN1" | node scripts/dev/validate-mass-documents.mjs) \
  && ok "$VALID (validateur ajv du moteur)" || ko "documents invalides : $VALID"

# ------------------- 4. 2e run : plafond abaissé en cours -> budget_exceeded

say '4. Budget — plafond abaissé en cours de 2e run'
call "$ETAB_JAR" "$ETAB_CSRF" POST "/api/etablissement/cohortes/$COHORTE_ID/runs" \
  "{\"promptPackageId\":\"$PACKAGE_ID\",\"promptPackageVersion\":\"$PACKAGE_VERSION\"}"
expect 201 'lancement du 2e run'
RUN2=$(jq -r '.runId' <<<"$RESP_BODY")

T=$(tick); CALLS_BEFORE=$(jq -r '.calls' <<<"$T")
ok "2e run lancé (60 jobs), $CALLS_BEFORE appels effectués"

call "$ETAB_JAR" "$ETAB_CSRF" PUT /api/etablissement/config \
  '{"provider":"humanome","model":"claude-sonnet-4-5","budgetCapUsd":0.01}'
expect 200 'abaissement du plafond'
T=$(tick)
check 'appels LLM après abaissement (refus AVANT appel)' '0' "$(jq -r '.calls' <<<"$T")"
[ "$(jq -r '.budgetBlocked' <<<"$T")" -ge 1 ] && ok 'coupe-circuit budget déclenché (budgetBlocked)' \
                                              || ko 'budgetBlocked attendu'
check 'statut du 2e run' 'budget_exceeded' "$(run_status "$RUN2")"
ok "états du 2e run : $(job_statuses "$RUN2")"
T=$(tick)
check 'tick suivant : toujours 0 appel' '0' "$(jq -r '.calls' <<<"$T")"

call "$ETAB_JAR" "$ETAB_CSRF" PUT /api/etablissement/config \
  '{"provider":"humanome","model":"claude-sonnet-4-5","budgetCapUsd":100}'
expect 200 'réactivation par hausse du plafond'
check 'run réactivé' 'active' "$(run_status "$RUN2")"
ok "états après réactivation : $(job_statuses "$RUN2")"

# --------------------------- 5. runner machine (Node) sur la même file

say '5. Runner Node (--once, mock injecté) — /api/worker/*, même file'
call "$ETAB_JAR" "$ETAB_CSRF" POST /api/etablissement/worker-token
expect 201 'génération du jeton worker'
WORKER_TOKEN=$(jq -r '.workerToken' <<<"$RESP_BODY")

RUNNER_STATS=$(node scripts/dev/runner-once-mock.mjs --api "$API" --token "$WORKER_TOKEN" --limit 5 2>"$WORK/runner.log") \
  || { ko 'runner en échec'; tail -5 "$WORK/runner.log"; }
RUNNER_OK=$(jq -r '.ok' <<<"$RUNNER_STATS")
[ "$RUNNER_OK" -ge 3 ] && ok "runner --once : $RUNNER_OK jobs traités (≥ 3 exigés), $(jq -r '.reserved' <<<"$RUNNER_STATS") réservés" \
                       || ko "runner --once : $RUNNER_OK jobs traités (< 3)"
check 'file du 2e run drainée par le runner' 'done:60' "$(job_statuses "$RUN2")"
check 'statut du 2e run' 'done' "$(run_status "$RUN2")"

# -------------------------------------------------------------- bilan

say 'BILAN'
echo "  run 1 : 60 jobs done, $((PH1_CALLS + PH2_CALLS)) appels LLM (480 attendus), interruption à $DONE_MID/60, reprise complète"
echo "  run 2 : budget_exceeded vécu puis réactivé, drainé par le runner Node ($RUNNER_OK jobs)"
echo "  coût cumulé : $(spent_usd) \$ (plafond 100 \$)"
echo "  comptes fixtures : dod-p11-etab@example.org / dod-p11-apprenantN@example.org (mdp : $PASSWORD)"
if [ "$FAILURES" -eq 0 ]; then
  say 'DoD P11 OPÉRATIONNELLE : TOUT EST VERT'
else
  say "DoD P11 : $FAILURES ÉCHEC(S)"
  exit 1
fi
