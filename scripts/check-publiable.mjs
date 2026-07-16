#!/usr/bin/env node
// Garde-fou de publication (D10). Le dépôt est destiné à un miroir PUBLIC
// (GitHub) : ce script refuse de laisser partir, dans les fichiers SUIVIS par
// git (l'index — donc ce qui serait poussé),
//   (a) un gabarit Twin9 en clair (répertoires golden-twin9/, twin9-oracles/,
//       golden-prompt/ — le contrat de la plateforme, jamais public) ;
//   (b) un fichier de secrets réel (.env… hors .example) ou un cache Python
//       compilé (.pyc / __pycache__, qui embarque un chemin absolu de build) ;
//   (c) un secret en clair : clé API (sk-ant-…), secret PayPal, mot de passe ;
//   (d) un chemin local absolu de la machine de développement (/Users/…) ;
//   (e) un identifiant d'hébergement OVH réel (hôte / cluster).
//
// Sortie 0 si propre, 1 sinon (avec la liste fichier:ligne — motif). Utilisé
// par le hook pre-commit ET par la CI (.github/workflows/publiable.yml).
//
// L'audit était jusqu'ici ponctuel (scan d'historique manuel) ; ceci en fait
// un garde-fou permanent. Il ne réécrit PAS l'historique (décision utilisateur,
// via git filter-repo) : il protège l'état courant (HEAD/index).
//
// Note : les littéraux réellement sensibles (identifiants OVH) sont construits
// par concaténation pour que le garde-fou ne se signale pas lui-même.

import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'

// --- Littéraux sensibles (concaténés : n'apparaissent pas en clair ici) ------
const OVH_HOST = 'harmong' + '927'
const OVH_CLUSTER = 'cluster' + '129'

// Une occurrence est ANODINE si sa ligne porte un marqueur de placeholder ou de
// valeur de test (les fixtures et .env.example en sont pleins, légitimement).
// `dev` couvre les identifiants jetables du compose LOCAL (humanome_dev,
// root_dev, dev_migrate_token) : jamais des secrets de production (ceux-ci
// vivent dans ~/app/shared/.env, hors dépôt).
const FAKE_MARKER =
  /(EXEMPLE|change-?me|placeholder|example\d*|clusterNNN|\btest\b|never|jamais|\bfake\b|xxx+|<[^>]+>|\.\.\.|_dev\b|\bdev[_-]|[:=]\s*["']?dev\b)/i

// Extensions binaires : présence tolérée, contenu non lu.
const BINARY_EXT = /\.(woff2?|ttf|otf|eot|png|jpe?g|gif|ico|webp|svgz|pdf|zip|gz|tgz|bundle|mp4|mp3|wasm)$/i

// Fichiers de test : fixtures par nature (certaines règles s'y assouplissent).
const TEST_PATH = /(\.(test|spec|e2e)\.[jt]sx?$)|(^|\/)(tests?|e2e|__tests__|fixtures)\//i

// Au-delà, on ne lit pas le contenu (un gros JSON de données n'est pas un lieu
// de secret ; on garde la vérif de NOM de fichier quoi qu'il arrive).
const MAX_CONTENT_BYTES = 1_000_000

// --- Règles sur le CHEMIN du fichier -----------------------------------------
const PATH_RULES = [
  {
    id: 'gabarit-twin9',
    test: (p) => /(^|\/)(golden-twin9|twin9-oracles|golden-prompt)\//.test(p),
    why: 'répertoire de gabarit Twin9 (jamais public)',
  },
  {
    id: 'env-reel',
    // .env, .env.deploy, .env.local… mais PAS *.example.
    test: (p) => {
      const base = p.split('/').pop()
      return /^\.env(\.[A-Za-z0-9_-]+)*$/.test(base) && !/\.example$/.test(base)
    },
    why: 'fichier de secrets (.env réel — doit rester hors dépôt)',
  },
  {
    id: 'pyc-cache',
    test: (p) => /\.pyc$/.test(p) || /(^|\/)__pycache__\//.test(p),
    why: 'cache Python compilé (embarque un chemin de build)',
  },
]

// --- Règles sur le CONTENU (ligne par ligne) ---------------------------------
const CONTENT_RULES = [
  {
    id: 'cle-anthropic',
    // Vraie clé : sk-ant-<préfixe>-<longue chaîne>. Les fakes courts
    // (sk-ant-user, sk-ant-platform-test-key) ne matchent pas la longueur.
    re: /sk-ant-[A-Za-z0-9]{2,}-[A-Za-z0-9_-]{16,}/,
    why: 'clé API Anthropic en clair',
  },
  {
    id: 'secret-paypal',
    re: /PAYPAL_SECRET\s*[:=]\s*["']?[^\s"'#]+/,
    why: 'secret PayPal en clair',
  },
  {
    id: 'mot-de-passe',
    // Toute variable d'env se terminant par PASS/PASSWORD (DB_, MYSQL_,
    // MYSQL_ROOT_, FTP_, DEPLOY_, SMTP_…) avec une valeur non-placeholder.
    // Ignorée dans les fichiers de test : les constantes de mot de passe y sont
    // des fixtures par nature (une VRAIE clé, elle, reste détectée partout).
    re: /\b[A-Z][A-Z0-9_]*PASS(?:WORD)?\s*[:=]\s*["']?[^\s"'#]+/,
    skip: (p) => TEST_PATH.test(p),
    why: 'mot de passe en clair (assignation)',
  },
  {
    id: 'chemin-local',
    re: /\/Users\/[A-Za-z0-9]/,
    why: 'chemin local absolu de la machine de dev',
  },
  {
    id: 'ovh-hote',
    re: new RegExp(OVH_HOST),
    why: 'identifiant OVH réel (hôte)',
  },
  {
    id: 'ovh-cluster',
    re: new RegExp(OVH_CLUSTER),
    why: 'identifiant OVH réel (cluster)',
  },
]

/** @returns {string[]} chemins suivis par git (index), relatifs à la racine. */
function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return out.split('\0').filter(Boolean)
}

/** @param {string} path @returns {Array<{path: string, line: number, id: string, why: string}>} */
function scanFile(path) {
  const findings = []

  for (const rule of PATH_RULES) {
    if (rule.test(path)) findings.push({ path, line: 0, id: rule.id, why: rule.why })
  }

  if (BINARY_EXT.test(path)) return findings
  let size = 0
  try {
    size = statSync(path).size
  } catch {
    return findings // fichier supprimé du disque mais encore indexé : rien à lire
  }
  if (size > MAX_CONTENT_BYTES) return findings

  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return findings
  }
  if (text.includes('\0')) return findings // binaire non déclaré

  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (FAKE_MARKER.test(line)) continue // placeholder / valeur de test : anodin
    for (const rule of CONTENT_RULES) {
      if (rule.skip && rule.skip(path)) continue
      if (rule.re.test(line)) {
        findings.push({ path, line: i + 1, id: rule.id, why: rule.why })
      }
    }
  }
  return findings
}

function main() {
  const files = trackedFiles()
  const findings = files.flatMap(scanFile)

  if (findings.length === 0) {
    console.log(`check-publiable : OK — ${files.length} fichiers suivis, aucun résidu non publiable.`)
    process.exit(0)
  }

  console.error(`check-publiable : ${findings.length} occurrence(s) NON PUBLIABLE(S) :\n`)
  for (const f of findings) {
    const at = f.line > 0 ? `${f.path}:${f.line}` : f.path
    console.error(`  [${f.id}] ${at} — ${f.why}`)
  }
  console.error(
    '\nCorrige (neutralise le secret, retire le fichier de l’index, remplace le chemin/identifiant)\n' +
      'avant de publier. Pour purger l’HISTOIRE (pas seulement HEAD) : git filter-repo (décision utilisateur).',
  )
  process.exit(1)
}

main()
