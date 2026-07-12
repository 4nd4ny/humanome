// Section « Mes données » (P8.6, chantier C) — export/import de l'archive
// pivot (schemas/archive-export.schema.json, ADR-006) et rappel du droit de
// suppression (cahier §6.3). Tout se passe dans le navigateur : l'archive est
// assemblée et validée localement avant téléchargement, l'import restaure les
// stores locaux (jamais de copie serveur implicite).
import { useRef, useState } from 'react'
import { exportArchive, importArchive } from '../../lib/archive.js'

/**
 * @param {{
 *   cartoStore: object,               // store cartographies (contrat carto-store)
 *   portfolioStore?: object,          // store portfolios (lib/portfolio-store)
 *   onImported?: () => void,          // recharge la liste du panneau parent
 *   fetchFn?: typeof fetch,           // test seam (compte / prompt-packages)
 *   download?: (filename: string, text: string) => void, // test seam
 *   getAccount?: Function, getReferentiel?: Function, getPromptPackages?: Function, // test seams
 * }} props
 */
export default function ExportSection({
  cartoStore,
  portfolioStore,
  onImported,
  fetchFn,
  download,
  getAccount,
  getReferentiel,
  getPromptPackages,
}) {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null) // {kind: 'info' | 'error', text}
  const fileInputRef = useRef(null)

  async function handleExport() {
    setBusy(true)
    setNotice(null)
    try {
      const { filename, counts } = await exportArchive({
        cartoStore,
        portfolioStore,
        fetchFn,
        download,
        getAccount,
        getReferentiel,
        getPromptPackages,
      })
      setNotice({
        kind: 'info',
        text:
          `Archive téléchargée (${filename}) : ${counts.portfolios} portfolio(s), ` +
          `${counts.cartographies} cartographie(s).`,
      })
    } catch (error) {
      setNotice({ kind: 'error', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  async function handleImportFile(event) {
    const file = event.target.files?.[0]
    event.target.value = '' // permet de réimporter le même fichier
    if (!file) return
    setBusy(true)
    setNotice(null)
    try {
      const report = await importArchive(file, { cartoStore, portfolioStore })
      setNotice({
        kind: 'info',
        text:
          `Import terminé : ${report.portfolios} portfolio(s) et ` +
          `${report.cartographies} cartographie(s) restaurés (les doublons sont ignorés).`,
      })
      onImported?.()
    } catch (error) {
      setNotice({ kind: 'error', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mes-donnees" aria-label="Mes données">
      <h3>Mes données</h3>
      <p>
        L’archive contient vos portfolios, vos cartographies, le référentiel et les prompts
        utilisés : elle est autoporteuse et reste lisible hors ligne (format ouvert, RGPD §6).
      </p>
      <div className="mes-donnees-actions">
        <button type="button" className="button button-primary" onClick={handleExport} disabled={busy}>
          Exporter toutes mes données
        </button>
        <button
          type="button"
          className="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
        >
          Importer une archive
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleImportFile}
          data-testid="archive-file-input"
          hidden
        />
      </div>
      {notice ? (
        <p role={notice.kind === 'error' ? 'alert' : 'status'} className={`notice-${notice.kind}`}>
          {notice.text}
        </p>
      ) : null}
      <p className="mes-donnees-rappel">
        Supprimer votre compte (purge réelle de toutes vos données serveur) se fait depuis votre{' '}
        <a href="#/compte">espace compte</a>.
      </p>
    </section>
  )
}
