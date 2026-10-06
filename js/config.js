window.FG = window.FG || {};

(function (FG) {
  'use strict';

  var W = 160;
  var H = 192;
  var FROG_W = 8;
  var HOP = 8;

  // Five bays across the hedge. The frog fits when its whole body is inside the opening.
  var BAYS = [];
  for (var i = 0; i < 5; i++) {
    var left = 15 + i * 28;
    BAYS.push({ index: i, left: left, right: left + 18 });
  }

  function rowTop(row) {
    if (row >= 7 && row <= 11) return 26 + (11 - row) * 12;
    if (row === 6) return 86;
    if (row >= 1 && row <= 5) return 98 + (5 - row) * 12;
    if (row === 0) return 158;
    return 10;
  }

  function startLevel(variation) {
    return variation === 3 || variation === 4 ? 2 : 1;
  }

  function twoPlayers(variation) {
    return variation % 2 === 0;
  }

  function speedy(variation) {
    return variation >= 5;
  }

  FG.Config = {
    W: W,
    H: H,
    FROG_W: FROG_W,
    FROG_H: 8,
    HOP: HOP,
    START_X: 76,
    TIME_LIMIT: 30,
    TIME_WARN: 5,
    START_LIVES: 5,
    EXTRA_EVERY: 1000,
    EXTRA_BELOW: 4,
    DEATH_TIME: 0.75,
    SPEEDY_REPEAT: 0.2,
    DIVE_CYCLE: 8,
    DIVE_WARN: 4.2,
    DIVE_UNDER: 5,
    DIVE_RISE: 6.6,
    SCORE: { forward: 1, home: 5, complete: 100, lady: 20, fly: 20, second: 2 },
    BAYS: BAYS,
    rowTop: rowTop,
    rowHeight: function (row) { return row === 12 ? 16 : 12; },
    startLevel: startLevel,
    twoPlayers: twoPlayers,
    speedy: speedy,
    variationLabel: function (variation) {
      var names = {
        1: 'Jogo 1 · iniciante, um jogador',
        2: 'Jogo 2 · iniciante, dois jogadores',
        3: 'Jogo 3 · avançado, um jogador',
        4: 'Jogo 4 · avançado, dois jogadores',
        5: 'Jogo 5 · Speedy Frogger, um jogador',
        6: 'Jogo 6 · Speedy Frogger, dois jogadores',
      };
      return names[variation] || ('Jogo ' + variation);
    },
  };
})(window.FG);
