// UC-CAR-04 — Corriger une cartographie (révision) : tests FONCTIONNELS (IHM).
// Fiche : docs/cas-utilisation/cartographe/UC-CAR-04-corriger-cartographie.md
//
// L'application ENTIÈRE (<App/>) est ouverte sur #/cartographe/relecture/12 ;
// le cartographe corrige des verdicts par champs contrôlés, compose une
// révision validée par l'engine, l'envoie, relit l'historique. Réseau simulé
// (fetch global) aux formes réelles de l'API ; le faux serveur applique les
// mêmes règles que l'API quand un scénario en dépend (note vide, garantie
// retirée par la révision).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { validateDocument } from '@engine/validation.js'
import { resetApiClient } from '../../../src/api/client.js'
import {
  CSRF,
  dayDoc,
  detailBody,
  jsonResponse,
  mergeDoc,
  noContent,
  openCartographe,
  stubNetwork,
} from '../support/car.js'

beforeEach(() => resetApiClient())

afterEach(() => {
  cleanup()
  window.location.hash = ''
  resetApiClient()
})

const comp = (doc, code) => doc.poles.flatMap((p) => p.competences).find((c) => c.code === code)

async function chooseCompetence(code) {
  fireEvent.change(await screen.findByLabelText('Compétence'), { target: { value: code } })
}

/** Remplit l'éditeur de verdict puis « Enregistrer la correction pour <code> ». */
async function correct(code, { statut, confiance, motif }) {
  await chooseCompetence(code)
  const editor = await screen.findByTestId('correction-editor')
  if (statut) fireEvent.change(within(editor).getByLabelText('Statut'), { target: { value: statut } })
  if (confiance !== undefined) {
    fireEvent.change(within(editor).getByLabelText('Confiance (0 à 1)'), { target: { value: String(confiance) } })
  }
  if (motif !== undefined) fireEvent.change(within(editor).getByLabelText('Motif'), { target: { value: motif } })
  fireEvent.click(within(editor).getByRole('button', { name: `Enregistrer la correction pour ${code}` }))
}

async function propose(note) {
  fireEvent.change(screen.getByLabelText('Note de révision'), { target: { value: note } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Proposer la révision' }))
  })
}

describe('UC-CAR-04 — le cartographe propose une révision', () => {
  it('UC-CAR-04-F11 — nominal (+A4, E1) : éditeur pré-rempli, corrections en attente (dont une retirée), révision validée, envoyée, historisée', async () => {
    let history = []
    const net = stubNetwork({
      'GET api/cartographe/cartographies/12': jsonResponse(200, detailBody()),
      'POST api/cartographies/12/revisions': ({ body }) => {
        history = [{ id: 21, note: body.note, author: { id: 9, displayName: 'Camille' }, createdAt: '2026-07-05T10:00:00' }]
        return jsonResponse(201, { revisionId: 21 })
      },
      'GET api/cartographies/12/revisions': () => jsonResponse(200, history),
    })
    openCartographe('relecture/12')

    // 1. Éditeur pré-rempli avec le verdict du moteur (renvoi 1.03).
    await chooseCompetence('1.03')
    const editor = await screen.findByTestId('correction-editor')
    expect(within(editor).getByLabelText('Statut').value).toBe('renvoi au cartographe')
    expect(within(editor).getByLabelText('Confiance (0 à 1)').value).toBe('0.4')
    expect(within(editor).getByLabelText('Motif').value).toContain('Pièce unique et ambivalente')
    // E1 : tant qu'aucune correction n'est en attente, l'envoi est impossible.
    expect(screen.getByText(/Aucune correction en attente/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Proposer la révision' }).disabled).toBe(true)

    // 2-3. Deux corrections, puis l'une est retirée (A4).
    await correct('1.03', { statut: 'présence établie', confiance: 0.8, motif: 'Note de synthèse retrouvée.' })
    await correct('1.01', { statut: 'renvoi au cartographe', confiance: 0.5 })
    const pending = screen.getByTestId('pending-corrections')
    expect(pending.textContent).toContain('1.03 → présence établie (confiance 80 %)')
    expect(pending.textContent).toContain('1.01 → renvoi au cartographe (confiance 50 %)')
    const ligne101 = within(pending).getAllByRole('listitem').find((li) => li.textContent.includes('1.01'))
    fireEvent.click(within(ligne101).getByRole('button', { name: 'Retirer' }))
    expect(screen.getByTestId('pending-corrections').textContent).not.toContain('1.01')

    // 4-5. Envoi : document complet, validé, note, CSRF.
    await propose('  Renvoi 1.03 tranché après relecture.  ')
    const [post] = net.called('POST api/cartographies/12/revisions')
    expect(post.headers['X-CSRF-Token']).toBe(CSRF)
    expect(post.body.note).toBe('Renvoi 1.03 tranché après relecture.')
    const sent = post.body.document
    expect(sent.kind).toBe('cartographie-jour')
    expect(comp(sent, '1.03').verdict).toMatchObject({ statut: 'présence établie', confiance: 0.8, motif: 'Note de synthèse retrouvée.' })
    expect(comp(sent, '1.01').verdict.statut).toBe('présence non établie') // correction retirée : inchangée
    expect(sent.poles[0].auditPole).toMatchObject({ presencesEtablies: 1, renvoisCartographe: 0 })
    expect(validateDocument('cartographie-jour', sent).valid).toBe(true)

    // 6. Historique rechargé, bascule sur la révision, corrections vidées.
    expect((await screen.findByTestId('viewing-revision')).textContent).toContain('Vous consultez la révision 21.')
    expect(screen.getByText(/Révision enregistrée/)).toBeTruthy()
    const historique = screen.getByTestId('revisions-list')
    expect(historique.textContent).toContain('Camille')
    expect(historique.textContent).toContain('« Renvoi 1.03 tranché après relecture. »')
    expect(screen.queryByTestId('pending-corrections')).toBeNull()
    expect(screen.getByLabelText('Note de révision').value).toBe('')
  })

  it('UC-CAR-04-F12 — A1/A5 : « Voir » une révision de l’historique, la corriger à son tour, revenir à l’origine', async () => {
    const revisee = dayDoc()
    comp(revisee, '1.03').verdict.statut = 'présence établie'
    const net = stubNetwork({
      'GET api/cartographe/cartographies/12': jsonResponse(
        200,
        detailBody({
          revisions: [{ id: 20, note: 'Première relecture', author: { id: 9, displayName: 'Camille' }, createdAt: '2026-07-05T10:00:00' }],
        }),
      ),
      'GET api/revisions/20': jsonResponse(200, { id: 20, cartographieId: 12, document: revisee, note: 'Première relecture', author: null, createdAt: '2026-07-05T10:00:00' }),
    })
    openCartographe('relecture/12')

    const historique = await screen.findByTestId('revisions-list')
    await act(async () => {
      fireEvent.click(within(historique).getByRole('button', { name: 'Voir' }))
    })
    expect((await screen.findByTestId('viewing-revision')).textContent).toContain('Vous consultez la révision 20.')
    expect(net.called('GET api/revisions/20')).toHaveLength(1)

    // L'éditeur part du document AFFICHÉ (la révision), pas de la base.
    await chooseCompetence('1.03')
    expect(within(await screen.findByTestId('correction-editor')).getByLabelText('Statut').value).toBe('présence établie')

    fireEvent.click(screen.getByRole('button', { name: 'Revenir au document d’origine' }))
    expect(screen.queryByTestId('viewing-revision')).toBeNull()
    await waitFor(() =>
      expect(within(screen.getByTestId('correction-editor')).getByLabelText('Statut').value).toBe('renvoi au cartographe'),
    )
  })

  it('UC-CAR-04-F13 — E3 : confiance hors bornes → message, aucune requête', async () => {
    const net = stubNetwork({ 'GET api/cartographe/cartographies/12': jsonResponse(200, detailBody()) })
    openCartographe('relecture/12')

    await correct('1.03', { statut: 'présence établie', confiance: 2 })
    await propose('Trop sûr de moi')

    expect((await screen.findByRole('alert')).textContent).toBe('Confiance hors bornes (0..1) pour 1.03')
    expect(net.calls.some((call) => call.key.startsWith('POST'))).toBe(false)
  })

  it('UC-CAR-04-F14 — E2 : document révisé non conforme au schéma → erreurs listées, révision NON envoyée', async () => {
    const broken = dayDoc()
    delete broken.kairos
    const net = stubNetwork({
      'GET api/cartographe/cartographies/12': jsonResponse(200, detailBody({ document: broken })),
    })
    openCartographe('relecture/12')

    await correct('1.03', { statut: 'présence établie', confiance: 0.8 })
    await propose('Révision d’un document abîmé')

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Le document révisé ne respecte pas le schéma : révision non envoyée.',
    )
    expect(screen.getByTestId('revision-schema-errors').textContent).toContain('kairos')
    expect(net.calls.some((call) => call.key.startsWith('POST'))).toBe(false)
  })

  it('UC-CAR-04-F15 — E4/E5 : refus serveur (422 schéma, 404 accès) → message, corrections conservées', async () => {
    let answer = jsonResponse(422, { error: 'Document invalide au schéma cartographie-jour', fields: { '/poles': ['…'] } })
    stubNetwork({
      'GET api/cartographe/cartographies/12': jsonResponse(200, detailBody()),
      'POST api/cartographies/12/revisions': () => answer,
    })
    openCartographe('relecture/12')

    await correct('1.03', { statut: 'présence établie', confiance: 0.8 })
    await propose('Relue')
    expect((await screen.findByRole('alert')).textContent).toBe('Document invalide au schéma cartographie-jour')
    expect(screen.getByTestId('pending-corrections').textContent).toContain('1.03')

    answer = jsonResponse(404, { error: 'Cartographie introuvable' })
    await propose('Relue')
    expect((await screen.findByRole('alert')).textContent).toBe('Cartographie introuvable')
    expect(screen.queryByTestId('viewing-revision')).toBeNull()
  })

  it('UC-CAR-04-F16 — A6 : parcours (merge) → ni éditeur de verdict ni section « Proposer une révision »', async () => {
    stubNetwork({
      'GET api/cartographe/cartographies/14': jsonResponse(
        200,
        detailBody({ id: 14, type: 'merge', titre: 'Mon parcours', document: mergeDoc() }),
      ),
    })
    openCartographe('relecture/14')
    await chooseCompetence('1.01')

    expect(await screen.findByTestId('annotation-panel')).toBeTruthy()
    expect(screen.queryByTestId('correction-editor')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Proposer une révision' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Historique des révisions' })).toBeTruthy()
  })
})

describe('UC-CAR-04 — anomalies constatées (comportement ACTUEL figé)', () => {
  it('UC-CAR-04-F17 — AN2 : sans note, l’IHM envoie note "" et le serveur refuse (422 « Validation échouée »)', async () => {
    const net = stubNetwork({
      'GET api/cartographe/cartographies/12': jsonResponse(200, detailBody()),
      // Règle réelle de api/src/routes/annotations.php : note chaîne vide -> 422.
      'POST api/cartographies/12/revisions': ({ body }) =>
        body.note === ''
          ? jsonResponse(422, { error: 'Validation échouée', fields: { note: 'Note invalide (500 caractères maximum)' } })
          : jsonResponse(201, { revisionId: 21 }),
    })
    openCartographe('relecture/12')

    await correct('1.03', { statut: 'présence établie', confiance: 0.8 })
    await propose('')

    expect(net.called('POST api/cartographies/12/revisions')[0].body.note).toBe('')
    expect((await screen.findByRole('alert')).textContent).toBe('Validation échouée')
    expect(screen.queryByText(/Révision enregistrée/)).toBeNull()
  })

  it('UC-CAR-04-F18 — AN4 : après une révision, la mention de garantie (retirée côté serveur) reste affichée ; son retrait échoue', async () => {
    let garantie = { par: 'Camille', date: '2026-07-04T09:00:00', revisionId: null }
    stubNetwork({
      'GET api/cartographe/cartographies/12': () => jsonResponse(200, detailBody({ garantie })),
      'POST api/cartographies/12/revisions': () => {
        garantie = null // Revisions::create retire la garantie en place
        return jsonResponse(201, { revisionId: 21 })
      },
      'GET api/cartographies/12/revisions': () =>
        jsonResponse(200, [{ id: 21, note: 'Relue', author: { id: 9, displayName: 'Camille' }, createdAt: '2026-07-05T10:00:00' }]),
      'DELETE api/cartographies/12/garantie': () =>
        garantie === null ? jsonResponse(404, { error: 'Garantie introuvable' }) : noContent(),
    })
    openCartographe('relecture/12')
    expect(await screen.findByTestId('garantie-badge')).toBeTruthy()

    await correct('1.03', { statut: 'présence établie', confiance: 0.8 })
    await propose('Relue')
    await screen.findByText(/Révision enregistrée/)

    // Le serveur n'a plus de garantie, l'écran l'affiche encore.
    expect(screen.getByTestId('garantie-badge').textContent).toContain('garantie par Camille')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retirer ma garantie' }))
    })
    expect((await screen.findByText('Garantie introuvable')).getAttribute('role')).toBe('alert')
  })
})
