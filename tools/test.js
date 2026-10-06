'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { buildArtifact, OUTPUT } = require('./build-artifact');

const ROOT = path.resolve(__dirname, '..');
const sandbox = { console, Math, JSON };
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const filename of ['config.js', 'sprites.js', 'world.js', 'game.js', 'screen.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', filename), 'utf8'), sandbox, { filename });
}
const FG = sandbox.FG;
const C = FG.Config;
const W = FG.World;
const Game = FG.Game;
const { UP, DOWN, LEFT, RIGHT } = Game;

function run(game, frames, pad) {
  for (let i = 0; i < frames; i++) game.frame(pad || {});
}

// Frames until `done` holds, failing after `limit`.
function until(game, done, limit, pad) {
  let frames = 0;
  while (!done(game)) {
    assert.ok(frames < limit, `a condição não chegou em ${limit} quadros`);
    game.frame(pad || {});
    frames++;
  }
  return frames;
}

// A game in play, right after the start tune, optionally moved to another level.
function playing(number, level) {
  const game = new Game();
  game.game = number || 1;
  game.press('reset');
  until(game, (g) => g.state === 'play', 600);
  if (level) {
    game.current.level = level;
    game.tableLevel = level;
  }
  return game;
}

// The joystick is read on odd frames: push on one, and let the next odd frame see it released.
function hop(game, stick) {
  if (((game.counter + 1) & 1) === 0) game.frame({});
  game.frame({ stick });
  game.frame({});
  game.frame({});
}

// Runs one odd frame with the rows exactly as given, so the collision sees them.
function oddFrame(game, pad) {
  if (((game.counter + 1) & 1) === 0) game.frame({});
  game.frame(pad || {});
}

function placeFrog(game, row, x) {
  game.frog.row = row;
  game.frog.x = x;
  game.frog.face = 'up';
  game.frog.riding = row >= 6;
}

test('colisão do cartucho: o vão de um grupo de tartarugas segura o sapo e o espaço de 32 px não', () => {
  // A trio of single turtles 16 px apart starting at 40: copies at 40, 56 and 72.
  for (let x = 33; x <= 80; x++) assert.equal(W.touches(x, 40, 8) || W.touches(x, 56, 8) || W.touches(x, 72, 8), true, `x ${x}`);
  // Two copies 32 px apart (40 and 72): the frog between 49 and 64 is in the water.
  for (let x = 49; x <= 64; x++) assert.equal(W.touches(x, 40, 8) || W.touches(x, 72, 8), false, `x ${x}`);
  // The pixel past the right edge still counts, and objects wrap around the 160 px line.
  assert.equal(W.touches(48, 40, 8), true);
  assert.equal(W.touches(49, 40, 8), false);
  assert.equal(W.touches(3, 155, 8), true);
  assert.equal(W.touches(156, 3, 8), true);
});

test('as tocas aceitam o sapo em [11, 18] + 32n; o resto do topo é arbusto', () => {
  for (let x = 1; x <= 160; x++) {
    const game = playing(1);
    placeFrog(game, 10, x);
    game.enterBay();
    const offset = x - 11;
    const inside = offset >= 0 && offset % 32 < 8 && offset < 5 * 32;
    if (inside) {
      assert.equal(game.frog.row, Game.IN_BAY, `x ${x} entra`);
      assert.equal(game.current.bays, 1 << Math.floor(offset / 32), `x ${x} enche a toca certa`);
    } else {
      assert.equal(game.frog.face, 'dead', `x ${x} bate no arbusto`);
      assert.equal(game.reason, 'arbusto');
    }
  }
});

test('toca ocupada não deixa entrar: o sapo fica na fileira de cima, sem som nem pontos', () => {
  const game = playing(1);
  game.current.bays = 0x04;
  placeFrog(game, 10, 75);
  const before = game.current.score;
  game.events.length = 0;
  game.enterBay();
  assert.equal(game.frog.row, 10);
  assert.equal(game.state, 'play');
  assert.equal(game.current.score, before);
  assert.deepEqual(Array.from(game.events), []);
});

test('chegar em casa vale 5 mais 2 por unidade de tempo; o próximo sapo sai 9 quadros depois', () => {
  const game = playing(1);
  placeFrog(game, 10, 43);
  game.timer = 30;
  game.enterBay();
  assert.equal(game.current.score, 65);
  assert.equal(game.state, 'pause');
  const frames = until(game, (g) => g.state === 'play', 20);
  assert.equal(frames, 9);
  assert.equal(game.frog.row, C.SIDEWALK);
  assert.equal(game.frog.x, 80);
  assert.equal(game.timer, 30);
});

test('a quinta toca dá 99 pontos (não 100), sobe a fase e toca a música ímpar', () => {
  const game = playing(1);
  game.current.bays = 0x0F;
  placeFrog(game, 10, 139);
  game.timer = 30;
  game.enterBay();
  game.frame({});
  assert.equal(game.current.score, 164);
  assert.equal(game.current.level, 2);
  assert.equal(game.sound.tune, C.TUNES.theme);
  const frames = until(game, (g) => g.state === 'play', 600);
  assert.ok(frames >= 434 && frames <= 437, `a música durou ${frames} quadros`);
  assert.equal(game.current.bays, 0);
  // Level 2 ends with the other tune.
  game.current.bays = 0x0F;
  placeFrog(game, 10, 139);
  game.enterBay();
  game.frame({});
  assert.equal(game.sound.tune, C.TUNES.start);
});

test('mosca vale 20, jacaré subindo deixa entrar sem bônus e jacaré fora da água mata', () => {
  const fly = playing(1);
  fly.visitor.bay = 3;
  fly.visitor.kind = 'fly';
  placeFrog(fly, 10, 75);
  fly.timer = 10;
  fly.enterBay();
  assert.equal(fly.current.score, 20 + 5 + 20);
  assert.equal(fly.visitor.bay, 0);

  const rising = playing(1);
  rising.visitor.bay = 2;
  rising.visitor.kind = 'rising';
  placeFrog(rising, 10, 43);
  rising.timer = 10;
  rising.enterBay();
  assert.equal(rising.current.score, 5 + 20);
  assert.equal(rising.frog.row, Game.IN_BAY);

  const croc = playing(1);
  croc.visitor.bay = 1;
  croc.visitor.kind = 'croc';
  placeFrog(croc, 10, 11);
  croc.enterBay();
  assert.equal(croc.frog.face, 'dead');
  assert.equal(croc.reason, 'jacaré');
});

test('visitantes: mosca nas fases ímpares, jacaré nas pares, 157 quadros cada etapa', () => {
  const game = playing(1);
  until(game, (g) => g.visitor.bay !== 0, 1200);
  assert.equal(game.visitor.kind, 'fly');
  const shown = until(game, (g) => g.visitor.bay === 0, 400);
  assert.equal(shown, C.VISIT);

  const even = playing(1, 2);
  until(even, (g) => g.visitor.bay !== 0, 1200);
  assert.equal(even.visitor.kind, 'rising');
  assert.equal(until(even, (g) => g.visitor.kind === 'croc', 400), C.VISIT);
  assert.equal(until(even, (g) => g.visitor.bay === 0, 400), C.VISIT);
});

test('a rã-dama sobe no sapo a até 5 px à esquerda ou 6 à direita e vale 20 em casa', () => {
  for (const [offset, carried] of [[-6, false], [-5, true], [0, true], [6, true], [7, false]]) {
    const game = playing(1);
    game.lady = { row: C.LADY_ROW, x: 60, step: 0, flags: 0xC0 };
    placeFrog(game, C.LADY_ROW, 60 - offset);
    game.counter = 1;
    game.updateLady();
    assert.equal(game.lady.row === 0x7F, carried, `diferença ${offset}`);
    if (carried) assert.equal(game.frog.ink, C.INK.olive);
  }
  const game = playing(1);
  game.lady = { row: 0x7F, x: 60, step: 0, flags: 0x40 };
  placeFrog(game, 10, 107);
  game.timer = 0;
  game.enterBay();
  assert.equal(game.current.score, 25);
});

test('pular para a frente só pontua numa fileira nova, no máximo 11 pontos por sapo', () => {
  const game = playing(1);
  hop(game, UP);
  assert.equal(game.current.score, 1);
  hop(game, DOWN);
  hop(game, UP);
  assert.equal(game.current.score, 1, 'voltar e avançar de novo não pontua');
  hop(game, UP);
  assert.equal(game.current.score, 2);
  assert.equal(game.frog.best, 2);
});

test('um sapo extra a cada milhar, só com menos de quatro na reserva', () => {
  const game = playing(1);
  game.current.score = 995;
  game.current.reserves = 3;
  game.addScore(5);
  assert.equal(game.current.score, 1000);
  assert.equal(game.current.reserves, 4);
  game.current.score = 1995;
  game.addScore(5);
  assert.equal(game.current.reserves, 4, 'a reserva para em quatro');
  game.current.score = 9990;
  game.current.reserves = 1;
  game.addScore(20);
  assert.equal(game.current.score, 10);
  assert.equal(game.current.reserves, 2, 'a virada do placar também conta');
});

test('o tempo: 30 unidades de 64 quadros, aviso em 6 e o sapo se perde no fim', () => {
  const game = playing(1);
  let warned = 0;
  const frames = until(game, (g) => {
    if (g.timer === C.TIMER_WARNING && g.sound.effect === C.EFFECTS.warning) warned++;
    return g.frog.face === 'dead';
  }, 2000);
  assert.ok(frames >= 1856 && frames <= 1920, `o tempo durou ${frames} quadros`);
  assert.ok(warned > 0, 'o aviso tocou');
  assert.equal(game.reason, 'tempo');
});

test('depois de uma morte o próximo sapo sai em 71 quadros', () => {
  const game = playing(1);
  game.die('trânsito');
  assert.equal(until(game, (g) => g.state === 'play', 100), 71);
  assert.equal(game.current.reserves, 3);
  assert.equal(game.frog.best, 0);
});

test('GAME RESET toca a música de abertura e o sapo parte em 435 a 437 quadros', () => {
  const game = new Game();
  game.press('reset');
  const frames = until(game, (g) => g.state === 'play', 600);
  assert.ok(frames >= 435 && frames <= 438, `${frames} quadros`);
  assert.equal(game.current.reserves, 4);
  assert.equal(game.current.level, 1);
});

test('Speedy Frogger repete o pulo a cada 8 quadros; os jogos 1 a 4 pedem um empurrão novo', () => {
  const speedy = playing(5);
  if (((speedy.counter + 1) & 1) === 0) speedy.frame({});
  const hops = [];
  for (let i = 0; i < 40; i++) {
    speedy.frame({ stick: RIGHT });
    if (speedy.events.includes('hop')) hops.push(i);
  }
  assert.ok(hops.length >= 4);
  for (let i = 2; i < hops.length; i++) assert.equal(hops[i] - hops[i - 1], 8);

  const plain = playing(1);
  run(plain, 40, { stick: RIGHT });
  assert.equal(plain.frog.x, 88, 'segurar não repete');
});

test('trocar de direção sem soltar já pula, e diagonal não faz nada', () => {
  const game = playing(1);
  if (((game.counter + 1) & 1) === 0) game.frame({});
  game.frame({ stick: UP });
  game.frame({ stick: UP });
  game.frame({ stick: LEFT });
  assert.equal(game.frog.row, 0);
  assert.equal(game.frog.x, 72);
  const diagonal = playing(1);
  run(diagonal, 4, { stick: UP | RIGHT });
  assert.equal(diagonal.frog.row, C.SIDEWALK);
  assert.equal(diagonal.frog.x, 80);
});

test('o sapo não pula para fora da tela nem para trás da calçada', () => {
  const game = playing(1);
  game.frog.x = 144;
  hop(game, RIGHT);
  assert.equal(game.frog.x, 144);
  game.frog.x = 8;
  hop(game, LEFT);
  assert.equal(game.frog.x, 8);
  hop(game, DOWN);
  assert.equal(game.frog.row, C.SIDEWALK);
});

test('dificuldade A: levado para x ≥ 147 ou x < 4, o sapo se perde; em B ele dá a volta', () => {
  for (const [x, alive] of [[146, true], [147, false], [4, true], [3, false]]) {
    const game = playing(1);
    game.difficulty[0] = true;
    placeFrog(game, 8, x);
    game.rows[8].a = x - 4;
    game.rows[8].b = (x + 28) % 160 || 160;
    oddFrame(game);
    assert.equal(game.frog.face !== 'dead', alive, `x ${x}`);
  }
  const game = playing(1);
  placeFrog(game, 8, 160);
  game.rows[8].a = 140;
  game.rows[8].b = 172 - 160;
  oddFrame(game);
  assert.notEqual(game.frog.face, 'dead');
  until(game, (g) => g.frog.x === 1, 10);
});

test('a cabeça do jacaré mata de p + 22 a p + 32; o resto do corpo carrega', () => {
  for (let d = -7; d <= 34; d++) {
    const game = playing(1, 2);
    game.rows[10].a = 40;
    game.rows[10].b = 120;
    placeFrog(game, 10, 40 + d);
    oddFrame(game);
    const dead = game.frog.face === 'dead';
    if (d >= 22 && d <= 32) assert.equal(dead && game.reason, 'jacaré', `d ${d}`);
    else if (d <= 32) assert.equal(dead, false, `d ${d}`);
  }
});

test('a cobra da margem só morde com a cabeça, de p + 7 a p + 14', () => {
  for (let d = -8; d <= 20; d++) {
    const game = playing(1, 4);
    game.rows[C.BANK].b = 60;
    placeFrog(game, C.BANK, 60 + d);
    oddFrame(game);
    assert.equal(game.frog.face === 'dead', d >= 7 && d <= 14, `d ${d}`);
  }
});

test('a cobra do tronco morde pelo lado para onde está virada', () => {
  const cases = [[false, 8, true], [false, 15, true], [false, 7, false], [false, -3, false], [true, 0, true], [true, -7, true], [true, 1, false], [true, 10, false]];
  for (const [left, d, bitten] of cases) {
    const game = playing(1, 5);
    game.snake = { row: C.SNAKE_ROW, x: 60, flags: left ? 0x40 : 0 };
    game.rows[8].a = 40;
    game.rows[8].b = 72;
    placeFrog(game, C.SNAKE_ROW, 60 + d);
    game.updateSnake();
    assert.equal(game.frog.face === 'dead', bitten, `${left ? 'esquerda' : 'direita'} ${d}`);
  }
});

test('só o segundo grupo de cada fileira de tartarugas mergulha, num ciclo de 1024 quadros', () => {
  assert.deepEqual(Array.from(C.DIVE[6]), [C.INK.turtle, C.INK.diving, C.INK.gone, C.INK.diving]);
  assert.deepEqual(Array.from(C.DIVE[9]), [C.INK.diving, C.INK.gone, C.INK.diving, C.INK.turtle]);
  const game = playing(1);
  game.divePhase = 2;
  game.rows[6].a = 100;
  game.rows[6].b = 40;
  placeFrog(game, 6, 44);
  oddFrame(game);
  assert.equal(game.reason, 'tartaruga');
  const safe = playing(1);
  safe.divePhase = 2;
  safe.rows[6].a = 40;
  safe.rows[6].b = 100;
  placeFrog(safe, 6, 44);
  oddFrame(safe);
  assert.notEqual(safe.frog.face, 'dead');
  const phases = new Game();
  const start = phases.divePhase;
  run(phases, 256);
  assert.equal(phases.divePhase, (start + 1) & 3);
});

test('cada fileira anda 1 px nos quadros em que (contador & máscara) é zero', () => {
  for (let level = 1; level <= 10; level++) {
    for (let row = 0; row < 11; row++) {
      const rows = W.createRows();
      const drawn = W.createRows();
      let moved = 0;
      for (let counter = 0; counter < 256; counter++) {
        const before = rows[row].a;
        W.advance(rows, drawn, level, counter);
        if (rows[row].a !== before) moved++;
      }
      assert.equal(moved, 256 / (C.MASKS[level - 1][row] + 1), `fase ${level}, fileira ${row}`);
    }
  }
  assert.equal(W.table(11), 0, 'a fase 11 repete as tabelas da fase 1');
});

test('chegar em casa devolve duas pistas vizinhas ao começo, e a tela só as vê quando andam', () => {
  const game = playing(1);
  run(game, 3);
  const before = game.rows.map((r) => ({ a: r.a, b: r.b }));
  const drawn = game.drawn.map((r) => ({ a: r.a, b: r.b }));
  placeFrog(game, 10, 11);
  const first = game.counter & 3;
  game.enterBay();
  for (let r = 0; r < 11; r++) {
    const snapped = r === first || r === first + 1;
    assert.deepEqual({ a: game.rows[r].a, b: game.rows[r].b }, snapped ? { a: C.ROWS[r].start[0], b: C.ROWS[r].start[1] } : before[r]);
    assert.deepEqual({ a: game.drawn[r].a, b: game.drawn[r].b }, drawn[r]);
  }
});

test('dois jogadores: a vez passa na morte, não na chegada, e o fim vem quando os dois acabam', () => {
  const game = playing(2);
  placeFrog(game, 10, 11);
  game.enterBay();
  until(game, (g) => g.state === 'play', 20);
  assert.equal(game.player, 0, 'chegar em casa não passa a vez');
  game.die('trânsito');
  until(game, (g) => g.state === 'play', 100);
  assert.equal(game.player, 1);
  assert.equal(game.players[1].reserves, 4);
  assert.equal(game.players[0].bays, 1);
  assert.equal(game.players[1].bays, 0);
  game.players[0].reserves = -1;
  game.die('água');
  until(game, (g) => g.state === 'play', 100);
  assert.equal(game.player, 1, 'sem sapos do outro lado, o mesmo jogador continua');
  game.players[1].reserves = 0;
  game.die('água');
  until(game, (g) => g.state === 'over', 100);
  assert.equal(game.state, 'over');
  assert.equal(game.sound.tune, C.TUNES.theme);
  game.frame({ fire: true, fire2: true });
  assert.equal(game.state, 'pause');
  assert.equal(game.game, 2, 'o botão vermelho joga de novo o mesmo jogo');
  assert.equal(game.players[0].score, 0);
});

test('GAME SELECT percorre os jogos de 1 a 6 e mostra os rostos nas tocas', () => {
  const game = new Game();
  const seen = [];
  for (let i = 0; i < 6; i++) {
    game.press('select');
    run(game, 4);
    seen.push([game.game, game.players[0].bays]);
  }
  assert.deepEqual(seen, [[2, 0x0A], [3, 0x04], [4, 0x0A], [5, 0x04], [6, 0x0A], [1, 0x04]]);
  assert.equal(game.state, 'select');
  game.press('select');
  game.press('reset');
  run(game, 2);
  assert.equal(game.state, 'pause', 'GAME RESET tem prioridade sobre GAME SELECT');
  const three = new Game();
  three.game = 2;
  three.press('select');
  run(three, 4);
  three.press('reset');
  until(three, (g) => g.state === 'play', 600);
  assert.equal(three.current.level, 3, 'os jogos 3 e 4 começam na fase 3');
});

test('parado na seleção por 7.680 quadros, o console entra na demonstração', () => {
  const game = new Game();
  const frames = until(game, (g) => g.state === 'over', 8000);
  assert.equal(frames, 7680);
  assert.equal(game.tableLevel, 4, 'a demonstração usa o trânsito da fase 4');
});

test('o som do pulo e as músicas seguem o driver do cartucho', () => {
  const game = playing(1);
  if (((game.counter + 1) & 1) === 0) game.frame({});
  // The hop happens after the picture and the sound driver starts it on the next frame.
  game.frame({ stick: UP });
  const regs = [];
  for (let i = 0; i < 10; i++) {
    game.frame({});
    regs.push(game.registers[0].join());
  }
  assert.deepEqual(regs.slice(0, 9), ['4,13,9', '4,13,9', '4,13,9', '4,7,8', '4,7,8', '4,7,8', '4,16,6', '4,16,6', '4,16,6']);
  assert.equal(regs[9].split(',')[2], '0');
  assert.equal(C.TUNES.start.length, 29);
  assert.equal(C.TUNES.theme.length, 29);
  // An effect asked for during a tune is dropped when the tune ends.
  const tune = new Game();
  tune.press('reset');
  run(tune, 10);
  tune.playEffect('hop');
  until(tune, (g) => !g.tunePlaying, 600);
  run(tune, 2);
  assert.equal(tune.registers[0][2], 0);
});

test('o quadro desenhado tem as cores e faixas do cartucho', () => {
  const game = playing(1);
  const pixels = FG.Screen.create();
  game.counter = 2;
  FG.Screen.draw(game, pixels);
  const color = (x, y) => '#' + (pixels[y * 160 + x] & 0xFFFFFF).toString(16).padStart(6, '0').match(/../g).reverse().join('').toUpperCase();
  assert.equal(color(80, 95), '#E8E84A', 'margem');
  assert.equal(color(120, 175), '#E8E84A', 'calçada');
  assert.equal(color(12, 20), '#001C88', 'água da toca');
  assert.equal(color(30, 20), '#527E2D', 'arbusto');
  assert.equal(color(3, 30), '#000000', 'traço do HMOVE');
  assert.equal(color(3, 31), '#527E2D', 'borda');
  assert.equal(color(140, 184), '#000000', 'faixa de tempo');
  assert.equal(color(18, 184), '#ECECEC', 'reserva');
  assert.equal(color(79, 171), '#6E9C42', 'sapo na calçada');
  game.toggleColor();
  FG.Screen.draw(game, pixels);
  assert.equal(color(80, 95), '#AAAAAA', 'margem em preto e branco');
});

test('o HTML portátil reúne todos os scripts e o estilo', () => {
  const output = buildArtifact();
  assert.equal(output.filename, OUTPUT);
  const html = fs.readFileSync(OUTPUT, 'utf8');
  assert.ok(!/<script\b[^>]*\bsrc=/i.test(html));
  assert.ok(!/<link\b[^>]*stylesheet/i.test(html));
  for (const name of ['FG.Config', 'FG.World', 'FG.Sprites', 'FG.Audio', 'FG.Input', 'FG.Game', 'FG.Screen', 'FG.boot']) {
    assert.ok(html.includes(name), name);
  }
});
