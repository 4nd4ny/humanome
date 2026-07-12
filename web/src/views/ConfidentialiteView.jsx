// Page confidentialité / RGPD publique (P12.2, cahier §6) — français clair.
//
// Le contenu vient de content/legal/confidentialite.md, IMPORTÉ AU BUILD
// (import.meta.glob eager + ?raw, comme la formation) : il voyage dans le
// bundle IIFE et la page fonctionne donc aussi sur une copie statique/file://
// (ADR-003), sans dépendre de l'API. Le Markdown passe par le mini-parseur
// maison md.js PUIS DOMPurify (renderMarkdown, ADR-007) : aucune requête
// réseau n'est possible depuis le HTML rendu.
//
// Chemin relatif depuis web/src/views/ vers la racine du monorepo (trois ../).

import { renderMarkdown } from '../lib/md.js'

const LEGAL_FILES = import.meta.glob('../../../content/legal/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** Contenu brut de content/legal/confidentialite.md (ou null si absent). */
function confidentialiteRaw() {
  for (const [path, raw] of Object.entries(LEGAL_FILES)) {
    if (path.endsWith('/confidentialite.md')) return String(raw)
  }
  return null
}

export default function ConfidentialiteView() {
  const raw = confidentialiteRaw()

  if (raw === null) {
    // Filet de sécurité : ne devrait jamais arriver (fichier embarqué au build).
    return (
      <div className="confidentialite">
        <h1>Confidentialité et protection des données</h1>
        <p role="alert" className="load-error">
          Le contenu de cette page est momentanément indisponible.
        </p>
      </div>
    )
  }

  // Les liens de la page sont soit des routes hash de l'app (#/compte,
  // #/espace…), soit des liens externes (respire.school) : on ne réécrit rien,
  // DOMPurify neutralise de toute façon les schémas dangereux.
  const html = renderMarkdown(raw)

  return (
    <div className="confidentialite">
      <article
        className="legal-document"
        data-testid="confidentialite-contenu"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
