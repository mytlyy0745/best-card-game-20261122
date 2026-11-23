// Ember Duel engine: pure turn-based card-battle rules, no DOM here.
// A side: { hp, maxHp, armor, mana, maxMana, deck[], hand[], board[] }.
// Creatures strike the enemy hero at the start of their owner's turn.
// The first side reduced to 0 health loses. Fatigue: drawing from an empty deck costs 1 health.
import { buildDeck } from './cards.js';
import { mulberry32, shuffle } from './random.js';

export const MAX_HAND = 7;
export const MAX_BOARD = 6;

export const DIFFICULTY = {
  apprentice: { label: 'Apprentice', foeHp: 22, foeStartCards: 3, aiDelay: 750, aiMistake: 0.25 },
  adept:      { label: 'Adept',      foeHp: 25, foeStartCards: 3, aiDelay: 600, aiMistake: 0.10 },
  master:     { label: 'Master',     foeHp: 28, foeStartCards: 4, aiDelay: 480, aiMistake: 0.0 },
};

export function newGame(difficultyKey, seed) {
  const rand = mulberry32(seed ?? ((Math.random() * 1e9) | 0));
  const diff = DIFFICULTY[difficultyKey] ?? DIFFICULTY.adept;
  const game = {
    difficulty: difficultyKey,
    diff,
    seed,
    rand,
    turn: 1,
    phase: 'player', // 'player' | 'foe' | 'over'
    winner: null, // 'you' | 'foe'
    log: [],
    stats: { turns: 0, cardsPlayed: 0, damageDealt: 0, creaturesSummoned: 0 },
    you: makeSide('you', 25, rand, 3),
    foe: makeSide('foe', diff.foeHp, rand, diff.foeStartCards),
  };
  game.you.mana = 1; game.you.maxMana = 1;
  game.foe.mana = 0; game.foe.maxMana = 0;
  return game;
}

function makeSide(who, hp, rand, startCards) {
  const side = {
    who, hp, maxHp: hp, armor: 0, mana: 0, maxMana: 0,
    deck: buildDeck(rand, who), hand: [], board: [],
  };
  for (let i = 0; i < startCards; i++) drawCard(side, true);
  return side;
}

export function drawCard(side, silent) {
  if (side.hand.length >= MAX_HAND) {
    side.deck.shift(); // hand full: the drawn card is discarded
    return null;
  }
  const card = side.deck.shift();
  if (!card) {
    side.hp -= 1; // fatigue
    return { fatigue: true };
  }
  side.hand.push(card);
  return card;
}

export function canPlay(game, side, card) {
  if (game.phase === 'over') return false;
  if (side.who === 'you' && game.phase !== 'player') return false;
  if (side.who === 'foe' && game.phase !== 'foe') return false;
  if (card.cost > side.mana) return false;
  if (card.kind === 'creature' && side.board.length >= MAX_BOARD) return false;
  return true;
}

export function needsTarget(card) {
  return card.kind === 'damage';
}

// Play a card. For damage spells pass target: { side: 'foe'|'you', kind: 'hero'|'creature', uid? }.
// Returns { ok, reason?, events[] } where events describe what happened for the UI.
export function playCard(game, side, cardUid, target) {
  const sideObj = side === 'you' ? game.you : game.foe;
  const enemy = side === 'you' ? game.foe : game.you;
  const idx = sideObj.hand.findIndex((c) => c.uid === cardUid);
  if (idx === -1) return { ok: false, reason: 'card not in hand' };
  const card = sideObj.hand[idx];
  if (!canPlay(game, sideObj, card)) return { ok: false, reason: 'cannot play that card now' };
  if (needsTarget(card) && !target) return { ok: false, reason: 'needs a target', needsTarget: true };

  sideObj.hand.splice(idx, 1);
  sideObj.mana -= card.cost;
  game.stats.cardsPlayed++;
  const events = [{ type: 'play', who: side, card }];

  if (card.kind === 'creature') {
    sideObj.board.push({ ...card });
    game.stats.creaturesSummoned++;
    events.push({ type: 'summon', who: side, card });
  } else if (card.kind === 'damage') {
    const t = resolveTarget(game, side, target);
    if (!t) return { ok: false, reason: 'bad target' };
    if (t.kind === 'creature') {
      t.creature.hp -= card.amount;
      events.push({ type: 'damage', who: t.sideObj.who, amount: card.amount, creatureUid: t.creature.uid });
      if (side === 'you') game.stats.damageDealt += card.amount;
      if (t.creature.hp <= 0) events.push({ type: 'slay', who: t.sideObj.who, card: t.creature });
      sweepBoards(game);
    } else {
      const dealt = dealDamage(game, t.sideObj, card.amount, events);
      if (side === 'you') game.stats.damageDealt += dealt;
    }
    events.push({ type: 'spell', who: side, card, target: t });
  } else if (card.kind === 'heal') {
    const healed = Math.min(card.amount, sideObj.maxHp - sideObj.hp);
    sideObj.hp += healed;
    events.push({ type: 'heal', who: side, amount: healed, card });
  } else if (card.kind === 'shield') {
    sideObj.armor += card.amount;
    events.push({ type: 'shield', who: side, amount: card.amount, card });
  }
  checkEnd(game);
  return { ok: true, events };
}

function resolveTarget(game, side, target) {
  const enemy = side === 'you' ? game.foe : game.you;
  const ally = side === 'you' ? game.you : game.foe;
  if (target.kind === 'hero') {
    // Damage spells may only hit the enemy hero, never your own.
    if (target.side !== enemy.who) return null;
    return { sideObj: enemy, kind: 'hero' };
  }
  if (target.kind === 'creature') {
    const board = target.side === enemy.who ? enemy.board : ally.board;
    const creature = board.find((c) => c.uid === target.uid);
    if (!creature) return null;
    return { sideObj: enemy, kind: 'creature', creature };
  }
  return null;
}

// Damage soaks armor first, then health. Returns the health damage dealt.
export function dealDamage(game, sideObj, amount, events) {
  let rest = amount;
  if (sideObj.armor > 0) {
    const soaked = Math.min(sideObj.armor, rest);
    sideObj.armor -= soaked;
    rest -= soaked;
    if (events) events.push({ type: 'soak', who: sideObj.who, amount: soaked });
  }
  if (rest > 0) {
    sideObj.hp -= rest;
    if (events) events.push({ type: 'damage', who: sideObj.who, amount: rest });
  }
  checkEnd(game);
  return rest;
}

// At the start of a side's turn, their creatures strike the enemy hero.
export function creatureStrike(game, side) {
  const sideObj = side === 'you' ? game.you : game.foe;
  const enemy = side === 'you' ? game.foe : game.you;
  const events = [];
  for (const creature of sideObj.board) {
    if (game.phase === 'over') break;
    const dealt = dealDamage(game, enemy, creature.atk, events);
    if (side === 'you') game.stats.damageDealt += dealt;
    events.push({ type: 'strike', who: side, card: creature, amount: creature.atk });
  }
  return events;
}

export function startTurn(game, side) {
  const sideObj = side === 'you' ? game.you : game.foe;
  game.phase = side === 'you' ? 'player' : 'foe';
  if (side === 'you') game.turn++;
  sideObj.maxMana = Math.min(10, sideObj.maxMana + 1);
  sideObj.mana = sideObj.maxMana;
  const events = [{ type: 'turn', who: side, turn: game.turn }];
  const drawn = drawCard(sideObj);
  if (drawn && drawn.fatigue) events.push({ type: 'fatigue', who: side });
  else if (drawn) events.push({ type: 'draw', who: side, card: drawn });
  const strikes = creatureStrike(game, side);
  return events.concat(strikes);
}

export function endPlayerTurn(game) {
  if (game.phase !== 'player') return [];
  return startTurn(game, 'foe');
}

export function endFoeTurn(game) {
  if (game.phase !== 'foe') return [];
  game.stats.turns++;
  return startTurn(game, 'you');
}

export function checkEnd(game) {
  if (game.phase === 'over') return;
  if (game.you.hp <= 0 && game.foe.hp <= 0) {
    game.winner = 'you'; // a draw counts as a win for the player who struck last is rare; keep it simple
  } else if (game.foe.hp <= 0) {
    game.winner = 'you';
  } else if (game.you.hp <= 0) {
    game.winner = 'foe';
  }
  if (game.winner) {
    game.phase = 'over';
    game.you.hp = Math.max(0, game.you.hp);
    game.foe.hp = Math.max(0, game.foe.hp);
  }
}

// Remove dead creatures from both boards. Returns the fallen cards.
export function sweepBoards(game) {
  const fallen = [];
  for (const side of [game.you, game.foe]) {
    const alive = [];
    for (const c of side.board) {
      if (c.hp > 0) alive.push(c);
      else fallen.push({ who: side.who, card: c });
    }
    side.board = alive;
  }
  return fallen;
}

export function describeCard(card) {
  if (card.kind === 'creature') return `${card.name} — ${card.cost} mana, ${card.atk} attack, ${card.hp} health`;
  if (card.kind === 'damage') return `${card.name} — ${card.cost} mana, deal ${card.amount} damage`;
  if (card.kind === 'heal') return `${card.name} — ${card.cost} mana, restore ${card.amount} health`;
  return `${card.name} — ${card.cost} mana, gain ${card.amount} armor`;
}
