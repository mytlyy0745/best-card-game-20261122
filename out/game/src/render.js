// Rendering: turns game state into DOM. No rules live here — see engine.js.
import { canPlay, MAX_HAND } from './engine.js';

const $ = (id) => document.getElementById(id);

export function cardElement(card, opts = {}) {
  const el = document.createElement('div');
  el.className = `card ${card.kind === 'creature' ? 'creature' : 'spell-' + card.kind}${opts.onBoard ? ' on-board' : ''}`;
  el.dataset.uid = card.uid;
  el.innerHTML = `
    <div class="cost">${card.cost}</div>
    <div class="name">${card.name}</div>
    <div class="art">${card.art}</div>
    <div class="text">${card.text}</div>
    ${card.kind === 'creature'
      ? `<div class="stats"><span class="atk">${card.atk}</span><span class="hp">${card.hp}</span></div>`
      : `<div class="type-tag">${card.kind}</div>`}`;
  if (opts.onClick) el.addEventListener('click', () => opts.onClick(card, el));
  return el;
}

export function renderAll(game, ui) {
  renderHero(game, 'you');
  renderHero(game, 'foe');
  renderMana(game, 'you');
  renderMana(game, 'foe');
  $('you-deck').textContent = `🂠 Deck ${game.you.deck.length}`;
  $('foe-deck').textContent = `🂠 Deck ${game.foe.deck.length}`;
  renderHand(game, ui);
  renderBoard(game, 'you', ui);
  renderBoard(game, 'foe', ui);
  $('end-turn-btn').disabled = game.phase !== 'player';
  const banner = $('turn-banner');
  if (game.phase === 'player') { banner.textContent = `Your turn — turn ${game.turn}`; banner.className = ''; }
  else if (game.phase === 'foe') { banner.textContent = 'Cinder Warden is thinking…'; banner.className = 'foe-turn'; }
  else { banner.textContent = game.winner === 'you' ? 'Victory!' : 'Defeat'; banner.className = ''; }
}

function renderHero(game, who) {
  const side = game[who];
  const p = who === 'you' ? 'you' : 'foe';
  const fill = $(`${p}-hp-fill`);
  fill.style.width = `${Math.max(0, (side.hp / side.maxHp) * 100)}%`;
  $(`${p}-hp-text`).textContent = `${Math.max(0, side.hp)} / ${side.maxHp} ❤`;
  $(`${p}-armor`).textContent = side.armor > 0 ? `🛡️ Armor ${side.armor}` : '';
}

function renderMana(game, who) {
  const side = game[who];
  const box = $(`${who}-mana`);
  box.innerHTML = '';
  for (let i = 0; i < side.maxMana; i++) {
    const pip = document.createElement('span');
    pip.className = 'mana-pip' + (i < side.mana ? ' full' : '');
    box.appendChild(pip);
  }
  const label = document.createElement('span');
  label.style.cssText = 'font-size:13px;color:#c9b896;margin-left:4px;';
  label.textContent = `${side.mana}/${side.maxMana} mana`;
  box.appendChild(label);
}

function renderHand(game, ui) {
  const hand = $('player-hand');
  hand.innerHTML = '';
  game.you.hand.forEach((card, i) => {
    const playable = canPlay(game, game.you, card);
    const el = cardElement(card);
    el.classList.toggle('unplayable', !playable);
    if (ui.selectedUid === card.uid) el.classList.add('selected');
    el.title = `${card.name} — press ${i + 1} to play`;
    el.addEventListener('click', () => ui.onCardClick(card, el));
    hand.appendChild(el);
  });
  const foeHand = $('foe-hand');
  foeHand.innerHTML = '';
  for (let i = 0; i < game.foe.hand.length; i++) {
    const back = document.createElement('div');
    back.className = 'card-back';
    foeHand.appendChild(back);
  }
  if (game.foe.hand.length === 0) foeHand.innerHTML = '<span class="empty-note">Warden’s hand is empty</span>';
}

function renderBoard(game, who, ui) {
  const board = $(who === 'you' ? 'player-board' : 'foe-board');
  board.innerHTML = '';
  const side = game[who];
  if (side.board.length === 0) {
    const note = document.createElement('span');
    note.className = 'empty-note';
    note.textContent = who === 'you' ? 'Your creatures gather here' : 'The Warden’s creatures gather here';
    board.appendChild(note);
    return;
  }
  for (const creature of side.board) {
    const el = cardElement(creature, { onBoard: true });
    if (ui.targeting && who === 'foe') {
      el.classList.add('targetable');
      el.addEventListener('click', () => ui.onTargetCreature(creature));
    }
    board.appendChild(el);
  }
}

export function logLine(text) {
  const log = $('combat-log');
  log.textContent = text;
}

export function floatText(x, y, text, kind) {
  const layer = $('float-layer');
  const el = document.createElement('div');
  el.className = `float-num ${kind}`;
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  layer.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

export function heroAnchor(who) {
  const el = $(who === 'you' ? 'you-hp-fill' : 'foe-hp-fill');
  const r = el.getBoundingClientRect();
  const stage = document.getElementById('stage').getBoundingClientRect();
  return { x: r.left - stage.left + r.width / 2, y: r.top - stage.top + r.height / 2 };
}

export function showScreen(id) {
  for (const s of ['title-screen', 'table-screen', 'end-screen']) $(s).classList.add('hidden');
  $(id).classList.remove('hidden');
}

export function showEnd(won, game) {
  const title = $('end-title');
  title.textContent = won ? 'VICTORY' : 'DEFEAT';
  title.className = won ? 'win' : 'lose';
  $('end-sub').textContent = won
    ? 'The Cinder Warden’s flame gutters out. The embers are yours — the table is yours.'
    : 'The Warden’s embers overwhelm you this time. Shuffle the deck and try a sharper line.';
  $('end-stats').innerHTML = `
    <div><b>${game.stats.turns}</b><span>turns</span></div>
    <div><b>${game.stats.cardsPlayed}</b><span>cards played</span></div>
    <div><b>${game.stats.damageDealt}</b><span>damage dealt</span></div>
    <div><b>${game.stats.creaturesSummoned}</b><span>creatures summoned</span></div>`;
  showScreen('end-screen');
}
