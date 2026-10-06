window.FG = window.FG || {};

// The cartridge's game logic, one 1/60 s frame at a time and in the same order as the console: the
// vertical blank (collisions, timer, visitors, lady frog, snake, sound, console switches), the picture
// (`onKernel`), then the overscan (joystick and traffic). Nothing here touches the DOM, so the tests
// drive the same object the browser does.
(function (FG) {
  'use strict';

  const C = FG.Config;
  const W = FG.World;

  // Joystick bits as the cartridge reads them from SWCHA (already inverted: 1 = pushed).
  const UP = 0x10;
  const DOWN = 0x20;
  const LEFT = 0x40;
  const RIGHT = 0x80;

  // Row values that are not a row: the frog left the screen for a bay, or nobody is shown.
  const IN_BAY = 0x49;
  const HIDDEN = 0x40;
  const PARKED = 0x5B;
  const LADY_GONE = 0xFF;
  const LADY_CARRIED = 0x7F;
  const SNAKE_GONE = 0x80;

  const FACES = { up: 'up', down: 'down', left: 'left', right: 'right', dead: 'dead' };

  function odd(value) {
    return (value & 1) === 1;
  }

  class Game {
    constructor(options) {
      const settings = options || {};
      this.audio = settings.audio || null;
      this.onKernel = settings.onKernel || null;
      this.colorTV = true;
      // false = B, true = A, for the left (player 1) and right (player 2) switches.
      this.difficulty = [false, false];
      this.held = { reset: 0, select: 0 };
      this.powerOn();
    }

    powerOn() {
      this.counter = 0;
      // The first sync after power-on already sees the counter at zero.
      this.divePhase = 1;
      this.rows = W.createRows();
      this.drawn = W.createRows();
      this.state = 'select';
      this.game = 1;
      this.player = 0;
      this.players = [0, 1].map(function () {
        return { score: 0, reserves: C.RESERVES, level: 1, bays: 0 };
      });
      // One bay shows a face in select mode: the middle one for one-player games.
      this.players[0].bays = 0x04;
      this.tableLevel = 1;
      this.clock = 0;
      this.rounds = 30;
      this.visitor = { bay: 0, kind: null };
      this.frog = { x: C.START_X, row: HIDDEN, face: FACES.up, ink: C.INK.frog, best: 0, riding: false };
      this.stick = 0;
      this.timer = 0xFF;
      this.pause = 0;
      this.lady = { row: HIDDEN, x: 0, step: 0, flags: 0 };
      this.snake = { row: HIDDEN, x: 0, flags: 0 };
      this.selectLatch = false;
      this.sound = { effect: null, step: 0, wait: 0xFF, tune: null, note: 0, envelope: 0xFF };
      this.registers = [[0, 0, 0], [0, 0, 0]];
      this.events = [];
      this.started = false;
      this.playTune('theme');
    }

    // ----- Console -----

    // GAME RESET and GAME SELECT are read on odd frames, so a click holds them for two frames.
    press(name) {
      if (name === 'reset' || name === 'select') this.held[name] = 2;
    }

    toggleColor() {
      this.colorTV = !this.colorTV;
    }

    toggleDifficulty(side) {
      this.difficulty[side] = !this.difficulty[side];
    }

    get current() {
      return this.players[this.player];
    }

    get setup() {
      return C.GAMES[this.game];
    }

    get twoPlayers() {
      return this.setup.players === 2;
    }

    get playing() {
      return this.state === 'play';
    }

    // ----- One frame -----

    frame(input) {
      const pad = input || {};
      this.events.length = 0;
      this.vblank(pad);
      if (this.onKernel) this.onKernel(this);
      this.overscan(pad);
      // The turtles change phase just before the next frame's sync, when the counter has wrapped.
      if (this.counter === 0) this.divePhase = (this.divePhase + 1) & 3;
      this.held.reset = Math.max(0, this.held.reset - 1);
      this.held.select = Math.max(0, this.held.select - 1);
      if (this.audio) this.audio.frame(this.registers);
    }

    vblank(pad) {
      this.counter = (this.counter + 1) & 0xFF;
      this.started = true;

      if (this.state === 'over') {
        if (pad.fire && (!this.twoPlayers || pad.fire2 !== false)) {
          this.startGame();
          return;
        }
        if (this.counter === 0) {
          if (this.twoPlayers) this.player ^= 1;
          if (this.rounds > 0) this.rounds--;
        }
        this.finishVblank();
        return;
      }

      if (this.state === 'select') {
        this.clock = (this.clock - 1) & 0xFF;
        if (this.clock === 0) {
          this.rounds = (this.rounds - 1) & 0xFF;
          if (this.rounds === 0) this.gameOver();
        }
      } else if (this.state === 'pause') {
        let waiting = false;
        if (this.pause !== 0) {
          this.pause = (this.pause - 1) & 0xFF;
          waiting = (this.pause & 0x80) === 0;
        }
        if (!waiting && this.sound.envelope & 0x80) this.nextFrog();
      } else if (this.state === 'play') {
        this.playVblank();
      }
      this.moveLadyAndSnake();
      this.finishVblank();
    }

    finishVblank() {
      this.runSound();
      if (odd(this.counter)) this.readSwitches();
    }

    playVblank() {
      if (odd(this.counter)) this.collide();
      if ((this.counter & 0x3F) === 0) {
        this.timer = (this.timer - 1) & 0xFF;
        if (this.timer === 0) {
          this.die('tempo');
          this.timer = 0xFF;
        } else if (this.timer === C.TIMER_WARNING) {
          this.playEffect('warning');
        }
      }
      if (this.state === 'play') {
        if (this.current.bays === 0x1F) this.finishLevel();
        this.visit();
      }
      const frog = this.frog;
      if (frog.riding && frog.row >= 0 && frog.row <= 10 && W.moves(this.tableLevel, frog.row, this.counter)) {
        frog.x = C.ROWS[frog.row].left ? (frog.x - 1 || 160) : W.wrapAdd(frog.x, 1);
      }
    }

    // ----- Collisions (odd frames only) -----

    collide() {
      const frog = this.frog;
      const row = frog.row;
      if (row < 0 || row > 10) {
        frog.riding = false;
        return;
      }
      if (row === C.BANK) {
        // Only the bank snake's head bites: its left edge + 7 to + 14.
        if (this.bankSnake()) {
          const head = (this.rows[C.BANK].b + 15) & 0xFF;
          if (frog.x < head && frog.x + 8 >= head) {
            this.die('cobra');
            return;
          }
        }
        frog.riding = false;
        return;
      }
      const hit = W.contact(this.rows, this.tableLevel, row, frog.x);
      if (!hit) {
        if (row >= 6) this.die('água');
        else frog.riding = false;
        return;
      }
      if (hit === 'a' && row === C.CROC_ROW && this.crocodile()) {
        const jaws = W.wrapAdd(this.rows[C.CROC_ROW].a, 0x20);
        if (jaws >= frog.x && W.wrapAdd(frog.x, 10) >= jaws) {
          this.die('jacaré');
          return;
        }
      }
      if (hit === 'b' && this.turtleInk(row) === C.INK.gone) {
        this.die('tartaruga');
        return;
      }
      if (row < 6) {
        this.die('trânsito');
        return;
      }
      if (this.difficulty[this.player] && (frog.x >= C.EDGE_RIGHT || frog.x < C.EDGE_LEFT)) {
        this.die('borda');
        return;
      }
      frog.riding = true;
    }

    crocodile() {
      return this.current.level >= 2;
    }

    bankSnake() {
      return this.current.level >= 4;
    }

    // Colour of the second turtle group of a turtle row, which is how the cartridge knows it dived.
    turtleInk(row) {
      const phases = C.DIVE[row];
      return phases ? phases[this.divePhase] : C.ROWS[row].ink;
    }

    // ----- Frog life cycle -----

    die(reason) {
      this.state = 'pause';
      this.pause = C.DEATH_PAUSE;
      this.frog.face = FACES.dead;
      this.frog.riding = false;
      this.current.reserves--;
      this.frog.best = 0;
      this.reason = reason;
      this.playEffect('death');
      this.events.push('death');
    }

    newFrog() {
      this.tableLevel = this.current.level;
      this.state = 'play';
      this.frog.face = FACES.up;
      this.timer = C.TIMER;
      this.frog.row = C.SIDEWALK;
      this.frog.x = C.START_X;
      this.frog.ink = C.INK.frog;
      if (this.lady.row !== C.LADY_ROW) {
        this.lady.flags &= 0x3F;
        this.lady.step = 0;
      }
      this.reason = null;
    }

    // What follows the pause after a death, a frog home or a finished level.
    nextFrog() {
      if (this.frog.face === FACES.dead) {
        if (this.twoPlayers) {
          this.player ^= 1;
          this.snake.flags = 0;
          this.snake.row = 0x1F;
          this.visitor.bay = 0;
          this.visitor.kind = null;
          this.rounds = 4;
          this.events.push('turn');
        }
        if (this.current.reserves < 0) {
          if (!this.twoPlayers) {
            this.gameOver();
            return;
          }
          this.player ^= 1;
          if (this.current.reserves < 0) {
            this.gameOver();
            return;
          }
          if (this.current.bays === 0x1F) this.current.bays = 0;
        }
      } else if (this.current.bays === 0x1F) {
        this.current.bays = 0;
      }
      this.newFrog();
    }

    finishLevel() {
      this.current.bays = 0x1F;
      this.visitor.bay = 0;
      this.visitor.kind = null;
      this.rounds = 3;
      this.playTune(odd(this.current.level) ? 'theme' : 'start');
      this.state = 'pause';
      this.addScore(99);
      this.pause = 0xFF;
      this.current.level = (this.current.level + 1) & 0xFF;
      this.events.push('level');
    }

    gameOver() {
      this.state = 'over';
      this.rounds = 0x28;
      this.visitor.bay = 0;
      this.visitor.kind = null;
      // The traffic of level 4 keeps running behind the final score.
      this.players[0].level = 4;
      this.players[1].level = 4;
      this.tableLevel = 4;
      this.playTune('theme');
      this.hideAll();
      this.events.push('gameover');
    }

    hideAll() {
      this.frog.row = HIDDEN;
      this.lady.row = HIDDEN;
      this.snake.row = HIDDEN;
    }

    startGame() {
      const level = this.setup.level;
      this.players.forEach(function (player) {
        player.level = level;
        player.bays = 0;
        player.reserves = C.RESERVES;
        player.score = 0;
      });
      this.player = 0;
      this.lady.flags = 0;
      this.lady.step = 0;
      this.visitor.bay = 0;
      this.visitor.kind = null;
      this.frog.row = C.SIDEWALK;
      this.playTune('start');
      this.tableLevel = level;
      this.rounds = 4;
      this.frog.x = C.START_X;
      this.frog.ink = C.INK.frog;
      this.timer = C.TIMER;
      this.lady.row = PARKED;
      this.snake.row = PARKED;
      this.frog.face = FACES.up;
      this.state = 'pause';
      this.reason = null;
      this.events.push('start');
    }

    addScore(points) {
      const player = this.current;
      const thousands = Math.floor(player.score / 1000);
      player.score = (player.score + points) % 10000;
      if (Math.floor(player.score / 1000) !== thousands && player.reserves >= 0 && player.reserves < 4) {
        player.reserves++;
        this.events.push('extra');
      }
    }

    // ----- Fly and crocodile heads in the bays -----

    visit() {
      const visitor = this.visitor;
      if (visitor.bay !== 0) {
        this.clock = (this.clock - 1) & 0xFF;
        if (this.clock !== 0) return;
        if (visitor.kind === 'rising') {
          visitor.kind = 'croc';
          this.clock = C.VISIT;
          return;
        }
        visitor.kind = null;
        visitor.bay = 0;
        this.clock = this.counter;
        this.rounds = odd(this.counter) ? 4 : 3;
        return;
      }
      this.clock = (this.clock - 1) & 0xFF;
      if (this.clock !== 0) return;
      this.rounds = (this.rounds - 1) & 0xFF;
      if (this.rounds !== 0) return;
      // Start at a bay picked by the frame counter and take the first empty one to its right.
      let bay = (this.counter & 3) + 1;
      for (let tries = 0; tries < 5 && (this.current.bays & (1 << (bay - 1))); tries++) bay = bay === 5 ? 1 : bay + 1;
      visitor.bay = bay;
      visitor.kind = odd(this.current.level) ? 'fly' : 'rising';
      this.clock = C.VISIT;
    }

    // ----- Lady frog and the log snake -----

    moveLadyAndSnake() {
      const lady = this.lady;
      const snake = this.snake;
      const level = this.tableLevel;
      if (lady.row === C.LADY_ROW && W.moves(level, C.LADY_ROW, this.counter)) lady.x = (lady.x + 1) & 0xFF;
      if (snake.row === C.SNAKE_ROW && !(snake.flags & 0x40) && W.moves(level, C.SNAKE_ROW, this.counter)) {
        snake.x = (snake.x + 2) & 0xFF;
      }
      this.updateLady();
      if (this.current.level >= 5) this.updateSnake();
    }

    updateLady() {
      const lady = this.lady;
      const frog = this.frog;
      if (lady.flags & 0x80) {
        if ((this.counter & 0x3F) === 0) {
          // She hops along her log: forward, forward, back, back. The cartridge only checks whether she
          // left the screen after the fourth hop; after the others it falls into the boarding check.
          lady.x = (lady.step >= 2 ? lady.x - 8 : lady.x + 8) & 0xFF;
          lady.step = (lady.step + 1) & 3;
          if (lady.step !== 0) {
            this.boardLady();
            return;
          }
        } else if (frog.row === C.LADY_ROW && frog.face !== FACES.dead) {
          const near = frog.x >= lady.x ? ((frog.x - 6) & 0xFF) < lady.x : frog.x + 6 >= lady.x;
          if (near) {
            frog.ink = C.INK.olive;
            lady.row = LADY_CARRIED;
            lady.flags &= 0x7F;
            this.playEffect('lady');
            this.events.push('lady');
            return;
          }
        }
        if (lady.x >= 0x98) {
          lady.row = LADY_GONE;
          lady.flags = (lady.flags | 0x20) & 0x3F;
        }
        return;
      }
      if (!(lady.flags & 0x40)) this.boardLady();
    }

    // Every second time the log passes x = 4 she climbs on it.
    boardLady() {
      const lady = this.lady;
      if (this.rows[C.LADY_ROW].a !== 4 || !W.moves(this.tableLevel, C.LADY_ROW, this.counter)) return;
      lady.flags ^= 0x20;
      if (lady.flags & 0x20) {
        lady.x = 0;
        lady.step = 0;
        lady.row = C.LADY_ROW;
        lady.flags = 0xC0;
      }
    }

    updateSnake() {
      const snake = this.snake;
      const frog = this.frog;
      if (snake.row !== C.SNAKE_ROW) {
        if (this.rows[C.SNAKE_ROW].a === 1 && W.moves(this.tableLevel, C.SNAKE_ROW, this.counter)) {
          snake.flags ^= 0x80;
          if (snake.flags & 0x80) {
            snake.x = 0;
            snake.row = C.SNAKE_ROW;
            snake.flags &= 0xBF;
          }
        }
        return;
      }
      const facingLeft = (snake.flags & 0x40) !== 0;
      if (frog.row === C.SNAKE_ROW && frog.face !== FACES.dead) {
        // The mouth is the dangerous end: the right half going right, the left edge going left.
        let bitten = false;
        if (snake.x >= frog.x) {
          bitten = facingLeft && ((snake.x - 8) & 0xFF) < frog.x;
        } else if (!facingLeft) {
          const head = (snake.x + 15) & 0xFF;
          bitten = head >= frog.x && ((head - 8) & 0xFF) < frog.x;
        }
        if (bitten) this.die('cobra');
      }
      if (snake.x >= 0x98) {
        snake.row = SNAKE_GONE;
        snake.flags &= 0x80;
      } else if (!facingLeft) {
        const turn = (this.rows[C.SNAKE_ROW].b + 20) & 0xFF;
        if (turn >= 0x40 && turn < snake.x) snake.flags |= 0x40;
      } else if (((this.rows[C.SNAKE_ROW].a - 5) & 0xFF) >= snake.x) {
        snake.flags &= 0xBF;
      }
    }

    // ----- Console switches (odd frames) -----

    readSwitches() {
      if (this.held.reset) {
        this.startGame();
        return;
      }
      if (!this.held.select) {
        this.selectLatch = false;
        return;
      }
      this.player = 0;
      this.players.forEach(function (player) { player.score = 0; });
      this.hideAll();
      this.rounds = 30;
      if (this.selectLatch) return;
      this.selectLatch = true;
      this.state = 'select';
      this.game = this.game === 6 ? 1 : this.game + 1;
      this.players[0].bays = this.twoPlayers ? 0x0A : 0x04;
      this.visitor.bay = 0;
      this.visitor.kind = null;
      this.playEffect(this.twoPlayers ? 'twoPlayers' : 'hop');
      this.players[0].level = this.setup.level;
      this.players[1].level = this.setup.level;
      this.tableLevel = this.setup.level;
      this.events.push('select');
    }

    // ----- Overscan: joystick and traffic -----

    overscan(pad) {
      if (odd(this.counter) && this.state === 'play') this.readStick(pad.stick || 0);
      W.advance(this.rows, this.drawn, this.tableLevel, this.counter);
    }

    readStick(bits) {
      const stick = bits & 0xF0;
      const changed = stick !== this.stick;
      this.stick = stick;
      // Speedy Frogger repeats a held direction every eight frames; the other games need a new push.
      if (!changed && ((this.counter & 6) !== 0 || !this.setup.speedy)) return;
      const frog = this.frog;
      if (stick === RIGHT) {
        const x = (frog.x + 8) & 0xFF;
        if (x >= C.HOP_MAX) return;
        frog.x = x;
        frog.face = FACES.right;
      } else if (stick === LEFT) {
        const x = (frog.x - 8) & 0xFF;
        if (x < C.HOP_MIN) return;
        frog.x = x;
        frog.face = FACES.left;
      } else if (stick === DOWN) {
        if (frog.row < 0) return;
        frog.row--;
        frog.face = FACES.down;
      } else if (stick === UP) {
        frog.row++;
        if (frog.row === 11) {
          this.enterBay();
          return;
        }
        if (frog.row >= frog.best) {
          frog.best++;
          this.addScore(1);
        }
        frog.face = FACES.up;
      } else {
        return;
      }
      this.playEffect('hop');
      this.events.push('hop');
    }

    enterBay() {
      const frog = this.frog;
      frog.row = 10;
      const offset = frog.x - C.BAY_LEFT;
      const bay = offset >= 0 && offset % C.BAY_PITCH < C.BAY_WIDTH ? Math.floor(offset / C.BAY_PITCH) + 1 : 0;
      if (bay < 1 || bay > 5) {
        this.die('arbusto');
        return;
      }
      if (bay === this.visitor.bay) {
        const kind = this.visitor.kind;
        this.visitor.kind = null;
        this.visitor.bay = 0;
        this.rounds = 2;
        if (kind === 'croc') {
          this.die('jacaré');
          return;
        }
        if (kind === 'fly') {
          this.addScore(20);
          this.events.push('fly');
        }
      }
      const bit = 1 << (bay - 1);
      if (this.current.bays & bit) return;
      this.current.bays |= bit;
      const withLady = !(this.lady.flags & 0x80) && (this.lady.flags & 0x40) !== 0;
      this.addScore(withLady ? 25 : 5);
      frog.best = 0;
      frog.row = IN_BAY;
      W.snapRoad(this.rows, this.counter & 3);
      if (this.current.bays !== 0x1F) {
        this.pause = C.HOME_PAUSE;
        this.state = 'pause';
      }
      this.addScore(2 * this.timer);
      this.playEffect('home');
      this.events.push(withLady ? 'home-lady' : 'home');
    }

    // ----- Sound driver -----

    playEffect(name) {
      this.sound.effect = C.EFFECTS[name];
      this.sound.step = 0;
      this.sound.wait = 0;
    }

    playTune(name) {
      this.sound.tune = C.TUNES[name];
      this.sound.note = 0;
      this.sound.envelope = 0;
    }

    get tunePlaying() {
      return (this.sound.envelope & 0x80) === 0;
    }

    runSound() {
      const s = this.sound;
      const regs = this.registers;
      if (this.tunePlaying) {
        if (s.envelope !== 0) {
          s.envelope--;
          regs[0][2] = regs[1][2] = s.envelope;
          return;
        }
        const notes = s.note < s.tune.length ? s.tune[s.note] : 0;
        if (notes !== 0) {
          const low = C.NOTES[notes & 15];
          const high = C.NOTES[notes >> 4];
          regs[1][0] = low[0];
          regs[1][1] = low[1];
          regs[0][0] = high[0];
          regs[0][1] = high[1];
          s.note++;
          s.envelope = 14;
          regs[0][2] = regs[1][2] = 14;
          return;
        }
        // The tune is over; an effect asked for meanwhile is dropped.
        s.envelope = 0xFF;
        s.wait = (s.wait - 1) & 0xFF;
        if (s.wait & 0x80) return;
      }
      if (s.wait & 0x80) return;
      if (s.wait !== 0) {
        s.wait--;
        return;
      }
      const step = s.effect && s.effect[s.step];
      if (!step) {
        regs[0][2] = 0;
        s.wait = 0xFF;
        return;
      }
      regs[0][0] = step[1];
      regs[0][1] = step[2];
      regs[0][2] = step[3];
      s.wait = step[0] - 1;
      s.step++;
    }

    // ----- Plain-data snapshot for the bot and the tests -----

    clone() {
      const copy = Object.create(Game.prototype);
      const data = JSON.parse(JSON.stringify(this, function (key, value) {
        return key === 'audio' || key === 'onKernel' ? undefined : value;
      }));
      Object.assign(copy, data);
      copy.audio = null;
      copy.onKernel = null;
      copy.sound.effect = this.sound.effect;
      copy.sound.tune = this.sound.tune;
      return copy;
    }
  }

  Game.UP = UP;
  Game.DOWN = DOWN;
  Game.LEFT = LEFT;
  Game.RIGHT = RIGHT;
  Game.IN_BAY = IN_BAY;
  Game.HIDDEN = HIDDEN;

  FG.Game = Game;
})(window.FG);
