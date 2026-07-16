import { useEffect, useState } from 'react'
import {
  API_UNAVAILABLE_MESSAGE,
  ApiError,
  ApiUnavailableError,
  deleteAccount,
  fetchMe,
  login,
  logout,
  register,
} from '../api/client.js'
import ApiKeysSection from './account/ApiKeysSection.jsx'

const PASSWORD_MIN_LENGTH = 10

/** Rôles P3 (cahier §2) -> libellés d'affichage. */
const ROLE_LABELS = {
  apprenant: 'Apprenant',
  cartographe: 'Cartographe',
  promptologue: 'Promptologue',
  epistemiarque: 'Épistémiarque',
  employeur: 'Employeur',
  etablissement: 'Établissement',
  admin: 'Administrateur',
}

/**
 * Espace compte (#/compte). La session n'est vérifiée qu'au montage de CETTE
 * route (GET api/auth/me) : le reste du site reste 100 % statique. Quatre
 * états : vérification, API indisponible (copie statique), anonyme
 * (connexion / inscription), connecté (profil + déconnexion + zone de danger
 * RGPD avec purge réelle, cahier §6.3).
 */
export default function AccountView() {
  const [status, setStatus] = useState('loading') // loading | unavailable | anonymous | authenticated
  const [unavailableMessage, setUnavailableMessage] = useState(API_UNAVAILABLE_MESSAGE)
  const [user, setUser] = useState(null)
  const [notice, setNotice] = useState(null)

  // Formulaires anonymes.
  const [mode, setMode] = useState('login') // login | register
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)

  // Zone de danger.
  const [confirmEmail, setConfirmEmail] = useState('')
  const [accountError, setAccountError] = useState(null)

  useEffect(() => {
    let alive = true
    fetchMe()
      .then(({ user: me }) => {
        if (!alive) return
        setUser(me)
        setStatus(me ? 'authenticated' : 'anonymous')
      })
      .catch((error) => {
        if (!alive) return
        setUnavailableMessage(
          error instanceof ApiUnavailableError
            ? error.message
            : 'Impossible de vérifier votre session pour le moment. Réessayez plus tard.',
        )
        setStatus('unavailable')
      })
    return () => {
      alive = false
    }
  }, [])

  function becomeAnonymous(message) {
    setUser(null)
    setStatus('anonymous')
    setNotice(message ?? null)
    setMode('login')
    setPassword('')
    setConfirmEmail('')
    setFormError(null)
    setAccountError(null)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError(null)
    setNotice(null)

    const cleanEmail = email.trim()
    if (cleanEmail === '') {
      setFormError('Indiquez votre adresse email.')
      return
    }
    if (mode === 'register' && displayName.trim() === '') {
      setFormError('Indiquez le nom qui sera affiché sur votre profil.')
      return
    }
    if (mode === 'register' && password.length < PASSWORD_MIN_LENGTH) {
      setFormError(`Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`)
      return
    }
    if (mode === 'login' && password === '') {
      setFormError('Indiquez votre mot de passe.')
      return
    }

    setBusy(true)
    try {
      const data =
        mode === 'login'
          ? await login({ email: cleanEmail, password })
          : await register({ email: cleanEmail, password, displayName: displayName.trim() })
      setUser(data.user ?? { email: cleanEmail, displayName: displayName.trim(), roles: [] })
      setStatus('authenticated')
      setNotice(mode === 'register' ? 'Compte créé, bienvenue !' : null)
      setPassword('')
    } catch (error) {
      setFormError(submitErrorMessage(error, mode))
    } finally {
      setBusy(false)
    }
  }

  async function handleLogout() {
    setAccountError(null)
    setBusy(true)
    try {
      await logout()
      becomeAnonymous('Vous êtes déconnecté.')
    } catch (error) {
      if (error instanceof ApiUnavailableError) becomeAnonymous('Vous êtes déconnecté.')
      else setAccountError(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setAccountError(null)
    setBusy(true)
    try {
      await deleteAccount()
      becomeAnonymous(
        'Votre compte a été supprimé : toutes vos données serveur ont été réellement purgées ' +
          '(un événement d’audit anonyme en garde la trace, conformément au RGPD).',
      )
    } catch (error) {
      setAccountError(error.message)
    } finally {
      setBusy(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="account">
        <h1>Compte</h1>
        <p className="account-loading">Vérification de la session…</p>
      </div>
    )
  }

  if (status === 'unavailable') {
    return (
      <div className="account">
        <h1>Compte</h1>
        <p className="account-unavailable" role="status">
          {unavailableMessage}
        </p>
      </div>
    )
  }

  if (status === 'authenticated' && user) {
    const roles = Array.isArray(user.roles) ? user.roles : []
    return (
      <div className="account">
        <h1>Compte</h1>
        {notice ? (
          <p className="account-notice" role="status">
            {notice}
          </p>
        ) : null}
        <section className="account-profile" aria-label="Profil">
          <h2>Profil</h2>
          <dl>
            <div className="account-row">
              <dt>Email</dt>
              <dd>{user.email}</dd>
            </div>
            <div className="account-row">
              <dt>Nom affiché</dt>
              <dd>{user.displayName}</dd>
            </div>
            <div className="account-row">
              <dt>Rôles</dt>
              <dd>
                {roles.length > 0
                  ? roles.map((role) => ROLE_LABELS[role] ?? role).join(', ')
                  : 'Aucun rôle attribué pour l’instant'}
              </dd>
            </div>
          </dl>
          <button type="button" className="button" onClick={handleLogout} disabled={busy}>
            Se déconnecter
          </button>
        </section>
        <ApiKeysSection />
        <section className="account-danger" aria-label="Zone de danger">
          <h2>Zone de danger</h2>
          <p>
            La suppression de votre compte est immédiate et définitive : purge réelle de toutes
            vos données serveur (profil, rôles, progression, clés API, partages), consignée par
            un événement d’audit (RGPD). Vos fichiers locaux (cartographies exportées) ne sont
            pas concernés.
          </p>
          <label htmlFor="account-delete-confirm">
            Pour confirmer, saisissez votre email ({user.email}) :
          </label>
          <input
            id="account-delete-confirm"
            type="text"
            inputMode="email"
            autoComplete="off"
            value={confirmEmail}
            onChange={(event) => setConfirmEmail(event.target.value)}
          />
          <button
            type="button"
            className="button button-danger"
            onClick={handleDelete}
            disabled={busy || confirmEmail.trim() !== user.email}
          >
            Supprimer mon compte
          </button>
        </section>
        {accountError ? (
          <p className="load-error" role="alert">
            {accountError}
          </p>
        ) : null}
      </div>
    )
  }

  // Anonyme : connexion / inscription.
  return (
    <div className="account">
      <h1>Compte</h1>
      {notice ? (
        <p className="account-notice" role="status">
          {notice}
        </p>
      ) : null}
      <div className="account-tabs">
        <button
          type="button"
          className={`button${mode === 'login' ? ' button-primary' : ''}`}
          onClick={() => {
            setMode('login')
            setFormError(null)
          }}
        >
          Connexion
        </button>
        <button
          type="button"
          className={`button${mode === 'register' ? ' button-primary' : ''}`}
          onClick={() => {
            setMode('register')
            setFormError(null)
          }}
        >
          Inscription
        </button>
      </div>
      <form className="account-form" onSubmit={handleSubmit} noValidate>
        {mode === 'register' ? (
          <label>
            Nom affiché
            <input
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              autoComplete="name"
            />
          </label>
        ) : null}
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
          />
        </label>
        <label>
          Mot de passe
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            minLength={mode === 'register' ? PASSWORD_MIN_LENGTH : undefined}
          />
          {mode === 'register' ? (
            <span className="field-hint">{PASSWORD_MIN_LENGTH} caractères minimum.</span>
          ) : null}
        </label>
        {formError ? (
          <p className="load-error" role="alert">
            {formError}
          </p>
        ) : null}
        <button type="submit" className="button button-primary" disabled={busy}>
          {mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
        </button>
      </form>
      <p className="privacy-note">
        Aucun contenu de portfolio n’est stocké sur le serveur par défaut : le compte ne
        conserve que votre profil, vos rôles et votre progression. Tout stockage
        supplémentaire est un choix explicite (opt-in), réversible à tout moment.
      </p>
    </div>
  )
}

/** @returns {string} French message adapted to the form and error. */
function submitErrorMessage(error, mode) {
  if (error instanceof ApiUnavailableError) return error.message
  if (error instanceof ApiError) {
    if (error.status === 401 && mode === 'login') return 'Email ou mot de passe incorrect.'
    if (error.fields && typeof error.fields === 'object') {
      // Validation serveur : détails par champ ({email: message, ...}).
      const details = Object.values(error.fields).filter((value) => typeof value === 'string')
      if (details.length > 0) return details.join(' ')
    }
    return error.message // messages API déjà en français (dont le 429 rate-limit)
  }
  return 'Une erreur inattendue est survenue. Réessayez.'
}
