window.FG = window.FG || {};

// The page around the console: the 60 Hz loop, the picture, the switches and the status line.
(function (FG) {
  'use strict';

  const C = FG.Config;
  const STEP = 1000 / 60;
  const RECORD_KEY = 'frogger2600.highScore';
  const DEATHS = {
    trânsito: 'O sapo foi atropelado.',
    água: 'O sapo caiu no rio.',
    tartaruga: 'A tartaruga mergulhou com o sapo nas costas.',
    jacaré: 'O jacaré pegou o sapo.',
    cobra: 'A cobra pegou o sapo.',
    arbusto: 'O sapo bateu no arbusto entre as tocas.',
    borda: 'O sapo foi levado para fora da tela.',
    tempo: 'O tempo acabou.',
  };

  function stickBits(state) {
    return (state.up ? FG.Game.UP : 0) | (state.down ? FG.Game.DOWN : 0) |
      (state.left ? FG.Game.LEFT : 0) | (state.right ? FG.Game.RIGHT : 0);
  }

  FG.boot = function () {
    const canvas = document.getElementById('screen');
    const ctx = canvas.getContext('2d', { alpha: false });
    const image = ctx.createImageData(C.W, C.H);
    const view = new Uint32Array(image.data.buffer);
    const frames = [FG.Screen.create(), FG.Screen.create()];
    let latest = 0;
    let drawn = 0;

    const game = new FG.Game({ audio: FG.Audio, onKernel: kernel });
    FG.game = game;
    let paused = false;
    let muted = false;
    let last = null;
    let budget = 0;
    let pending = 0;
    let fireWas = false;
    let news = null;
    let statusText = '';
    let record = 0;
    try { record = Number(localStorage.getItem(RECORD_KEY)) || 0; } catch (_) { /* Storage is optional. */ }

    FG.paused = function () { return paused; };

    function kernel(state) {
      latest ^= 1;
      FG.Screen.draw(state, frames[latest]);
      drawn++;
    }

    // One emulated frame per refresh is shown as is, flicker included, like a television. When the
    // browser shows fewer frames than the console makes, the last two are mixed like phosphor glow,
    // so sprites drawn on alternate frames never vanish.
    function present() {
      if (drawn >= 2) {
        const a = frames[0];
        const b = frames[1];
        for (let i = 0; i < view.length; i++) {
          const p = a[i];
          const q = b[i];
          view[i] = (0xFF000000 | Math.max(p & 0xFF0000, q & 0xFF0000) | Math.max(p & 0xFF00, q & 0xFF00) | Math.max(p & 0xFF, q & 0xFF)) >>> 0;
        }
      } else {
        view.set(frames[latest]);
      }
      ctx.putImageData(image, 0, 0);
    }

    function saveRecord() {
      const best = Math.max(game.players[0].score, game.players[1].score);
      if (best <= record) return;
      record = best;
      try { localStorage.setItem(RECORD_KEY, String(record)); } catch (_) { /* Private browsing can deny storage. */ }
    }

    function runFrame() {
      const pad = FG.Input.poll();
      pending |= stickBits(pad);
      // On the select screen the red button also presses GAME RESET; the cartridge only takes the switch.
      if (pad.fire && !fireWas && game.state === 'select') game.press('reset');
      fireWas = pad.fire;
      game.frame({ stick: pending, fire: pad.fire, fire2: pad.fire });
      // The cartridge reads the joystick on odd frames; a tap shorter than that waits for the next one.
      if (game.counter & 1) pending = 0;
      game.events.forEach(function (event) { news = event === 'hop' ? null : event; });
      if (game.state === 'play' && news !== 'turn') news = null;
      saveRecord();
    }

    function tick(now) {
      requestAnimationFrame(tick);
      if (last === null) last = now;
      budget += Math.min(now - last, 250);
      last = now;
      if (paused) {
        budget = 0;
        return;
      }
      drawn = 0;
      let steps = 0;
      while (budget >= STEP && steps < 4) {
        runFrame();
        budget -= STEP;
        steps++;
      }
      if (steps === 4) budget = 0;
      if (drawn) present();
      syncConsole();
      syncStatus();
    }

    function label(id, value) {
      const node = document.getElementById(id);
      if (node && node.textContent !== value) node.textContent = value;
    }

    function pressed(selector, value) {
      const node = document.querySelector(selector);
      if (node) node.setAttribute('aria-pressed', String(value));
    }

    function setPaused(value) {
      if (game.state === 'select' || game.state === 'over') value = false;
      paused = value;
      FG.Input.clear();
      if (paused) FG.Audio.stop();
      last = null;
    }

    function action(type) {
      FG.Audio.unlock();
      if (type === 'start') {
        if (game.state === 'select' || game.state === 'over') game.press('reset');
        else setPaused(!paused);
      } else if (type === 'pause') {
        setPaused(!paused);
      } else if (type === 'reset' || type === 'select') {
        setPaused(false);
        game.press(type);
      } else if (/^select[1-6]$/.test(type)) {
        setPaused(false);
        // A number key is a quick run of GAME SELECT presses: land one game short and press once more.
        const wanted = Number(type.slice(6));
        game.game = wanted === 1 ? 6 : wanted - 1;
        game.selectLatch = false;
        game.press('select');
      } else if (type === 'difficultyLeft' || type === 'difficultyRight') {
        game.toggleDifficulty(type === 'difficultyLeft' ? 0 : 1);
      } else if (type === 'color') {
        game.toggleColor();
        if (paused) {
          FG.Screen.draw(game, frames[latest]);
          drawn = 1;
          present();
        }
      } else if (type === 'mute') {
        muted = !muted;
        FG.Audio.setMuted(muted);
      } else if (type === 'fullscreen') {
        toggleFullscreen();
      }
      syncConsole();
      syncStatus();
    }

    // The stage holds the television and the touch pad, so a phone keeps its controls. Older Safari
    // only has the webkit-prefixed API, and the iPhone has neither, so the button hides there.
    const stage = document.querySelector('.stage');
    const requestFull = stage && (stage.requestFullscreen || stage.webkitRequestFullscreen);
    const canFullscreen = !!requestFull && !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
    const fullscreenButton = document.getElementById('fullscreen-button');
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
      } catch (_) { /* The browser can refuse fullscreen. */ }
    }

    function markFullscreen() {
      if (stage) stage.classList.toggle('full', fullscreenElement() === stage);
    }
    document.addEventListener('fullscreenchange', markFullscreen);
    document.addEventListener('webkitfullscreenchange', markFullscreen);

    function pauseOnLeave() {
      if (game.state === 'play' || game.state === 'pause') setPaused(true);
      else {
        FG.Input.clear();
        FG.Audio.stop();
        last = null;
      }
      syncStatus();
    }
    window.addEventListener('blur', pauseOnLeave);
    document.addEventListener('visibilitychange', function () { if (document.hidden) pauseOnLeave(); });

    function touch() {
      return document.body.classList.contains('touch');
    }

    function syncConsole() {
      label('game-state', C.GAMES[game.game].label);
      const side = function (on) { return on ? 'A' : 'B'; };
      label('diff-state', 'Dificuldade: esquerda ' + side(game.difficulty[0]) + ' · direita ' + side(game.difficulty[1]));
      label('tv-state', game.colorTV ? 'TV colorida' : 'TV em preto e branco');
      label('mute-state', muted ? 'Som desligado' : 'Som ligado');
      pressed('[data-switch="tv"]', !game.colorTV);
      pressed('[data-switch="left"]', game.difficulty[0]);
      pressed('[data-switch="right"]', game.difficulty[1]);
      pressed('[data-action="mute"]', muted);
    }

    function message() {
      const who = game.twoPlayers ? 'Jogador ' + (game.player + 1) : 'O sapo';
      const begin = touch() ? 'Toque na tela ou em GAME RESET' : 'Aperte Enter ou GAME RESET';
      if (paused) return touch() ? 'Jogo pausado. Toque na tela ou no botão vermelho para continuar.' : 'Jogo pausado. Aperte P para continuar.';
      if (game.state === 'select') return C.GAMES[game.game].label + '. ' + begin + ' para começar; GAME SELECT troca o jogo.';
      if (game.state === 'over') {
        const scores = game.twoPlayers
          ? 'Jogador 1: ' + game.players[0].score + ' pontos · jogador 2: ' + game.players[1].score + ' pontos.'
          : game.players[0].score + ' pontos.';
        return 'Fim de jogo. ' + scores + ' Recorde: ' + record + '. O botão vermelho joga de novo o mesmo jogo.';
      }
      if (game.state === 'pause') {
        if (game.frog.face === 'dead') return DEATHS[game.reason] || 'O sapo se perdeu.';
        if (news === 'level') return 'Cinco sapos em casa! Começa a fase ' + game.current.level + '.';
        if (news === 'start' || game.frog.row === C.SIDEWALK) return 'A música de abertura toca; o sapo parte quando ela acabar.';
        if (news === 'home-lady') return 'Sapo em casa com a rã-dama: 20 pontos a mais.';
        if (news === 'fly') return 'Sapo em casa e a mosca foi comida: 20 pontos a mais.';
        return 'Sapo em casa!';
      }
      if (news === 'turn') return 'Vez do jogador ' + (game.player + 1) + '.';
      return who + ' na travessia. Leve-o a uma toca vazia antes que o tempo acabe.';
    }

    function syncStatus() {
      const text = message();
      if (text !== statusText) {
        statusText = text;
        label('status', text);
      }
      const running = game.state === 'play' || game.state === 'pause';
      label('pause-label', paused ? 'CONTINUAR' : 'PAUSA');
      const pause = document.getElementById('pause-button');
      if (pause) {
        pause.disabled = !running;
        pause.setAttribute('aria-pressed', String(paused));
      }
      // During a game Enter pauses, so the start button turns into GAME RESET and shows R.
      label('start-label', running ? 'REINICIAR' : 'COMEÇAR');
      label('start-key', running ? 'R' : 'ENTER');
      const start = document.getElementById('start-button');
      if (start) start.setAttribute('data-action', running ? 'reset' : 'start');
    }

    FG.Input.init(action);
    syncConsole();
    syncStatus();
    requestAnimationFrame(tick);
  };
})(window.FG);
