window.FG = window.FG || {};

(function (FG) {
  'use strict';

  var C = FG.Config;
  var World = FG.World;
  var S = FG.Sprites;
  var silent = {
    hop: function () {}, sploosh: function () {}, warn: function () {}, lady: function () {},
    home: function () {}, clear: function () {}, extra: function () {}, stop: function () {},
  };

  function blankHomes() {
    var homes = [];
    for (var i = 0; i < 5; i++) homes.push({ filled: false, fly: false, gator: false });
    return homes;
  }

  function makeSlot(level) {
    return {
      score: 0,
      lives: C.START_LIVES,
      level: level,
      timeLeft: C.TIME_LIMIT,
      warning: false,
      warnClock: 0,
      homes: blankHomes(),
      world: World.create(level),
      row: 0,
      x: C.START_X,
      facing: 'up',
      ladyCaught: false,
      decor: 0,
      decorCount: 0,
    };
  }

  function Game(options) {
    options = options || {};
    this.audio = options.audio || silent;
    this.variation = 1;
    this.switches = [false, false];
    this.phase = 'title';
    this.player = 0;
    this.slots = [makeSlot(1)];
    this.slot = this.slots[0];
    this.prev = {};
    this.holdClock = 0;
    this.deathTimer = 0;
    this.death = null;
    this.reason = '';
    this.time = 0;
    this.hopFlash = null;
  }

  Game.prototype.currentSwitch = function () {
    return !!this.switches[this.player] ;
  };

  Game.prototype.start = function () {
    var level = C.startLevel(this.variation);
    this.player = 0;
    this.slots = [makeSlot(level)];
    if (C.twoPlayers(this.variation)) this.slots.push(makeSlot(level));
    this.slot = this.slots[0];
    this.phase = 'playing';
    this.reason = '';
    this.death = null;
    this.deathTimer = 0;
    this.holdClock = 0;
    this.prev = {};
    this.hopFlash = null;
    this.audio.stop();
  };

  Game.prototype.beginFrog = function () {
    var slot = this.slot;
    slot.row = 0;
    slot.x = C.START_X;
    slot.facing = 'up';
    slot.timeLeft = C.TIME_LIMIT;
    slot.warning = false;
    slot.warnClock = 0;
    slot.ladyCaught = false;
    if (slot.world.lady) slot.world.lady.caught = false;
    this.holdClock = 0;
    this.hopFlash = null;
  };

  Game.prototype.nextLevel = function () {
    var slot = this.slot;
    slot.level += 1;
    slot.homes = blankHomes();
    slot.world = World.create(slot.level);
    slot.decor = 0;
    slot.decorCount = 0;
    this.beginFrog();
    this.audio.clear();
  };

  Game.prototype.award = function (points) {
    if (!points || this.phase !== 'playing') return;
    var before = this.slot.score;
    this.slot.score = before + points;
    var gained = Math.floor(this.slot.score / C.EXTRA_EVERY) - Math.floor(before / C.EXTRA_EVERY);
    for (var i = 0; i < gained; i++) {
      if (this.slot.lives < C.EXTRA_BELOW) {
        this.slot.lives += 1;
        this.audio.extra();
      }
    }
  };

  Game.prototype.die = function (reason) {
    if (this.phase !== 'playing') return;
    this.slot.lives -= 1;
    this.phase = 'dying';
    this.reason = reason;
    this.deathTimer = C.DEATH_TIME;
    this.death = { x: this.slot.x, row: this.slot.row };
    this.audio.sploosh();
  };

  Game.prototype.finishDeath = function () {
    if (C.twoPlayers(this.variation)) {
      var other = 1 - this.player;
      if (this.slots[other].lives > 0) {
        this.player = other;
        this.slot = this.slots[other];
        this.beginFrog();
        this.phase = 'playing';
        this.death = null;
        this.prev = {};
        return;
      }
    }
    if (this.slot.lives > 0) {
      this.beginFrog();
      this.phase = 'playing';
      this.death = null;
      this.prev = {};
      return;
    }
    this.phase = 'gameover';
    this.death = null;
  };

  Game.prototype.probe = function () {
    return World.probe(this.slot.world, this.slot.row, this.slot.x);
  };

  Game.prototype.bayLanding = function () {
    var x = this.slot.x;
    var right = x + C.FROG_W;
    for (var i = 0; i < C.BAYS.length; i++) {
      var bay = C.BAYS[i];
      if (x >= bay.left && right <= bay.right) return i;
    }
    return -1;
  };

  Game.prototype.resolveHome = function () {
    var index = this.bayLanding();
    if (index < 0) {
      this.die('arbusto');
      return;
    }
    var home = this.slot.homes[index];
    if (home.filled) return;
    if (home.gator) {
      this.die('jacare');
      return;
    }
    var fly = home.fly;
    home.filled = true;
    home.fly = false;
    home.gator = false;
    var seconds = Math.floor(this.slot.timeLeft + 1e-9);
    var points = C.SCORE.forward + C.SCORE.home + C.SCORE.second * seconds;
    if (this.slot.ladyCaught) points += C.SCORE.lady;
    if (fly) points += C.SCORE.fly;
    var complete = this.slot.homes.every(function (item) { return item.filled; });
    if (complete) points += C.SCORE.complete;
    this.award(points);
    this.audio.home();
    if (complete) this.nextLevel();
    else this.beginFrog();
  };

  Game.prototype.keepOnScreen = function () {
    var x = this.slot.x;
    var offRight = x >= C.W;
    var offLeft = x + C.FROG_W <= 0;
    if (!offRight && !offLeft) return true;
    if (this.switches[this.player]) {
      this.die('borda');
      return false;
    }
    while (x >= C.W) x -= C.W;
    while (x + C.FROG_W <= 0) x += C.W;
    this.slot.x = x;
    return true;
  };

  Game.prototype.applyHop = function (dir) {
    if (dir === 'left' || dir === 'right') {
      var nx = this.slot.x + (dir === 'left' ? -C.HOP : C.HOP);
      if (nx < 0 || nx + C.FROG_W > C.W) return;
      this.slot.facing = dir;
      this.hopFlash = { dir: dir, age: 0 };
      this.audio.hop();
      this.slot.x = nx;
      var side = this.probe();
      if (!side.safe) this.die(side.reason);
      else this.catchLady();
      return;
    }
    if (dir === 'down') {
      if (this.slot.row <= 0) return;
      this.slot.facing = dir;
      this.hopFlash = { dir: dir, age: 0 };
      this.audio.hop();
      this.slot.row -= 1;
      var below = this.probe();
      if (!below.safe) this.die(below.reason);
      else this.catchLady();
      return;
    }
    this.slot.facing = dir;
    this.hopFlash = { dir: dir, age: 0 };
    this.audio.hop();
    if (this.slot.row >= 11) {
      this.resolveHome();
      return;
    }
    this.slot.row += 1;
    var above = this.probe();
    if (!above.safe) this.die(above.reason);
    else {
      this.award(C.SCORE.forward);
      this.catchLady();
    }
  };

  Game.prototype.consumeHop = function (held, edge, dt) {
    var order = ['up', 'down', 'left', 'right'];
    for (var i = 0; i < order.length; i++) {
      if (edge[order[i]]) {
        this.holdClock = 0;
        return order[i];
      }
    }
    if (!C.speedy(this.variation)) return null;
    var dir = null;
    for (var j = 0; j < order.length; j++) {
      if (held[order[j]]) { dir = order[j]; break; }
    }
    if (!dir) {
      this.holdClock = 0;
      return null;
    }
    this.holdClock += dt;
    if (this.holdClock >= C.SPEEDY_REPEAT) {
      this.holdClock = 0;
      return dir;
    }
    return null;
  };

  Game.prototype.catchLady = function () {
    if (this.phase !== 'playing' || this.slot.ladyCaught) return;
    var lady = this.slot.world.lady;
    if (!lady || lady.caught || lady.row !== this.slot.row) return;
    var lx = World.ladyX(this.slot.world);
    if (lx == null) return;
    if (Math.abs((this.slot.x + C.FROG_W / 2) - (lx + C.FROG_W / 2)) <= 8) {
      lady.caught = true;
      this.slot.ladyCaught = true;
      this.audio.lady();
    }
  };

  Game.prototype.tickDecor = function (dt) {
    var slot = this.slot;
    slot.decor += dt;
    if (slot.decor < 4) return;
    slot.decor = 0;
    var empty = [];
    var i;
    for (i = 0; i < slot.homes.length; i++) {
      slot.homes[i].fly = false;
      slot.homes[i].gator = false;
      if (!slot.homes[i].filled) empty.push(i);
    }
    if (!empty.length) return;
    slot.decorCount += 1;
    var index = empty[(slot.decorCount - 1) % empty.length];
    if (slot.decorCount % 2 === 0) slot.homes[index].fly = true;
    else slot.homes[index].gator = true;
  };

  Game.prototype.tickTime = function (dt) {
    if (dt <= 0) return;
    this.slot.timeLeft -= dt;
    if (this.slot.timeLeft <= 0) {
      this.slot.timeLeft = 0;
      this.slot.warning = false;
      this.die('tempo');
      return;
    }
    if (this.slot.timeLeft <= C.TIME_WARN) {
      if (!this.slot.warning) this.audio.warn();
      this.slot.warning = true;
      this.slot.warnClock += dt;
      if (this.slot.warnClock >= 0.5) {
        this.slot.warnClock = 0;
        this.audio.warn();
      }
    } else {
      this.slot.warning = false;
      this.slot.warnClock = 0;
    }
  };

  Game.prototype.moveWorld = function (dt) {
    World.move(this.slot.world, dt);
  };

  Game.prototype.step = function (dt, input) {
    if (!isFinite(dt) || dt < 0) dt = 0;
    input = input || {};
    this.time += dt;
    if (this.hopFlash) {
      this.hopFlash.age += dt;
      if (this.hopFlash.age > 0.12) this.hopFlash = null;
    }
    var keys = ['up', 'down', 'left', 'right', 'fire'];
    var held = {};
    var edge = {};
    for (var i = 0; i < keys.length; i++) {
      held[keys[i]] = !!input[keys[i]];
      edge[keys[i]] = held[keys[i]] && !this.prev[keys[i]];
    }

    if (this.phase === 'title' || this.phase === 'gameover') {
      this.moveWorld(dt);
      if (edge.fire) this.start();
      this.prev = held;
      return;
    }
    if (this.phase === 'paused') {
      this.prev = held;
      return;
    }
    if (this.phase === 'dying') {
      this.moveWorld(dt);
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) this.finishDeath();
      this.prev = held;
      return;
    }

    this.tickTime(dt);
    if (this.phase !== 'playing') {
      this.prev = held;
      return;
    }
    var hop = this.consumeHop(held, edge, dt);
    if (hop) {
      this.moveWorld(dt);
      if (this.phase === 'playing') this.applyHop(hop);
      this.prev = held;
      return;
    }
    var before = this.probe();
    if (!before.safe) {
      this.die(before.reason);
      this.prev = held;
      return;
    }
    this.moveWorld(dt);
    if (before.speed) this.slot.x += before.speed * dt;
    if (!this.keepOnScreen()) {
      this.prev = held;
      return;
    }
    var after = this.probe();
    if (!after.safe) this.die(after.reason);
    else {
      this.catchLady();
      this.tickDecor(dt);
    }
    this.prev = held;
  };

  Game.prototype.action = function (name) {
    if (!name) return;
    if (name === 'difficulty') {
      if (this.phase === 'title' || this.phase === 'gameover') {
        var next = !this.switches[0];
        this.switches[0] = next;
        this.switches[1] = next;
      } else {
        this.switches[this.player] = !this.switches[this.player];
      }
      return;
    }
    if (name === 'select' || /^select[1-6]$/.test(name)) {
      if (name === 'select') this.variation = this.variation % 6 + 1;
      else this.variation = Number(name.slice(6));
      this.start();
      return;
    }
    if (name === 'pause') {
      if (this.phase === 'paused') this.phase = 'playing';
      else if (this.phase === 'playing' || this.phase === 'dying') this.phase = 'paused';
      return;
    }
    if (name === 'reset' || name === 'start') {
      this.start();
      return;
    }
    if (name === 'fire' && (this.phase === 'title' || this.phase === 'gameover')) this.start();
  };

  FG.Game = Game;

  var PAL = {
    hud: '#10160f',
    text: '#f4f7ef',
    gold: '#e4c24a',
    hedge: '#1f8f34',
    hedgeDark: '#0d5c1e',
    bay: '#2d62e6',
    water: '#18409f',
    waterDeep: '#102f78',
    log: '#8d4e22',
    logLine: '#5d3014',
    turtle: '#d42323',
    turtleBlue: '#8fd4ff',
    gator: '#1b7a36',
    jaw: '#e23b3b',
    tooth: '#f4f4f4',
    bank: '#e4c24a',
    bankDark: '#c9a62f',
    road: '#1a1a1a',
    dash: '#d8d2a4',
    sidewalk: '#e4c24a',
    frog: '#3ddc4a',
    belly: '#c9f5b0',
    eye: '#ffffff',
    pupil: '#171717',
    lady: '#f7f7f7',
    fly: '#f2e15a',
    time: '#111111',
    timeWarn: '#e02020',
    square: '#f5f5f5',
    mark: '#39d353',
    snake: '#2f9a3a',
    cars: ['#e23b3b', '#f0d23a', '#3aa0e0', '#c85bd4', '#f07a28'],
  };

  function boot() {
    var canvas = document.getElementById('screen');
    var ctx = canvas.getContext('2d', { alpha: false });
    var frame = document.createElement('canvas');
    frame.width = C.W;
    frame.height = C.H;
    var g = frame.getContext('2d', { alpha: false });
    var game = new Game({ audio: FG.Audio });
    FG.game = game;
    var muted = false;
    var monochrome = false;
    var last = 0;
    var statusText = '';

    function label(id, value) {
      var node = document.getElementById(id);
      if (node) node.textContent = value;
    }

    function action(type) {
      if (FG.Audio) FG.Audio.unlock();
      if (type === 'mute') {
        muted = !muted;
        FG.Audio.setMuted(muted);
        label('mute-state', muted ? 'Som desligado' : 'Som ligado');
        var mute = document.querySelector('[data-action="mute"]');
        if (mute) mute.setAttribute('aria-pressed', String(muted));
      } else if (type === 'color') {
        monochrome = !monochrome;
        canvas.classList.toggle('bw', monochrome);
        label('tv-state', monochrome ? 'TV em preto e branco' : 'TV colorida');
        var tv = document.querySelector('[data-switch="tv"]');
        if (tv) tv.setAttribute('aria-pressed', String(monochrome));
      } else if (type === 'fullscreen') {
        toggleFullscreen();
      } else {
        game.action(type);
        syncSwitches();
      }
      syncStatus();
    }

    function syncSwitches() {
      var hard = game.switches[game.phase === 'playing' || game.phase === 'dying' || game.phase === 'paused' ? game.player : 0];
      label('diff-state', hard ? 'Dificuldade A · sair da tela mata' : 'Dificuldade B · a tela dá a volta');
      label('game-state', C.variationLabel(game.variation));
      var button = document.querySelector('[data-switch="difficulty"]');
      if (button) button.setAttribute('aria-pressed', String(hard));
    }

    var stage = document.querySelector('.stage');
    var requestFull = stage && (stage.requestFullscreen || stage.webkitRequestFullscreen);
    var canFullscreen = !!requestFull && !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
    var fullscreenButton = document.getElementById('fullscreen-button');
    if (fullscreenButton && !canFullscreen) fullscreenButton.hidden = true;

    function fullscreenElement() {
      return document.fullscreenElement || document.webkitFullscreenElement || null;
    }

    function settle(result) {
      if (result && typeof result.catch === 'function') result.catch(function () {});
    }

    function toggleFullscreen() {
      if (!canFullscreen) return;
      try {
        if (fullscreenElement()) settle((document.exitFullscreen || document.webkitExitFullscreen).call(document));
        else settle(requestFull.call(stage));
      } catch (error) { /* The browser can refuse fullscreen. */ }
    }

    function markFullscreen() {
      if (stage) stage.classList.toggle('full', fullscreenElement() === stage);
    }
    document.addEventListener('fullscreenchange', markFullscreen);
    document.addEventListener('webkitfullscreenchange', markFullscreen);
    FG.Input.init(action);

    function deathMessage() {
      var messages = {
        veiculo: 'Um carro ou caminhão atropelou o sapo.',
        agua: 'O sapo caiu na água.',
        mergulho: 'A tartaruga mergulhou com o sapo.',
        mandibula: 'O sapo entrou na boca do jacaré.',
        cobra: 'O sapo chegou perto demais da boca da cobra.',
        arbusto: 'O sapo bateu no arbusto e caiu no rio.',
        jacare: 'A toca estava com a cabeça de um jacaré.',
        borda: 'A corrente levou o sapo para fora da tela.',
        tempo: 'O tempo acabou.',
      };
      return messages[game.reason] || 'O sapo se perdeu.';
    }

    function touchScreen() {
      return document.body.classList.contains('touch');
    }

    function syncStatus() {
      var touch = touchScreen();
      var player = 'Jogador ' + (game.player + 1);
      var messages = {
        title: touch ? 'Toque na tela ou em COMEÇAR para atravessar.' : 'Aperte Enter ou o botão vermelho para começar.',
        playing: player + ' na travessia. Leve o sapo até uma toca vazia.',
        paused: 'Jogo pausado.',
        dying: deathMessage(),
        gameover: 'Fim de jogo. ' + (touch ? 'Toque em COMEÇAR' : 'Aperte o botão vermelho ou Enter') + ' para repetir a mesma variação.',
      };
      var text = messages[game.phase] || messages.playing;
      if (statusText !== text) {
        statusText = text;
        label('status', text);
      }
      var starting = game.phase === 'title' || game.phase === 'gameover';
      var startLabel = document.getElementById('start-label');
      if (startLabel) startLabel.textContent = starting ? 'COMEÇAR' : 'REINICIAR';
      var start = document.getElementById('start-button');
      if (start) start.setAttribute('data-action', starting ? 'start' : 'reset');
    }

    function fill(color, x, y, w, h) {
      g.fillStyle = color;
      g.fillRect(x | 0, y | 0, w, h);
    }

    function glyph(ch, x, y, color) {
      var rows = S.FONT[ch] || S.FONT[' '];
      g.fillStyle = color;
      for (var row = 0; row < rows.length; row++) {
        for (var col = 0; col < rows[row].length; col++) {
          if (rows[row][col] === '1') g.fillRect(x + col, y + row, 1, 1);
        }
      }
    }

    function text(value, x, y, color) {
      value = String(value);
      for (var i = 0; i < value.length; i++) glyph(value[i], x + i * 4, y, color);
    }

    function sprite(rows, x, y, colors) {
      for (var row = 0; row < rows.length; row++) {
        for (var col = 0; col < rows[row].length; col++) {
          var pixel = rows[row][col];
          if (pixel === '.') continue;
          g.fillStyle = colors[pixel] || colors['1'];
          g.fillRect(x + col, y + row, 1, 1);
        }
      }
    }

    function drawFrog(x, y, colors) {
      sprite(S.FROG, Math.round(x), y, colors || { '1': PAL.frog });
      g.fillStyle = PAL.eye;
      g.fillRect(Math.round(x) + 1, y + 1, 2, 2);
      g.fillRect(Math.round(x) + 5, y + 1, 2, 2);
      g.fillStyle = PAL.pupil;
      g.fillRect(Math.round(x) + 2, y + 2, 1, 1);
      g.fillRect(Math.round(x) + 5, y + 2, 1, 1);
    }

    function drawHomes() {
      fill(PAL.hedge, 0, 10, C.W, 16);
      for (var x = 0; x < C.W; x += 4) fill(PAL.hedgeDark, x, 10, 2, 16);
      for (var i = 0; i < C.BAYS.length; i++) {
        var bay = C.BAYS[i];
        var home = game.slot.homes[i];
        fill(PAL.bay, bay.left, 12, bay.right - bay.left, 14);
        fill(PAL.waterDeep, bay.left, 23, bay.right - bay.left, 3);
        if (home.filled) drawFrog(bay.left + 5, 16, { '1': PAL.frog });
        else if (home.gator) {
          fill(PAL.gator, bay.left + 2, 15, 14, 8);
          fill(PAL.jaw, bay.left + 4, 17, 10, 3);
          fill(PAL.tooth, bay.left + 6, 17, 2, 2);
          fill(PAL.tooth, bay.left + 10, 17, 2, 2);
        } else if (home.fly) {
          fill(PAL.fly, bay.left + 6, 15, 6, 4);
          fill(PAL.eye, bay.left + 4, 16, 2, 2);
          fill(PAL.eye, bay.left + 12, 16, 2, 2);
        }
      }
    }

    function drawSnake(width, mouth, speed, x, y) {
      fill(PAL.snake, x, y + 1, width, 6);
      var mouthX = speed >= 0 ? x + width - mouth : x;
      fill(PAL.jaw, mouthX, y + 2, mouth, 4);
      fill(PAL.tooth, mouthX + 2, y + 3, 2, 2);
    }

    function drawTurtles(obj, x, top) {
      var phase = World.turtlePhase(obj);
      if (phase === 'under') return;
      var color = phase === 'blue' ? PAL.turtleBlue : PAL.turtle;
      for (var s = 0; s < obj.segments.length; s++) {
        var part = obj.segments[s];
        if (part.part !== 'turtle') continue;
        fill(color, x + part.offset, top, part.w, 8);
        fill(PAL.eye, x + part.offset + 2, top + 2, 2, 2);
      }
    }

    function drawGator(obj, x, top) {
      var parts = World.alligatorParts(obj.speed);
      for (var p = 0; p < parts.length; p++) {
        var part = parts[p];
        var color = part.part === 'jaws' ? PAL.jaw : PAL.gator;
        fill(color, x + part.offset, top + (part.part === 'tail' ? 2 : 0), part.w, part.part === 'tail' ? 4 : 8);
        if (part.part === 'jaws') fill(PAL.tooth, x + part.offset + 2, top + 3, 2, 2);
      }
    }

    function paintRiver() {
      for (var row = 11; row >= 7; row--) {
        var top = C.rowTop(row);
        fill(row % 2 ? PAL.water : PAL.waterDeep, 0, top, C.W, 12);
        var objects = game.slot.world.lanes[row].objects;
        for (var i = 0; i < objects.length; i++) paintFloater(objects[i], top + 2);
      }
      var lady = game.slot.world.lady;
      if (lady && !lady.caught) {
        var lx = World.ladyX(game.slot.world);
        if (lx != null) {
          sprite(S.LADY, Math.round(lx), C.rowTop(lady.row) + 2, { '2': PAL.lady });
        }
      }
    }

    function paintFloater(obj, top) {
      var origins = [obj.x];
      if (obj.x + obj.w > C.W) origins.push(obj.x - C.W);
      if (obj.x < 0) origins.push(obj.x + C.W);
      for (var n = 0; n < origins.length; n++) {
        var x = Math.round(origins[n]);
        if (obj.kind === 'log') {
          fill(PAL.log, x, top, obj.w, 8);
          for (var stripe = 6; stripe < obj.w; stripe += 8) fill(PAL.logLine, x + stripe, top, 2, 8);
          if (obj.snake) drawSnake(obj.snake.w, obj.snake.mouth, obj.speed, x + obj.snake.offset, top);
        } else if (obj.kind === 'turtles') {
          drawTurtles(obj, x, top);
        } else if (obj.kind === 'alligator') {
          drawGator(obj, x, top);
        }
      }
    }

    function paintBank() {
      var top = C.rowTop(6);
      fill(PAL.bank, 0, top, C.W, 12);
      for (var x = 0; x < C.W; x += 8) fill(PAL.bankDark, x, top + 10, 4, 2);
      var objects = game.slot.world.lanes[6].objects;
      for (var i = 0; i < objects.length; i++) {
        var snake = objects[i];
        if (snake.kind !== 'snake') continue;
        var origins = [snake.x];
        if (snake.x + snake.w > C.W) origins.push(snake.x - C.W);
        drawSnake(snake.w, snake.mouth, snake.speed, Math.round(origins[0]), top + 2);
        if (origins[1] != null) drawSnake(snake.w, snake.mouth, snake.speed, Math.round(origins[1]), top + 2);
      }
    }

    function paintRoad() {
      for (var row = 5; row >= 1; row--) {
        var top = C.rowTop(row);
        fill(PAL.road, 0, top, C.W, 12);
        if (row > 1) {
          for (var dash = 2; dash < C.W; dash += 8) fill(PAL.dash, dash, top, 4, 1);
        }
        var objects = game.slot.world.lanes[row].objects;
        for (var i = 0; i < objects.length; i++) {
          var obj = objects[i];
          var origins = [obj.x];
          if (obj.x + obj.w > C.W) origins.push(obj.x - C.W);
          for (var n = 0; n < origins.length; n++) {
            var x = Math.round(origins[n]);
            var color = PAL.cars[obj.color % PAL.cars.length];
            fill(color, x, top + 2, obj.w, 8);
            fill(PAL.hud, x + 2, top + 3, Math.max(2, obj.w - 8), 3);
            if (obj.kind === 'truck') fill(PAL.text, x + obj.w - 6, top + 4, 3, 4);
          }
        }
      }
    }

    function paintSidewalk() {
      var top = C.rowTop(0);
      fill(PAL.sidewalk, 0, top, C.W, 12);
      for (var x = 0; x < C.W; x += 8) fill(PAL.bankDark, x, top, 4, 2);
    }

    function paintActor() {
      if (game.phase === 'dying' && game.death) {
        var dx = Math.round(game.death.x);
        var dy = C.rowTop(game.death.row) + 2;
        g.strokeStyle = PAL.mark;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(dx + 1, dy + 1);
        g.lineTo(dx + 7, dy + 7);
        g.moveTo(dx + 7, dy + 1);
        g.lineTo(dx + 1, dy + 7);
        g.stroke();
        return;
      }
      if (game.phase === 'gameover') return;
      var y = C.rowTop(game.slot.row) + 2;
      drawFrog(game.slot.x, y, null);
      if (game.slot.ladyCaught) fill(PAL.lady, Math.round(game.slot.x) + 3, y - 2, 2, 2);
    }

    function paintHud() {
      fill(PAL.hud, 0, 0, C.W, 10);
      var score = String(game.slot.score);
      while (score.length < 6) score = '0' + score;
      text(score, 2, 2, PAL.text);
      text(String(game.variation), 152, 2, PAL.gold);
      if (C.twoPlayers(game.variation)) text('P' + (game.player + 1), 136, 2, PAL.text);
    }

    function paintFooter() {
      fill(PAL.hud, 0, 170, C.W, 22);
      fill('#243018', 0, 170, 78, 22);
      var reserves = Math.max(0, game.slot.lives - 1);
      for (var i = 0; i < reserves; i++) fill(PAL.square, 4 + i * 8, 178, 5, 5);
      fill('#0c0c0c', 84, 178, 70, 5);
      var width = Math.max(0, Math.round(70 * (game.slot.timeLeft / C.TIME_LIMIT)));
      fill(game.slot.warning ? PAL.timeWarn : PAL.time, 84, 178, width, 5);
      text('TIME', 128, 184, game.slot.warning ? PAL.timeWarn : PAL.text);
    }

    function render() {
      fill('#081008', 0, 0, C.W, C.H);
      paintHud();
      drawHomes();
      paintRiver();
      paintBank();
      paintRoad();
      paintSidewalk();
      paintActor();
      paintFooter();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
    }

    function frameStep(now) {
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      var input = FG.Input.state();
      game.step(dt, input);
      render();
      syncStatus();
      requestAnimationFrame(frameStep);
    }

    syncSwitches();
    syncStatus();
    requestAnimationFrame(frameStep);
  }

  FG.boot = boot;
  FG.drawPalette = PAL;
})(window.FG);
