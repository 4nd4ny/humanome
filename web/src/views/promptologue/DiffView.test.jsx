// Traçabilité (exigence diff-promptologue) : DiffView plantait sur la sortie
// RÉELLE du serveur (clés françaises fictives ajoutes/retires/modifies côté
// front vs added/removed/modified + from/to objets {version} côté
// api/src/Packages/PackageDiff.php — crash React « Objects are not valid as a
// React child » à l'intégration M7). Ce test est la moitié FRONT de la
// protection contre une divergence future de contrat : il rend DiffView avec
// la fixture PARTAGÉE schemas/fixtures/diff/prompt-package-diff-exemple.json
// (sous-répertoire diff/ pour rester hors du scan de validate-corpus.mjs, qui
// ne valide que les documents à `kind`), générée depuis la vraie sortie PHP
// (PackageDiff::compute) et figée côté serveur par
// api/tests/PackagesDiffTest.php::testDiffMatchesSharedFixture. Si
// PackageDiff.php renomme une clé, la fixture régénérée casse ce test tant
// que la vue n'est pas réalignée. Il couvre aussi les branches de rendu non
// exercées par EditeurSection.test.jsx (prompts added/removed, variables
// modifiées, entrypoint, champs, cas identical).
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { DiffView } from './EditeurSection.jsx'
import diffFixture from '../../../../schemas/fixtures/diff/prompt-package-diff-exemple.json'

afterEach(cleanup)

function renderDiff(diff = diffFixture) {
  render(<DiffView diff={diff} />)
  return screen.getByTestId('promptologue-diff')
}

describe('Fixture partagée serveur ↔ front (contrat M7)', () => {
  it('a la forme RÉELLE du serveur : clés anglaises, from/to objets {version}', () => {
    // Sanity : si la fixture est régénérée avec des clés renommées, ce test
    // échoue AVANT les tests de rendu, avec un message qui pointe le contrat.
    expect(diffFixture.packageId).toBe('aurora-demo')
    expect(diffFixture.from).toEqual({ version: '1.0.0' })
    expect(diffFixture.to).toEqual({ version: '2.0.0' })
    expect(Object.keys(diffFixture.prompts).sort()).toEqual(['added', 'modified', 'removed'])
    const modified = diffFixture.prompts.modified[0]
    expect(modified.texte.map((l) => l.op)).toEqual(['del', 'add'])
    expect(modified.texte[0]).toHaveProperty('line')
    expect(modified.texte[0]).toHaveProperty('text')
    expect(diffFixture.code.entrypoint).toEqual({ from: 'run', to: 'main' })
  })
})

describe('DiffView — rendu de la fixture partagée (sortie serveur réelle)', () => {
  it('rend l’en-tête « Diff 1.0.0 → 2.0.0 » depuis les objets {version}, sans crash', () => {
    const block = renderDiff()
    expect(block.querySelector('h3').textContent).toBe('Diff 1.0.0 → 2.0.0')
    // Aucun objet rendu tel quel comme enfant React ni sérialisé brut.
    expect(block.textContent).not.toContain('[object Object]')
    expect(block.textContent).not.toContain('"version"')
  })

  it('prompts ajoutés : « {role} — {nom} » depuis les objets {role, nom}', () => {
    const block = renderDiff()
    expect(block.textContent).toContain('Ajoutés : merge — Fusion chronologique multi-jours')
  })

  it('prompts retirés : « {role} — {nom} » depuis les objets {role, nom}', () => {
    const block = renderDiff()
    expect(block.textContent).toContain('Retirés : kairos — Synthèse transversale de la journée')
  })

  it('prompt modifié : lignes serveur {op,line,text} rendues avec marqueurs -/+', () => {
    const block = renderDiff()
    expect(block.textContent).toContain("Modifié : extraction-pole — Extraction des traces d'un pôle")
    expect(block.textContent).toContain(
      '- - Cite les passages verbatim, sans reformuler ni inventer.',
    )
    expect(block.textContent).toContain(
      '+ - Cite les passages verbatim, sans reformuler ni inventer, avec leur position dans la feuille.',
    )
  })

  it('variables : ajoutée = nom (chaîne serveur), modifiée = description from → to', () => {
    const block = renderDiff()
    // added est une liste de NOMS (chaînes), pas d'objets — fallback asText.
    expect(block.textContent).toContain('Variables ajoutées : consignes_additionnelles')
    expect(block.textContent).toContain('Variable « date_feuille » : description')
    expect(block.textContent).toContain(
      'Date de la feuille de portfolio en cours de cartographie (segmentation du portfolio). '
        + '→ Date de la feuille de portfolio cartographiée, au format ISO (AAAA-MM-JJ).',
    )
  })

  it('code : entrypoint objet {from,to} rendu lisiblement, orchestration en lignes +', () => {
    const block = renderDiff()
    expect(block.textContent).toContain("Point d'entrée : run → main")
    expect(block.textContent).toContain('+ // v2 : passe de fusion ajoutée.')
  })

  it('champs et métadonnées {clé: {from,to}} rendus « clé : from → to »', () => {
    const block = renderDiff()
    expect(block.textContent).toContain('description :')
    expect(block.textContent).toContain('Deuxième itération : extraction affinée')
    expect(block.textContent).toContain('licence : CC-BY-SA-4.0 → CC-BY-4.0')
  })

  it('deux versions identiques : message dédié, aucune section de diff', () => {
    const block = renderDiff({
      packageId: 'aurora-demo',
      from: { version: '1.0.0' },
      to: { version: '1.0.0' },
      identical: true,
      fields: {},
      prompts: { added: [], removed: [], modified: [] },
      code: { entrypoint: null, orchestration: null },
      metadata: {},
    })
    expect(block.querySelector('h3').textContent).toBe('Diff 1.0.0 → 1.0.0')
    expect(block.textContent).toContain('Les deux versions sont identiques.')
    expect(block.querySelectorAll('.promptologue-diff-section').length).toBe(0)
  })
})
