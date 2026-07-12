// humanome engine — stage B1 of the cartography pipeline (docs/plan-portage-moteur.md):
// generation of the narrative prompts (61 competences + 7 poles + 1 kairos) from the
// numeric aggregates of the merge. DOM-free ESM module (ADR-001), no I/O: callers
// provide the aggregates and receive the prompt texts.
//
// Retro-engineered from the real artefacts. Oracle: the 69 prompt files of
// assets-existants/merge-prototype/intermediate/prompts/ (byte-for-byte parity,
// checked by scripts/parity/parity-prompts.mjs).
//
// The long French constants below are the FIXED parts of the three prompt templates,
// extracted verbatim from the oracle files — do not reword or re-wrap them: parity
// with the historical prompts is the contract. {{N}} marks the pole number slot.

// ---------------------------------------------------------------------------
// Formatting helpers (twins of the Python prototype's formatting)
// ---------------------------------------------------------------------------

/** '2025-12-22' -> '22/12/2025' (French date as used in the prompt headers). */
export function formatDateFr(iso) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/**
 * Twin of Python's '%.2f': correctly-rounded 2-decimal formatting of the exact
 * binary double, with ties rounded half-to-even (JS toFixed rounds ties up,
 * which diverges on exact ties such as 0.625 -> Python '0.62' vs toFixed '0.63').
 *
 * @param {number} x finite number (aggregate scores/confidences are >= 0)
 * @returns {string} e.g. 0.7171 -> '0.72', 0 -> '0.00', 54.23 -> '54.23'
 */
export function formatFixed2(x) {
  const negative = x < 0
  // toFixed(20) is an exact decimal expansion prefix: a double that is not an
  // exact 3-decimal tie differs from it within the first ~18 fractional digits.
  const s = Math.abs(x).toFixed(20)
  const dot = s.indexOf('.')
  let intPart = s.slice(0, dot)
  let kept = s.slice(dot + 1, dot + 3)
  const rest = s.slice(dot + 3).replace(/0+$/, '')
  let carry = 0
  if (rest !== '') {
    if (rest[0] > '5') carry = 1
    else if (rest[0] === '5') {
      // exact tie only when nothing but zeros follows the 5
      if (rest.length > 1) carry = 1
      else carry = (kept.charCodeAt(1) - 48) % 2 === 1 ? 1 : 0
    }
  }
  if (carry === 1) {
    const bumped = String(BigInt(intPart + kept) + 1n).padStart(intPart.length + 2, '0')
    intPart = bumped.slice(0, -2)
    kept = bumped.slice(-2)
  }
  const sign = negative && (intPart !== '0' || kept !== '00') ? '-' : ''
  return `${sign}${intPart}.${kept}`
}

// ---------------------------------------------------------------------------
// Fixed template text (verbatim from the oracle prompts)
// ---------------------------------------------------------------------------

const COMPETENCE_INTRO = `Tu es chargé d'écrire un **court paragraphe** qui raconte l'**évolution de cette compétence** pour l'apprenant à travers les feuilles cartographiées du portfolio.`

const COMPETENCE_BODY = `## Ta tâche

Écris **un seul paragraphe** (3 à 5 phrases, **600 caractères max**) qui raconte la trajectoire de cette compétence : comment elle s'est déposée, oubliée, retrouvée, précisée, déplacée d'une feuille à l'autre.

## Consignes

- Mets l'accent sur la TRAJECTOIRE — pas sur l'état figé. Si le score a augmenté, dis comment ; si la confiance s'est consolidée, dis pourquoi ; si la compétence a basculé d'un renvoi à une présence établie, nomme le mouvement
- **Ne réécris PAS** les verdicts ni les prescriptions individuels — ils restent accessibles séparément dans un menu ouvrable. Tu peux y faire référence (« le verdict du 26/12 a noté... ») mais sans les paraphraser intégralement
- Pas de listes, pas de titres, pas de blockquotes — juste **un paragraphe de prose**
- Si la compétence n'apparaît qu'une seule fois, dis-le simplement et mentionne ce qu'elle a manifesté à ce moment-là (1-2 phrases suffisent)
- Si la compétence n'apparaît dans aucune feuille (aucune trace), dis : *« Aucune trace dans la période cartographiée. »* — un seul paragraphe, rien de plus
- Tonalité Aurora : précise, située, sans grandiloquence
- N'INVENTE RIEN : appuie-toi exclusivement sur les données fournies

## Format de sortie

Un seul paragraphe Markdown, **sans titre, sans préambule, sans signature**. Commence directement par la première phrase.

---

# Données : présence par feuille (ordre chronologique)`

const POLE_INTRO = `Tu es chargé de produire la **synthèse évolutive du Pôle {{N}}** d'un portfolio cartographié sur plusieurs feuilles datées. Cette synthèse remplace, dans le rapport du pôle, les rapports de pôle individuels — qui restent accessibles séparément, dépliables date par date.`

const POLE_BODY = `## Ta tâche

Produis un **Markdown** avec EXACTEMENT ces 5 sections (titres conservés tels quels, dans cet ordre) :

\`\`\`
## Portrait du pôle
## Territoires les plus denses
## Territoires non visités
## Émergences du pôle
## Pistes
\`\`\`

Chaque section doit faire la **synthèse évolutive** de la section correspondante des rapports du pôle {{N}} de chacune des feuilles fournies plus bas. Ce qu'il faut faire ressortir : **comment les rapports de chaque feuille forment l'histoire des apprentissages de l'apprenant pour ce pôle au fil du temps**.

## Consignes de style

- Garde EXACTEMENT les 5 titres ci-dessus
- Mets l'ÉVOLUTION DANS LE TEMPS au centre : raconte la trajectoire du pôle, pas la juxtaposition de ses photographies. Note ce qui se précise, ce qui apparaît, ce qui se confirme, ce qui glisse d'une compétence vers une autre
- Tonalité Aurora : précise, située, sans grandiloquence ; cite les verbatims marquants quand ils servent l'argument
- Ne réécris PAS les verdicts ni les prescriptions individuels — ils restent accessibles séparément
- N'invente RIEN : appuie-toi exclusivement sur les rapports fournis
- Longueur cible : comparable à un seul rapport de pôle individuel
- Pour **Territoires les plus denses** : reprends les territoires qui se sont confirmés ou approfondis ; cite des verbatims si pertinent
- Pour **Pistes** : pistes consolidées tenant compte de la trajectoire (3 à 5)

## Format de sortie

Markdown brut, qui commence directement par \`## Portrait du pôle\`. Pas de titre principal (\`#\`), pas de préambule.

---

# Données : rapports du pôle {{N}} par feuille (ordre chronologique)`

const KAIROS_INTRO = `Tu es chargé de produire la **synthèse Kairos évolutive** d'un portfolio cartographié sur plusieurs feuilles datées. Cette synthèse remplace, dans le rapport global, les Kairos individuels — qui restent accessibles séparément, dépliables date par date.`

const KAIROS_BODY = `## Ta tâche

Produis un **Markdown** avec EXACTEMENT ces 5 sections (titres conservés tels quels, dans cet ordre) :

\`\`\`
## Portrait
## La forme de votre profil
## Ce qui relie vos pôles
## Ce qui émerge entre les lignes
## Invitations pour la suite
\`\`\`

Chaque section doit faire la **synthèse évolutive** de la section correspondante de chacune des feuilles fournies plus bas. Ce qu'il faut faire ressortir : **comment les rapports de chaque feuille forment l'histoire des apprentissages de l'apprenant au fil du temps**.

## Consignes de style

- Garde EXACTEMENT les 5 titres ci-dessus — ne les renomme pas, ne les réordonne pas
- Mets l'ÉVOLUTION DANS LE TEMPS au centre : ne juxtapose pas les feuilles, **raconte la trajectoire**. Quand une voix s'est précisée, quand un fil s'est ouvert, quand un constat est devenu pratique installée, etc.
- Garde le ton du protocole Aurora : précis, situé, chaleureux mais sans grandiloquence ; travaille les nuances ; cite les verbatims marquants quand ils servent l'argument
- N'invente RIEN : appuie-toi exclusivement sur les rapports Kairos fournis ci-dessous
- Longueur cible : comparable à un seul Kairos individuel — pas plus long
- Pour la section **Invitations pour la suite** : 4 à 6 invitations consolidées, en blockquotes (\`> Pour prolonger...\`), qui tiennent compte de la trajectoire observée plutôt que de la juxtaposer

## Format de sortie

Markdown brut, qui commence directement par \`## Portrait\`. Pas de titre principal (\`#\`), pas de préambule, pas de bloc \`Pour le Cartographe\`.

---

# Données : rapports Kairos par feuille (ordre chronologique)`

const COURT_CIRCUIT_STATUT = 'court-circuit (compétence non triée pour cette feuille)'

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function feuilleHeading(iso) {
  return `## Feuille du ${formatDateFr(iso)} (date ISO : ${iso})`
}

// Shared data section for pole/kairos prompts: one markdown report per sheet,
// blank when the day run produced none (observed: 2026-01-06 everywhere,
// 2026-03-07 on pole 6). Reports are interpolated verbatim minus the trailing
// newline some of them carry (the oracle strips it).
function pushRapportBlocks(lines, entries, getText) {
  for (const entry of entries) {
    lines.push(feuilleHeading(entry.date), '')
    const text = (getText(entry) ?? '').trim()
    if (text !== '') lines.push(text)
    lines.push('', '---', '')
  }
}

/**
 * Prompt "histoire d'apprentissage" for one competence.
 *
 * @param {object} comp one entry of agrege.par_competence (merge stage A output)
 * @param {string} poleNom e.g. 'TETE — Penser & Comprendre'
 * @param {object} periode { premiere, derniere, nb_feuilles } (ISO dates)
 * @returns {string} full prompt markdown
 */
export function buildCompetencePrompt(comp, poleNom, periode) {
  const lines = [
    `# Histoire d'apprentissage — Compétence ${comp.code} : ${comp.nom}`,
    '',
    COMPETENCE_INTRO,
    '',
    '## Cadre',
    '',
    `- Compétence : **${comp.code} — ${comp.nom}** (Pôle ${comp.pole} — ${poleNom})`,
    `- Période : du **${formatDateFr(periode.premiere)}** au **${formatDateFr(periode.derniere)}**`,
    `- Nombre de feuilles cartographiées : **${periode.nb_feuilles}** ; feuilles ayant établi cette compétence : **${comp.nb_feuilles_etablies}**`,
    `- Statut final cumulé : **${comp.statut_final}**`,
    `- Cumul : **${comp.cumul_preuves}** preuves décisives, **${comp.cumul_indices}** indices ; confiance moyenne : **${formatFixed2(comp.confiance_moyenne)}** ; score cumulé : **${formatFixed2(comp.score)}**`,
    '',
    COMPETENCE_BODY,
    '',
  ]
  for (const feuille of comp.presence_par_feuille) {
    lines.push(feuilleHeading(feuille.date), '')
    if (feuille.court_circuit) {
      // The short-circuit flag wins even when the day data carries a motif
      // (observed on the 2026-03-26 sheet): only the status line is emitted.
      lines.push(`- **Statut** : ${COURT_CIRCUIT_STATUT}`)
    } else {
      lines.push(`- **Statut** : ${feuille.statut}`)
      lines.push(
        `- **Preuves** : ${feuille.preuves}, **Indices** : ${feuille.indices}, ` +
          `**Confiance** : ${formatFixed2(feuille.confiance)}, **Score** : ${formatFixed2(feuille.score)}`,
      )
      if (feuille.motif) lines.push(`- **Verdict (motif)** : ${feuille.motif}`)
      if (feuille.prescription) lines.push(`- **Prescription** : ${feuille.prescription}`)
      // Traces without a verbatim extract are skipped (5 occurrences in the corpus).
      const traces = (feuille.traces ?? []).filter((t) => t.extraitVerbatim)
      if (traces.length > 0) {
        lines.push('- **Traces retenues** :')
        for (const trace of traces) {
          lines.push(`  - (${trace.role}) « ${trace.extraitVerbatim} »`)
        }
      }
    }
    lines.push('', '---', '')
  }
  return lines.join('\n')
}

/**
 * Prompt "synthèse évolutive" for one pole.
 *
 * @param {object} pole one entry of agrege.par_pole (merge stage A output)
 * @param {object} periode { premiere, derniere, nb_feuilles, feuilles_chronologiques }
 * @returns {string} full prompt markdown
 */
export function buildPolePrompt(pole, periode) {
  const n = pole.pole_num
  const lines = [
    `# Synthèse évolutive du Pôle ${n} — ${pole.pole_nom}`,
    '',
    POLE_INTRO.replaceAll('{{N}}', String(n)),
    '',
    '## Cadre',
    '',
    `- Pôle : **${n} — ${pole.pole_nom}**`,
    `- Période couverte : du **${formatDateFr(periode.premiere)}** au **${formatDateFr(periode.derniere)}**`,
    `- Nombre de feuilles cartographiées : **${periode.nb_feuilles}**`,
    `- Dates ISO : \`${periode.feuilles_chronologiques.join(', ')}\``,
    '',
    POLE_BODY.replaceAll('{{N}}', String(n)),
    '',
  ]
  pushRapportBlocks(lines, pole.rapports_par_feuille, (entry) => entry.rapportCompletMarkdown)
  return lines.join('\n')
}

/**
 * Prompt "synthèse évolutive du Kairos" (one per portfolio).
 *
 * @param {object} globalAgrege agrege.global (merge stage A output)
 * @param {object} periode { premiere, derniere, nb_feuilles, feuilles_chronologiques }
 * @returns {string} full prompt markdown
 */
export function buildKairosPrompt(globalAgrege, periode) {
  const lines = [
    '# Synthèse évolutive du Kairos — Portfolio multi-feuilles',
    '',
    KAIROS_INTRO,
    '',
    '## Cadre',
    '',
    `- Période couverte : du **${formatDateFr(periode.premiere)}** au **${formatDateFr(periode.derniere)}**`,
    `- Nombre de feuilles cartographiées : **${periode.nb_feuilles}**`,
    `- Dates ISO : \`${periode.feuilles_chronologiques.join(', ')}\``,
    '',
    KAIROS_BODY,
    '',
  ]
  pushRapportBlocks(lines, globalAgrege.kairos_par_feuille, (entry) => entry.syntheseCompleteMarkdown)
  return lines.join('\n')
}

/**
 * Builds the full set of narrative prompts (one per competence, one per pole,
 * one kairos) from the stage-A aggregates.
 *
 * @param {object} agrege { par_competence, par_pole, global } — the `agrege`
 *   object produced by the merge (stage A), same shape as carto_merge.json
 * @param {object} meta { periode: { premiere, derniere, nb_feuilles, feuilles_chronologiques } }
 *   — the merge-level metadata (carto_merge.json `periode`)
 * @returns {Array<{ type: 'competence'|'pole'|'kairos', id: string, filename: string, content: string }>}
 *   in oracle order: competences by code, then poles by number, then kairos
 */
export function buildNarrativePrompts(agrege, meta) {
  const periode = meta?.periode
  if (!periode) throw new Error('buildNarrativePrompts: meta.periode is required')
  const prompts = []
  for (const code of Object.keys(agrege.par_competence).sort()) {
    const comp = agrege.par_competence[code]
    const pole = agrege.par_pole[String(comp.pole)]
    if (!pole) throw new Error(`buildNarrativePrompts: pole ${comp.pole} of competence ${code} not in par_pole`)
    prompts.push({
      type: 'competence',
      id: code,
      filename: `competence_${code}.prompt.md`,
      content: buildCompetencePrompt(comp, pole.pole_nom, periode),
    })
  }
  const poleNums = Object.keys(agrege.par_pole).sort((a, b) => Number(a) - Number(b))
  for (const n of poleNums) {
    prompts.push({
      type: 'pole',
      id: String(n),
      filename: `pole_${n}.prompt.md`,
      content: buildPolePrompt(agrege.par_pole[n], periode),
    })
  }
  prompts.push({
    type: 'kairos',
    id: 'kairos',
    filename: 'kairos.prompt.md',
    content: buildKairosPrompt(agrege.global, periode),
  })
  return prompts
}
