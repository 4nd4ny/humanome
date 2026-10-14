// Interface ultime — import par glisser-déposer ou sélection (spec §3, §7).
// Les fichiers sont lus DANS le navigateur ; rien n'est envoyé. Le rapport
// classe chaque anomalie en Bloquant / À arbitrer / Avertissement /
// Information (V3 ImportReportPanel).

import { useRef, useState } from 'react'
import { SEVERITIES, SEVERITY_LABELS } from '../core/model.js'

/** Lit des File (ou des entrées de dossier) en {path, bytes}. */
export async function readFiles(fileList) {
  const out = []
  for (const f of fileList) {
    const path = f.webkitRelativePath || f.relativePath || f.name
    const bytes = new Uint8Array(await f.arrayBuffer())
    out.push({ path, bytes })
  }
  return out
}

/** Parcourt récursivement un dossier déposé (API webkitGetAsEntry). */
export async function filesFromDataTransfer(dt) {
  const items = [...(dt.items ?? [])]
  const entries = items.map((i) => (typeof i.webkitGetAsEntry === 'function' ? i.webkitGetAsEntry() : null)).filter(Boolean)
  if (entries.length === 0) return readFiles(dt.files ?? [])
  const out = []
  const walk = async (entry, prefix) => {
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej))
      out.push({ path: `${prefix}${entry.name}`, bytes: new Uint8Array(await file.arrayBuffer()) })
    } else if (entry.isDirectory) {
      const reader = entry.createReader()
      let batch
      do {
        batch = await new Promise((res, rej) => reader.readEntries(res, rej))
        for (const child of batch) await walk(child, `${prefix}${entry.name}/`)
      } while (batch.length > 0)
    }
  }
  for (const e of entries) await walk(e, '')
  return out
}

/**
 * @param {{onImport: (files: Array<object>) => Promise<object | null>, busy?: string | null, compact?: boolean}} props
 */
export function ImportPanel({ onImport, busy = null, compact = false }) {
  const fileRef = useRef(null)
  const dirRef = useRef(null)
  const [over, setOver] = useState(false)
  const [error, setError] = useState(null)

  async function run(promiseOfFiles) {
    setError(null)
    try {
      const files = await promiseOfFiles
      if (files.length === 0) return
      await onImport(files)
    } catch (err) {
      setError(`Import interrompu : ${err.message}`)
    }
  }

  return (
    <section className={`carto-import${compact ? ' carto-import--compact' : ''}`} aria-label="Importer des fichiers">
      <div
        className={`carto-drop${over ? ' is-over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          run(filesFromDataTransfer(e.dataTransfer))
        }}
      >
        <p>
          Déposez ici vos analyses Aurora (<code>carto_P1…P7.json</code> et <code>kairos.json</code>, ZIP de journées, arborescence AuroraCore), votre portfolio (<code>.md</code>, <code>.txt</code>) ou une archive.
        </p>
        <div className="carto-drop-actions">
          <button type="button" className="carto-btn" onClick={() => fileRef.current?.click()} disabled={Boolean(busy)}>
            Choisir des fichiers
          </button>
          <button type="button" className="carto-btn carto-btn--quiet" onClick={() => dirRef.current?.click()} disabled={Boolean(busy)}>
            Choisir un dossier
          </button>
        </div>
        <p className="carto-muted carto-small">Les fichiers sont lus dans ce navigateur. Rien n’est envoyé.</p>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".json,.zip,.md,.markdown,.txt,.js"
          hidden
          onChange={(e) => {
            const list = [...e.target.files]
            e.target.value = ''
            run(readFiles(list))
          }}
        />
        <input
          ref={dirRef}
          type="file"
          multiple
          hidden
          {...{ webkitdirectory: '', directory: '' }}
          onChange={(e) => {
            const list = [...e.target.files]
            e.target.value = ''
            run(readFiles(list))
          }}
        />
      </div>
      {busy ? (
        <p role="status" className="carto-status">
          {busy}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="carto-error">
          {error}
        </p>
      ) : null}
    </section>
  )
}

/**
 * Rapport d'import : comptes par gravité, filtre, 100 entrées au plus par gravité.
 * @param {{entries: Array<object>, onClose?: () => void, title?: string}} props
 */
export function ImportReport({ entries, onClose, title = 'Rapport d’import' }) {
  const [filter, setFilter] = useState(() => (entries.some((e) => e.severity === 'blocking' || e.severity === 'arbitrate') ? 'todo' : 'all'))
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, entries.filter((e) => e.severity === s).length]))
  const shown = SEVERITIES.flatMap((s) =>
    entries
      .filter((e) => e.severity === s)
      .filter(() => filter === 'all' || filter === s || (filter === 'todo' && (s === 'blocking' || s === 'arbitrate')))
      .slice(0, 100),
  )
  return (
    <section className="carto-report" aria-label={title}>
      <header className="carto-report-head">
        <h3>{title}</h3>
        {onClose ? (
          <button type="button" className="carto-btn carto-btn--quiet" onClick={onClose}>
            Fermer
          </button>
        ) : null}
      </header>
      <div className="carto-report-filters" role="group" aria-label="Filtrer par gravité">
        <button type="button" aria-pressed={filter === 'todo'} onClick={() => setFilter('todo')}>
          À traiter ({counts.blocking + counts.arbitrate})
        </button>
        {SEVERITIES.map((s) => (
          <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)} className={`sev-${s}`}>
            {SEVERITY_LABELS[s]} ({counts[s]})
          </button>
        ))}
        <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
          Tout ({entries.length})
        </button>
      </div>
      {shown.length === 0 ? (
        <p className="carto-muted">Rien dans cette catégorie.</p>
      ) : (
        <ul className="carto-report-list">
          {shown.map((e, i) => (
            <li key={`${e.severity}-${e.code}-${i}`} className={`sev-${e.severity}`}>
              <span className="carto-sev">{SEVERITY_LABELS[e.severity]}</span> {e.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
