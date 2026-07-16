#!/usr/bin/env node
// Génère SUMMARY.md (sommaire GitBook, D10) à partir de la doc DÉJÀ présente
// dans le dépôt : les manuels par rôle (content/formation/<parcours>/) et la
// doc technique/admin (docs/). GitBook (Git Sync) lit SUMMARY.md + .gitbook.yaml
// directement depuis le dépôt : le fichier généré est donc VERSIONNÉ (relancer
// ce script quand la doc bouge). Titres lus depuis le frontmatter `titre:` ou,
// à défaut, le premier titre `# H1`.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Parcours de formation dans l'ordre de progression des rôles du site.
const PARCOURS = [
  ['visiteur', 'Visiteur — découvrir'],
  ['apprenant', 'Apprenant — construire son portfolio'],
  ['cartographe', 'Cartographe — relire et garantir'],
  ['employeur', 'Employeur — lire une cartographie'],
  ['etablissement', 'Établissement — piloter une cohorte'],
  ['promptologue', 'Promptologue — versionner les prompts'],
  ['epistemiarque', 'Épistémiarque — éditer le référentiel'],
  ['noesiologie', 'Noésiologie — les fondements'],
  ['admin', 'Administration — exploiter la plateforme'],
]

// Doc technique / admin (docs/), groupée. Chaque entrée est un chemin relatif à
// docs/ ; le titre vient du H1 du fichier.
const DOCS_GROUPS = [
  [
    'Spécification & référence',
    ['cahier-des-charges.md', 'contrats.md', 'inventaire-assets.md', 'offre-employeur.md', 'ergonomie-navigation.md'],
  ],
  [
    'Exploitation',
    ['administration.md', 'hebergement.md', 'deploiement.md', 'backup-restore.md', 'runner-node.md'],
  ],
  [
    'RGPD & autorisations',
    ['rgpd-registre.md', 'rgpd-verification.md', 'autorisations.md'],
  ],
  [
    'Sécurité',
    ['securite-checklist.md', 'securite-demo.md', 'securite-prompts.md'],
  ],
  [
    'Moteur, masse & tests',
    ['plan-portage-moteur.md', 'rapport-parite-moteur.md', 'plan-fusion-visu.md', 'plan-masse.md', 'plan-prompts.md', 'strategie-tests.md', 'tests-e2e.md'],
  ],
]

/** Titre d'un markdown : frontmatter `titre:` sinon premier `# H1` sinon nom. */
function titleOf(absPath, fallback) {
  let text
  try {
    text = readFileSync(absPath, 'utf8')
  } catch {
    return fallback
  }
  const fm = text.match(/^---\n([\s\S]*?)\n---/)
  if (fm) {
    const m = fm[1].match(/^titre:\s*["']?(.+?)["']?\s*$/m)
    if (m) return m[1].trim()
  }
  const h1 = text.match(/^#\s+(.+?)\s*$/m)
  if (h1) return h1[1].trim()
  return fallback
}

/** Chapitres d'un parcours, triés par préfixe numérique (index.md exclu). */
function chaptersOf(parcours) {
  const dir = resolve(repo, 'content/formation', parcours)
  let files
  try {
    files = readdirSync(dir)
  } catch {
    return []
  }
  return files
    .filter((f) => f.endsWith('.md') && f !== 'index.md')
    .sort()
    .map((f) => ({
      href: `content/formation/${parcours}/${f}`,
      title: titleOf(resolve(dir, f), f.replace(/\.md$/, '')),
    }))
}

function buildSummary() {
  const lines = ['# Sommaire', '', '## Manuels par rôle', '']

  for (const [parcours, label] of PARCOURS) {
    const indexHref = `content/formation/${parcours}/index.md`
    lines.push(`* [${label}](${indexHref})`)
    for (const ch of chaptersOf(parcours)) {
      lines.push(`  * [${ch.title}](${ch.href})`)
    }
  }

  lines.push('', '## Documentation technique & administration', '')
  for (const [group, files] of DOCS_GROUPS) {
    lines.push(`* ${group}`)
    for (const file of files) {
      const abs = resolve(repo, 'docs', file)
      lines.push(`  * [${titleOf(abs, file)}](docs/${file})`)
    }
  }

  // Décisions d'architecture (ADR) : tous les docs/decisions/ADR-*.md, triés.
  const decisionsDir = resolve(repo, 'docs/decisions')
  const adrs = readdirSync(decisionsDir)
    .filter((f) => /^ADR-.*\.md$/.test(f))
    .sort()
  lines.push('', '## Décisions d’architecture (ADR)', '')
  for (const f of adrs) {
    lines.push(`* [${titleOf(resolve(decisionsDir, f), f)}](docs/decisions/${f})`)
  }

  lines.push('')
  return lines.join('\n')
}

const summary = buildSummary()
writeFileSync(resolve(repo, 'SUMMARY.md'), summary)
const entries = summary.split('\n').filter((l) => l.includes('](')).length
console.log(`wrote SUMMARY.md (${entries} entrées)`)
