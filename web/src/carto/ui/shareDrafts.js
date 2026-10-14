// Interface ultime — brouillons des versions partagées (D-33) : la
// composition d'une version publiée (titre, précision, compétences, extraits
// choisis et retouchés, noms remplacés), gardée dans CE navigateur, jamais sur
// le serveur, pour publier une nouvelle version à sa place. Clé :
// `humanome-carto-share-draft:<jeu>:<version>`. Un brouillon n'existe donc que
// pour une version publiée depuis ce jeu, dans ce navigateur ; il disparaît
// avec la version (retrait, attestation retirée), avec le jeu (suppression),
// avec le compte (suppression), et quand la version n'est plus sur le
// serveur (retirée ailleurs : constaté à l'ouverture de l'espace Partage).

export const DRAFT_PREFIX = 'humanome-carto-share-draft:'

export function saveDraft(key, draft) {
  try {
    localStorage.setItem(DRAFT_PREFIX + key, JSON.stringify(draft))
  } catch {
    /* stockage indisponible : la reprise partira du document publié */
  }
}

export function loadDraft(key) {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function dropDraft(key) {
  try {
    localStorage.removeItem(DRAFT_PREFIX + key)
  } catch {
    /* rien à faire */
  }
}

/** Identifiants (texte) des versions dont ce jeu a un brouillon : publiées depuis ce jeu, dans ce navigateur. */
export function draftVersionIds(datasetId) {
  const prefix = `${DRAFT_PREFIX}${datasetId}:`
  const out = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(prefix)) out.push(key.slice(prefix.length))
    }
  } catch {
    /* stockage indisponible */
  }
  return out
}

/**
 * Efface les brouillons d'un jeu : tous, ou seulement ceux dont la version
 * n'est plus sur le serveur (`keep` : identifiants des versions existantes).
 * @param {string} datasetId
 * @param {{keep?: Set<string> | null}} [opts]
 */
export function dropDatasetDrafts(datasetId, { keep = null } = {}) {
  for (const id of draftVersionIds(datasetId)) {
    if (!keep || !keep.has(id)) dropDraft(`${datasetId}:${id}`)
  }
}

/** Efface tous les brouillons de ce navigateur : le compte est supprimé, ses versions sont purgées. */
export function dropAllDrafts() {
  try {
    const keys = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(DRAFT_PREFIX)) keys.push(key)
    }
    for (const key of keys) localStorage.removeItem(key)
  } catch {
    /* stockage indisponible */
  }
}
