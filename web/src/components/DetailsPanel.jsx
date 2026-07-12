import { useMemo } from 'react'
import { renderNarrativeHtml } from '../lib/narrative.js'

/**
 * Details panel: structured header (title/description) + narrative HTML.
 * Every `html` fragment goes through DOMPurify then the legacy day-link
 * rewriter (ADR-007, docs/contrats.md §2.3) — never injected raw.
 *
 * @param {{
 *   title?: string,
 *   titleColor?: string,
 *   description?: string,
 *   html?: string,            // narrative HTML from the data (sanitized here)
 *   children?: import('react').ReactNode, // structured content, rendered before html
 * }} props
 */
export default function DetailsPanel({ title, titleColor, description, html, children }) {
  const safeHtml = useMemo(() => (html ? renderNarrativeHtml(html) : ''), [html])

  return (
    <section className="details-panel" aria-live="polite">
      {title ? (
        <h2 className="details-title" style={titleColor ? { color: titleColor } : undefined}>
          {title}
        </h2>
      ) : null}
      {description ? <p className="details-description">{description}</p> : null}
      {children}
      {safeHtml ? (
        <div
          className="narrative"
          data-testid="narrative-html"
          dangerouslySetInnerHTML={{ __html: safeHtml }}
        />
      ) : null}
    </section>
  )
}
