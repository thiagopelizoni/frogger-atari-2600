'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const { buildArtifact, ROOT, OUTPUT } = require('./build-artifact');
const { createServer } = require('./serve');

const RESULTS = path.join(ROOT, 'test-results');
let checks = 0;

function ok(condition, message) {
  assert.ok(condition, message);
  checks++;
  console.log(`✓ ${message}`);
}

function observe(page) {
  const problems = [];
  const requests = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') problems.push(message.text()); });
  page.on('request', (request) => requests.push(request.url()));
  return { problems, requests };
}

async function load(page, url) {
  await page.goto(url);
  await page.waitForFunction(() => window.FG && FG.game && FG.game.state === 'select');
  await page.locator('#screen').waitFor({ state: 'visible' });
}

async function frames(page, count = 2) {
  await page.evaluate((left) => new Promise((resolve) => {
    const next = () => (left-- <= 0 ? resolve() : requestAnimationFrame(next));
    next();
  }), count);
}

// The start tune lasts more than seven seconds; the tests play it through at once.
async function skipTune(page) {
  await page.waitForFunction(() => FG.game.state === 'pause');
  await page.evaluate(() => { while (FG.game.state !== 'play') FG.game.frame({}); });
}

async function pixel(page, x, y) {
  return page.evaluate(([px, py]) => {
    const data = document.getElementById('screen').getContext('2d').getImageData(px, py, 1, 1).data;
    return '#' + [data[0], data[1], data[2]].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  }, [x, y]);
}

async function noOverflow(page, label) {
  const width = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
  ok(width.content <= width.viewport, `${label}: página sem rolagem horizontal (${width.viewport}px)`);
  const rect = await page.locator('#screen').boundingBox();
  ok(Math.abs(rect.width / rect.height - 4 / 3) < 0.01, `${label}: a tela mantém a proporção 4:3 do televisor`);
}

async function desktop(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const observed = observe(page);
  await load(page, pathToFileURL(path.join(ROOT, 'index.html')).href);
  await frames(page, 4);
  ok(await pixel(page, 80, 27) === '#001C88', 'o rio tem o azul do cartucho');
  ok(await pixel(page, 80, 97) === '#E8E84A', 'a margem tem o amarelo do cartucho');
  ok(await pixel(page, 3, 30) === '#000000' && await pixel(page, 3, 33) === '#527E2D', 'a borda esquerda mostra os traços pretos do HMOVE');
  ok((await page.textContent('#status')).includes('GAME RESET'), 'na seleção a barra de estado pede GAME RESET');
  await page.screenshot({ path: path.join(RESULTS, 'desktop-select.png') });

  await page.locator('#screen').focus();
  await page.keyboard.press('Digit4');
  await page.waitForFunction(() => FG.game.game === 4);
  ok((await page.textContent('#game-state')).includes('Jogo 4'), 'a tecla 4 escolhe o jogo 4 e o painel do console mostra');
  ok(await page.evaluate(() => FG.game.players[0].bays === 0x0A), 'num jogo de dois jogadores as tocas 2 e 4 mostram os rostos');
  await page.keyboard.press('Digit1');
  await page.waitForFunction(() => FG.game.game === 1);

  await page.keyboard.press('Enter');
  await skipTune(page);
  ok((await page.textContent('#start-label')) === 'REINICIAR', 'durante a partida o botão principal vira GAME RESET');
  // A key pressed and released inside one frame still counts once.
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowUp', bubbles: true }));
  });
  await page.waitForFunction(() => FG.game.frog.row === 0 || FG.game.frog.face === 'dead');
  ok(await page.evaluate(() => FG.game.current.score === 1), 'um toque de tecla mais curto que um quadro dá um pulo e um ponto');
  await page.evaluate(() => { FG.game.frog.row = -1; FG.game.frog.face = 'up'; });

  await page.locator('#mute-button').click();
  ok(await page.evaluate(() => FG.Audio.muted), 'o botão SOM desliga o som');
  await page.keyboard.press('Enter');
  await frames(page, 2);
  ok(await page.evaluate(() => FG.Audio.muted && FG.paused()), 'depois de clicar num botão, Enter vai para o jogo e pausa, sem apertar o botão de novo');
  ok((await page.textContent('#status')).includes('pausado'), 'a pausa aparece na barra de estado');
  const counter = await page.evaluate(() => FG.game.counter);
  await frames(page, 6);
  ok(await page.evaluate((before) => FG.game.counter === before, counter), 'em pausa o console não anda');
  await page.keyboard.press('KeyP');
  await frames(page, 3);
  ok(await page.evaluate(() => !FG.paused()), 'P continua a partida');
  await page.keyboard.press('KeyM');

  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
  ok(await page.evaluate(() => FG.paused()), 'sair da janela pausa a partida');
  await page.keyboard.press('KeyP');

  await page.keyboard.press('KeyL');
  await page.keyboard.press('Semicolon');
  await frames(page, 2);
  ok(await page.evaluate(() => FG.game.difficulty[0] && FG.game.difficulty[1]), 'L e Ç mudam as alavancas esquerda e direita para A');
  ok((await page.textContent('#diff-state')) === 'Dificuldade: esquerda A · direita A', 'o painel mostra as duas alavancas');
  await page.keyboard.press('KeyL');
  await page.keyboard.press('Semicolon');

  await page.keyboard.press('KeyC');
  await frames(page, 3);
  ok(await pixel(page, 80, 97) === '#AAAAAA', 'C passa a TV para preto e branco com a tabela de cinzas do cartucho');
  await page.keyboard.press('KeyC');
  await frames(page, 3);

  await page.evaluate(() => { FG.game.players[0].score = 1234; FG.game.players[0].reserves = 0; FG.game.die('água'); });
  await page.waitForFunction(() => FG.game.state === 'over', null, { timeout: 5000 });
  await frames(page, 2);
  ok((await page.textContent('#status')).includes('Recorde: 1234'), 'o fim de jogo mostra o recorde');
  await page.screenshot({ path: path.join(RESULTS, 'desktop-gameover.png') });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => FG.game.state === 'pause');
  ok(await page.evaluate(() => FG.game.game === 1 && FG.game.players[0].score === 0), 'no fim de jogo o botão vermelho joga de novo o mesmo jogo');

  await page.reload();
  await page.waitForFunction(() => window.FG && FG.game && FG.game.state === 'select');
  ok(await page.evaluate(() => localStorage.getItem('frogger2600.highScore') === '1234'), 'o recorde fica guardado depois de recarregar');
  await page.locator('#reset-button').click();
  await skipTune(page);
  await page.evaluate(() => { FG.game.frog.row = 6; FG.game.frog.face = 'up'; });
  await frames(page, 2);
  await page.screenshot({ path: path.join(RESULTS, 'desktop-playing.png') });
  ok(observed.problems.length === 0, `a página roda sem erros: ${observed.problems.join('; ')}`);
  await context.close();
}

async function gamepad(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const page = await context.newPage();
  const observed = observe(page);
  await load(page, url);
  await page.evaluate(() => {
    window.testPad = { connected: true, axes: [0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false })) };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [window.testPad], configurable: true });
    window.testPad.buttons[9].pressed = true;
  });
  await page.waitForFunction(() => FG.game.state === 'pause');
  await page.evaluate(() => { testPad.buttons[9].pressed = false; });
  ok(true, 'START do gamepad aperta GAME RESET');
  await skipTune(page);
  await page.evaluate(() => { testPad.axes[1] = -0.8; });
  await page.waitForFunction(() => FG.game.frog.row === 0 || FG.game.frog.face === 'dead');
  await page.evaluate(() => { testPad.axes[1] = -0.1; });
  await frames(page, 6);
  ok(await page.evaluate(() => FG.game.frog.row <= 0 || FG.game.frog.face === 'dead'), 'o manche analógico dá um pulo e, segurado, não repete fora do Speedy');
  ok(observed.problems.length === 0, `o jogo servido por HTTP funciona sem erros: ${observed.problems.join('; ')}`);
  await context.close();
}

async function mobile(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true, offline: true,
  });
  const page = await context.newPage();
  const observed = observe(page);
  await load(page, pathToFileURL(path.join(ROOT, 'index.html')).href);
  await noOverflow(page, 'Celular');
  await page.locator('#screen').tap();
  await page.waitForFunction(() => FG.game.state === 'pause');
  ok(true, 'na seleção, tocar na tela aperta GAME RESET');
  await skipTune(page);
  await page.locator('#pad').scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const button = document.querySelector('#pad [data-dir="up"]');
    const init = { pointerId: 41, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, button: 0 };
    button.dispatchEvent(new PointerEvent('pointerdown', init));
    button.dispatchEvent(new PointerEvent('pointerup', init));
  });
  await page.waitForFunction(() => FG.game.frog.row === 0 || FG.game.frog.face === 'dead');
  ok(true, 'um toque no direcional mais curto que um quadro dá um pulo');
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
  ok((await page.textContent('#status')).includes('Toque na tela'), 'no toque, a pausa pede um toque para continuar');
  await page.locator('#screen').tap();
  await frames(page, 3);
  ok(await page.evaluate(() => !FG.paused()), 'tocar na tela retoma a partida pausada');
  await page.screenshot({ path: path.join(RESULTS, 'mobile-playing.png'), fullPage: true });

  await page.setViewportSize({ width: 320, height: 740 });
  await noOverflow(page, 'Celular compacto');
  await page.screenshot({ path: path.join(RESULTS, 'mobile-320.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await frames(page, 2);
  const fits = await page.evaluate(() => {
    const box = (selector) => document.querySelector(selector).getBoundingClientRect();
    return { screenTop: box('#screen').top, padBottom: box('#pad').bottom, height: innerHeight, scroll: document.documentElement.scrollWidth };
  });
  ok(fits.screenTop >= 0 && fits.padBottom <= fits.height && fits.scroll <= 320, `em 320×568 a tela e o direcional cabem juntos (direcional até ${Math.round(fits.padBottom)}px)`);
  await page.screenshot({ path: path.join(RESULTS, 'mobile-320x568.png') });

  const SWITCHES = ['#color-switch', '#left-switch', '#right-switch', '#select-button', '#reset-button'];
  const inView = (extra) => page.evaluate((list) => {
    const rects = ['#screen', '#pad [data-dir="up"]', '#pad [data-dir="down"]', '#pad [data-dir="left"]', '#pad [data-dir="right"]', '#fire-button', ...list].map((selector) => document.querySelector(selector).getBoundingClientRect());
    return { fits: rects.every((rect) => rect.width > 0 && rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight), scroll: document.documentElement.scrollWidth <= innerWidth };
  }, extra || []);
  for (const [width, height] of [[568, 320], [740, 360], [844, 390], [650, 700]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.scrollTo(0, 0));
    await frames(page, 2);
    const sideways = width > height;
    const view = await inView(sideways ? SWITCHES : []);
    ok(view.fits && view.scroll, `em ${width}×${height} a tela, o direcional${sideways ? ', o botão vermelho e as cinco chaves do console' : ' e o botão vermelho'} cabem juntos sem rolar`);
    await noOverflow(page, `Toque ${width}×${height}`);
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await frames(page, 2);
  await page.screenshot({ path: path.join(RESULTS, 'mobile-844x390.png') });
  const before = await page.evaluate(() => FG.game.game);
  await page.locator('#select-button').tap();
  await page.waitForFunction((game) => FG.game.game === game % 6 + 1, before);
  ok(true, 'com o celular deitado, GAME SELECT continua ao alcance do toque');
  await page.locator('#fullscreen-button').tap();
  await page.waitForFunction(() => !!document.fullscreenElement);
  await frames(page, 2);
  ok((await inView()).fits, 'em tela cheia no celular deitado o direcional e o botão vermelho continuam à mão');
  await page.evaluate(() => document.exitFullscreen());
  await page.waitForFunction(() => !document.fullscreenElement);
  ok(observed.problems.length === 0, `os controles de toque não produzem erros: ${observed.problems.join('; ')}`);
  await context.close();
}

async function standalone(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, offline: true });
  const page = await context.newPage();
  const observed = observe(page);
  await load(page, pathToFileURL(OUTPUT).href);
  await page.locator('#screen').focus();
  await page.keyboard.press('Enter');
  await skipTune(page);
  await page.keyboard.press('ArrowUp');
  await page.waitForFunction(() => FG.game.frog.row === 0 || FG.game.frog.face === 'dead');
  const external = observed.requests.filter((url) => !url.startsWith('file:'));
  ok(external.length === 0, 'o HTML portátil não pede nada da rede');
  ok(observed.problems.length === 0, `o HTML portátil roda offline sem erros: ${observed.problems.join('; ')}`);
  await page.screenshot({ path: path.join(RESULTS, 'offline-playing.png') });
  await context.close();
}

async function blockedGamepad(browser) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, offline: true });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => { throw new DOMException('Access to the feature "gamepad" is disallowed by permissions policy.', 'SecurityError'); },
      configurable: true,
    });
  });
  const page = await context.newPage();
  const observed = observe(page);
  await load(page, pathToFileURL(OUTPUT).href);
  const counter = await page.evaluate(() => FG.game.counter);
  await page.waitForFunction((before) => FG.game.counter !== before, counter);
  await page.locator('#screen').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => FG.game.state === 'pause');
  ok(observed.problems.length === 0, `com o gamepad bloqueado o jogo continua rodando e aceita o teclado: ${observed.problems.join('; ')}`);
  await context.close();
}

// Older Safari has only the webkit-prefixed API, and the iPhone has no element fullscreen at all.
async function fullscreenFallbacks(browser) {
  const prefixed = await browser.newContext({ viewport: { width: 1024, height: 768 }, offline: true });
  await prefixed.addInitScript(() => {
    delete Element.prototype.requestFullscreen;
    delete Document.prototype.exitFullscreen;
  });
  let page = await prefixed.newPage();
  let observed = observe(page);
  await load(page, pathToFileURL(OUTPUT).href);
  ok(await page.locator('#fullscreen-button').isVisible(), 'só com a API prefixada o botão TELA CHEIA continua visível');
  await page.locator('#fullscreen-button').click();
  await page.waitForFunction(() => !!document.webkitFullscreenElement);
  await frames(page, 2);
  ok(await page.evaluate(() => document.querySelector('.stage').classList.contains('full')), 'o botão usa webkitRequestFullscreen quando a API padrão não existe');
  await page.keyboard.press('f');
  await page.waitForFunction(() => !document.webkitFullscreenElement && !document.querySelector('.stage').classList.contains('full'));
  ok(observed.problems.length === 0, `F sai da tela cheia prefixada sem erros: ${observed.problems.join('; ')}`);
  await prefixed.close();

  const none = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, offline: true });
  await none.addInitScript(() => {
    delete Element.prototype.requestFullscreen;
    delete Element.prototype.webkitRequestFullscreen;
    Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false, configurable: true });
    Object.defineProperty(Document.prototype, 'webkitFullscreenEnabled', { get: () => false, configurable: true });
  });
  page = await none.newPage();
  observed = observe(page);
  await load(page, pathToFileURL(OUTPUT).href);
  ok(await page.locator('#fullscreen-button').isHidden(), 'sem tela cheia no navegador, como no iPhone, o botão TELA CHEIA some');
  await page.locator('#screen').focus();
  await page.keyboard.press('f');
  await frames(page, 2);
  ok(await page.evaluate(() => !document.fullscreenElement) && observed.problems.length === 0, `sem tela cheia, F não faz nada e não gera erros: ${observed.problems.join('; ')}`);
  await none.close();
}

async function main() {
  buildArtifact();
  fs.mkdirSync(RESULTS, { recursive: true });
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    await desktop(browser);
    await gamepad(browser, `http://127.0.0.1:${server.address().port}/`);
    await mobile(browser);
    await standalone(browser);
    await blockedGamepad(browser);
    await fullscreenFallbacks(browser);
    console.log(`\n${checks} verificações de navegador passaram. Capturas em test-results/.`);
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
