// Ember Duel — orchestration: screens, input, the Warden's turn, and staged screenshots.
import { newGame, playCard, canPlay, endPlayerTurn, endFoeTurn, dealDamage, checkEnd, startTurn } from './engine.js';
import { aiStep } from './ai.js';
import { renderAll, logLine, floatText, heroAnchor, showScreen, showEnd } from './render.js';
import { sfx, setMuted, isMuted } from './sound.js';
import { stageGame } from './shots.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const SEED = Number(params.get('seed') || 7);

let game = null;
let difficulty = 'adept';
let selectedUid = null;
let targeting = null; // card awaiting a target
let aiBusy = false;

const ui = {
  get selectedUid() { return selectedUid; },
  get targeting() { return !!targeting; },
  onCardClick,
  onTargetCreature,
};

function fitStage() {
  const s = Math.min(1, window.innerWidth / 1280, window.innerHeight / 720);
  $('stage').style.transform = `scale(${s})`;
}
window.addEventListener('resize', fitStage);
fitStage();

// ---------- Screens ----------
// Safe localStorage: the hosted page may block storage, and a broken game is worse than a lost record.
function readBest() {
  try { return JSON.parse(localStorage.getItem('ember-duel-best') || '{}'); } catch { return {}; }
}
function writeBest(best) {
  try { localStorage.setItem('ember-duel-best', JSON.stringify(best)); } catch { /* best record is decoration */ }
}

function showTitle() {
  const best = readBest();
  const line = Object.entries(best).map(([d, w]) => `${d}: ${w} win${w === 1 ? '' : 's'}`).join(' · ');
  $('best-line').textContent = line ? `Your record — ${line}` : 'No duels won yet. The table is waiting.';
  showScreen('title-screen');
}

function startDuel() {
  game = newGame(difficulty, (Math.random() * 1e9) | 0);
  selectedUid = null; targeting = null; aiBusy = false;
  $('foe-diff').textContent = `· ${game.diff.label}`;
  showScreen('table-screen');
  renderAll(game, ui);
  logLine('The duel begins. Your creatures strike at the start of your turn.');
  sfx.turn();
}

function endDuel() {
  const won = game.winner === 'you';
  if (won) {
    const best = readBest();
    best[difficulty] = (best[difficulty] || 0) + 1;
    writeBest(best);
  }
  renderAll(game, ui);
  showEnd(won, game);
  if (won) sfx.win(); else sfx.lose();
}

// ---------- Playing a card ----------
function onCardClick(card) {
  if (!game || game.phase !== 'player' || aiBusy) return;
  if (targeting && targeting.uid === card.uid) { cancelTargeting(); return; }
  if (!canPlay(game, game.you, card)) {
    logLine(`${card.name} costs ${card.cost} mana — you have ${game.you.mana}.`);
    return;
  }
  if (card.kind === 'damage') {
    targeting = card; selectedUid = card.uid;
    $('target-hint').classList.remove('hidden');
    renderAll(game, ui);
    logLine(`Choose a target for ${card.name}.`);
    sfx.click();
    return;
  }
  resolvePlay(card, null);
}

function onTargetCreature(creature) {
  if (!targeting) return;
  resolvePlay(targeting, { side: 'foe', kind: 'creature', uid: creature.uid });
}

function resolvePlay(card, target) {
  const res = playCard(game, 'you', card.uid, target);
  cancelTargeting();
  if (!res.ok) { logLine(res.reason || 'That cannot be played.'); return; }
  handleEvents(res.events, 'you');
  renderAll(game, ui);
  if (game.phase === 'over') endDuel();
}

function cancelTargeting() {
  targeting = null; selectedUid = null;
  $('target-hint').classList.add('hidden');
}

function onHeroClick(who) {
  if (!targeting || who !== 'foe') return;
  resolvePlay(targeting, { side: 'foe', kind: 'hero' });
}

// ---------- Events -> feedback ----------
function handleEvents(events, who) {
  for (const ev of events) {
    const mine = ev.who === 'you';
    if (ev.type === 'play') logLine(`${mine ? 'You play' : 'Warden plays'} ${ev.card.name}.`);
    else if (ev.type === 'summon') { logLine(`${ev.card.name} joins the ${mine ? 'your' : 'Warden’s'} board.`); sfx.summon(); }
    else if (ev.type === 'strike') {
      const a = heroAnchor(ev.who === 'you' ? 'foe' : 'you');
      floatText(a.x - 10, a.y - 14, `-${ev.amount}`, 'dmg');
      logLine(`${ev.card.name} strikes for ${ev.amount}.`);
      sfx.hit();
    } else if (ev.type === 'damage') {
      if (ev.creatureUid) { sfx.hit(); logLine(`A creature takes ${ev.amount} damage.`); }
    } else if (ev.type === 'slay') { logLine(`${ev.card.name} is destroyed!`); sfx.hit(); }
    else if (ev.type === 'spell') { sfx.play(); }
    else if (ev.type === 'heal') {
      const a = heroAnchor(ev.who);
      floatText(a.x - 10, a.y - 14, `+${ev.amount}`, 'heal');
      logLine(`${mine ? 'You restore' : 'Warden restores'} ${ev.amount} health.`);
      sfx.heal();
    } else if (ev.type === 'shield') {
      const a = heroAnchor(ev.who);
      floatText(a.x - 10, a.y - 14, `+${ev.amount} 🛡`, 'shield');
      logLine(`${mine ? 'You gain' : 'Warden gains'} ${ev.amount} armor.`);
      sfx.shield();
    } else if (ev.type === 'turn') {
      logLine(ev.who === 'you' ? `Turn ${ev.turn} — your move.` : 'The Warden takes the turn.');
      if (ev.who === 'you') sfx.turn();
    } else if (ev.type === 'draw') {
      if (ev.who === 'you') logLine(`You draw ${ev.card.name}.`);
    } else if (ev.type === 'fatigue') {
      logLine(`${mine ? 'Your' : 'The Warden’s'} deck is empty — fatigue bites for 1.`);
    }
  }
}

// ---------- The Warden's turn ----------
function runFoeTurn() {
  aiBusy = true;
  renderAll(game, ui);
  const step = () => {
    if (!game || game.phase !== 'foe') { aiBusy = false; return; }
    const { played, done, events } = aiStep(game);
    if (played) handleEvents(events, 'foe');
    renderAll(game, ui);
    if (game.phase === 'over') { aiBusy = false; endDuel(); return; }
    if (done) {
      const evs = endFoeTurn(game);
      handleEvents(evs, 'you');
      aiBusy = false;
      renderAll(game, ui);
      if (game.phase === 'over') endDuel();
      return;
    }
    setTimeout(step, game.diff.aiDelay);
  };
  setTimeout(step, game.diff.aiDelay);
}

// ---------- Wiring ----------
$('play-btn').addEventListener('click', () => { sfx.click(); startDuel(); });
$('again-btn').addEventListener('click', () => { sfx.click(); startDuel(); });
$('end-turn-btn').addEventListener('click', () => {
  if (!game || game.phase !== 'player' || aiBusy) return;
  cancelTargeting();
  const evs = endPlayerTurn(game);
  handleEvents(evs, 'foe');
  renderAll(game, ui);
  if (game.phase === 'over') { endDuel(); return; }
  runFoeTurn();
});
$('foe-hp-fill').parentElement.addEventListener('click', () => onHeroClick('foe'));
document.querySelector('#opponent-bar .portrait').addEventListener('click', () => onHeroClick('foe'));
document.querySelectorAll('.diff-btn').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.diff-btn').forEach((x) => x.classList.remove('selected'));
    b.classList.add('selected');
    difficulty = b.dataset.diff;
    sfx.click();
  });
});
$('mute-btn').addEventListener('click', () => {
  setMuted(!isMuted());
  $('mute-btn').textContent = isMuted() ? '🔇' : '🔊';
});
document.addEventListener('keydown', (e) => {
  if (!$('title-screen').classList.contains('hidden')) {
    if (e.key === 'Enter') startDuel();
    return;
  }
  if (!$('end-screen').classList.contains('hidden')) {
    if (e.key === 'r' || e.key === 'R' || e.key === 'Enter') startDuel();
    return;
  }
  if (!game || game.phase !== 'player' || aiBusy) return;
  if (e.key === 'e' || e.key === 'E') { $('end-turn-btn').click(); return; }
  if (e.key === 'Escape') { cancelTargeting(); renderAll(game, ui); return; }
  const n = Number(e.key);
  if (n >= 1 && n <= game.you.hand.length) onCardClick(game.you.hand[n - 1]);
});

// ---------- Staged screenshots (?shot=start|play|win|loss) ----------
if (SHOT) {
  document.body.classList.add('shot-mode');
  if (SHOT === 'start') {
    showTitle();
  } else {
    const staged = stageGame(SHOT, SEED);
    game = staged.game;
    difficulty = staged.game.difficulty;
    $('foe-diff').textContent = `· ${game.diff.label}`;
    showScreen('table-screen');
    renderAll(game, ui);
    if (SHOT === 'win' || SHOT === 'loss') {
      renderAll(game, ui);
      showEnd(SHOT === 'win', game);
    } else {
      logLine(staged.caption);
    }
  }
} else {
  showTitle();
}
