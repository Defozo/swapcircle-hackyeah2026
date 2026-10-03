import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';

const base = process.env.DEMO_URL || 'https://defozo.github.io/swapcircle-hackyeah2026/';
const report = { checkedAt: new Date().toISOString(), base, browser: 'fresh Chromium context without login or wallet', checks: [], errors: [] };
const browser = await chromium.launch({ headless: true });
await mkdir('docs/evidence', { recursive: true });
const check = (name, value) => { report.checks.push({ name, passed: Boolean(value) }); if (!value) throw new Error(name); };
const confirmation = async page => {
  const dialog = page.getByRole('dialog');
  const consent = dialog.getByRole('checkbox');
  if (await consent.count()) await consent.check();
  await page.getByTestId('confirm-demo-action').click();
  await dialog.waitFor({ state: 'hidden' });
};
const create = async page => {
  await page.getByTestId('find-cycle').click();
  await page.getByTestId('create-cycle').click();
  await confirmation(page);
};
const fund = async (page, person) => { await page.getByTestId(`fund-${person}`).click(); await confirmation(page); };
try {
  for (const lang of ['pl', 'en']) {
    const context = await browser.newContext({ viewport: lang === 'pl' ? { width: 1440, height: 1000 } : { width: 390, height: 844 } });
    const page = await context.newPage();
    const external = [], writes = [];
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('request', request => {
      if (request.method() !== 'GET') writes.push(request.url());
      if (!request.url().startsWith(new URL(base).origin) && !request.url().startsWith('data:')) external.push(request.url());
    });
    await page.goto(`${base}?lang=${lang}`, { waitUntil: 'networkidle' });
    await page.getByTestId('offer-2').waitFor();
    check(`${lang}: default public entry is Demo`, await page.locator('.demo-badge').innerText() === 'Demo');
    await create(page);
    await fund(page, 0); await fund(page, 1);
    check(`${lang}: earlier deposits do not pay recipients`, await page.getByTestId('balance-0').locator('td').nth(3).innerText() === '0 dY');
    await page.reload();
    await page.getByTestId('fund-2').waitFor();
    await fund(page, 2);
    check(`${lang}: last deposit settles the exchange`, await page.getByTestId('cycle-state').innerText() === (lang === 'pl' ? 'Wymiana rozliczona' : 'Exchange settled'));
    for (const [i, amount] of ['40 dY', '250 dZ', '100 dX'].entries()) check(`${lang}: final balance ${i}`, await page.getByTestId(`balance-${i}`).locator('td').nth(3).innerText() === amount);
    await page.screenshot({ path: `docs/evidence/public-demo-settled-${lang}.png`, fullPage: true });
    await page.getByRole('button', { name: lang === 'pl' ? 'Od początku' : 'Start over', exact: true }).click();
    await create(page); await fund(page, 0); await fund(page, 1);
    await page.getByTestId('expire-cycle').click(); await confirmation(page);
    check(`${lang}: missing participant has no refund`, await page.getByTestId('refund-2').count() === 0);
    await page.getByTestId('refund-1').click(); await confirmation(page);
    await page.reload();
    await page.getByTestId('refund-0').click(); await confirmation(page);
    check(`${lang}: independent refunds complete`, await page.getByTestId('cycle-state').innerText() === (lang === 'pl' ? 'Wszystkie depozyty zwrócone' : 'All deposits refunded'));
    check(`${lang}: no document overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    check(`${lang}: no external requests in Demo`, external.length === 0);
    check(`${lang}: no network writes in Demo`, writes.length === 0);
    await page.screenshot({ path: `docs/evidence/public-demo-refunded-${lang}.png`, fullPage: true });
    await page.getByRole('button', { name: lang === 'pl' ? 'Switch to English' : 'Przełącz na polski', exact: true }).click();
    await page.reload();
    await page.getByTestId('cycle-state').waitFor();
    check(`${lang}: language switch survives reload`, await page.locator('html').getAttribute('lang') === (lang === 'pl' ? 'en' : 'pl'));
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(new URL('watch.html', base).href);
  await page.waitForFunction(() => { const v = document.querySelector('video'); return v && v.readyState >= 2 && v.duration > 0; }, null, { timeout: 90000 });
  const video = await page.evaluate(async () => {
    const v = document.querySelector('video');
    v.muted = true;
    await v.play();
    await new Promise(resolve => setTimeout(resolve, 1600));
    v.pause();
    return { duration: v.duration, width: v.videoWidth, height: v.videoHeight, playedSeconds: v.currentTime, error: v.error?.message || null, captions: [...v.textTracks].map(t => ({ language: t.language, kind: t.kind })) };
  });
  report.video = video;
  check('public player decodes and plays the film', video.playedSeconds > 0.5 && !video.error);
  check('public film stays within 3 minutes', video.duration > 0 && video.duration <= 180);
  check('public film is Full HD', video.width === 1920 && video.height === 1080);
  check('Polish captions are available', video.captions.some(t => t.language === 'pl'));
  await page.screenshot({ path: 'docs/evidence/public-watch-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  check('public player mobile has no overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: 'docs/evidence/public-watch-mobile.png', fullPage: true });
  await context.close();
  check('no page errors', report.errors.length === 0);
  report.complete = true;
} catch (error) {
  report.complete = false; report.failure = String(error); process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile('docs/evidence/public-pitch-demo.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
