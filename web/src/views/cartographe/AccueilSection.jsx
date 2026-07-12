// Accueil de l'espace cartographe (P9.1) : accepter une invitation (code émis
// par un apprenant depuis son espace), mes apprentis rattachés, file des
// cartographies à relire (visibility cartographe|publique des apprentis liés).
// La garde de rôle est faite par CartographeView : ici l'utilisateur EST
// cartographe.

import { useCallback, useEffect, useState } from 'react'
import {
  acceptInvitation,
  fetchApprentis,
  fetchQueue,
  frDate,
  typeLabel,
} from './cartographe-api.js'

// Alphabet du contrat M7 : 10 caractères A-Z2-9 (pas de 0/O ni 1/I).
const CODE_RE = /^[A-Z2-9]{10}$/

/**
 * @param {{fetchFn?: typeof fetch}} props seam de test (pattern CartographiesPanel)
 */
export default function AccueilSection({ fetchFn }) {
  const [apprentis, setApprentis] = useState(null) // null = chargement
  const [queue, setQueue] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [code, setCode] = useState('')
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteError, setInviteError] = useState(null)
  const [inviteInfo, setInviteInfo] = useState(null)

  const reload = useCallback(async () => {
    setLoadError(null)
    try {
      const [nextApprentis, nextQueue] = await Promise.all([
        fetchApprentis(fetchFn),
        fetchQueue(fetchFn),
      ])
      setApprentis(nextApprentis)
      setQueue(nextQueue)
    } catch (error) {
      setApprentis((current) => current ?? [])
      setQueue((current) => current ?? [])
      setLoadError(error.message)
    }
  }, [fetchFn])

  useEffect(() => {
    reload()
  }, [reload])

  async function submitInvitation(event) {
    event.preventDefault()
    setInviteError(null)
    setInviteInfo(null)
    const normalized = code.trim().toUpperCase()
    if (!CODE_RE.test(normalized)) {
      setInviteError('Le code d’invitation comporte 10 caractères (lettres A-Z, chiffres 2-9).')
      return
    }
    setInviteBusy(true)
    try {
      await acceptInvitation(normalized, fetchFn)
      setCode('')
      setInviteInfo('Invitation acceptée : l’apprenant est maintenant rattaché à vous.')
      await reload()
    } catch (error) {
      setInviteError(error.message)
    } finally {
      setInviteBusy(false)
    }
  }

  return (
    <div className="cartographe-accueil">
      <section className="cartographe-invitation" aria-label="Accepter une invitation">
        <h2>Accepter une invitation</h2>
        <p>
          Un apprenant génère un code d’invitation depuis son espace ; en l’acceptant, vous
          devenez son cartographe et ses cartographies partagées apparaissent dans votre file.
        </p>
        <form onSubmit={submitInvitation} className="cartographe-invitation-form">
          <label htmlFor="invitation-code">Code d’invitation</label>
          <input
            id="invitation-code"
            name="invitation-code"
            type="text"
            autoComplete="off"
            maxLength={10}
            placeholder="ex. K7TQZ2M9RC"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
          <button type="submit" className="button" disabled={inviteBusy}>
            {inviteBusy ? 'Acceptation…' : 'Accepter l’invitation'}
          </button>
        </form>
        {inviteError ? (
          <p role="alert" className="load-error">
            {inviteError}
          </p>
        ) : null}
        {inviteInfo ? (
          <p role="status" className="account-notice">
            {inviteInfo}
          </p>
        ) : null}
      </section>

      <section className="cartographe-apprentis" aria-label="Mes apprentis">
        <h2>Mes apprentis</h2>
        {apprentis === null ? (
          <p role="status">Chargement…</p>
        ) : apprentis.length === 0 ? (
          <p className="privacy-note">
            Aucun apprenant rattaché pour l’instant : acceptez une invitation ci-dessus.
          </p>
        ) : (
          <ul data-testid="apprentis-list">
            {apprentis.map((apprenti) => (
              <li key={apprenti.id ?? apprenti.displayName}>
                <strong>{apprenti.displayName ?? apprenti.email ?? '—'}</strong>
                {apprenti.linkedAt ? ` — rattaché le ${frDate(apprenti.linkedAt)}` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="cartographe-file" aria-label="Cartographies à relire">
        <h2>Cartographies à relire</h2>
        {loadError ? (
          <p role="alert" className="load-error">
            {loadError}
          </p>
        ) : null}
        {queue === null ? (
          <p role="status">Chargement…</p>
        ) : queue.length === 0 ? (
          <p className="privacy-note">
            Aucune cartographie dans votre file : vos apprentis n’ont encore rien partagé avec
            vous (confidentialité « partagée avec mon cartographe » ou « publique »).
          </p>
        ) : (
          <div className="table-scroll">
            <table data-testid="cartographe-queue">
              <thead>
                <tr>
                  <th scope="col">Titre</th>
                  <th scope="col">Apprenant</th>
                  <th scope="col">Type</th>
                  <th scope="col">Déposée le</th>
                  <th scope="col">Garantie</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {queue.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.titre}</td>
                    <td>{entry.apprenant?.displayName ?? '—'}</td>
                    <td>{typeLabel(entry.type)}</td>
                    <td>{frDate(entry.createdAt)}</td>
                    <td>
                      {entry.garantie ? (
                        <span className="verdict-badge etablie">
                          Garantie{entry.garantie.par ? ` par ${entry.garantie.par}` : ''}
                        </span>
                      ) : (
                        <span className="verdict-badge renvoi">À relire</span>
                      )}
                    </td>
                    <td>
                      <a className="button" href={`#/cartographe/relecture/${entry.id}`}>
                        Relire
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {queue !== null && queue.length >= 2 ? (
          <p>
            <a href="#/cartographe/comparer">Comparer deux cartographies d’un même apprenant →</a>
            {' · '}
            <a href="#/cartographe/consistance">Analyser la consistance multi-run →</a>
          </p>
        ) : null}
      </section>
    </div>
  )
}
