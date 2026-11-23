// Tiny WebAudio sound effects, synthesized — no audio files needed.
let ctx = null;
let muted = false;

export function setMuted(m) { muted = m; }
export function isMuted() { return muted; }

function audio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur, type, vol, when = 0) {
  if (muted) return;
  try {
    const ac = audio();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ac.currentTime + when);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + when + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(ac.currentTime + when);
    osc.stop(ac.currentTime + when + dur);
  } catch { /* sound is decoration; a silent game still plays */ }
}

export const sfx = {
  play: () => tone(520, 0.12, 'triangle', 0.12),
  summon: () => { tone(220, 0.15, 'sawtooth', 0.08); tone(330, 0.18, 'triangle', 0.1, 0.05); },
  hit: () => { tone(160, 0.16, 'square', 0.12); tone(90, 0.2, 'sawtooth', 0.1, 0.02); },
  heal: () => { tone(660, 0.14, 'sine', 0.1); tone(880, 0.2, 'sine', 0.08, 0.08); },
  shield: () => tone(440, 0.15, 'sine', 0.1),
  turn: () => tone(392, 0.1, 'triangle', 0.09),
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 'triangle', 0.12, i * 0.13)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.07, i * 0.15)),
  click: () => tone(700, 0.05, 'square', 0.05),
};
