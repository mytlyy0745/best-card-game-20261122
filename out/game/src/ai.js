// Cinder Warden AI: a greedy heuristic with a little human wobble on lower difficulties.
// Each step it picks the single best affordable play, plays it, and repeats until nothing
// good is left — then ends its turn. Deterministic given the game's seeded RNG.
import { canPlay, playCard } from './engine.js';

export function chooseAiPlay(game) {
  const foe = game.foe;
  const you = game.you;
  const affordable = foe.hand.filter((c) => canPlay(game, foe, c));
  if (affordable.length === 0) return null;

  const scored = affordable.map((card) => ({ card, score: scoreCard(game, card) }));
  scored.sort((a, b) => b.score - a.score);

  // On easier difficulties the Warden sometimes picks a worse card, like a human would.
  if (game.diff.aiMistake > 0 && game.rand() < game.diff.aiMistake && scored.length > 1) {
    const pick = scored[1 + Math.floor(game.rand() * (scored.length - 1))];
    return { card: pick.card, target: pickTarget(game, pick.card) };
  }
  const best = scored[0];
  return { card: best.card, target: pickTarget(game, best.card) };
}

function scoreCard(game, card) {
  const foe = game.foe;
  const you = game.you;
  let s = 0;
  if (card.kind === 'creature') {
    // Creatures are worth their stats, more when the board is empty.
    s = card.atk * 2 + card.hp + (foe.board.length === 0 ? 1.5 : 0);
    // Don't overfill the board when the hero is nearly dead: finish them instead.
    if (you.hp <= 6) s -= 1;
  } else if (card.kind === 'damage') {
    const t = pickTarget(game, card);
    if (t && t.kind === 'creature') {
      // Killing a creature is worth its stats; overkill is wasteful.
      s = t.creature.atk * 2 + t.creature.hp - Math.max(0, card.amount - t.creature.hp);
      if (t.creature.hp <= card.amount) s += 2;
    } else {
      s = card.amount * 1.6; // face damage
      if (you.hp - card.amount <= 0) s += 100; // lethal!
      if (you.hp <= 6) s += 3;
    }
    // Don't waste burn on a heavily armored hero.
    if (you.armor >= card.amount) s -= 2;
  } else if (card.kind === 'heal') {
    const missing = foe.maxHp - foe.hp;
    s = missing <= 0 ? -5 : Math.min(card.amount, missing) * 1.1;
    if (foe.hp <= 8) s += 2;
  } else if (card.kind === 'shield') {
    s = you.board.reduce((sum, c) => sum + c.atk, 0) > 0 ? card.amount * 0.9 : 0.4;
    if (foe.hp <= 8) s += 1;
  }
  // Prefer spending mana efficiently: a small penalty per unspent mana is handled by
  // the loop itself (it keeps playing while anything scores above zero).
  s += (card.cost / 10) * 0.1;
  return s;
}

function pickTarget(game, card) {
  if (card.kind !== 'damage') return null;
  const you = game.you;
  // Lethal first.
  const lethal = card.amount >= you.hp + you.armor;
  if (lethal) return { side: 'you', kind: 'hero' };
  // Remove the biggest threat if it dies to this spell.
  const threats = you.board.filter((c) => c.hp <= card.amount);
  if (threats.length > 0) {
    threats.sort((a, b) => (b.atk * 2 + b.hp) - (a.atk * 2 + a.hp));
    return { side: 'you', kind: 'creature', uid: threats[0].uid, creature: threats[0] };
  }
  // Otherwise go face unless the hero is armored and a creature is about to hit hard.
  if (you.armor >= card.amount && you.board.length > 0) {
    const big = [...you.board].sort((a, b) => b.atk - a.atk)[0];
    return { side: 'you', kind: 'creature', uid: big.uid, creature: big };
  }
  return { side: 'you', kind: 'hero' };
}

// Play one AI step. Returns { played, done, events }.
export function aiStep(game) {
  const choice = chooseAiPlay(game);
  if (!choice) return { played: false, done: true, events: [] };
  const res = playCard(game, 'foe', choice.card.uid, choice.target);
  if (!res.ok) return { played: false, done: true, events: [] };
  return { played: true, done: false, events: res.events };
}
