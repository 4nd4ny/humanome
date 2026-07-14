// Émulation du `set` CPython pour de PETITS ENTIERS NON NÉGATIFS (hash(i) = i)
// — nécessaire à la parité bit-à-bit de heatmap.segments() : `cover =
// [spans[i] for i in actifs]` itère la table de hachage dans l'ordre des
// slots, PAS en ordre croissant (dès que des indices dépassent la taille de
// table ou après des discard, l'ordre diverge), et cet ordre pilote l'ordre
// de sommation flottante de `heat` et `conf_moyenne` (spec-journee §7.3).
//
// Reproduit setobject.c de CPython (3.11+, vérifié contre 3.14 par vecteurs
// figés dans pySet.test.js) : open addressing, sondage linéaire LINEAR_PROBES
// = 9 puis perturbation (perturb >>= 5, i = i*5 + 1 + perturb), table
// initiale de 8, croissance ×4 (utilisés ≤ 50 000) quand fill*5 >= mask*3,
// réinsertion « clean » dans l'ordre des slots de l'ancienne table, dummies
// réutilisés à l'insertion (dernier dummy rencontré sur le chemin de sondage).

const LINEAR_PROBES = 9;
const MINSIZE = 8;
const EMPTY = -1;
const DUMMY = -2;

/** perturb >>= 5 sans troncature 32 bits (clés < 2^53). */
function shift5(p) {
  return Math.floor(p / 32);
}

export class PyIntSet {
  constructor() {
    /** @type {number[]} — EMPTY (-1), DUMMY (-2) ou la clé (entier ≥ 0). */
    this.slots = new Array(MINSIZE).fill(EMPTY);
    this.mask = MINSIZE - 1;
    this.fill = 0; // actifs + dummies (jamais décrémenté par discard)
    this.used = 0; // actifs
  }

  /** set.add(key) — set_add_entry de CPython. @param {number} key */
  add(key) {
    const hash = key;
    const mask = this.mask;
    let i = hash % (mask + 1);
    let freeslot = -1;
    let perturb = hash;
    for (;;) {
      let j = i;
      let probes = i + LINEAR_PROBES <= mask ? LINEAR_PROBES : 0;
      for (;;) {
        const k = this.slots[j];
        if (k === EMPTY) {
          // slot vraiment vide : réutilise le dernier dummy vu, sinon insère ici
          if (freeslot >= 0) {
            this.slots[freeslot] = key;
            this.used += 1;
            return;
          }
          this.slots[j] = key;
          this.fill += 1;
          this.used += 1;
          if (this.fill * 5 >= mask * 3) {
            this._resize(this.used > 50000 ? this.used * 2 : this.used * 4);
          }
          return;
        }
        if (k === key) return; // déjà présent
        if (k === DUMMY) freeslot = j; // dernier dummy du chemin (CPython)
        if (probes-- <= 0) break;
        j += 1;
      }
      perturb = shift5(perturb);
      i = (i * 5 + 1 + perturb) % (mask + 1);
    }
  }

  /** set.discard(key) — set_lookkey puis marquage dummy. @param {number} key */
  discard(key) {
    const hash = key;
    const mask = this.mask;
    let i = hash % (mask + 1);
    let perturb = hash;
    for (;;) {
      let j = i;
      let probes = i + LINEAR_PROBES <= mask ? LINEAR_PROBES : 0;
      for (;;) {
        const k = this.slots[j];
        if (k === EMPTY) return; // absent
        if (k === key) {
          this.slots[j] = DUMMY;
          this.used -= 1;
          return;
        }
        if (probes-- <= 0) break;
        j += 1;
      }
      perturb = shift5(perturb);
      i = (i * 5 + 1 + perturb) % (mask + 1);
    }
  }

  /** len(set). @returns {number} */
  get size() {
    return this.used;
  }

  /** list(set) — parcours de la table dans l'ordre des slots. @returns {number[]} */
  values() {
    /** @type {number[]} */
    const out = [];
    for (const k of this.slots) {
      if (k !== EMPTY && k !== DUMMY) out.push(k);
    }
    return out;
  }

  /** set_table_resize + set_insert_clean (réinsertion en ordre de slots). */
  _resize(minused) {
    let newsize = MINSIZE;
    while (newsize <= minused) newsize <<= 1;
    const old = this.slots;
    this.slots = new Array(newsize).fill(EMPTY);
    this.mask = newsize - 1;
    this.fill = this.used;
    for (const k of old) {
      if (k !== EMPTY && k !== DUMMY) this._insertClean(k);
    }
  }

  /** set_insert_clean : table sans dummies, clé garantie absente. */
  _insertClean(key) {
    const mask = this.mask;
    let perturb = key;
    let i = key % (mask + 1);
    for (;;) {
      if (this.slots[i] === EMPTY) {
        this.slots[i] = key;
        return;
      }
      if (i + LINEAR_PROBES <= mask) {
        let entry = i;
        for (let j = 0; j < LINEAR_PROBES; j++) {
          entry += 1;
          if (this.slots[entry] === EMPTY) {
            this.slots[entry] = key;
            return;
          }
        }
      }
      perturb = shift5(perturb);
      i = (i * 5 + 1 + perturb) % (mask + 1);
    }
  }
}
