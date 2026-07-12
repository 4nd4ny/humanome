import { useRef, useState } from 'react'
import { parseUserDocument } from '../data/load.js'

/**
 * Accueil : présentation sobre + accès à la démo + chargement local d'une
 * cartographie (drag & drop ou sélecteur de fichier). Les fichiers sont lus
 * et validés dans le navigateur, rien n'est envoyé nulle part (cahier §6).
 *
 * @param {{onUserDocument: (result: {kind: string, doc: object}) => void}} props
 */
export default function HomeView({ onUserDocument }) {
  const [error, setError] = useState(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  async function handleFile(file) {
    setError(null)
    if (!file) return
    try {
      const text = await file.text()
      onUserDocument(parseUserDocument(text))
    } catch (e) {
      setError(e)
    }
  }

  return (
    <div className="home">
      <section className="home-hero">
        <h1 className="home-title">humanome.xyz</h1>
        <p className="home-lead">
          humanome.xyz cartographie les compétences humaines à partir d’un portfolio réflexif,
          sur la base du référentiel RESPIRE — 61 compétences réparties en 7 pôles.
        </p>
        <p className="home-lead">
          Chaque cartographie est produite par des prompts versionnés, examinée de façon
          adversariale, puis relue et garantie par des cartographes humains.
        </p>
        <p className="home-lead">
          Le résultat est un diagramme évolutif dans le temps, jour après jour, que l’apprenant
          peut explorer, imprimer et choisir de partager.
        </p>
        <p className="home-actions">
          <a className="button button-primary" href="#/merge">
            Explorer la cartographie de démonstration
          </a>
          <a className="button" href="#/essayer">
            Essayer avec votre propre texte
          </a>
          <button
            type="button"
            className="button"
            onClick={() => inputRef.current?.click()}
          >
            Charger ma cartographie (JSON)
          </button>
        </p>
      </section>

      <section
        className={`dropzone${dragging ? ' dropzone-active' : ''}`}
        data-testid="dropzone"
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          handleFile(event.dataTransfer?.files?.[0])
        }}
      >
        <p>
          Déposez ici un document <code>cartographie-merge</code> ou{' '}
          <code>cartographie-jour</code> (JSON), ou utilisez le bouton ci-dessus.
        </p>
        <p className="privacy-note">
          Vos fichiers ne quittent pas votre navigateur : lecture et validation sont entièrement
          locales.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          className="visually-hidden"
          aria-label="Charger ma cartographie (JSON)"
          onChange={(event) => {
            handleFile(event.target.files?.[0])
            event.target.value = ''
          }}
        />
      </section>

      {error ? (
        <section className="load-error" role="alert">
          <p>{error.message}</p>
          {error.validationErrors ? (
            <ul>
              {error.validationErrors.slice(0, 8).map((ve, i) => (
                <li key={i}>
                  <code>{ve.path}</code> — {ve.message}
                </li>
              ))}
              {error.validationErrors.length > 8 ? (
                <li>… et {error.validationErrors.length - 8} autres erreurs.</li>
              ) : null}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
