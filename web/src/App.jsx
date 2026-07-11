import { useEffect, useState } from 'react'

export default function App() {
  const [health, setHealth] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setHealth)
      .catch((e) => setError(e.message))
  }, [])

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 640 }}>
      <h1>humanome.xyz</h1>
      <p>Cartographie de compétences humaines — écosystème RESPIRE.</p>
      <p data-testid="api-status">
        API :{' '}
        {health
          ? `ok (version ${health.version})`
          : error
            ? `indisponible (${error})`
            : 'vérification…'}
      </p>
    </main>
  )
}
