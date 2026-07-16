// Avatar (D6) : image quand le compte en a une, initiales en repli sinon.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import Avatar, { initials } from './Avatar.jsx'

afterEach(cleanup)

describe('initials', () => {
  it('dérive 1 ou 2 lettres majuscules', () => {
    expect(initials('Ada Lovelace')).toBe('AL')
    expect(initials('maya')).toBe('MA')
    expect(initials('  Jean-Pierre  De La Tour ')).toBe('JT')
    expect(initials('')).toBe('?')
    expect(initials(undefined)).toBe('?')
  })
})

describe('Avatar', () => {
  it('sans avatar : initiales en repli, aucune image', () => {
    render(<Avatar userId={7} displayName="Ada Lovelace" hasAvatar={false} />)
    expect(screen.getByTestId('avatar-initials').textContent).toBe('AL')
    expect(screen.queryByTestId('avatar-img')).toBeNull()
  })

  it('avec avatar : sert l’image /api/users/{id}/avatar (cache-busting)', () => {
    render(<Avatar userId={7} displayName="Ada" hasAvatar version={3} />)
    const img = screen.getByTestId('avatar-img')
    expect(img.getAttribute('src')).toBe('api/users/7/avatar?v=3')
    expect(img.getAttribute('alt')).toContain('Ada')
  })

  it('hasAvatar mais userId absent : retombe sur les initiales', () => {
    render(<Avatar displayName="Ada" hasAvatar />)
    expect(screen.getByTestId('avatar-initials')).toBeTruthy()
  })
})
