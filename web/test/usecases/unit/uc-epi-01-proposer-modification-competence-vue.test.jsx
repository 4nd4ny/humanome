// UC-EPI-01 — Proposer une modification de compétence : tests UNITAIRES (vue).
// Fiche : docs/cas-utilisation/epistemiarque/UC-EPI-01-proposer-modification-competence.md
//
// Le composant EpistemiarqueView est rendu ISOLÉ, avec ses coutures de test
// (deps.fetchMeFn / deps.api) : garde de rôle côté IHM (branche admin, erreurs
// de session, section inconnue) et éditeur riche (ListEditor des marqueurs et
// des signaux, argument employeur, enrichissements) — sans réseau ni <App/>.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import EpistemiarqueView from '../../../src/views/EpistemiarqueView.jsx'
import { ApiError, ApiUnavailableError } from '../../../src/api/client.js'
import { competenceContent } from '../support/epi.js'

const session = (roles) => async () => ({ user: { id: 42, displayName: 'Iris', roles } })

async function click(element) {
  await act(async () => {
    fireEvent.click(element)
  })
}

function atelierApi() {
  return {
    list: vi.fn(async () => [{ id: 1, code: '1.01', nom: 'Pensée Critique', pole: 1, semver: '1.0.0', status: 'published' }]),
    listDrafts: vi.fn(async () => []),
    cutRelease: vi.fn(),
    createDraft: vi.fn(),
  }
}

afterEach(() => {
  cleanup()
  window.location.hash = ''
})

describe('UC-EPI-01 — garde de rôle de l’atelier (vue isolée)', () => {
  it('UC-EPI-01-U18 — un compte admin sans rôle épistémiarque voit l’atelier (A5) ; un promptologue est refusé sans appel aux compétences', async () => {
    const api = atelierApi()
    render(<EpistemiarqueView section={null} deps={{ fetchMeFn: session(['apprenant', 'admin']), api }} />)

    const referentiel = await screen.findByRole('region', { name: 'Les 61 compétences' })
    expect(within(referentiel).getByRole('button', { name: 'Proposer une évolution' })).toBeDefined()
    expect(screen.queryByTestId('epi-sans-role')).toBeNull()
    expect(api.list).toHaveBeenCalledTimes(1)
    expect(api.listDrafts).toHaveBeenCalledTimes(1)
    cleanup()

    const refused = atelierApi()
    render(<EpistemiarqueView section={null} deps={{ fetchMeFn: session(['apprenant', 'promptologue']), api: refused }} />)
    expect((await screen.findByTestId('epi-sans-role')).textContent).toContain('réservé au rôle')
    expect(refused.list).not.toHaveBeenCalled()
    expect(refused.listDrafts).not.toHaveBeenCalled()
  })

  it('UC-EPI-01-U21 — auth/me : API absente → « copie statique » ; erreur serveur (500) → « nécessite une session » (anomalie AN5, figé) ; section inconnue → message et retour', async () => {
    const api = atelierApi()
    render(
      <EpistemiarqueView
        section={null}
        deps={{ fetchMeFn: async () => Promise.reject(new ApiUnavailableError()), api }}
      />,
    )
    expect((await screen.findByTestId('epi-indisponible')).textContent).toContain('Copie statique du site')
    cleanup()

    // Anomalie AN5 (comportement actuel figé) : une panne serveur de auth/me
    // (ApiError 500) est présentée comme une ABSENCE de session — un
    // épistémiarque connecté lit « nécessite une session. Connectez-vous ».
    render(
      <EpistemiarqueView
        section={null}
        deps={{ fetchMeFn: async () => Promise.reject(new ApiError('Erreur serveur (HTTP 500). Réessayez plus tard.', 500)), api }}
      />,
    )
    expect((await screen.findByTestId('epi-anonyme')).textContent).toContain('nécessite une session')
    expect(api.list).not.toHaveBeenCalled()
    cleanup()

    render(<EpistemiarqueView section="foo" deps={{ fetchMeFn: session(['epistemiarque']), api }} />)
    expect((await screen.findByRole('alert')).textContent).toBe('Section inconnue de l’atelier épistémiarque : « foo ».')
    expect(screen.getByRole('link', { name: 'Retour à l’atelier' }).getAttribute('href')).toBe('#/epistemiarque')
    expect(api.list).not.toHaveBeenCalled()
  })
})

describe('UC-EPI-01 — éditeur riche (vue isolée)', () => {
  it('UC-EPI-01-U19 — ListEditor (ajout, édition, suppression), argument employeur et enrichissements : saveDraft reçoit le contenu complet et l’empreinte de base', async () => {
    const content = competenceContent('1.01', 'Pensée Critique', 'Douter méthodiquement.')
    content.identite.marqueurs_fondamentaux = ['marqueur 1 initial', 'marqueur 2 initial']
    const saved = { id: 12, code: '1.01', semver: '1.1.0', status: 'draft', contentHash: 'hash-2' }
    const api = {
      getDraft: vi.fn(async () => ({ id: 12, code: '1.01', semver: '1.1.0', status: 'draft', contentHash: 'hash-base', content })),
      saveDraft: vi.fn(async (_id, doc) => ({ ...saved, content: doc })),
      submitDraft: vi.fn(),
    }
    render(<EpistemiarqueView section="editer/12" deps={{ fetchMeFn: session(['epistemiarque']), api }} />)

    const save = await screen.findByRole('button', { name: 'Enregistrer' })
    expect(save.disabled).toBe(true) // rien à enregistrer tant que rien n'a changé

    // Signaux déclencheurs (passe 1) : ajout d'une ligne vide puis saisie.
    const signaux = screen.getByRole('region', { name: 'Protocole de scan (passe 1)' })
    await click(within(signaux).getByRole('button', { name: '+ Ajouter (ex. j’ai vérifié)' }))
    fireEvent.change(within(signaux).getByLabelText('signal 2'), { target: { value: 'j’ai recoupé' } })
    // Marqueurs fondamentaux : suppression du premier, édition du restant.
    const marqueurs = screen.getByRole('region', { name: 'Marqueurs fondamentaux' })
    await click(within(marqueurs).getByRole('button', { name: 'supprimer marqueur 1' }))
    expect(within(marqueurs).getByLabelText('marqueur 1').value).toBe('marqueur 2 initial')
    fireEvent.change(within(marqueurs).getByLabelText('marqueur 1'), { target: { value: 'marqueur 2 précisé' } })
    fireEvent.change(screen.getByLabelText('Argument employeur'), { target: { value: 'Repère les affirmations non étayées.' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Enrichissements' }), { target: { value: 'Faux positif : « j’ai vérifié mes mails ».' } })

    await click(save)

    expect(api.saveDraft).toHaveBeenCalledTimes(1)
    const [id, doc, baseHash] = api.saveDraft.mock.calls[0]
    expect([id, baseHash]).toEqual(['12', 'hash-base'])
    expect(doc.identite.marqueurs_fondamentaux).toEqual(['marqueur 2 précisé'])
    expect(doc.protocole.passe_1).toEqual({ signaux_declencheurs: ['j’ai vérifié', 'j’ai recoupé'], token_budget: 40 })
    expect(doc.identite.argument_employeur).toBe('Repère les affirmations non étayées.')
    expect(doc.enrichissements).toBe('Faux positif : « j’ai vérifié mes mails ».')
    // Champs non édités : intacts.
    expect([doc.identite.code, doc.identite.nom, doc.identite.definition, doc.fiche]).toEqual([
      '1.01',
      'Pensée Critique',
      'Douter méthodiquement.',
      content.fiche,
    ])
    expect(screen.getByRole('status').textContent).toContain('Compétence enregistrée.')
    expect(save.disabled).toBe(true)
  })
})
