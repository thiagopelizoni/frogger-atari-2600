window.FG = window.FG || {};

// Tables and constants of the cartridge. Coordinates are the console's own: the picture is 160 pixels
// wide and the canvas keeps scanlines 0 to 191 of the frame. Horizontal positions are the 1..160 bytes
// the game keeps in RAM; an object at position p starts at screen column p - 1 (single width) or p
// (double and quad width, which the TIA starts one clock later).
//
// Rows are numbered from the bottom: 0..4 are the road lanes (0 next to the sidewalk), 5 is the
// riverbank and 6..10 the river (10 under the bays). The frog also uses -1 for the sidewalk.
window.FG.Config = (function () {
  'use strict';

  // NTSC colours of the console, indexed by TIA colour value / 2.
  const NTSC = [
    '#000000', '#4A4A4A', '#6F6F6F', '#8E8E8E', '#AAAAAA', '#C0C0C0', '#D6D6D6', '#ECECEC',
    '#484800', '#69690F', '#86861D', '#A2A22A', '#BBBB35', '#D2D240', '#E8E84A', '#FCFC54',
    '#7C2C00', '#904811', '#A26221', '#B47A30', '#C3903D', '#D2A44A', '#DFB755', '#ECC860',
    '#901C00', '#A33915', '#B55328', '#C66C3A', '#D5824A', '#E39759', '#F0AA67', '#FCBC74',
    '#940000', '#A71A1A', '#B83232', '#C84848', '#D65C5C', '#E46F6F', '#F08080', '#FC9090',
    '#840064', '#97197A', '#A8308F', '#B846A2', '#C659B3', '#D46CC3', '#E07CD2', '#EC8CE0',
    '#500084', '#68199A', '#7D30AD', '#9246C0', '#A459D0', '#B56CE0', '#C57CEE', '#D48CFC',
    '#140090', '#331AA3', '#4E32B5', '#6848C6', '#7F5CD5', '#956FE3', '#A980F0', '#BC90FC',
    '#000094', '#181AA7', '#2D32B8', '#4248C8', '#545CD6', '#656FE4', '#7580F0', '#8490FC',
    '#001C88', '#183B9D', '#2D57B0', '#4272C2', '#548AD2', '#65A0E1', '#75B5EF', '#84C8FC',
    '#003064', '#185080', '#2D6D98', '#4288B0', '#54A0C5', '#65B7D9', '#75CCEB', '#84E0FC',
    '#004030', '#18624E', '#2D8169', '#429E82', '#54B899', '#65D1AE', '#75E7C2', '#84FCD4',
    '#004400', '#1A661A', '#328432', '#48A048', '#5CBA5C', '#6FD26F', '#80E880', '#90FC90',
    '#143C00', '#355F18', '#527E2D', '#6E9C42', '#87B754', '#9ED065', '#B4E775', '#C8FC84',
    '#303800', '#505916', '#6D762B', '#88923E', '#A0AB4F', '#B7C25F', '#CCD86E', '#E0EC7C',
    '#482C00', '#694D14', '#866A26', '#A28638', '#BB9F47', '#D2B656', '#E8CC63', '#FCE070',
  ];

  // The kernel never names a colour directly: it reads an index through one of these two tables,
  // picked by the TV TYPE switch.
  const INK = {
    black: 0, white: 1, orange: 2, yellow: 3, green: 4, log: 6, purple: 7, olive: 8, turtle: 9,
    diving: 10, water: 11, frog: 12, pink: 13, snake: 14, gone: 11,
  };
  const COLOR_TABLE = [0x00, 0x0E, 0x28, 0x1C, 0xD4, 0x90, 0x12, 0x68, 0x16, 0x22, 0x96, 0x90, 0xD6, 0x58, 0xD4];
  const GRAY_TABLE = [0x00, 0x0E, 0x0C, 0x08, 0x02, 0x03, 0x00, 0x0D, 0x0E, 0x00, 0x0A, 0x04, 0x0E, 0x0C, 0x0E];

  function palette(gray) {
    return (gray ? GRAY_TABLE : COLOR_TABLE).map(function (value) { return NTSC[value >> 1]; });
  }

  // Rows from the bottom up. `top` is the first scanline of the 7-line object band.
  const ROWS = [
    { name: 'road1', top: 161, left: true, start: [1, 81], ink: INK.orange, kind: 'carOrange' },
    { name: 'road2', top: 148, left: false, start: [11, 91], ink: INK.purple, kind: 'carPurple' },
    { name: 'road3', top: 135, left: true, start: [14, 94], ink: INK.snake, kind: 'carGreen' },
    { name: 'road4', top: 122, left: false, start: [22, 102], ink: INK.pink, kind: 'carPink' },
    { name: 'road5', top: 109, left: true, start: [15, 95], ink: INK.white, kind: 'truck' },
    { name: 'bank', top: 95, left: false, start: [8, 50], ink: INK.snake, kind: 'snake' },
    { name: 'river1', top: 83, left: true, start: [5, 70], ink: INK.turtle, kind: 'turtle' },
    { name: 'river2', top: 70, left: false, start: [90, 98], ink: INK.log, kind: 'log' },
    { name: 'river3', top: 57, left: false, start: [10, 42], ink: INK.log, kind: 'log' },
    { name: 'river4', top: 44, left: true, start: [70, 10], ink: INK.turtle, kind: 'turtle' },
    { name: 'river5', top: 31, left: false, start: [2, 82], ink: INK.log, kind: 'log' },
  ];
  const BANK = 5;
  const LADY_ROW = 7;
  const SNAKE_ROW = 8;
  const CROC_ROW = 10;
  const SIDEWALK = -1;
  const SIDEWALK_TOP = 171;

  // The TIA size codes the rows use: width of one copy, number of copies and the gap to the next one.
  const SHAPES = [
    { width: 8, copies: 1, gap: 0 },
    { width: 8, copies: 2, gap: 8 },
    { width: 8, copies: 2, gap: 24 },
    { width: 8, copies: 3, gap: 8 },
    { width: 8, copies: 2, gap: 56 },
    { width: 16, copies: 1, gap: 0 },
    { width: 8, copies: 3, gap: 24 },
    { width: 32, copies: 1, gap: 0 },
  ];

  // Per level (1..10, then again from 1): a row moves one pixel on frames where
  // (counter & mask) == 0, so 0 is 60 px/s, 1 is 30, 3 is 15 and 7 is 7.5.
  const MASKS = [
    [3, 7, 7, 3, 7, 1, 3, 1, 3, 1, 1],
    [1, 3, 3, 1, 3, 0, 1, 3, 1, 3, 3],
    [3, 1, 3, 1, 3, 0, 1, 1, 0, 3, 1],
    [0, 1, 3, 1, 0, 3, 7, 3, 1, 1, 3],
    [0, 3, 0, 3, 1, 1, 0, 1, 3, 1, 1],
    [1, 0, 0, 7, 0, 7, 1, 3, 1, 3, 7],
    [0, 1, 3, 1, 0, 3, 7, 3, 1, 1, 3],
    [1, 3, 3, 1, 3, 0, 1, 3, 1, 3, 3],
    [1, 0, 0, 7, 0, 7, 1, 3, 1, 3, 7],
    [3, 0, 1, 3, 0, 3, 3, 7, 3, 1, 1],
  ];
  const LAYOUTS = [
    [0, 0, 2, 0, 5, 5, 3, 6, 7, 1, 7],
    [2, 1, 1, 1, 5, 5, 3, 6, 7, 1, 7],
    [1, 6, 0, 3, 5, 5, 3, 2, 7, 1, 7],
    [2, 1, 1, 1, 5, 5, 3, 6, 7, 1, 7],
    [0, 0, 2, 0, 5, 5, 3, 6, 7, 1, 7],
    [2, 1, 1, 1, 5, 5, 3, 6, 7, 1, 7],
    [0, 0, 2, 0, 5, 5, 3, 6, 7, 1, 7],
    [3, 6, 3, 6, 5, 5, 3, 4, 7, 1, 7],
    [1, 6, 0, 3, 5, 5, 3, 2, 7, 1, 7],
    [3, 6, 3, 6, 5, 5, 3, 4, 7, 1, 7],
  ];

  // Only the second turtle group of each turtle row dives. The phase moves every 256 frames.
  const DIVE = {
    6: [INK.turtle, INK.diving, INK.gone, INK.diving],
    9: [INK.diving, INK.gone, INK.diving, INK.turtle],
  };

  const GAMES = {
    1: { players: 1, level: 1, speedy: false, label: 'Jogo 1 · um jogador' },
    2: { players: 2, level: 1, speedy: false, label: 'Jogo 2 · dois jogadores' },
    3: { players: 1, level: 3, speedy: false, label: 'Jogo 3 · um jogador, mais difícil' },
    4: { players: 2, level: 3, speedy: false, label: 'Jogo 4 · dois jogadores, mais difícil' },
    5: { players: 1, level: 1, speedy: true, label: 'Jogo 5 · Speedy Frogger, um jogador' },
    6: { players: 2, level: 1, speedy: true, label: 'Jogo 6 · Speedy Frogger, dois jogadores' },
  };

  // Sound. An effect is a list of [frames, AUDC, AUDF, AUDV] steps on channel 0.
  const CHIRP = [[2, 13, 2, 14], [2, 13, 3, 8], [2, 13, 5, 2]];
  const EFFECTS = {
    hop: [[3, 4, 13, 9], [3, 4, 7, 8], [3, 4, 16, 6]],
    lady: [[5, 4, 8, 12], [5, 4, 4, 12], [5, 4, 8, 12]],
    warning: CHIRP.concat([[3, 13, 2, 14], [2, 13, 3, 8], [2, 13, 5, 2]], CHIRP, CHIRP),
    twoPlayers: CHIRP.concat(CHIRP),
    home: CHIRP,
    death: [[3, 8, 16, 14], [2, 13, 5, 6], [4, 8, 30, 8]],
  };
  // Tune notes pack channel 0 in the high nibble and channel 1 in the low one. Each note decays from
  // volume 14 to 0 in 15 frames.
  const NOTES = [
    [12, 23], [12, 20], [12, 17], [12, 15], [5, 26], [5, 23], [5, 20], [5, 19], [5, 17], [5, 15], [5, 0],
  ];
  const TUNES = {
    start: [0x62, 0x42, 0x40, 0x42, 0x62, 0x42, 0x40, 0x41, 0x73, 0x73, 0x61, 0x63, 0x53, 0xA3, 0xA0, 0xA3,
      0x73, 0x73, 0x60, 0x63, 0x53, 0x53, 0x90, 0x93, 0x83, 0x73, 0x60, 0x53, 0x42],
    theme: [0x42, 0x50, 0x62, 0x70, 0x82, 0xA0, 0x62, 0xA0, 0x42, 0x50, 0x62, 0x50, 0x42, 0xA0, 0x42, 0xA0,
      0x42, 0x50, 0x62, 0x70, 0x82, 0xA0, 0x62, 0xA0, 0x83, 0x70, 0x63, 0x50, 0x42],
  };

  return {
    W: 160,
    H: 192,
    NTSC: NTSC,
    INK: INK,
    palette: palette,
    ROWS: ROWS,
    BANK: BANK,
    LADY_ROW: LADY_ROW,
    SNAKE_ROW: SNAKE_ROW,
    CROC_ROW: CROC_ROW,
    SIDEWALK: SIDEWALK,
    SIDEWALK_TOP: SIDEWALK_TOP,
    SHAPES: SHAPES,
    MASKS: MASKS,
    LAYOUTS: LAYOUTS,
    DIVE: DIVE,
    GAMES: GAMES,
    EFFECTS: EFFECTS,
    NOTES: NOTES,
    TUNES: TUNES,
    START_X: 80,
    TIMER: 30,
    TIMER_WARNING: 6,
    RESERVES: 4,
    DEATH_PAUSE: 70,
    HOME_PAUSE: 8,
    VISIT: 157,
    // Bay n (0..4) takes a frog whose x is in [11 + 32n, 18 + 32n].
    BAY_LEFT: 11,
    BAY_PITCH: 32,
    BAY_WIDTH: 8,
    // Hop limits on x: a hop must land on 6 or more and below 147.
    HOP_MIN: 6,
    HOP_MAX: 147,
    // With the difficulty switch on A, a frog carried to x >= 147 or x < 4 is lost.
    EDGE_RIGHT: 147,
    EDGE_LEFT: 4,
  };
})();
