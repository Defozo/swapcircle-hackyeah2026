import { chromium, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const work = resolve('submission/_video_work/pitch-capture');
const demoBase = process.env.SWAPCIRCLE_DEMO_URL || 'http://127.0.0.1:5187';
const run = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const sourceDir = resolve(work, 'source', run);
mkdirSync(sourceDir, { recursive: true });
mkdirSync(resolve(work, 'manifests'), { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 810 },
  recordVideo: { dir: sourceDir, size: { width: 1440, height: 810 } },
  locale: 'pl-PL', timezoneId: 'Europe/Warsaw', reducedMotion: 'no-preference' });
const page = await context.newPage();
const t0 = performance.now();
const scenes = [];
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const time = () => (performance.now() - t0) / 1000;
let active;
async function begin(id) { active = { id, start: time(), actions: [] }; scenes.push(active); }
async function stamp(action) { active.actions.push({ at: time(), text: action }); }
async function holdUntil(seconds) { await page.waitForTimeout(Math.max(0, (seconds - (time() - active.start)) * 1000)); }
async function end() { active.end = time(); await page.screenshot({ path: resolve(sourceDir, `${active.id}-end.png`) }); }
async function scroll(y) { await page.evaluate(y => window.scrollTo({ top: y, behavior: 'smooth' }), y); await page.waitForTimeout(500); }
async function confirm(consent = true, hold = 600) {
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.waitForTimeout(hold);
  if (consent) await page.getByRole('dialog').getByRole('checkbox').check();
  await page.getByTestId('confirm-demo-action').click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.waitForTimeout(250);
}
async function create() {
  await page.getByTestId('find-cycle').click();
  await page.getByTestId('create-cycle').click();
  await confirm(true, 100);
}
async function fund(i, hold = 100) { await page.getByTestId(`fund-${i}`).click(); await confirm(true, hold); }

try {
  await page.goto(demoBase + '/?mode=demo&lang=pl', { timeout: 30000 });
  await expect(page.getByTestId('offer-2')).toBeVisible();
  await page.waitForTimeout(800);
  await begin('02-offers');
  await stamp('Three selected offers, no directly matching pair.');
  await holdUntil(6);
  await scroll(170);
  await holdUntil(12);
  await end();

  await begin('03-cycle');
  await page.getByTestId('find-cycle').click();
  await stamp('Find an exchange clicked.');
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await scroll(265);
  await holdUntil(9);
  await scroll(385);
  await holdUntil(14);
  await end();

  await begin('04-terms');
  await page.getByTestId('create-cycle').click();
  await stamp('Show amounts, recipients, 2-minute demo deadline and deposit lock.');
  await expect(page.getByRole('dialog')).toBeVisible();
  await holdUntil(7);
  await confirm(true, 50);
  await stamp('Terms accepted and circle created.');
  await scroll(230);
  await holdUntil(11);
  await end();

  await begin('05-deposits');
  await fund(0, 850);
  await stamp('Alice deposit complete.');
  await scroll(230);
  await holdUntil(3.7);
  await fund(1, 850);
  await stamp('Bartek deposit complete.');
  await scroll(320);
  await expect(page.getByTestId('cycle-state')).toHaveText('2 z 3 wpłat');
  await expect(page.getByTestId('balance-0').locator('td').nth(3)).toHaveText('0 dY');
  await expect(page.getByTestId('balance-1').locator('td').nth(3)).toHaveText('0 dZ');
  await stamp('Both deposits in vaults, zero tokens received from exchange.');
  await holdUntil(13);
  await end();

  await begin('06-settlement');
  await page.getByTestId('fund-2').click();
  await stamp('Celine final-deposit confirmation.');
  await holdUntil(2);
  await confirm(true, 50);
  await stamp('Final deposit settles all transfers at once.');
  await expect(page.getByTestId('cycle-state')).toHaveText('Wymiana rozliczona');
  await scroll(230);
  await holdUntil(6.5);
  await scroll(330);
  for (const [i, amount] of ['40 dY', '250 dZ', '100 dX'].entries()) await expect(page.getByTestId(`balance-${i}`).locator('td').nth(3)).toHaveText(amount);
  await holdUntil(13);
  await end();

  // Set up a separate unchanged demo scenario through the same UI. Its setup
  // remains in source footage, excluded only from the concise presentation.
  await page.getByRole('button', { name: 'Od początku', exact: true }).click();
  await create();
  await fund(0); await fund(1);
  await scroll(240);
  await page.waitForTimeout(700);
  await begin('07-refund');
  await stamp('Separate circle with two deposits and missing Celine.');
  await holdUntil(2.0);
  await page.getByTestId('expire-cycle').click();
  await confirm(false, 600);
  await stamp('Demo clock advanced to agreed deadline.');
  await scroll(240);
  await holdUntil(5);
  await page.getByTestId('refund-0').click();
  await confirm(false, 700);
  await stamp('Alice recovered her own 100 dX.');
  await scroll(240);
  await holdUntil(8.5);
  await page.getByTestId('refund-1').click();
  await confirm(false, 700);
  await stamp('Bartek independently recovered his own 40 dY.');
  await expect(page.getByTestId('cycle-state')).toHaveText('Wszystkie depozyty zwrócone');
  await scroll(330);
  await expect(page.getByTestId('balance-0').locator('td').nth(1)).toHaveText('100 dX');
  await expect(page.getByTestId('balance-1').locator('td').nth(1)).toHaveText('40 dY');
  await holdUntil(16);
  await end();

  await page.getByRole('button', { name: 'Od początku', exact: true }).click();
  await page.getByRole('group', { name: 'Liczba osób' }).getByRole('button', { name: '2', exact: true }).click();
  await page.getByTestId('find-cycle').click();
  await scroll(270);
  await begin('08-community');
  await stamp('Two-participant matching.');
  await holdUntil(5);
  await page.getByRole('button', { name: 'Od początku', exact: true }).click();
  await page.getByRole('group', { name: 'Liczba osób' }).getByRole('button', { name: '4', exact: true }).click();
  await page.getByTestId('find-cycle').click();
  await scroll(265);
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
  await stamp('Four-participant matching.');
  await holdUntil(13);
  await end();
} finally {
  const wallSeconds = time();
  const video = page.video();
  await context.close();
  const path = resolve(sourceDir, 'demo-capture.webm');
  await video.saveAs(path);
  await browser.close();
  const result = { source: path, mode: 'interactive simulation', application_url: demoBase + '/?mode=demo&lang=pl',
    viewport: { width:1440,height:810 }, wallSeconds, scenes, errors,
    timing_method: 'Monotonic process timestamps after page creation, verified by extracted source/output boundary frames. No application state mutation; all changes through visible UI.' };
  writeFileSync(resolve(work,'manifests','capture.json'), JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
}
