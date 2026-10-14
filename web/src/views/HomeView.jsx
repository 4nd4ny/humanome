import { useRef, useState } from 'react'
import FamilyTiles from '../components/FamilyTiles.jsx'
import { filesFromDataTransfer, readFiles } from '../carto/ui/ImportPanel.jsx'

/**
 * Accueil : présentation sobre + tuiles du plan du site filtrées par la
 * session (landing de profil, refonte 2026-07) + ouverture de fichiers de
 * cartographie (dépôt ou sélecteur) : ils sont lus dans le navigateur et
 * remis à l'interface de cartographie (#/cartographie), qui les reconnaît et
 * les importe dans un nouveau jeu — rien n'est envoyé nulle part (cahier §6).
 * Depuis le 2026-10-14, l'interface V3 (#/merge) est retirée.
 *
 * @param {{onUserFiles: (files: Array<{path: string, bytes: Uint8Array}>) => void,
 *   roles?: string[]}} props
 */
export default function HomeView({ onUserFiles, roles = [] }) {
  const [error, setError] = useState(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  async function handleFiles(read) {
    setError(null)
    try {
      const files = await read
      if (files.length > 0) onUserFiles(files)
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
          <a className="button button-primary" href="#/cartographie">
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
            Ouvrir mes fichiers de cartographie
          </button>
        </p>
      </section>

      <FamilyTiles roles={roles} />

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
          if (event.dataTransfer) handleFiles(filesFromDataTransfer(event.dataTransfer))
        }}
      >
        <p>
          Déposez ici vos fichiers de cartographie (journées, merge, archive, portfolio), ou
          utilisez le bouton ci-dessus : ils s’ouvrent dans la cartographie.
        </p>
        <p className="privacy-note">
          Vos fichiers ne quittent pas votre navigateur : lecture et reconnaissance sont
          entièrement locales.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="visually-hidden"
          aria-label="Ouvrir mes fichiers de cartographie"
          onChange={(event) => {
            const list = [...(event.target.files ?? [])]
            event.target.value = ''
            handleFiles(readFiles(list))
          }}
        />
      </section>

      {error ? (
        <section className="load-error" role="alert">
          <p>Lecture impossible : {error.message}</p>
        </section>
      ) : null}
    </div>
  )
}
