window.FG = window.FG || {};

// The eleven rows of traffic and river. Each row holds two objects that share one TIA size code, so
// what the player sees as "three cars" or "a log and a half" is just copies of those two sprites.
window.FG.World = (function (C) {
  'use strict';

  // Positions are bytes from 1 to 160; this is the cartridge's add-and-wrap.
  function wrapAdd(value, amount) {
    const sum = (value + amount) & 0xFF;
    return sum >= 161 ? sum - 160 : sum;
  }

  // Level 11 plays with the tables of level 1, and so on; the level number itself keeps counting.
  function table(level) {
    let index = level & 0xFF;
    while (index >= 11) index -= 10;
    return index - 1;
  }

  function mask(level, row) {
    return C.MASKS[table(level)][row];
  }

  function shape(level, row) {
    return C.SHAPES[C.LAYOUTS[table(level)][row]];
  }

  function createRows() {
    return C.ROWS.map(function (row) {
      return { a: row.start[0], b: row.start[1] };
    });
  }

  function moves(level, row, counter) {
    return (mask(level, row) & counter) === 0;
  }

  // Both objects of a row step one pixel together on the frames its speed mask allows. The kernel
  // only learns a row's new place (`drawn`) when the row moves.
  function advance(rows, drawn, level, counter) {
    for (let r = rows.length - 1; r >= 0; r--) {
      if (!moves(level, r, counter)) continue;
      const left = C.ROWS[r].left;
      const row = rows[r];
      row.a = left ? (row.a - 1 || 160) : (row.a === 160 ? 1 : row.a + 1);
      row.b = left ? (row.b - 1 || 160) : (row.b === 160 ? 1 : row.b + 1);
      drawn[r].a = row.a;
      drawn[r].b = row.b;
    }
  }

  // A frog reaching a bay puts two neighbouring road lanes back where they started. The picture keeps
  // the old place until those lanes move again.
  function snapRoad(rows, first) {
    for (let r = first; r <= first + 1; r++) {
      rows[r].a = C.ROWS[r].start[0];
      rows[r].b = C.ROWS[r].start[1];
    }
  }

  // Does the 8 px frog at x touch an object copy that starts at `left` and is `width` wide? This
  // follows the cartridge's comparisons, wrap-around branches and its extra pixel on the right side,
  // which is what lets the frog sit in the gaps of a turtle group.
  function touches(x, left, width) {
    if (x < left) {
      if (x + 7 >= left) return true;
      const end = left + width;
      return end >= 161 && end - 160 >= x;
    }
    if (left + width >= x) return true;
    return left < 8 && left + 152 < x;
  }

  // Which of the row's two objects the frog is standing on or touching: 'a', 'b' or null.
  function contact(rows, level, row, x) {
    const s = shape(level, row);
    const objects = ['a', 'b'];
    for (let i = 0; i < 2; i++) {
      let left = rows[row][objects[i]];
      for (let copy = 0; copy < s.copies; copy++) {
        if (touches(x, left, s.width)) return objects[i];
        left = wrapAdd(left + s.width, s.gap);
      }
    }
    return null;
  }

  // Screen columns covered by every copy of one object, for drawing.
  function copies(level, row, position) {
    const s = shape(level, row);
    const list = [];
    let left = position;
    for (let copy = 0; copy < s.copies; copy++) {
      list.push(left);
      left = wrapAdd(left + s.width, s.gap);
    }
    return { width: s.width, scale: s.width / 8, origins: list };
  }

  return {
    wrapAdd: wrapAdd,
    table: table,
    mask: mask,
    shape: shape,
    moves: moves,
    createRows: createRows,
    advance: advance,
    snapRoad: snapRoad,
    touches: touches,
    contact: contact,
    copies: copies,
  };
})(window.FG.Config);
