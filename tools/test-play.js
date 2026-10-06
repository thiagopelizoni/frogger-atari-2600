'use strict';

// Plays whole levels only through the joystick and the console switches, from power-on, and checks
// that the same game played twice ends the same way. Usage: node tools/test-play.js [levels] [game]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const sandbox = { console, Math, JSON };
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const filename of ['config.js', 'sprites.js', 'world.js', 'game.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', filename), 'utf8'), sandbox, { filename });
}
const FG = sandbox.FG;
const { UP, DOWN, LEFT, RIGHT } = FG.Game;
const C = FG.Config;

const levels = Number(process.argv[2] || 6);
const number = Number(process.argv[3] || 1);
if (!Number.isInteger(levels) || levels < 1 || levels > 12) {
  console.error('Use um número de fases de 1 a 12.');
  process.exit(2);
}
if (!C.GAMES[number] || C.GAMES[number].players !== 1) {
  console.error('Escolha um jogo de um jogador: 1, 3 ou 5.');
  process.exit(2);
}

// Distance from the frog to the closest empty bay window.
function bayDistance(game) {
  let best = Infinity;
  for (let bay = 0; bay < 5; bay++) {
    if (game.current.bays & (1 << bay)) continue;
    best = Math.min(best, Math.abs(game.frog.x - (C.BAY_LEFT + 3 + bay * C.BAY_PITCH)));
  }
  return best;
}

const MOVES = [UP, 0, LEFT, RIGHT, DOWN];

// Tries one push on a copy of the game. At depth 2 it waits eight frames and tries every second push;
// at depth 1 it waits 25 frames. A frog that dies scores nothing; otherwise the score is how far it got.
function look(game, stick, depth) {
  const copy = game.clone();
  const bays = copy.current.bays;
  const level = copy.current.level;
  copy.frame({ stick });
  const frames = depth > 1 ? 7 : 24;
  for (let i = 0; i < frames; i++) {
    copy.frame({});
    if (copy.frog.face === 'dead') return null;
    if (copy.current.bays !== bays || copy.current.level !== level) return 10000;
  }
  if (copy.state !== 'play') return null;
  if (depth > 1) {
    let best = null;
    for (const next of MOVES) {
      const value = look(copy, next, depth - 1);
      if (value !== null && (best === null || value > best)) best = value;
    }
    return best === null ? null : best - 1;
  }
  const row = copy.frog.row;
  let score = (row + 1) * 100;
  if (row === 10) score -= bayDistance(copy);
  return score;
}

function play() {
  const game = new FG.Game();
  for (let i = 1; i < number; i++) {
    game.press('select');
    for (let k = 0; k < 4; k++) game.frame({});
  }
  game.press('reset');
  const start = game.setup.level;
  let frames = 0;
  let deaths = 0;
  let level = start;
  while (game.current.level < start + levels) {
    assert.ok(frames < 60000 * levels, `o robô não terminou a fase ${level}`);
    // At game over the cartridge switches to level 4 for the attract traffic, so report our own count.
    assert.notEqual(game.state, 'over', `o robô perdeu todos os sapos na fase ${level}`);
    level = game.current.level;
    let stick = 0;
    // Decide only right before an odd frame, when the cartridge reads the joystick.
    if (game.state === 'play' && ((game.counter + 1) & 1) === 1 && game.stick === 0) {
      let best = null;
      for (const candidate of MOVES) {
        const value = look(game, candidate, 2);
        if (value !== null && (best === null || value > best.value)) best = { value, candidate };
      }
      stick = best ? best.candidate : 0;
    }
    const before = game.current.reserves;
    game.frame({ stick });
    if (game.current.reserves < before) deaths++;
    frames++;
  }
  return { frames, score: game.current.score, deaths, level: game.current.level };
}

const first = play();
const second = play();
assert.deepEqual(second, first, 'a mesma partida terminou de outro jeito');
console.log(`Jogo ${number}: ${levels} fase(s) completas em ${first.frames} quadros (${(first.frames / 3600).toFixed(1)} min), ${first.score} pontos, ${first.deaths} sapo(s) perdido(s); a repetição deu o mesmo resultado.`);
