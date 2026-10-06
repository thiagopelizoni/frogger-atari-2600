window.FG = window.FG || {};

(function (FG) {
  'use strict';

  var C = FG.Config;
  var W = C.W;
  var FROG_W = C.FROG_W;

  function mod(n, m) {
    return ((n % m) + m) % m;
  }

  function turtleSegments() {
    return [
      { offset: 0, w: 10, part: 'turtle' },
      { offset: 10, w: 4, part: 'gap' },
      { offset: 14, w: 10, part: 'turtle' },
      { offset: 24, w: 4, part: 'gap' },
      { offset: 28, w: 10, part: 'turtle' },
    ];
  }

  function alligatorParts(speed) {
    if (speed >= 0) {
      return [
        { offset: 0, w: 16, part: 'tail' },
        { offset: 16, w: 16, part: 'back' },
        { offset: 32, w: 10, part: 'jaws' },
      ];
    }
    return [
      { offset: 0, w: 10, part: 'jaws' },
      { offset: 10, w: 16, part: 'back' },
      { offset: 26, w: 16, part: 'tail' },
    ];
  }

  function turtlePhase(obj) {
    if (!obj || obj.kind !== 'turtles' || !obj.dives) return 'red';
    var t = obj.clock % C.DIVE_CYCLE;
    if (t >= C.DIVE_UNDER && t < C.DIVE_RISE) return 'under';
    if (t >= C.DIVE_WARN) return 'blue';
    return 'red';
  }

  function submerged(obj) {
    return turtlePhase(obj) === 'under';
  }

  function scale(level) {
    return 1 + (level - 1) * 0.25;
  }

  function makeLane(row, kind) {
    return { row: row, kind: kind, objects: [] };
  }

  function create(level) {
    var lanes = [];
    var row;
    for (row = 0; row < 12; row++) {
      var kind = 'sidewalk';
      if (row >= 1 && row <= 5) kind = 'road';
      else if (row === 6) kind = 'bank';
      else if (row >= 7) kind = 'river';
      lanes.push(makeLane(row, kind));
    }

    var roadSpeed = [28, -20, 36, -24, 16];
    var roadCount = level <= 1 ? 2 : 3;
    var factor = scale(level);
    for (var r = 0; r < 5; r++) {
      var lane = lanes[r + 1];
      var truck = r % 2 === 1;
      var width = truck ? 26 : 14;
      var gap = W / roadCount;
      for (var i = 0; i < roadCount; i++) {
        lane.objects.push({
          kind: truck ? 'truck' : 'car',
          x: mod(12 + r * 20 + i * gap, W),
          w: width,
          speed: roadSpeed[r] * factor,
          color: (r + i) % 5,
        });
      }
    }

    if (level >= 2) {
      lanes[6].objects.push({
        kind: 'snake',
        x: 20,
        w: 30,
        speed: 22 * factor,
        mouth: 8,
      });
    }

    var riverSpeed = [-22, 18, -32, 26, -14];
    var riverKind = ['log', 'turtles', 'log', 'turtles', 'log'];
    var riverCount = level <= 1 ? 3 : 2;
    var lady = null;
    for (var c = 0; c < 5; c++) {
      var current = lanes[c + 7];
      var base = riverSpeed[c] * factor;
      var spacing = W / riverCount;
      for (var n = 0; n < riverCount; n++) {
        var mixed = level >= 2 && n % 2 === 1 ? 1.5 : 1;
        var speed = base * mixed;
        var x = mod(8 + c * 26 + n * spacing, W);
        if (riverKind[c] === 'turtles') {
          current.objects.push({
            kind: 'turtles',
            x: x,
            w: 38,
            speed: speed,
            dives: n === 0,
            clock: (c * 1.3 + n) % C.DIVE_CYCLE,
            segments: turtleSegments(),
          });
        } else if (c === 2 && n === 0) {
          current.objects.push({
            kind: 'alligator',
            x: x,
            w: 42,
            speed: speed,
          });
        } else {
          var log = { kind: 'log', x: x, w: 36, speed: speed, snake: null };
          if (level >= 3 && c === 4 && n === 0) {
            log.snake = { offset: 6, w: 22, mouth: 8 };
          }
          current.objects.push(log);
          if (!lady && c === 0 && n === 0) {
            lady = { row: current.row, index: 0, offset: 14, caught: false };
          }
        }
      }
    }

    return { level: level, lanes: lanes, lady: lady };
  }

  function boxOverlap(frogX, objX, objW) {
    if (objW <= 0) return false;
    var f0 = frogX;
    var f1 = frogX + FROG_W;
    var shifts = [0, W, -W];
    for (var s = 0; s < shifts.length; s++) {
      var a = objX + shifts[s];
      var b = a + objW;
      if (f0 < b && a < f1) return true;
    }
    return false;
  }

  function centerOffset(frogX, objX, objW) {
    if (objW <= 0) return null;
    var rel = mod((frogX + FROG_W / 2) - objX, W);
    return rel < objW ? rel : null;
  }

  function snakeMouth(obj) {
    var mouth = obj.mouth || 8;
    if (obj.speed >= 0) return { offset: obj.w - mouth, w: mouth };
    return { offset: 0, w: mouth };
  }

  function logMouth(obj) {
    var mouth = obj.snake.mouth;
    var offset = obj.speed >= 0 ? obj.snake.offset + obj.snake.w - mouth : obj.snake.offset;
    return { offset: offset, w: mouth };
  }

  function overlapsRelative(frogX, objX, offset, width) {
    return boxOverlap(frogX, objX + offset, width);
  }

  function probe(world, row, frogX) {
    var lane = world.lanes[row];
    if (!lane || lane.kind === 'sidewalk') return { safe: true, speed: 0, reason: '' };
    var i;
    if (lane.kind === 'road') {
      for (i = 0; i < lane.objects.length; i++) {
        var vehicle = lane.objects[i];
        if (boxOverlap(frogX, vehicle.x, vehicle.w)) return { safe: false, speed: 0, reason: 'veiculo' };
      }
      return { safe: true, speed: 0, reason: '' };
    }
    if (lane.kind === 'bank') {
      for (i = 0; i < lane.objects.length; i++) {
        var snake = lane.objects[i];
        if (snake.kind !== 'snake') continue;
        var mouth = snakeMouth(snake);
        if (overlapsRelative(frogX, snake.x, mouth.offset, mouth.w)) return { safe: false, speed: 0, reason: 'cobra' };
      }
      return { safe: true, speed: 0, reason: '' };
    }
    for (i = 0; i < lane.objects.length; i++) {
      var obj = lane.objects[i];
      if (obj.kind === 'alligator') {
        var parts = alligatorParts(obj.speed);
        var p;
        for (p = 0; p < parts.length; p++) {
          if (parts[p].part === 'jaws' && overlapsRelative(frogX, obj.x, parts[p].offset, parts[p].w)) {
            return { safe: false, speed: 0, reason: 'mandibula' };
          }
        }
        var onGator = centerOffset(frogX, obj.x, obj.w);
        if (onGator != null) {
          var part = 'back';
          for (p = 0; p < parts.length; p++) {
            if (onGator >= parts[p].offset && onGator < parts[p].offset + parts[p].w) part = parts[p].part;
          }
          if (part === 'jaws') return { safe: false, speed: 0, reason: 'mandibula' };
          return { safe: true, speed: obj.speed, reason: '', obj: obj, part: part };
        }
      } else if (obj.kind === 'turtles') {
        var onTurtles = centerOffset(frogX, obj.x, obj.w);
        if (onTurtles != null) {
          if (submerged(obj)) return { safe: false, speed: 0, reason: 'mergulho' };
          return { safe: true, speed: obj.speed, reason: '', obj: obj, part: 'turtles' };
        }
      } else if (obj.kind === 'log') {
        var onLog = centerOffset(frogX, obj.x, obj.w);
        if (onLog != null) {
          if (obj.snake) {
            var bite = logMouth(obj);
            if (overlapsRelative(frogX, obj.x, bite.offset, bite.w)) {
              return { safe: false, speed: 0, reason: 'cobra' };
            }
          }
          return { safe: true, speed: obj.speed, reason: '', obj: obj, part: 'log' };
        }
      }
    }
    return { safe: false, speed: 0, reason: 'agua' };
  }

  function move(world, dt) {
    if (!dt) return;
    for (var row = 0; row < world.lanes.length; row++) {
      var objects = world.lanes[row].objects;
      for (var i = 0; i < objects.length; i++) {
        var obj = objects[i];
        obj.x = mod(obj.x + obj.speed * dt, W);
        if (obj.dives) obj.clock += dt;
      }
    }
  }

  function ladyX(world) {
    var lady = world.lady;
    if (!lady || lady.caught) return null;
    var log = world.lanes[lady.row].objects[lady.index];
    if (!log) return null;
    return mod(log.x + lady.offset, W);
  }

  FG.World = {
    create: create,
    move: move,
    probe: probe,
    submerged: submerged,
    turtlePhase: turtlePhase,
    alligatorParts: alligatorParts,
    snakeMouth: snakeMouth,
    logMouth: logMouth,
    turtleSegments: turtleSegments,
    ladyX: ladyX,
    mod: mod,
    boxOverlap: boxOverlap,
    centerOffset: centerOffset,
    scale: scale,
  };
})(window.FG);
