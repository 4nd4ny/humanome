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
    expect(screen.getByText(/Aucune correction en attente\. Les corrections enregistrées/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Proposer la révision' }).disabled).toBe(true)
    // Garde défensive : le formulaire soumis quand même (bouton contourné).
    await act(async () => {
      fireEvent.submit(screen.getByLabelText('Note de révision').closest('form'))
    })
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Aucune correction en attente : corrigez au moins un verdict.',
    )
    expect(net.called('POST api/cartographies/12/revisions')).toHaveLength(0)

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

  it('UC-CAR-04-F14 — E2 : document révisé non conforme au schéma → 5 erreurs listées au plus, révision NON envoyée', async () => {
    const broken = dayDoc()
    delete broken.kairos
    // Six statuts hors énumération en plus : 7 erreurs de schéma au total.
    broken.poles
      .flatMap((p) => p.competences)
      .filter((c) => c.code !== '1.03')
      .slice(0, 6)
      .forEach((c) => {
        c.verdict.statut = 'peut-être'
      })
    const net = stubNetwork({
      'GET api/cartographe/cartographies/12': jsonResponse(200, detailBody({ document: broken })),
    })
    openCartographe('relecture/12')

    await correct('1.03', { statut: 'présence établie', confiance: 0.8 })
    await propose('Révision d’un document abîmé')

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Le document révisé ne respecte pas le schéma : révision non envoyée.',
    )
    const errors = screen.getByTestId('revision-schema-errors')
    expect(errors.textContent).toContain('kairos')
    expect(within(errors).getAllByRole('listitem')).toHaveLength(5)
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
    expect(screen.getByTestId('pending-corrections').textContent).toContain('1.03')
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

describe('UC-CAR-04 — révisions successives et historique', () => {
  const revision20 = () => {
    const revisee = dayDoc()
    comp(revisee, '1.03').verdict.statut = 'présence établie'
    return revisee
  }
  const detailWithRevision20 = () =>
    jsonResponse(
      200,
      detailBody({
        revisions: [{ id: 20, note: 'Première relecture', author: { id: 9, displayName: 'Camille' }, createdAt: '2026-07-05T10:00:00' }],
      }),
    )
  const revision20Response = () =>
    jsonResponse(200, { id: 20, cartographieId: 12, document: revision20(), note: 'Première relecture', author: null, createdAt: '2026-07-05T10:00:00' })

  async function voir() {
    const historique = await screen.findByTestId('revisions-list')
    await act(async () => {
      fireEvent.click(within(historique).getByRole('button', { name: 'Voir' }))
    })
  }

  it('UC-CAR-04-F20 — A5 : révision proposée depuis une révision affichée → document envoyé = révision + nouvelle correction', async () => {
    const net = stubNetwork({
      'GET api/cartographe/cartographies/12': detailWithRevision20(),
      'GET api/revisions/20': revision20Response(),
      'POST api/cartographies/12/revisions': jsonResponse(201, { revisionId: 21 }),
      'GET api/cartographies/12/revisions': jsonResponse(200, []),
    })
    openCartographe('relecture/12')
    await voir()
    expect((await screen.findByTestId('viewing-revision')).textContent).toContain('révision 20')

    await correct('2.01', { statut: 'renvoi au cartographe', confiance: 0.5 })
    await propose('Sur la révision 20')

    const sent = net.called('POST api/cartographies/12/revisions')[0].body.document
    expect(comp(sent, '1.03').verdict.statut).toBe('présence établie') // hérité de la révision 20
    expect(comp(sent, '2.01').verdict).toMatchObject({ statut: 'renvoi au cartographe', confiance: 0.5 })
    expect(sent.poles[0].auditPole.presencesEtablies).toBe(1) // recalculé depuis la révision, pas la base
    expect(validateDocument('cartographie-jour', sent).valid).toBe(true)
  })

  it('UC-CAR-04-F21 — AN12 : POST réussi mais historique non rechargé → erreur, corrections gardées, un nouvel essai reposte (état ACTUEL)', async () => {
    const net = stubNetwork({
      'GET api/cartographe/cartographies/12': jsonResponse(200, detailBody()),
      'POST api/cartographies/12/revisions': jsonResponse(201, { revisionId: 21 }),
      'GET api/cartographies/12/revisions': jsonResponse(500, { error: 'Erreur interne' }),
    })
    openCartographe('relecture/12')

    await correct('1.03', { statut: 'présence établie', confiance: 0.8 })
    await propose('Relue')

    // La révision est stockée (201), mais l'écran affiche un échec…
    expect((await screen.findByRole('alert')).textContent).toBe('Erreur interne')
    expect(screen.getByTestId('pending-corrections').textContent).toContain('1.03')
    expect(screen.queryByTestId('viewing-revision')).toBeNull()
    expect(screen.queryByText(/Révision enregistrée/)).toBeNull()
    // … et un nouvel essai crée un doublon.
    await propose('Relue')
    expect(net.called('POST api/cartographies/12/revisions')).toHaveLength(2)
  })

  it('UC-CAR-04-F22 — AN13 : « Voir » efface les corrections en attente ; « Revenir » les garde et les applique à la base (état ACTUEL)', async () => {
    const net = stubNetwork({
      'GET api/cartographe/cartographies/12': detailWithRevision20(),
      'GET api/revisions/20': revision20Response(),
      'POST api/cartographies/12/revisions': jsonResponse(201, { revisionId: 21 }),
      'GET api/cartographies/12/revisions': jsonResponse(200, []),
    })
    openCartographe('relecture/12')

    // 1. Correction en attente sur la base, puis « Voir » : elle disparaît sans avertissement.
    await correct('2.02', { statut: 'présence établie', confiance: 0.7 })
    expect(screen.getByTestId('pending-corrections').textContent).toContain('2.02')
    await voir()
    expect(await screen.findByTestId('viewing-revision')).toBeTruthy()
    expect(screen.queryByTestId('pending-corrections')).toBeNull()

    // 2. Correction saisie sur la révision 20, puis « Revenir au document d'origine » :
    //    elle reste en attente et s'applique à la BASE.
    await correct('2.01', { statut: 'renvoi au cartographe', confiance: 0.5 })
    fireEvent.click(screen.getByRole('button', { name: 'Revenir au document d’origine' }))
    expect(screen.getByTestId('pending-corrections').textContent).toContain('2.01')
    await propose('Envoyée depuis la base')

    const sent = net.called('POST api/cartographies/12/revisions')[0].body.document
    expect(comp(sent, '2.01').verdict.statut).toBe('renvoi au cartographe')
    expect(comp(sent, '1.03').verdict.statut).toBe('renvoi au cartographe') // le changement de la révision 20 est perdu
  })

  it('UC-CAR-04-F23 — A1/E5 : « Voir » une révision devenue inaccessible → alerte de l’historique, affichage inchangé', async () => {
    stubNetwork({
      'GET api/cartographe/cartographies/12': detailWithRevision20(),
      'GET api/revisions/20': jsonResponse(404, { error: 'Révision introuvable' }),
    })
    openCartographe('relecture/12')
    await voir()

    const historique = screen.getByRole('region', { name: 'Historique des révisions' })
    expect((await within(historique).findByRole('alert')).textContent).toBe('Révision introuvable')
    expect(screen.queryByTestId('viewing-revision')).toBeNull()
  })
})
