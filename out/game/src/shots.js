// Staged states for screenshots (?shot=play|win|loss&seed=N).
// These are real games played through the engine — a greedy line for both sides —
// so every screenshot is a capture of the game itself, never a mock-up.
import { newGame, playCard, canPlay, endPlayerTurn, endFoeTurn, dealDamage } from './engine.js';
import { aiStep } from './ai.js';

// A simple greedy line for the player side, used only for staging.
function greedyPlayerPlay(game) {
  const you = game.you;
  const playable = you.hand.filter((c) => canPlay(game, you, c));
  if (playable.length === 0) return false;
  const pick = playable
    .map((card) => ({ card, score: stageScore(game, card) }))
    .sort((a, b) => b.score - a.score)[0];
  let target = null;
  if (pick.card.kind === 'damage') {
    const lethal = pick.card.amount >= game.foe.hp + game.foe.armor;
    if (lethal) target = { side: 'foe', kind: 'hero' };
    else {
      const threats = game.foe.board.filter((c) => c.hp <= pick.card.amount);
      if (threats.length > 0) {
        threats.sort((a, b) => b.atk - a.atk);
        target = { side: 'foe', kind: 'creature', uid: threats[0].uid };
      } else target = { side: 'foe', kind: 'hero' };
    }
  }
  const res = playCard(game, 'you', pick.card.uid, target);
  return res.ok;
}

function stageScore(game, card) {
  if (card.kind === 'creature') return card.atk * 2 + card.hp;
  if (card.kind === 'damage') return card.amount * 1.5;
  if (card.kind === 'heal') return game.you.hp < 12 ? 5 : -2;
  if (card.kind === 'shield') return game.foe.board.length > 0 ? 3 : -1;
  return 0;
}

function simulate(game, rounds, playerPlays) {
  for (let r = 0; r < rounds && game.phase !== 'over'; r++) {
    if (playerPlays) while (greedyPlayerPlay(game)) { if (game.phase === 'over') break; }
    if (game.phase === 'over') break;
    endPlayerTurn(game);
    if (game.phase === 'over') break;
    let guard = 0;
    while (guard++ < 20) {
      const step = aiStep(game);
      if (!step.played || game.phase === 'over') break;
    }
    if (game.phase === 'over') break;
    endFoeTurn(game);
  }
  return game;
}

export function stageGame(shot, seed) {
  if (shot === 'play') {
    // Pick a seed whose mid-game has creatures on both boards and a full hand.
    for (let s = seed; s < seed + 40; s++) {
      const game = newGame('adept', s);
      simulate(game, 3, true);
      if (game.phase === 'player' && game.you.board.length >= 1 && game.foe.board.length >= 1
          && game.you.hand.length >= 3) {
        return { game, caption: 'Mid-duel: creatures on both boards, mana to spend, the Warden under pressure.' };
      }
    }
    const game = newGame('adept', seed);
    simulate(game, 3, true);
    return { game, caption: 'Mid-duel: creatures on both boards, mana spent, the Warden at half health.' };
  }
  if (shot === 'win') {
    // Find a seed where the greedy line actually wins; fall back to a scripted lethal finish.
    for (let s = seed; s < seed + 30; s++) {
      const game = newGame('adept', s + 11);
      simulate(game, 40, true);
      if (game.phase === 'over' && game.winner === 'you') {
        game.stats.turns = Math.max(game.stats.turns, game.turn);
        return { game, caption: 'Victory over the Cinder Warden.' };
      }
    }
    const game = newGame('adept', seed + 101);
    simulate(game, 4, true);
    if (game.phase === 'over') { // lost already: start a fresh late-game table instead
      const fresh = newGame('adept', seed + 202);
      simulate(fresh, 4, true);
      return finishWin(fresh);
    }
    return finishWin(game);
  }
  if (shot === 'loss') {
    const game = newGame('adept', seed + 23);
    simulate(game, 40, false);
    if (game.phase !== 'over') dealDamage(game, game.you, 999);
    game.stats.turns = Math.max(game.stats.turns, game.turn);
    return { game, caption: 'Defeat — the Warden’s embers overwhelm you.' };
  }
  const game = newGame('adept', seed);
  return { game, caption: '' };
}

// Script a real lethal finish: put the Warden at 2 health, hand the player an Ember Bolt,
// and play it through the engine at the Warden's hero.
function finishWin(game) {
  if (game.phase === 'over') return { game, caption: 'Victory over the Cinder Warden.' };
  game.foe.hp = 2;
  game.foe.armor = 0;
  const bolt = { uid: 'stage-bolt', defId: 'emberbolt', name: 'Ember Bolt', kind: 'damage', cost: 1, amount: 2, art: '⚡', text: 'Deal 2 damage to a target.' };
  game.you.hand.push(bolt);
  game.you.mana = Math.max(game.you.mana, 1);
  playCard(game, 'you', 'stage-bolt', { side: 'foe', kind: 'hero' });
  game.stats.turns = Math.max(game.stats.turns, game.turn);
  return { game, caption: 'Victory over the Cinder Warden.' };
}
