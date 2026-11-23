// Card catalogue for Ember Duel. All original: ember-spirit creatures and spark spells.
import { shuffle } from './random.js';
// kind: 'creature' | 'damage' | 'heal' | 'shield'
//  - creature: cost, atk, hp. Stays on the board; strikes the enemy hero at the start of its owner's turn.
//  - damage: deals `amount` to a chosen target (enemy hero or one of their creatures).
//  - heal: restores `amount` health to your hero.  - shield: gains `amount` armor.
export const CARD_DEFS = [
  { id: 'sparkimp',    name: 'Spark Imp',    kind: 'creature', cost: 1, atk: 1, hp: 1, art: '👹', text: 'A tiny ember with a big temper.' },
  { id: 'cinderpup',   name: 'Cinder Pup',   kind: 'creature', cost: 1, atk: 2, hp: 1, art: '🐺', text: 'Bites first, thinks never.' },
  { id: 'emberwisp',   name: 'Ember Wisp',   kind: 'creature', cost: 2, atk: 2, hp: 2, art: '✨', text: 'Drifts where the wind takes it.' },
  { id: 'ashfox',      name: 'Ash Fox',      kind: 'creature', cost: 2, atk: 3, hp: 2, art: '🦊', text: 'Quick paws, quicker sparks.' },
  { id: 'coalgolem',   name: 'Coal Golem',   kind: 'creature', cost: 3, atk: 2, hp: 5, art: '🗿', text: 'Slow, heavy, impossible to move.' },
  { id: 'flamehawk',   name: 'Flame Hawk',   kind: 'creature', cost: 3, atk: 4, hp: 3, art: '🦅', text: 'Dives from the smoke.' },
  { id: 'magmabear',   name: 'Magma Bear',   kind: 'creature', cost: 4, atk: 4, hp: 5, art: '🐻', text: 'Hugs like a furnace.' },
  { id: 'phoenix',     name: 'Ash Phoenix',  kind: 'creature', cost: 5, atk: 5, hp: 5, art: '🔥', text: 'Burns bright, returns brighter.' },
  { id: 'infernodrake',name: 'Inferno Drake',kind: 'creature', cost: 6, atk: 7, hp: 6, art: '🐉', text: 'The sky itself catches fire.' },
  { id: 'emberbolt',   name: 'Ember Bolt',   kind: 'damage', cost: 1, amount: 2, art: '⚡', text: 'Deal 2 damage to a target.' },
  { id: 'fireball',    name: 'Fireball',     kind: 'damage', cost: 2, amount: 3, art: '☄️', text: 'Deal 3 damage to a target.' },
  { id: 'flamestrike', name: 'Flame Strike', kind: 'damage', cost: 4, amount: 6, art: '🌋', text: 'Deal 6 damage to a target.' },
  { id: 'warmth',      name: 'Warmth',       kind: 'heal', cost: 1, amount: 3, art: '💗', text: 'Restore 3 health.' },
  { id: 'hearthmeal',  name: 'Hearth Meal',  kind: 'heal', cost: 2, amount: 5, art: '🍲', text: 'Restore 5 health.' },
  { id: 'stoneskin',   name: 'Stone Skin',   kind: 'shield', cost: 1, amount: 3, art: '🛡️', text: 'Gain 3 armor.' },
  { id: 'ironwall',    name: 'Iron Wall',    kind: 'shield', cost: 3, amount: 7, art: '🧱', text: 'Gain 7 armor.' },
];

export const DECK_LIST = [
  'sparkimp', 'sparkimp', 'cinderpup', 'cinderpup', 'emberwisp', 'emberwisp',
  'ashfox', 'ashfox', 'coalgolem', 'flamehawk', 'flamehawk', 'magmabear',
  'phoenix', 'emberbolt', 'emberbolt', 'emberbolt', 'fireball', 'fireball',
  'flamestrike', 'warmth', 'warmth', 'hearthmeal', 'stoneskin', 'ironwall',
];

export function defById(id) {
  return CARD_DEFS.find((d) => d.id === id);
}

export function makeCard(defId, uid) {
  const def = defById(defId);
  return { uid, defId, ...def, hp: def.hp ?? null, maxHp: def.hp ?? null };
}

// Build a fresh shuffled deck of card objects for one side.
export function buildDeck(rand, uidPrefix) {
  let n = 0;
  return shuffle(DECK_LIST, rand).map((defId) => makeCard(defId, `${uidPrefix}-${n++}`));
}
