window.FG = window.FG || {};

// Draws one television frame the way the cartridge's kernel builds it, line by line from the top, into
// a 160x192 buffer of RGBA pixels. Called at the point of the frame where the console draws, after the
// game logic and before the joystick is read.
window.FG.Screen = (function (C, W, S) {
  'use strict';

  const WIDTH = C.W;
  const HEIGHT = C.H;
  // Lines where HMOVE blanks the first eight pixels of the playfield border.
  const HMOVE_LINES = [13, 30, 43, 56, 69, 82, 94, 108, 121, 134, 147, 160, 170, 182];
  const INK = C.INK;

  function rgba(hex) {
    const value = parseInt(hex.slice(1), 16);
    // Little-endian ImageData word: alpha, blue, green, red.
    return (0xFF000000 | ((value & 0xFF) << 16) | (value & 0xFF00) | (value >> 16)) >>> 0;
  }

  const palettes = { color: C.palette(false).map(rgba), gray: C.palette(true).map(rgba) };

  function create() {
    return new Uint32Array(WIDTH * HEIGHT);
  }

  function draw(game, pixels) {
    const ink = game.colorTV ? palettes.color : palettes.gray;
    const odd = (game.counter & 1) === 1;
    const player = game.current;

    function fill(top, bottom, left, right, color) {
      for (let y = top; y <= bottom; y++) pixels.fill(color, y * WIDTH + left, y * WIDTH + right + 1);
    }

    // A bitmap of 8-pixel lines; each pixel is stretched `scale` times and wraps around the line,
    // as TIA objects do.
    function sprite(lines, origin, top, scale, color) {
      for (let row = 0; row < lines.length; row++) {
        const y = top + row;
        if (y < 0 || y >= HEIGHT) continue;
        const line = lines[row];
        const base = y * WIDTH;
        for (let bit = 0; bit < 8; bit++) {
          if (line.charCodeAt(bit) !== 35) continue;
          for (let k = 0; k < scale; k++) {
            const x = (((origin + bit * scale + k) % WIDTH) + WIDTH) % WIDTH;
            pixels[base + x] = color;
          }
        }
      }
    }

    // Objects of one row: every copy of one of its two players.
    function object(lines, rowIndex, position, color) {
      const copies = W.copies(game.tableLevel, rowIndex, position);
      // Stretched players start one pixel later than single-width ones.
      const shift = copies.scale > 1 ? 0 : -1;
      copies.origins.forEach(function (origin) { sprite(lines, origin + shift, C.ROWS[rowIndex].top, copies.scale, color); });
    }

    function frogAt(top) {
      sprite(S.frog[game.frog.face], game.frog.x - 1, top, 1, ink[game.frog.ink]);
    }

    // Score area and the green rim above the bays.
    fill(0, 10, 0, WIDTH - 1, ink[INK.black]);
    drawScore();
    fill(11, 12, 0, WIDTH - 1, ink[INK.green]);

    // Hedge and the five bays.
    fill(13, 24, 0, WIDTH - 1, ink[INK.green]);
    for (let bay = 0; bay < 5; bay++) fill(13, 24, 8 + bay * 32, 23 + bay * 32, ink[INK.water]);
    drawBays();

    // River, bank, road, sidewalk and the green bottom.
    fill(25, 91, 0, WIDTH - 1, ink[INK.water]);
    fill(92, 102, 0, WIDTH - 1, ink[INK.yellow]);
    fill(103, 169, 0, WIDTH - 1, ink[INK.black]);
    fill(170, 179, 0, WIDTH - 1, ink[INK.yellow]);
    fill(180, HEIGHT - 1, 0, WIDTH - 1, ink[INK.green]);

    for (let row = 10; row >= 0; row--) drawRow(row);
    if (game.frog.row === C.SIDEWALK) frogAt(C.SIDEWALK_TOP);
    drawLivesAndTime();

    // The playfield border covers objects at both edges; HMOVE leaves its black comb on the left.
    fill(11, HEIGHT - 1, 0, 7, ink[INK.green]);
    fill(11, HEIGHT - 1, WIDTH - 8, WIDTH - 1, ink[INK.green]);
    HMOVE_LINES.forEach(function (y) { fill(y, y, 0, 7, ink[INK.black]); });

    function drawScore() {
      const color = ink[INK.orange];
      if (game.state === 'select') {
        sprite(S.digits[game.game], 70, 1, 1, color);
        return;
      }
      const score = player.score;
      const digits = [Math.floor(score / 1000) % 10, Math.floor(score / 100) % 10, Math.floor(score / 10) % 10, score % 10];
      const left = game.player === 0 ? 40 : 100;
      let leading = true;
      digits.forEach(function (digit, i) {
        if (leading && digit === 0 && i < 3) return;
        leading = false;
        sprite(S.digits[digit], left + i * 8, 1, 1, color);
      });
    }

    // On odd frames a visitor takes the bay kernel for itself, so the frogs already home blink.
    function drawBays() {
      const visitor = game.visitor;
      if (odd && visitor.bay) {
        const picture = visitor.kind === 'fly' ? S.fly : visitor.kind === 'rising' ? S.crocRising : S.crocHead;
        if (visitor.kind) sprite(picture, 12 + (visitor.bay - 1) * 32, 14, 1, ink[INK.frog]);
        return;
      }
      for (let bay = 0; bay < 5; bay++) {
        if (player.bays & (1 << bay)) sprite(S.homeFrog, 12 + bay * 32, 14, 1, ink[INK.green]);
      }
    }

    function rowObjects(row) {
      const info = C.ROWS[row];
      const positions = game.drawn[row];
      const level = player.level;
      let first = S[info.kind];
      let second = first;
      if (row === C.BANK) {
        first = null;
        second = level >= 4 ? S.snake.right[(game.counter & 0x10) === 0 ? 1 : 0] : null;
      } else if (row === C.CROC_ROW) {
        if (level >= 2) first = (game.counter & 0x40) === 0 ? S.croc.shut : S.croc.open;
        second = S.log;
      }
      if (first) object(first, row, positions.a, ink[info.ink]);
      if (second) object(second, row, positions.b, ink[row === 6 || row === 9 ? game.turtleInk(row) : info.ink]);
    }

    function drawRow(row) {
      const top = C.ROWS[row].top;
      const frogHere = game.frog.row === row;
      if (row === C.BANK) {
        // The bank has its own kernel: frog and snake every frame.
        rowObjects(row);
        if (frogHere) frogAt(top);
        return;
      }
      if (odd && game.lady.row === row) {
        sprite(S.lady, game.lady.x - 1, top, 1, ink[INK.white]);
        if (frogHere) frogAt(top);
        return;
      }
      if (odd && game.snake.row === row) {
        const facing = game.snake.flags & 0x40 ? S.snake.left : S.snake.right;
        sprite(facing[(game.counter & 0x10) === 0 ? 0 : 1], game.snake.x, top, 2, ink[INK.snake]);
        if (frogHere) frogAt(top);
        return;
      }
      if (odd && frogHere) {
        frogAt(top);
        return;
      }
      rowObjects(row);
    }

    function drawLivesAndTime() {
      const reserves = player.reserves;
      for (let i = 0; i < Math.min(Math.max(reserves, 0), 4); i++) fill(183, 186, 18 + i * 4, 19 + i * 4, ink[INK.white]);
      const timer = game.timer;
      if (timer > 0 && timer < 0x80) {
        fill(183, 186, Math.max(8, 152 - timer), 151, ink[timer <= C.TIMER_WARNING ? INK.turtle : INK.black]);
      }
    }
  }

  return { WIDTH: WIDTH, HEIGHT: HEIGHT, create: create, draw: draw };
})(window.FG.Config, window.FG.World, window.FG.Sprites);
