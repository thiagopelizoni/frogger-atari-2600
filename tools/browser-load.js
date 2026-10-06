'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
assert.equal(/type\s*=\s*["']module["']/i.test(html), false, 'a página não pode depender de módulo ES');
assert.match(html, /<script>\s*window\.FG\.boot\(\);\s*<\/script>/, 'a página chama o boot clássico');
const sources = [...html.matchAll(/<script\s+src="([^"]+)"><\/script>/g)].map((match) => match[1]);
assert.deepEqual(sources, ['js/config.js', 'js/sprites.js', 'js/world.js', 'js/audio.js', 'js/input.js', 'js/game.js']);
console.log('passou: abrir file:// usa script src clássico e mostra o jogo, sem tela em branco de módulo');

const sandbox = {
  console,
  Math,
  performance: { now: () => 0 },
};
sandbox.window = sandbox;
assert.equal(Object.prototype.hasOwnProperty.call(sandbox, 'module'), false);
assert.equal(typeof sandbox.require, 'undefined');
vm.createContext(sandbox);
for (const source of sources) {
  const filename = path.join(ROOT, source);
  const code = fs.readFileSync(filename, 'utf8');
  assert.equal(/\brequire\s*\(/.test(code), false, `${source} não usa require`);
  assert.equal(/module\.exports/.test(code), false, `${source} não usa module.exports`);
  vm.runInContext(code, sandbox, { filename: source });
  console.log(`passou: ${source} avaliou com window e sem module/require`);
}
assert.equal(typeof sandbox.FG.Game, 'function');
assert.equal(typeof sandbox.FG.boot, 'function');
const game = new sandbox.FG.Game();
game.action('reset');
assert.equal(game.phase, 'playing');
assert.equal(game.slot.lives, 5);
assert.equal(game.slot.row, 0);
console.log('passou: os scripts instalam FG.Game e FG.boot, a mesma entrada da página');
