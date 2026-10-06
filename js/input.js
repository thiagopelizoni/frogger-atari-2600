window.FG = window.FG || {};

(function (FG) {
  'use strict';

  var keys = Object.create(null);
  var pointers = new Map();
  var pulse = Object.create(null);
  var callback = function () {};
  var ready = false;
  var state = { left: false, right: false, up: false, down: false, fire: false };
  var directions = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  };
  var actions = {
    Enter: 'start', Space: 'fire', KeyP: 'pause', KeyR: 'reset', KeyM: 'mute',
    KeyC: 'color', KeyL: 'difficulty', KeyF: 'fullscreen',
    Digit1: 'select1', Digit2: 'select2', Digit3: 'select3', Digit4: 'select4', Digit5: 'select5', Digit6: 'select6',
    Numpad1: 'select1', Numpad2: 'select2', Numpad3: 'select3', Numpad4: 'select4', Numpad5: 'select5', Numpad6: 'select6',
  };

  function editable(target) {
    return !!(target && (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)));
  }

  function heldDirections() {
    var next = { left: false, right: false, up: false, down: false, fire: false };
    Object.keys(keys).forEach(function (code) {
      var dir = directions[code];
      if (dir) next[dir] = true;
    });
    pointers.forEach(function (pointer) {
      if (pointer.control) next[pointer.control] = true;
    });
    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (var i = 0; i < pads.length; i++) {
      var pad = pads[i];
      if (!pad) continue;
      var x = pad.axes[0] || 0;
      var y = pad.axes[1] || 0;
      if (x < -0.4 || (pad.buttons[14] && pad.buttons[14].pressed)) next.left = true;
      if (x > 0.4 || (pad.buttons[15] && pad.buttons[15].pressed)) next.right = true;
      if (y < -0.4 || (pad.buttons[12] && pad.buttons[12].pressed)) next.up = true;
      if (y > 0.4 || (pad.buttons[13] && pad.buttons[13].pressed)) next.down = true;
      if ((pad.buttons[0] && pad.buttons[0].pressed) || (pad.buttons[1] && pad.buttons[1].pressed)) next.fire = true;
    }
    state = next;
    document.querySelectorAll('#pad [data-dir], #pad [data-control="fire"]').forEach(function (button) {
      var control = button.dataset.dir || 'fire';
      button.classList.toggle('held', !!next[control]);
    });
    return state;
  }

  function init(onAction) {
    callback = typeof onAction === 'function' ? onAction : callback;
    if (ready) return;
    ready = true;
    if (navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
    window.addEventListener('keydown', function (event) {
      if (editable(event.target) || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target && event.target.closest && event.target.closest('button, a, [role="button"]')) return;
      var dir = directions[event.code];
      var action = actions[event.code];
      if (!dir && !action) return;
      event.preventDefault();
      if (FG.Audio) FG.Audio.unlock();
      if (dir) keys[event.code] = true;
      if (action && !event.repeat && !keys[event.code]) {
        keys[event.code] = true;
        callback(action);
      }
      heldDirections();
    });
    window.addEventListener('keyup', function (event) {
      delete keys[event.code];
      heldDirections();
    });
    window.addEventListener('blur', function () {
      keys = Object.create(null);
      pointers.clear();
      heldDirections();
    });
    document.querySelectorAll('[data-action]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (FG.Audio) FG.Audio.unlock();
        callback(button.dataset.action);
        var screen = document.getElementById('screen');
        if (screen) screen.focus({ preventScroll: true });
      });
    });
    document.querySelectorAll('#pad [data-dir], #pad [data-control="fire"]').forEach(function (element) {
      var control = element.dataset.dir || 'fire';
      element.addEventListener('pointerdown', function (event) {
        event.preventDefault();
        if (event.pointerType !== 'mouse') document.body.classList.add('touch');
        if (FG.Audio) FG.Audio.unlock();
        pointers.set(event.pointerId, { control: control });
        pulse[control] = true;
        try { element.setPointerCapture(event.pointerId); } catch (error) { /* Pointer capture can fail. */ }
        heldDirections();
      });
      function release(event) {
        if (pointers.delete(event.pointerId)) heldDirections();
      }
      element.addEventListener('pointerup', release);
      element.addEventListener('pointercancel', release);
    });
    var screen = document.getElementById('screen');
    if (screen) {
      screen.addEventListener('pointerdown', function (event) {
        if (event.pointerType === 'mouse') {
          screen.focus({ preventScroll: true });
          return;
        }
        document.body.classList.add('touch');
        if (FG.Audio) FG.Audio.unlock();
        callback('fire');
      });
    }
  }

  FG.Input = {
    init: init,
    state: function () {
      var next = ready ? heldDirections() : state;
      Object.keys(pulse).forEach(function (control) {
        next[control] = true;
        delete pulse[control];
      });
      state = next;
      return state;
    },
    clear: function () {
      keys = Object.create(null);
      pointers.clear();
      state = { left: false, right: false, up: false, down: false, fire: false };
    },
  };
})(window.FG);
