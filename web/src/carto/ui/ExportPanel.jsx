// Interface ultime — espace Export (spec §11) : trois formats, toujours
// produits dans le navigateur (rien n'est envoyé), et l'outil « Préparer une
// démo » (§11.1).
//   1. archive JSON : le master complet, réimportable sans perte ;
//   2. copie autonome : un seul fichier HTML, lisible en file:// sans réseau ;
//   3. rapport imprimable : pages A4 (CSS d'impression, SVG natif).

import { useId, useMemo, useState } from 'react'
import { archiveFileName, buildArchive } from '../core/archive.js'
import { injectArchive } from '../core/standalone.js'
import { formatLong } from '../core/dates.js'
import { downloadBlob } from '../../lib/download-json.js'
import { loadViewerTemplate } from './viewerTemplate.js'
import { formatBytes } from './format.js'
import { DEFAULT_REPORT_OPTIONS, ReportPreview } from './Report.jsx'
import { DemoTool } from './DemoTool.jsx'

function Status({ value }) {
  if (!value) return null
  return (
    <p role={value.kind === 'error' ? 'alert' : 'status'} className={value.kind === 'error' ? 'carto-error carto-small' : 'carto-small carto-export-done'}>
      {value.text}
    </p>
  )
}

/**
 * @param {{dataset: object, refl: object, state: object, layout: object, geometry: object, params: object,
 *   t: string | null, data: object, fetchFn?: typeof fetch, onOpenDataset?: () => void}} props
 */
export function ExportPanel({ dataset, refl, state, layout, geometry, params, t, data, fetchFn, onOpenDataset }) {
  const uid = useId()
  const [jsonPortfolio, setJsonPortfolio] = useState(true)
  const [htmlPortfolio, setHtmlPortfolio] = useState(false)
  const [status, setStatus] = useState({})
  const [busy, setBusy] = useState(null)
  const [options, setOptions] = useState(() => ({ ...DEFAULT_REPORT_OPTIONS }))
  const [reportOpen, setReportOpen] = useState(false)
  const [demoOpen, setDemoOpen] = useState(false)

  const observed = useMemo(() => refl.competencies.filter((c) => state.competencies.has(c.code)), [refl, state])
  const chosenKey = options.codes.filter((c) => state.competencies.has(c)).join(',')
  const chosen = useMemo(() => (chosenKey ? chosenKey.split(',') : []), [chosenKey])
  const hasComparison = Boolean(dataset.preferences?.compare?.a && dataset.preferences?.compare?.b)
  const setOpt = (patch) => setOptions((o) => ({ ...o, ...patch }))
  const reportOptions = useMemo(() => ({ ...options, codes: chosen, comparison: options.comparison && hasComparison }), [options, chosen, hasComparison])

  async function currentArchive(includePortfolio) {
    await data.flush()
    const exported = await data.store.exportAll(dataset.datasetId)
    if (!exported) throw new Error('jeu de données introuvable')
    return buildArchive(exported, { includePortfolio })
  }

  async function run(key, label, fn) {
    setBusy(key)
    setStatus((s) => ({ ...s, [key]: { kind: 'busy', text: label } }))
    try {
      const text = await fn()
      setStatus((s) => ({ ...s, [key]: { kind: 'ok', text } }))
    } catch (err) {
      setStatus((s) => ({ ...s, [key]: { kind: 'error', text: err.message } }))
    } finally {
      setBusy(null)
    }
  }

  const downloadArchive = () =>
    run('json', 'Préparation de l’archive…', async () => {
      const archive = await currentArchive(jsonPortfolio)
      const blob = new Blob([JSON.stringify(archive)], { type: 'application/json' })
      const name = archiveFileName('archive', archive.exportedAt)
      downloadBlob(blob, name)
      return `${name} (${formatBytes(blob.size)}) téléchargé.`
    })

  const downloadCopy = () =>
    run('html', 'Préparation de la copie autonome…', async () => {
      let template
      try {
        template = await loadViewerTemplate(fetchFn)
      } catch (err) {
        throw new Error(`La copie autonome n’a pas pu être produite : ${err.message}.`)
      }
      const archive = await currentArchive(htmlPortfolio)
      const blob = new Blob([injectArchive(template, archive)], { type: 'text/html' })
      const name = archiveFileName('copie', archive.exportedAt, 'html')
      downloadBlob(blob, name)
      return `${name} (${formatBytes(blob.size)}) téléchargé.`
    })

  return (
    <section className="carto-export" aria-labelledby={`${uid}-title`}>
      <header className="carto-export-head">
        <h2 id={`${uid}-title`}>Exporter</h2>
        <p className="carto-small carto-muted">Les fichiers sont produits dans ce navigateur : rien n’est envoyé sur un serveur.</p>
      </header>

      <div className="carto-export-grid">
        <section className="carto-export-card" aria-labelledby={`${uid}-json`}>
          <h3 id={`${uid}-json`}>Archive complète (JSON)</h3>
          <p className="carto-small">
            Tout votre travail : journées, analyses, réponses au jury, ensembles, repères, préférences et référentiel. Elle se réimporte sans perte, ici ou dans un
            autre navigateur ; ce qui est déjà présent est ignoré.
          </p>
          <label className="carto-small">
            <input type="checkbox" checked={jsonPortfolio} onChange={(e) => setJsonPortfolio(e.target.checked)} /> inclure le texte du portfolio
          </label>
          {jsonPortfolio ? null : (
            <p className="carto-small carto-muted">
              Sans le texte, le surlignage des passages sera indisponible à la réimportation. Les extraits cités par le jury restent dans l’archive.
            </p>
          )}
          <button type="button" className="carto-btn" onClick={downloadArchive} disabled={Boolean(busy)}>
            Télécharger l’archive
          </button>
          <Status value={status.json} />
        </section>

        <section className="carto-export-card" aria-labelledby={`${uid}-html`}>
          <h3 id={`${uid}-html`}>Copie autonome (HTML)</h3>
          <p className="carto-small">
            Un seul fichier qui s’ouvre dans un navigateur, sans réseau ni installation : soleil, heatmap, comparaison et tableau de bord, en lecture. Ce qu’on y
            change n’est pas enregistré.
          </p>
          <label className="carto-small">
            <input type="checkbox" checked={htmlPortfolio} onChange={(e) => setHtmlPortfolio(e.target.checked)} /> inclure le portfolio (nécessaire au surlignage des
            passages)
          </label>
          {htmlPortfolio ? (
            <p className="carto-note carto-note--warn carto-small" role="note">
              Le fichier contiendra le texte intégral de votre portfolio : toute personne qui le reçoit pourra le lire.
            </p>
          ) : (
            <p className="carto-small carto-muted">Sans le portfolio, les extraits cités par le jury restent lisibles, mais les passages ne sont pas surlignés.</p>
          )}
          <button type="button" className="carto-btn" onClick={downloadCopy} disabled={Boolean(busy)}>
            Télécharger la copie
          </button>
          <Status value={status.html} />
        </section>

        <section className="carto-export-card carto-export-card--wide" aria-labelledby={`${uid}-pdf`}>
          <h3 id={`${uid}-pdf`}>Rapport imprimable (PDF)</h3>
          <p className="carto-small">
            Des pages A4 à imprimer ou à enregistrer en PDF : le soleil et sa légende, le profil chiffré, puis les réflexions du jury que vous choisissez. Il porte sur
            l’état affiché : les journées cochées{t ? `, jusqu’au ${formatLong(t)}` : ''}.
          </p>
          <div className="carto-export-report">
            <div>
              <label className="carto-field">
                <span>Pseudonyme en première page</span>
                <input type="text" value={options.pseudonym} placeholder="par exemple : Camille" maxLength={80} onChange={(e) => setOpt({ pseudonym: e.target.value })} />
              </label>
              <fieldset className="carto-export-fieldset">
                <legend>Réflexions du jury</legend>
                <label className="carto-small">
                  <input type="radio" name={`${uid}-scope`} checked={options.scope === 'last'} onChange={() => setOpt({ scope: 'last' })} /> la dernière journée observée
                </label>
                <label className="carto-small">
                  <input type="radio" name={`${uid}-scope`} checked={options.scope === 'all'} onChange={() => setOpt({ scope: 'all' })} /> toutes les journées observées
                </label>
                <label className="carto-small">
                  <input type="checkbox" checked={options.extracts} onChange={(e) => setOpt({ extracts: e.target.checked })} /> avec les extraits de ces journées
                </label>
              </fieldset>
              <label className="carto-small">
                <input type="checkbox" checked={options.comparison && hasComparison} disabled={!hasComparison} onChange={(e) => setOpt({ comparison: e.target.checked })} /> page de
                comparaison A / B{hasComparison ? '' : ' (définissez-la d’abord dans l’espace Comparaison)'}
              </label>
              <label className="carto-small">
                <input type="checkbox" checked={options.notes} onChange={(e) => setOpt({ notes: e.target.checked })} /> inclure mes réponses au jury et ma note de comparaison
              </label>
            </div>
            <fieldset className="carto-export-fieldset carto-export-codes">
              <legend>
                Compétences dont imprimer les réflexions ({chosen.length} / {observed.length})
              </legend>
              <div className="carto-export-codes-tools">
                <button type="button" className="carto-link-btn" onClick={() => setOpt({ codes: observed.map((c) => c.code) })}>
                  toutes
                </button>
                <button type="button" className="carto-link-btn" onClick={() => setOpt({ codes: [] })}>
                  aucune
                </button>
              </div>
              {observed.length === 0 ? (
                <p className="carto-small carto-muted">Aucune compétence observée dans les journées cochées.</p>
              ) : (
                <ul>
                  {observed.map((c) => (
                    <li key={c.code}>
                      <label className="carto-small">
                        <input
                          type="checkbox"
                          checked={chosen.includes(c.code)}
                          onChange={(e) => setOpt({ codes: e.target.checked ? [...chosen, c.code].sort((a, b) => observed.findIndex((x) => x.code === a) - observed.findIndex((x) => x.code === b)) : chosen.filter((x) => x !== c.code) })}
                        />{' '}
                        <span className="carto-code">{c.code}</span> {c.name}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>
          </div>
          <button type="button" className="carto-btn" onClick={() => setReportOpen(true)}>
            Aperçu avant impression
          </button>
        </section>

        <section className="carto-export-card carto-export-card--wide" aria-labelledby={`${uid}-demo`}>
          <h3 id={`${uid}-demo`}>Préparer une démo</h3>
          <p className="carto-small">
            Pour déposer une démonstration sur le serveur : une copie anonymisée de ce jeu. Les noms choisis sont remplacés partout (portfolio, extraits, jury) pour
            que les surlignages tiennent ; la table de correspondance n’est jamais exportée.
          </p>
          {demoOpen ? null : (
            <button type="button" className="carto-btn carto-btn--quiet" onClick={() => setDemoOpen(true)}>
              Ouvrir l’outil d’anonymisation
            </button>
          )}
        </section>
      </div>

      {demoOpen ? <DemoTool dataset={dataset} data={data} fetchFn={fetchFn} onClose={() => setDemoOpen(false)} onOpened={onOpenDataset} /> : null}

      {reportOpen ? (
        <ReportPreview
          data={data}
          onClose={() => setReportOpen(false)}
          dataset={dataset}
          refl={refl}
          state={state}
          layout={layout}
          geometry={geometry}
          params={params}
          t={t}
          options={reportOptions}
        />
      ) : null}
    </section>
  )
}
