// UC-EPI-01 — Proposer une modification de compétence : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/epistemiarque/UC-EPI-01-proposer-modification-competence.md
//
// Le scénario est joué sur l'application ENTIÈRE (<App/>) comme le ferait un
// épistémiarque : il ouvre #/epistemiarque, propose l'évolution d'une
// compétence, l'édite, l'enregistre puis la soumet au vote. Seul le réseau est
// simulé, par un faux serveur à état qui suit le contrat de l'API compétences
// (web/test/usecases/support/epi.js) ; le module sunburst est le faux module.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import App from '../../../src/App.jsx'
import { resetApiClient } from '../../../src/api/client.js'
import * as fakeLib from '../../../src/test/fake-sunburst-lib.js'
import { CSRF, createEpiBackend, htmlResponse, jsonResponse } from '../support/epi.js'

const IRIS = { id: 42, displayName: 'Iris', roles: ['apprenant', 'epistemiarque'] }
const PUBLISHED = [
  { code: '1.01', nom: 'Pensée Critique', pole: 1, definition: 'Douter méthodiquement.' },
  { code: '2.01', nom: 'Écoute', pole: 2 },
]

function start(backend, hash = '#/epistemiarque') {
  vi.stubGlobal('fetch', backend.fetchMock)
  window.location.hash = hash
  render(<App lib={fakeLib} />)
}

/** Ligne de l'atelier d'une compétence (liste par pôle). */
async function competenceRow(code) {
  await screen.findByRole('heading', { name: /Le référentiel \(\d+ compétences\)/ })
  const section = screen.getByRole('region', { name: 'Les 61 compétences' })
  return within(section).getByText(code).closest('li')
}

async function click(element) {
  await act(async () => {
    fireEvent.click(element)
  })
}

beforeEach(() => resetApiClient())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.location.hash = ''
  resetApiClient()
})

describe('UC-EPI-01 — l’épistémiarque propose l’évolution d’une compétence', () => {
  it('UC-EPI-01-F14 — nominal : proposer, éditer (If-Match), enregistrer puis soumettre au vote avec un fil Decidim', async () => {
    const backend = createEpiBackend({ me: IRIS, published: PUBLISHED })
    start(backend)

    // 1-2. L'atelier liste les compétences par pôle.
    const row = await competenceRow('1.01')
    expect(screen.getByRole('heading', { name: /TÊTE/ })).toBeDefined()
    expect(within(row).getByText('v1.0.0')).toBeDefined()

    // 3-4. « Proposer une évolution » : fork en version mineure suivante.
    await click(within(row).getByRole('button', { name: 'Proposer une évolution' }))
    const [fork] = backend.callsTo('POST', /^api\/competences\/1\.01\/drafts$/)
    expect(fork.body).toEqual({ semver: '1.1.0' })
    expect(fork.headers['X-CSRF-Token']).toBe(CSRF)

    // 5. L'éditeur s'ouvre sur le brouillon.
    const definition = await screen.findByLabelText('Définition')
    expect(window.location.hash).toMatch(/^#\/epistemiarque\/editer\/\d+$/)
    expect(screen.getByRole('heading', { name: /1\.01 Édition — v1\.1\.0/ })).toBeDefined()
    const draftId = Number(window.location.hash.split('/').pop())
    const baseHash = backend.versions.get(draftId).contentHash
    // Oracle INDÉPENDANT du PUT : le contenu tel que chargé, capturé AVANT l'enregistrement.
    const base = structuredClone(backend.versions.get(draftId).content)
    expect(base.fiche).toMatch(/^## 1\.01/)

    // 6-7. Édition puis « Enregistrer » avec If-Match = empreinte chargée.
    fireEvent.change(screen.getByLabelText('Nom de la compétence'), { target: { value: 'Pensée Critique & Anti-Hallucination' } })
    fireEvent.change(definition, { target: { value: 'Douter méthodiquement, y compris de soi.' } })
    await click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect((await screen.findByRole('status')).textContent).toContain('Compétence enregistrée.')
    const [put] = backend.callsTo('PUT', new RegExp(`^api/competences/drafts/${draftId}$`))
    expect(put.headers['If-Match']).toBe(baseHash)
    expect(put.body.identite.nom).toBe('Pensée Critique & Anti-Hallucination')
    expect(put.body.identite.definition).toBe('Douter méthodiquement, y compris de soi.')
    // Contenu COMPLET : les champs non édités repartent intacts (fiche de scan comprise).
    expect(put.body.fiche).toBe(base.fiche)
    expect(put.body.protocole).toEqual(base.protocole)
    expect(put.body.identite.marqueurs_fondamentaux).toEqual(base.identite.marqueurs_fondamentaux)
    expect(put.body.identite.argument_employeur).toBe(base.identite.argument_employeur)
    expect(put.body.identite.code).toBe('1.01')

    // 8-9. Lien Decidim puis « Soumettre au vote ».
    fireEvent.change(screen.getByLabelText('Lien Decidim (optionnel)'), {
      target: { value: 'https://participer.harmonia.education/processes/referentiel/f/12/debates/7' },
    })
    await click(screen.getByRole('button', { name: 'Soumettre au vote' }))
    const [submit] = backend.callsTo('POST', /\/submit$/)
    expect(submit.body).toEqual({ decidimUrl: 'https://participer.harmonia.education/processes/referentiel/f/12/debates/7' })
    expect(backend.callsTo('PUT', /drafts/)).toHaveLength(1) // rien de neuf à enregistrer avant la soumission

    // 10. La page de vote s'ouvre : proposition au vote, fil Decidim joint.
    expect(await screen.findByText('au vote')).toBeDefined()
    expect(window.location.hash).toBe(`#/epistemiarque/proposition/${draftId}`)
    const decidim = screen.getByRole('link', { name: 'Débattre sur Decidim' })
    expect(decidim.getAttribute('href')).toBe('https://participer.harmonia.education/processes/referentiel/f/12/debates/7')
    expect(screen.getByText(/\(fil joint\)/)).toBeDefined()
  })

  it('UC-EPI-01-F15 — A1 : retirer la proposition rouvre l’éditeur (brouillon)', async () => {
    const backend = createEpiBackend({ me: IRIS, published: PUBLISHED })
    const id = backend.seedProposal('1.01', '1.1.0')
    start(backend, `#/epistemiarque/proposition/${id}`)

    await click(await screen.findByRole('button', { name: /Retirer la proposition/ }))

    expect(backend.callsTo('POST', new RegExp(`drafts/${id}/withdraw$`))).toHaveLength(1)
    expect(await screen.findByLabelText('Définition')).toBeDefined()
    expect(window.location.hash).toBe(`#/epistemiarque/editer/${id}`)
    expect(backend.versions.get(id).status).toBe('draft')
  })

  it('UC-EPI-01-F16 — A4 : ouvrir l’éditeur d’une proposition au vote affiche le gel et renvoie à la page de vote', async () => {
    const backend = createEpiBackend({ me: IRIS, published: PUBLISHED })
    const id = backend.seedProposal('1.01', '1.1.0')
    start(backend, `#/epistemiarque/editer/${id}`)

    expect((await screen.findByRole('alert')).textContent).toContain('ouverte au vote')
    expect(screen.queryByLabelText('Définition')).toBeNull()
    expect(screen.getByRole('link', { name: 'Aller à la page de vote' }).getAttribute('href')).toBe(
      `#/epistemiarque/proposition/${id}`,
    )
    // L'atelier signale la compétence comme « déjà en cours d'édition » (plus de bouton Proposer).
    window.location.hash = '#/epistemiarque'
    const row = await competenceRow('1.01')
    expect(within(row).getByText('déjà en cours d’édition')).toBeDefined()
    expect(within(row).queryByRole('button', { name: 'Proposer une évolution' })).toBeNull()
  })

  it('UC-EPI-01-F17 — A3 : soumettre avec des modifications non enregistrées les enregistre d’abord, sans lien Decidim', async () => {
    const backend = createEpiBackend({ me: IRIS, published: PUBLISHED })
    start(backend)
    await click(within(await competenceRow('2.01')).getByRole('button', { name: 'Proposer une évolution' }))
    fireEvent.change(await screen.findByLabelText('Fiche de scan'), { target: { value: '## 2.01 — Écoute\n\nÉcouter activement.\n\n---' } })

    await click(screen.getByRole('button', { name: 'Soumettre au vote' }))

    expect(await screen.findByText('au vote')).toBeDefined()
    const sequence = backend.calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.url.replace(/\d{3}/, '<id>')}`)
    expect(sequence).toEqual([
      'POST api/competences/2.01/drafts',
      'PUT api/competences/drafts/<id>',
      'POST api/competences/drafts/<id>/submit',
    ])
    expect(backend.callsTo('PUT', /drafts/)[0].body.fiche).toBe('## 2.01 — Écoute\n\nÉcouter activement.\n\n---')
    expect(backend.callsTo('POST', /\/submit$/)[0].body).toEqual({})
    expect(screen.queryByText(/\(fil joint\)/)).toBeNull()
    // Sans lien, la proposition renvoie à l'espace Decidim général.
    expect(screen.getByRole('link', { name: 'Débattre sur Decidim' }).getAttribute('href')).toBe(
      'https://participer.harmonia.education',
    )
  })

  it('UC-EPI-01-F18 — E1/E2 : sans session, sans rôle, ou copie statique sans API → l’atelier est refusé avec un message', async () => {
    let backend = createEpiBackend({ me: null, published: PUBLISHED })
    start(backend)
    expect((await screen.findByTestId('epi-anonyme')).textContent).toContain('nécessite une session')
    expect(backend.callsTo('GET', /^api\/competences/)).toHaveLength(0)
    cleanup()

    backend = createEpiBackend({ me: { id: 3, displayName: 'Maya', roles: ['apprenant'] }, published: PUBLISHED })
    start(backend)
    expect((await screen.findByTestId('epi-sans-role')).textContent).toContain('réservé au rôle')
    expect(backend.callsTo('GET', /^api\/competences/)).toHaveLength(0)
    cleanup()

    backend = createEpiBackend({ me: IRIS, published: PUBLISHED })
    backend.override('GET', /^api\/auth\/me$/, () => htmlResponse(404))
    start(backend)
    expect((await screen.findByTestId('epi-indisponible')).textContent).toContain('Copie statique du site')
    expect(backend.callsTo('GET', /^api\/competences/)).toHaveLength(0)
  })

  it('UC-EPI-01-F19 — E7 : un autre épistémiarque a enregistré entre-temps → 409, message et bouton « Recharger »', async () => {
    const backend = createEpiBackend({ me: IRIS, published: PUBLISHED })
    start(backend)
    await click(within(await competenceRow('1.01')).getByRole('button', { name: 'Proposer une évolution' }))
    const definition = await screen.findByLabelText('Définition')
    const draftId = Number(window.location.hash.split('/').pop())
    // Noé enregistre la même compétence pendant qu'Iris édite : l'empreinte change.
    backend.versions.get(draftId).contentHash = 'hash-noe'

    fireEvent.change(definition, { target: { value: 'Version d’Iris' } })
    await click(screen.getByRole('button', { name: 'Enregistrer' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('modifiée par un autre épistémiarque')
    expect(alert.textContent).toContain('Rechargez pour récupérer la dernière version.')
    expect(within(alert).getByRole('button', { name: 'Recharger' })).toBeDefined()
  })

  it('UC-EPI-01-F20 — E5/E10 : fork refusé (409) signalé sur la ligne ; lien Decidim refusé (422) sans quitter l’éditeur', async () => {
    // Anomalie AN2 (comportement actuel figé) : le 409 de doublon porte un
    // message serveur ANGLAIS (CompetenceRepository::createDraft), que
    // l'atelier affiche tel quel (errorMessage → serverMessage).
    const backend = createEpiBackend({ me: IRIS, published: PUBLISHED })
    backend.override('POST', /^api\/competences\/2\.01\/drafts$/, () =>
      jsonResponse(409, { error: 'Competence 2.01@1.1.0 already exists' }),
    )
    start(backend)

    const row = await competenceRow('2.01')
    await click(within(row).getByRole('button', { name: 'Proposer une évolution' }))
    expect((await within(row).findByRole('alert')).textContent).toBe('Competence 2.01@1.1.0 already exists')
    expect(window.location.hash).toBe('#/epistemiarque')

    await click(within(await competenceRow('1.01')).getByRole('button', { name: 'Proposer une évolution' }))
    await screen.findByLabelText('Définition')
    const editorHash = window.location.hash
    fireEvent.change(screen.getByLabelText('Lien Decidim (optionnel)'), { target: { value: 'ftp://participer.harmonia.education/x' } })
    await click(screen.getByRole('button', { name: 'Soumettre au vote' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Le lien Decidim doit être une URL http(s) valide.')
    expect(window.location.hash).toBe(editorHash)
    expect(backend.versions.get(Number(editorHash.split('/').pop())).status).toBe('draft')
  })
})

describe('UC-EPI-01 — section inconnue de l’atelier (E14)', () => {
  /** Ouvre <App/> : session du shell par fetchMeFn, celle de la vue par le faux serveur. */
  function openAs(backend, me, hash) {
    vi.stubGlobal('fetch', backend.fetchMock)
    window.location.hash = hash
    render(<App lib={fakeLib} fetchMeFn={async () => ({ user: me })} />)
  }

  const HASH = '#/epistemiarque/%3Cimg%20src%3Dx%3E'

  it('UC-EPI-01-F21 — E14 : section inconnue → alerte citant le segment décodé en texte, lien de retour ; aucun appel aux compétences ; admin (A5) : même repli ; sans rôle : refus', async () => {
    const backend = createEpiBackend({ me: IRIS, published: PUBLISHED })
    openAs(backend, IRIS, HASH)

    const alert = await screen.findByRole('alert')
    // Segment décodé (parseHash) puis rendu comme TEXTE : aucune balise créée.
    expect(alert.textContent).toBe('Section inconnue de l’atelier épistémiarque : « <img src=x> ».')
    expect(document.querySelector('.epi img')).toBeNull()
    const back = screen.getByRole('link', { name: 'Retour à l’atelier' })
    expect(back.getAttribute('href')).toBe('#/epistemiarque')
    expect(screen.queryByRole('region', { name: 'Les 61 compétences' })).toBeNull()
    await act(async () => {})
    expect(backend.calls.map((c) => `${c.method} ${c.url}`)).toEqual(['GET api/auth/me'])

    // Le lien de retour rouvre l'atelier, qui charge alors compétences et brouillons.
    fireEvent.click(back)
    expect(await competenceRow('1.01')).toBeDefined()
    expect(window.location.hash).toBe('#/epistemiarque')
    expect(screen.queryByText(/Section inconnue/)).toBeNull()
    expect(backend.callsTo('GET', /^api\/competences$/)).toHaveLength(1)
    expect(backend.callsTo('GET', /^api\/auth\/me$/)).toHaveLength(1)
    cleanup()
    vi.unstubAllGlobals()

    // Administrateur sans rôle épistémiarque (A5) : il passe la garde, donc
    // voit le même repli.
    const admin = { id: 1, displayName: 'Root', roles: ['admin'] }
    const adminBackend = createEpiBackend({ me: admin, published: PUBLISHED })
    openAs(adminBackend, admin, HASH)
    expect((await screen.findByRole('alert')).textContent).toBe('Section inconnue de l’atelier épistémiarque : « <img src=x> ».')
    expect(adminBackend.callsTo('GET', /^api\/competences/)).toHaveLength(0)
    cleanup()
    vi.unstubAllGlobals()

    // Compte sans rôle : la garde passe AVANT le dispatch → refus, pas le repli.
    const maya = { id: 3, displayName: 'Maya', roles: ['apprenant'] }
    const refused = createEpiBackend({ me: maya, published: PUBLISHED })
    openAs(refused, maya, HASH)
    expect((await screen.findByTestId('epi-sans-role')).textContent).toContain('réservé au rôle')
    expect(screen.queryByText(/Section inconnue/)).toBeNull()
    expect(refused.calls.map((c) => `${c.method} ${c.url}`)).toEqual(['GET api/auth/me'])
    cleanup()
    vi.unstubAllGlobals()

    // Comportement ACTUEL (anomalie AN1 de UC-VIS-02, commune aux routes à
    // section) : un segment au pourcentage mal formé n'atteint pas ce repli.
    // App calcule sa route au premier rendu (useState(currentRoute)) : le
    // rendu lui-même lève une URIError — ni shell, ni sonde de session.
    const broken = createEpiBackend({ me: IRIS, published: PUBLISHED })
    vi.stubGlobal('fetch', broken.fetchMock)
    const shellMe = vi.fn(async () => ({ user: IRIS }))
    window.location.hash = '#/epistemiarque/100%'
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(() => render(<App lib={fakeLib} fetchMeFn={shellMe} />)).toThrow(URIError)
    } finally {
      consoleError.mockRestore()
    }
    expect(document.body.textContent).toBe('')
    expect(shellMe).not.toHaveBeenCalled()
    expect(broken.calls).toEqual([])
  })
})
