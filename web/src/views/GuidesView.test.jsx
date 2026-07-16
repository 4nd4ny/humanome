import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import GuidesView from './GuidesView.jsx'

afterEach(cleanup)

const anonymous = async () => ({ user: null })

/** Store de progression factice : pas de localStorage ni d'appel réseau. */
const fakeTrainingStore = () => ({
  load: async () => ({ chapitres: [], source: 'local' }),
  setChapter: async () => {},
})

describe('GuidesView — hub public des guides', () => {
  it('accueil : une carte par parcours, groupées par famille, en accès libre', () => {
    render(<GuidesView parcours={null} chapter={null} deps={{ fetchMeFn: anonymous }} />)
    expect(screen.getByRole('heading', { level: 1, name: /Guides/ })).toBeDefined()
    // Les sept profils utilisateurs sont présents comme cartes cliquables.
    for (const label of [
      'Découvrir humanome.xyz',
      'Construire sa cartographie',
      'Lire une cartographie partagée',
      'Relire et garantir',
      'Cartographier une cohorte',
      'Faire évoluer le référentiel',
      'Concevoir les prompts',
    ]) {
      expect(screen.getByText(label)).toBeDefined()
    }
    // La carte visiteur pointe vers son parcours.
    const carte = screen.getByText('Découvrir humanome.xyz').closest('a')
    expect(carte.getAttribute('href')).toBe('#/guides/visiteur')
  })

  it('un parcours connu rend la formation avec le fil d’Ariane vers le hub', async () => {
    render(<GuidesView parcours="visiteur" chapter={null} deps={{ fetchMeFn: anonymous }} />)
    expect(screen.getByRole('link', { name: '← Tous les guides' }).getAttribute('href')).toBe(
      '#/guides',
    )
    // La liste des chapitres du parcours visiteur est rendue (progression).
    expect(await screen.findByTestId('formation-progress')).toBeDefined()
  })

  it('un parcours inconnu affiche une erreur et un retour au hub', () => {
    render(<GuidesView parcours="inconnu" chapter={null} deps={{ fetchMeFn: anonymous }} />)
    expect(screen.getByRole('alert').textContent).toContain('Guide inconnu')
    expect(screen.getByRole('link', { name: 'Retour à tous les guides' }).getAttribute('href')).toBe(
      '#/guides',
    )
  })
})

// Traçabilité — exigence utilisateur « documentation en ligne complète par
// rôle » : les manuels des 8 rôles + le portail noésiologie (« 8+1 »),
// accessibles sur le site en pages tutoriel. Ce bloc couvre ce que le bloc
// ci-dessus ne vérifie pas : les cartes admin (doc reprenant docs/) et
// noésiologie, les familles « Administrer » / « Écosystème RESPIRE », le rendu
// d'un CHAPITRE via le hub (liens internes réécrits vers #/guides/…, pas vers
// un espace de rôle) et le lien « votre espace dédié ».
describe('GuidesView — cartes admin + noésiologie et rendu de chapitre (8+1 manuels)', () => {
  it('l’accueil affiche UNE carte par parcours (9), dont admin et noésiologie', () => {
    const { container } = render(
      <GuidesView parcours={null} chapter={null} deps={{ fetchMeFn: anonymous }} />,
    )
    expect(container.querySelectorAll('.guides-card')).toHaveLength(9)
    // La documentation admin (reprenant docs/) est bien exposée dans le hub.
    const admin = screen.getByText('Administrer la plateforme').closest('a')
    expect(admin.getAttribute('href')).toBe('#/guides/admin')
    // Le portail noésiologie (le « +1 ») aussi.
    const noesiologie = screen.getByText('La noésiologie : une discipline sœur').closest('a')
    expect(noesiologie.getAttribute('href')).toBe('#/guides/noesiologie')
  })

  it('les familles « Administrer » et « Écosystème RESPIRE » sont des sections de l’accueil', () => {
    render(<GuidesView parcours={null} chapter={null} deps={{ fetchMeFn: anonymous }} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Administrer' })).toBeDefined()
    expect(screen.getByRole('heading', { level: 2, name: 'Écosystème RESPIRE' })).toBeDefined()
  })

  it('rend un chapitre via le hub avec ses liens internes réécrits vers #/guides/…', async () => {
    render(
      <GuidesView
        parcours="apprenant"
        chapter="01-pourquoi-un-portfolio-reflexif"
        deps={{ fetchMeFn: anonymous, trainingStore: fakeTrainingStore() }}
      />,
    )
    const article = await screen.findByTestId('formation-chapitre')
    expect(article.querySelector('h1').textContent).toBe('Pourquoi un portfolio réflexif')
    // Le lien interne « 02-….md » du chapitre est réécrit vers le hub public…
    expect(
      article.querySelector('a[href="#/guides/apprenant/02-ecrire-des-traces-exploitables"]'),
    ).not.toBeNull()
    // … et PAS vers l'espace de rôle connecté (base par défaut du parcours).
    expect(article.querySelector('a[href^="#/espace/formation"]')).toBeNull()
    // La navigation entre chapitres reste elle aussi dans le hub.
    const next = screen.getByRole('link', { name: 'Écrire des traces exploitables →' })
    expect(next.getAttribute('href')).toBe('#/guides/apprenant/02-ecrire-des-traces-exploitables')
  })

  it('le lien « votre espace dédié » n’apparaît que pour les parcours avec espace', async () => {
    // Parcours AVEC espace de rôle : apprenant -> #/espace/formation.
    const withSpace = render(
      <GuidesView
        parcours="apprenant"
        chapter={null}
        deps={{ fetchMeFn: anonymous, trainingStore: fakeTrainingStore() }}
      />,
    )
    await withSpace.findByTestId('formation-progress')
    const link = withSpace.container.querySelector('.guides-espace-link')
    expect(link).not.toBeNull()
    expect(link.querySelector('a').getAttribute('href')).toBe('#/espace/formation')
    withSpace.unmount()

    // Parcours SANS espace (espace: null) : aucun lien « espace dédié ».
    for (const parcours of ['employeur', 'etablissement', 'epistemiarque', 'noesiologie']) {
      const view = render(
        <GuidesView
          parcours={parcours}
          chapter={null}
          deps={{ fetchMeFn: anonymous, trainingStore: fakeTrainingStore() }}
        />,
      )
      await view.findByTestId('formation-progress')
      expect(
        view.container.querySelector('.guides-espace-link'),
        `lien espace inattendu pour ${parcours}`,
      ).toBeNull()
      view.unmount()
    }
  })
})
