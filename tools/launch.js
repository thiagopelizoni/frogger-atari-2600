'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createServer, ROOT } = require('./serve');

const scratch = process.env.FROGGER_SCRATCH || path.join(ROOT, 'test-results');
fs.mkdirSync(scratch, { recursive: true });

function loadPlaywright() {
  const candidates = [
    'playwright',
    '/mnt/d/Projects/frostbite-atari-2600/node_modules/playwright',
    '/mnt/d/Projects/riverraid-atari-2600/node_modules/playwright',
  ];
  for (const id of candidates) {
    try {
      return require(id);
    } catch (error) {
      /* Try the next installed copy. */
    }
  }
  return null;
}

function failLaunch(error) {
  const message = error && error.stack ? error.stack : String(error);
  fs.writeFileSync(path.join(scratch, 'launch-failure.log'), message);
  console.error(message);
}

async function painted(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById('screen');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = 0;
    let maxY = 0;
    for (let i = 0, pixel = 0; i < image.length; i += 4, pixel++) {
      if (image[i] + image[i + 1] + image[i + 2] <= 24) continue;
      count += 1;
      const x = pixel % canvas.width;
      const y = Math.floor(pixel / canvas.width);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    return {
      width: canvas.width,
      height: canvas.height,
      fraction: count / (canvas.width * canvas.height),
      boxW: maxX - minX + 1,
      boxH: maxY - minY + 1,
    };
  });
}

async function once(browser, url, index) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const problems = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  await page.goto(url);
  await page.waitForFunction(() => window.FG && FG.game && FG.game.phase === 'title');
  await page.locator('#screen').click();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => FG.game.phase === 'playing' && FG.game.slot.row === 0);
  await page.waitForTimeout(150);
  const before = await painted(page);
  if (before.width !== 160 || before.height !== 192) throw new Error(`quadro ${before.width}x${before.height}`);
  if (before.fraction < 0.45) throw new Error(`quadro pouco pintado: ${before.fraction}`);
  if (before.boxW < 150 || before.boxH < 180) throw new Error(`caixa ${before.boxW}x${before.boxH}`);
  const shot = path.join(scratch, `launch-${index}.png`);
  await page.locator('#screen').screenshot({ path: shot });
  const row = await page.evaluate(() => FG.game.slot.row);
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction((start) => FG.game.slot.row !== start || FG.game.phase === 'dying', row);
  await page.keyboard.up('ArrowUp');
  const after = await page.evaluate(() => ({ row: FG.game.slot.row, phase: FG.game.phase }));
  if (!(after.row > row || after.phase === 'dying')) throw new Error(`o pulo não mudou a posição: ${row} -> ${after.row}`);
  const later = await painted(page);
  if (later.fraction < 0.45) throw new Error('o quadro apagou depois do pulo');
  if (problems.length) throw new Error(problems.join('\n'));
  await page.close();
  return { before, after, shot };
}

async function main() {
  const playwright = loadPlaywright();
  if (!playwright) {
    failLaunch(new Error('playwright não está instalado'));
    return;
  }
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  let browser;
  try {
    browser = await playwright.chromium.launch({ headless: true });
    const lines = [];
    for (let index = 1; index <= 2; index++) {
      const result = await once(browser, url, index);
      lines.push(`passou: lançamento ${index} quadro 160x192 fração ${result.before.fraction.toFixed(3)} pulo ${result.after.row} ${result.shot}`);
      console.log(lines[lines.length - 1]);
    }
    fs.writeFileSync(path.join(scratch, 'launch.log'), lines.join('\n') + '\n');
  } catch (error) {
    failLaunch(error);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main();
