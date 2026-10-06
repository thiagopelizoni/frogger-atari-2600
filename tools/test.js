'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const sandbox = {
  console,
  Math,
  performance: { now: () => 0 },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const filename of ['config.js', 'sprites.js', 'world.js', 'audio.js', 'input.js', 'game.js']) {
  const code = fs.readFileSync(path.join(ROOT, 'js', filename), 'utf8');
  assert.equal(/\brequire\s*\(/.test(code), false, `${filename} não pode usar require`);
  assert.equal(/module\.exports/.test(code), false, `${filename} não pode usar module.exports`);
  vm.runInContext(code, sandbox, { filename });
}

const FG = sandbox.FG;
const C = FG.Config;
const World = FG.World;

function note(message) {
  console.log(`passou: ${message}`);
}

function play(variation) {
  const game = new FG.Game();
  if (variation) game.action(`select${variation}`);
  else game.action('reset');
  return game;
}

function release(game) {
  game.step(0, {});
}

function parkOthers(lane, keep, x, w) {
  for (const obj of lane.objects) {
    if (obj === keep) continue;
    obj.x = x;
    obj.w = w;
  }
}

function parkRoads(game) {
  for (let row = 1; row <= 5; row++) {
    for (const obj of game.slot.world.lanes[row].objects) {
      obj.x = 0;
      obj.w = 8;
    }
  }
}

function bayX(index) {
  const bay = C.BAYS[index];
  return bay.left + Math.floor((bay.right - bay.left - C.FROG_W) / 2);
}

function saveBay(game, index) {
  release(game);
  game.slot.row = 11;
  game.slot.x = bayX(index);
  game.slot.timeLeft = 10;
  game.step(0, { up: true });
}

function squash(game) {
  const car = game.slot.world.lanes[1].objects[0];
  car.x = game.slot.x;
  car.w = 24;
  game.slot.row = 1;
  game.step(0, {});
}

function finishDeath(game) {
  assert.equal(game.phase, 'dying');
  game.step(C.DEATH_TIME, {});
}

function signs(world, from, to) {
  const out = [];
  for (let row = from; row <= to; row++) out.push(Math.sign(world.lanes[row].objects[0].speed));
  return out;
}

function speeds(world, from, to) {
  const out = [];
  for (let row = from; row <= to; row++) out.push(Math.abs(world.lanes[row].objects[0].speed));
  return out;
}

function metrics(world) {
  let floats = 0;
  let vehicles = 0;
  let max = 0;
  let mixed = false;
  for (const lane of world.lanes) {
    const seen = new Set();
    for (const obj of lane.objects) {
      const speed = Math.abs(obj.speed);
      if (speed > max) max = speed;
      if (lane.kind === 'river') {
        floats += 1;
        const key = Math.round(speed * 100);
        if (seen.size && !seen.has(key)) mixed = true;
        seen.add(key);
      }
      if (lane.kind === 'road') vehicles += 1;
    }
  }
  return { floats, vehicles, max, mixed };
}

test('a partida começa na calçada com cinco sapos e as cinco pistas alternadas', () => {
  const game = play();
  assert.equal(game.phase, 'playing');
  assert.equal(game.slot.lives, 5);
  assert.equal(game.slot.row, 0);
  assert.equal(game.slot.x, C.START_X);
  assert.equal(game.slot.timeLeft, 30);
  assert.equal(C.W, 160);
  assert.equal(C.H, 192);
  assert.deepEqual(signs(game.slot.world, 1, 5), [1, -1, 1, -1, 1]);
  assert.equal(new Set(speeds(game.slot.world, 1, 5)).size, 5);
  assert.deepEqual(signs(game.slot.world, 7, 11), [-1, 1, -1, 1, -1]);
  assert.equal(new Set(speeds(game.slot.world, 7, 11)).size, 5);
  assert.equal(game.slot.world.lanes[5].kind, 'road');
  assert.equal(game.slot.world.lanes[6].kind, 'bank');
  assert.equal(game.slot.world.lanes[7].kind, 'river');
  note('cinco vidas na calçada, cinco pistas em sentidos alternados e cinco correntes');
});

test('contato com veículo mata e a margem do rio não', () => {
  const killed = play();
  const landed = killed.slot.x;
  killed.slot.world.lanes[1].objects[0].x = landed;
  killed.slot.world.lanes[1].objects[0].w = 24;
  killed.step(0, { up: true });
  assert.equal(killed.phase, 'dying');
  assert.equal(killed.reason, 'veiculo');
  assert.equal(killed.slot.lives, 4);
  assert.equal(killed.slot.score, 0);

  const bank = play();
  release(bank);
  bank.slot.row = 5;
  bank.slot.x = C.START_X;
  bank.step(0, { up: true });
  assert.equal(bank.phase, 'playing');
  assert.equal(bank.slot.row, 6);
  note('contato com veículo mata e a margem do rio não');
});

test('água mata; tronco, vão entre tartarugas e jacaré carregam; boca e mergulho matam', () => {
  const water = play();
  release(water);
  water.slot.row = 6;
  water.slot.x = C.START_X;
  parkOthers(water.slot.world.lanes[7], null, 0, 8);
  water.step(0, { up: true });
  assert.equal(water.phase, 'dying');
  assert.equal(water.reason, 'agua');
  note('água aberta mata');

  const ride = play();
  const log = ride.slot.world.lanes[7].objects[0];
  log.x = 40;
  log.speed = 20;
  parkOthers(ride.slot.world.lanes[7], log, 120, 8);
  ride.slot.row = 7;
  ride.slot.x = 48;
  ride.step(0, {});
  assert.equal(ride.phase, 'playing');
  const ridingX = ride.slot.x;
  ride.step(0.5, {});
  assert.equal(ride.phase, 'playing');
  assert.ok(Math.abs(ride.slot.x - (ridingX + 10)) < 1e-9);
  release(ride);
  ride.slot.x = log.x + log.w - 6;
  ride.step(0, { right: true });
  assert.equal(ride.phase, 'dying');
  assert.equal(ride.reason, 'agua');
  note('tronco carrega o sapo e sair pela lateral para a água mata');

  const turtles = play();
  const group = turtles.slot.world.lanes[8].objects.find((obj) => obj.dives);
  group.x = 40;
  group.speed = 16;
  group.clock = 0;
  parkOthers(turtles.slot.world.lanes[8], group, 120, 8);
  const gap = group.segments.find((part) => part.part === 'gap');
  turtles.slot.row = 8;
  turtles.slot.x = group.x + gap.offset + gap.w / 2 - C.FROG_W / 2;
  turtles.step(0, {});
  assert.equal(turtles.phase, 'playing');
  const gapX = turtles.slot.x;
  turtles.step(0.5, {});
  assert.equal(turtles.phase, 'playing');
  assert.ok(Math.abs(turtles.slot.x - (gapX + 8)) < 1e-9);
  note('o vão dentro do grupo de tartarugas é seguro e carrega o sapo');

  group.clock = C.DIVE_WARN + 0.05;
  turtles.slot.x = group.x + gap.offset;
  turtles.step(0, {});
  assert.equal(turtles.phase, 'playing');
  note('tartaruga azul, ainda na superfície, não mata');

  group.clock = C.DIVE_UNDER - 0.04;
  turtles.slot.x = group.x + gap.offset;
  turtles.step(0.1, {});
  assert.equal(turtles.phase, 'dying');
  assert.equal(turtles.reason, 'mergulho');
  note('tartaruga que mergulha embaixo do sapo mata');

  const edge = play();
  const end = edge.slot.world.lanes[8].objects.find((obj) => obj.kind === 'turtles');
  end.x = 40;
  end.clock = 0;
  end.dives = false;
  parkOthers(edge.slot.world.lanes[8], end, 130, 8);
  edge.slot.row = 8;
  edge.slot.x = 68;
  edge.step(0, { right: true });
  assert.equal(edge.phase, 'dying');
  assert.equal(edge.reason, 'agua');
  note('sair pela ponta do grupo de tartarugas para a água mata');

  const gatorGame = play();
  const gator = gatorGame.slot.world.lanes[9].objects.find((obj) => obj.kind === 'alligator');
  gator.x = 30;
  gator.speed = Math.sign(gator.speed) * 20;
  parkOthers(gatorGame.slot.world.lanes[9], gator, 120, 8);
  const parts = World.alligatorParts(gator.speed);
  function stand(partName) {
    const part = parts.find((item) => item.part === partName);
    gatorGame.slot.row = 9;
    gatorGame.slot.x = gator.x + part.offset;
    gatorGame.phase = 'playing';
    gatorGame.slot.lives = 5;
  }
  stand('back');
  gatorGame.step(0, {});
  assert.equal(gatorGame.phase, 'playing');
  const backX = gatorGame.slot.x;
  gatorGame.step(0.5, {});
  assert.equal(gatorGame.phase, 'playing');
  assert.ok(Math.abs(gatorGame.slot.x - (backX + gator.speed * 0.5)) < 1e-9);
  note('o dorso do jacaré é seguro e carrega o sapo');

  stand('tail');
  gatorGame.prev = {};
  gatorGame.step(0, {});
  assert.equal(gatorGame.phase, 'playing');
  note('a cauda do jacaré é segura');

  stand('jaws');
  gatorGame.prev = {};
  gatorGame.step(0, {});
  assert.equal(gatorGame.phase, 'dying');
  assert.equal(gatorGame.reason, 'mandibula');
  note('a boca do jacaré mata');
});

test('dificuldade A mata fora da tela, B dá a volta, e o pulo não sai da tela', () => {
  function setup(hard) {
    const game = play();
    const log = game.slot.world.lanes[7].objects[0];
    log.x = 140;
    log.w = 36;
    log.speed = 80;
    parkOthers(game.slot.world.lanes[7], log, 10, 8);
    game.slot.row = 7;
    game.slot.x = 150;
    game.switches[0] = hard;
    return game;
  }
  const hard = setup(true);
  hard.step(0.5, {});
  assert.equal(hard.phase, 'dying');
  assert.equal(hard.reason, 'borda');
  note('dificuldade A mata o sapo carregado para fora da tela');

  const soft = setup(false);
  soft.step(0.5, {});
  assert.equal(soft.phase, 'playing');
  assert.equal(soft.slot.x, 30);
  note('dificuldade B traz o sapo de volta pelo outro lado');

  const blocked = play();
  blocked.slot.x = 0;
  blocked.step(0, { left: true });
  assert.equal(blocked.slot.x, 0);
  assert.equal(blocked.phase, 'playing');
  release(blocked);
  blocked.slot.x = C.W - C.FROG_W;
  blocked.step(0, { right: true });
  assert.equal(blocked.slot.x, C.W - C.FROG_W);
  assert.equal(blocked.phase, 'playing');
  note('o sapo não consegue pular para fora da tela');
});

test('toca alinhada salva, arbusto mata, toca ocupada é recusada e jacaré na toca não salva', () => {
  const game = play();
  assert.equal(game.slot.score, 0);
  saveBay(game, 2);
  assert.equal(game.phase, 'playing');
  assert.equal(game.slot.homes[2].filled, true);
  assert.equal(game.slot.score, 26);
  assert.equal(game.slot.lives, 5);
  assert.equal(game.slot.row, 0);
  note('toca vazia e alinhada salva, com 1 + 5 + 2 pontos por segundo');

  const again = game.slot.score;
  release(game);
  game.slot.row = 11;
  game.slot.x = bayX(2);
  game.slot.timeLeft = 10;
  game.step(0, { up: true });
  assert.equal(game.phase, 'playing');
  assert.equal(game.slot.row, 11);
  assert.equal(game.slot.homes[2].filled, true);
  assert.equal(game.slot.score, again);
  assert.equal(game.slot.lives, 5);
  note('toca ocupada é recusada');

  const shrub = play();
  release(shrub);
  shrub.slot.row = 11;
  shrub.slot.x = bayX(2) - 8;
  shrub.step(0, { up: true });
  assert.equal(shrub.phase, 'dying');
  assert.equal(shrub.reason, 'arbusto');
  assert.equal(shrub.slot.homes.some((home) => home.filled), false);
  note('arbusto ao lado da toca mata');

  const head = play();
  head.slot.homes[2].gator = true;
  release(head);
  head.slot.row = 11;
  head.slot.x = bayX(2);
  head.step(0, { up: true });
  assert.equal(head.phase, 'dying');
  assert.equal(head.reason, 'jacare');
  assert.equal(head.slot.homes[2].filled, false);
  note('toca com cabeça de jacaré não salva');
});

test('a faixa de tempo avisa e mata no zero', () => {
  const warn = play();
  warn.slot.timeLeft = 5.2;
  warn.step(0.3, {});
  assert.equal(warn.phase, 'playing');
  assert.equal(warn.slot.warning, true);
  assert.ok(warn.slot.timeLeft < 5);
  note('os últimos segundos acendem o aviso');

  const expired = play();
  expired.slot.timeLeft = 0.05;
  expired.step(0.1, {});
  assert.equal(expired.phase, 'dying');
  assert.equal(expired.reason, 'tempo');
  assert.equal(expired.slot.timeLeft, 0);
  assert.equal(expired.slot.lives, 4);
  note('o tempo zerado mata o sapo');
});

test('cinco tocas avançam para uma fase mais difícil, com cobra', () => {
  const game = play();
  const before = metrics(game.slot.world);
  assert.equal(game.slot.world.lanes[6].objects.some((obj) => obj.kind === 'snake'), false);
  for (let bay = 0; bay < 4; bay++) saveBay(game, bay);
  assert.equal(game.slot.level, 1);
  assert.equal(game.slot.homes.filter((home) => home.filled).length, 4);
  assert.equal(game.slot.score, 104);
  saveBay(game, 4);
  assert.equal(game.slot.score, 230);
  assert.equal(game.slot.level, 2);
  assert.equal(game.slot.lives, 5);
  assert.equal(game.slot.homes.some((home) => home.filled), false);
  const after = metrics(game.slot.world);
  assert.ok(after.floats < before.floats);
  assert.ok(after.vehicles > before.vehicles);
  assert.ok(after.max > before.max);
  assert.equal(after.mixed, true);
  const snake = game.slot.world.lanes[6].objects.find((obj) => obj.kind === 'snake');
  assert.ok(snake);
  note('cinco tocas valem 100 e a fase seguinte é mais difícil e tem cobra');

  snake.x = 40;
  snake.speed = 20;
  const mouth = World.snakeMouth(snake);
  game.slot.row = 6;
  game.slot.x = snake.x + 2;
  game.step(0, {});
  assert.equal(game.phase, 'playing');
  const bodyX = game.slot.x;
  game.step(0.3, {});
  assert.equal(game.phase, 'playing');
  assert.equal(game.slot.x, bodyX);
  note('o corpo da cobra não mata e não carrega o sapo');

  game.slot.x = snake.x + mouth.offset;
  game.step(0, {});
  assert.equal(game.phase, 'dying');
  assert.equal(game.reason, 'cobra');
  note('a boca da cobra mata');

  finishDeath(game);
  for (let bay = 0; bay < 5; bay++) saveBay(game, bay);
  assert.equal(game.slot.level, 3);
  const ridden = game.slot.world.lanes[11].objects.find((obj) => obj.snake);
  assert.ok(ridden);
  ridden.x = 40;
  ridden.speed = 16;
  parkOthers(game.slot.world.lanes[11], ridden, 120, 8);
  const bite = World.logMouth(ridden);
  game.slot.row = 11;
  game.slot.x = ridden.x + ridden.snake.offset;
  game.step(0, {});
  assert.equal(game.phase, 'playing');
  game.slot.x = ridden.x + bite.offset;
  game.step(0, {});
  assert.equal(game.phase, 'dying');
  assert.equal(game.reason, 'cobra');
  note('nas fases seguintes a cobra da tora morde e o corpo continua seguro');
});

test('a pontuação do manual, a rã, a mosca e o sapo extra abaixo de quatro vidas', () => {
  const forward = play();
  parkRoads(forward);
  forward.step(0, { up: true });
  assert.equal(forward.slot.score, 1);
  assert.equal(forward.slot.row, 1);
  forward.step(0, { left: true });
  assert.equal(forward.slot.score, 1);
  release(forward);
  forward.step(0, { down: true });
  assert.equal(forward.slot.score, 1);
  assert.equal(forward.slot.row, 0);
  note('pulo para a frente vale 1; para o lado e para trás não pontuam');

  const ladyGame = play();
  const lady = ladyGame.slot.world.lady;
  const log = ladyGame.slot.world.lanes[lady.row].objects[lady.index];
  log.x = 40;
  parkOthers(ladyGame.slot.world.lanes[lady.row], log, 120, 8);
  ladyGame.slot.row = lady.row;
  ladyGame.slot.x = World.ladyX(ladyGame.slot.world);
  ladyGame.step(0, {});
  assert.equal(ladyGame.slot.ladyCaught, true);
  ladyGame.slot.row = 11;
  ladyGame.slot.x = bayX(1);
  ladyGame.slot.timeLeft = 10;
  ladyGame.step(0, { up: true });
  assert.equal(ladyGame.slot.score, 46);
  assert.equal(ladyGame.slot.homes[1].filled, true);
  note('levar a rã para casa vale 20');

  const fly = play();
  fly.slot.homes[0].fly = true;
  release(fly);
  fly.slot.row = 11;
  fly.slot.x = bayX(0);
  fly.slot.timeLeft = 10;
  fly.step(0, { up: true });
  assert.equal(fly.slot.score, 46);
  assert.equal(fly.slot.homes[0].filled, true);
  assert.equal(fly.slot.homes[0].fly, false);
  note('comer a mosca vale 20');

  const extra = play();
  parkRoads(extra);
  const gates = [999, 1999, 2999, 3999];
  const lives = [1, 2, 3, 4];
  const afterLives = [2, 3, 4, 4];
  for (let i = 0; i < gates.length; i++) {
    if (i) release(extra);
    extra.slot.score = gates[i];
    extra.slot.lives = lives[i];
    extra.step(0, { up: true });
    assert.equal(extra.slot.score, gates[i] + 1);
    assert.equal(extra.slot.lives, afterLives[i]);
  }
  note('cada 1000 pontos dá um sapo só enquanto houver menos de quatro');

  const full = play();
  parkRoads(full);
  full.slot.score = 999;
  full.slot.lives = 5;
  full.step(0, { up: true });
  assert.equal(full.slot.score, 1000);
  assert.equal(full.slot.lives, 5);
  note('com quatro ou mais sapos, cruzar 1000 não ganha extra');
});

test('Speedy repete o pulo e as variações 1 a 4 dão um pulo por comando', () => {
  const slow = play(1);
  parkRoads(slow);
  assert.equal(C.speedy(1), false);
  slow.step(0, { up: true });
  assert.equal(slow.slot.row, 1);
  slow.step(1, { up: true });
  assert.equal(slow.slot.row, 1);
  release(slow);
  slow.step(0, { up: true });
  assert.equal(slow.slot.row, 2);
  note('jogos 1 a 4 fazem um pulo por comando');

  const fast = play(5);
  parkRoads(fast);
  assert.equal(C.speedy(5), true);
  assert.equal(C.twoPlayers(5), false);
  fast.step(0, { up: true });
  assert.equal(fast.slot.row, 1);
  fast.step(C.SPEEDY_REPEAT, { up: true });
  assert.equal(fast.slot.row, 2);
  note('Speedy Frogger repete o pulo enquanto a direção fica segurada');
});

test('dois jogadores alternam na morte, com placar separado, e o fogo repete a variação', () => {
  const game = play(2);
  assert.equal(game.player, 0);
  assert.equal(game.slot.lives, 5);
  assert.equal(game.slots[1].lives, 5);
  assert.equal(C.twoPlayers(2), true);
  parkRoads(game);
  game.step(0, { up: true });
  assert.equal(game.slot.score, 1);
  squash(game);
  assert.equal(game.slot.lives, 4);
  finishDeath(game);
  assert.equal(game.phase, 'playing');
  assert.equal(game.player, 1);
  assert.equal(game.slots[0].score, 1);
  assert.equal(game.slots[0].lives, 4);
  assert.equal(game.slot.score, 0);
  assert.equal(game.slot.lives, 5);
  parkRoads(game);
  game.step(0, { up: true });
  assert.equal(game.slot.score, 1);
  assert.equal(game.slots[0].score, 1);
  note('a morte alterna os jogadores e os placares ficam separados');

  const ending = play(4);
  assert.equal(ending.variation, 4);
  assert.equal(ending.slot.level, 2);
  assert.equal(C.startLevel(1), 1);
  assert.ok(metrics(ending.slot.world).floats < metrics(play(1).slot.world).floats);
  assert.ok(ending.slot.world.lanes[6].objects.some((obj) => obj.kind === 'snake'));
  ending.slot.lives = 1;
  ending.slots[1].lives = 1;
  squash(ending);
  finishDeath(ending);
  assert.equal(ending.phase, 'playing');
  assert.equal(ending.player, 1);
  squash(ending);
  finishDeath(ending);
  assert.equal(ending.phase, 'gameover');
  note('o jogo de dois jogadores só acaba quando os dois ficam sem sapos');

  ending.action('fire');
  assert.equal(ending.phase, 'playing');
  assert.equal(ending.variation, 4);
  assert.equal(ending.player, 0);
  assert.equal(ending.slot.lives, 5);
  assert.equal(ending.slots[1].lives, 5);
  note('o botão de fogo recomeça a mesma variação');

  const solo = play(1);
  assert.equal(solo.slot.lives, 5);
  for (let life = 0; life < 5; life++) {
    squash(solo);
    assert.equal(solo.slot.lives, 4 - life);
    finishDeath(solo);
  }
  assert.equal(solo.phase, 'gameover');
  assert.equal(solo.slot.lives, 0);
  solo.action('reset');
  assert.equal(solo.phase, 'playing');
  assert.equal(solo.variation, 1);
  assert.equal(solo.slot.lives, 5);
  note('um jogador começa com 5 sapos, acaba em zero e o reset repete a variação');
});

test('as variações 3 e 4 começam mais difíceis e a 6 é Speedy de dois jogadores', () => {
  const easy = metrics(play(1).slot.world);
  const hard = play(3);
  assert.equal(hard.variation, 3);
  assert.equal(hard.slot.level, 2);
  assert.equal(C.twoPlayers(3), false);
  const hardMetrics = metrics(hard.slot.world);
  assert.ok(hardMetrics.floats < easy.floats);
  assert.ok(hardMetrics.max > easy.max);
  assert.equal(hardMetrics.mixed, true);
  const pair = play(6);
  assert.equal(pair.variation, 6);
  assert.equal(C.speedy(6), true);
  assert.equal(C.twoPlayers(6), true);
  assert.equal(pair.slots.length, 2);
  note('jogos 3 e 4 começam mais difíceis; 5 e 6 são Speedy; pares são de dois jogadores');
});
