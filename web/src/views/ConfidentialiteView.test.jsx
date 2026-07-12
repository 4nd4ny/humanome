// Page confidentialité (P12.2, cahier §6) : le contenu français clair de
// content/legal/confidentialite.md est embarqué au build et rendu via md.js +
// DOMPurify. On vérifie que la page couvre bien les rubriques RGPD exigées
// (données, local vs serveur, base légale, durées, droits, sous-traitants LLM,
// cookies, contact) et qu'elle ne fonctionne QUE localement (aucun fetch).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import ConfidentialiteView from './ConfidentialiteView.jsx'

afterEach(cleanup)

describe('ConfidentialiteView', () => {
  it('rend le contenu embarqué sans aucun appel réseau', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    render(<ConfidentialiteView />)

    // Le document est présent et non vide (contenu embarqué au build).
    const article = screen.getByTestId('confidentialite-contenu')
    expect(article.textContent.length).toBeGreaterThan(500)
    // Page publique statique : jamais de fetch (ADR-003, file:// compatible).
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('couvre les rubriques RGPD obligatoires (cahier §6)', () => {
    render(<ConfidentialiteView />)
    const text = screen.getByTestId('confidentialite-contenu').textContent

    // Quelles données + où (local par défaut vs serveur opt-in).
    expect(text).toMatch(/portfolio/i)
    expect(text).toMatch(/navigateur/i)
    expect(text).toMatch(/opt-in|explicite/i)
    // Base légale = consentement.
    expect(text).toMatch(/base légale/i)
    expect(text).toMatch(/consentement/i)
    // Durées (liens de partage, sessions, comptes jusqu'à suppression).
    expect(text).toMatch(/durée|conservation/i)
    expect(text).toMatch(/90 jours/i) // validité par défaut d'un lien de partage
    expect(text).toMatch(/30 jours/i) // grâce avant purge d'un lien expiré
    // Droits (accès/export/suppression).
    expect(text).toMatch(/export/i)
    expect(text).toMatch(/supprim/i)
    // Sous-traitants LLM (Anthropic / clé perso / établissement).
    expect(text).toMatch(/Anthropic/)
    expect(text).toMatch(/établissement/i)
    // Cookies (session strictement nécessaire, aucun traceur).
    expect(text).toMatch(/cookie/i)
    expect(text).toMatch(/traceur/i)
    // Contact.
    expect(text).toMatch(/contact/i)
  })

  it('rend des liens vers les parcours RGPD de l’app et neutralise tout script', () => {
    render(<ConfidentialiteView />)
    const article = screen.getByTestId('confidentialite-contenu')

    // Les droits pointent vers #/compte et #/espace (accès/export/suppression).
    const hrefs = [...article.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('#/compte')
    expect(hrefs).toContain('#/espace')

    // DOMPurify : aucune balise script ni gestionnaire d'événement inline.
    expect(article.querySelector('script')).toBeNull()
    expect(article.innerHTML).not.toMatch(/onerror=|onclick=/i)
  })
})
