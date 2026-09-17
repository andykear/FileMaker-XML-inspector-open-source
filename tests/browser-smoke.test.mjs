// One headless walk through the whole page, against the live reference solution.
// Reads only: the server is the same one `npm start` runs, with noPrompt, and every
// read the page makes goes through readOps' read-only guard.
//
// Runs only when INSPECTOR_BROWSER=1, and only when a Chrome is where
// INSPECTOR_CHROME (or the macOS default) says it is -- puppeteer-core never
// downloads a browser, so an absent Chrome is a skip, not a failure.
//
//   INSPECTOR_BROWSER=1 npm run test:browser
//
// What it asserts, per tab: the tab draws a heading, the rendered text carries none
// of `undefined`, `[object Object]` or `NaN` outside <code>/<pre> (a calculation may
// legitimately say NaN; the page's own prose may not), and selecting the first
// selectable row draws again without either fault. Then the Gaps tab's live check is
// run for real, the Markdown export is downloaded and read back, and the console is
// asserted to have stayed quiet for the whole walk.
//
// What this does NOT check, so a green run is not read as more than it is:
//
//   * only `#main` is scanned. The sidebar, the header, the progress line and the
//     export menu are drawn by the same code and are never looked at here.
//   * `span.detail` -- the Scripts tab's raw step options, fm's own text -- is not
//     inside <code> or <pre>, so it IS scanned as if it were the page's prose. A
//     file whose step option legitimately reads `undefined` would be reported as a
//     renderer fault here. ooe has none; another solution might.
//   * one row per tab. The FIRST `[data-select]` is clicked and nothing else, so a
//     tab is proved to render one selection, not all of them -- the kind of row
//     that comes second (a relation after an occurrence, a folder after a script)
//     is never opened.
//   * the screenshots are evidence, not assertions: nothing reads them back, and a
//     page taller than 6000px is saved as its first screenful only (Chrome will not
//     encode a PNG past ~16k pixels), so the bottom of a long tab is not pictured.
//   * every read is of one solution, `fmnet://localhost/ooe`, in one fm build. A
//     shape no reference file carries is not walked by anything here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { locateFmCli } from 'fm-adt-toolkit/runner';
import { createServer } from '../server/server.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = join(REPO, '.local', 'screenshots');
const CHROME = process.env.INSPECTOR_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const root = process.env.INSPECTOR_FILE ?? 'fmnet://localhost/ooe';
const username = process.env.INSPECTOR_USERNAME ?? 'admin';

const skip = process.env.INSPECTOR_BROWSER !== '1'
  ? 'set INSPECTOR_BROWSER=1 to run the browser pass'
  : !existsSync(CHROME)
    ? `no Chrome at ${CHROME} -- set INSPECTOR_CHROME to one`
    : false;

/** The three ways a renderer leaks its own internals into prose. Each is looked for
 *  in the text the page draws, outside <code>/<pre>: inside those, the text is the
 *  file's own (a calculation, a step's raw options) and none of the three is ours. */
const FAULTS = ['undefined', '[object Object]', 'NaN'];

const MINUTE = 60 * 1000;

/** Every text node of #main that is not inside a <code> or a <pre>, one per line, so
 *  a fault can be reported with the sentence it was found in. */
function mainText() {
  const main = document.getElementById('main');
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  const out = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.parentElement?.closest('code, pre')) continue;
    const text = n.nodeValue.trim();
    if (text) out.push(text);
  }
  return out.join('\n');
}

/** The fault lines, with the tab and the moment named, as one assertion message. */
function faultsIn(text) {
  const bad = [];
  for (const line of text.split('\n')) {
    for (const fault of FAULTS) {
      // \bNaN\b would match "NaNoseconds"; the fault is the token on its own.
      const re = fault === 'NaN' ? /\bNaN\b/ : new RegExp(fault.replace(/[[\]]/g, '\\$&'));
      if (re.test(line)) bad.push(`${fault}: ${line.slice(0, 160)}`);
    }
  }
  return [...new Set(bad)];
}

async function settled(page) {
  await page.waitForFunction(() => !!document.querySelector('#main h2'), { timeout: MINUTE });
}

/** A row may sit inside a closed <details>, which has no box for the mouse to land
 *  on. A real click is tried first -- it is what a user does, and it is what catches
 *  an element covered by another -- and the in-page click is the fallback. */
async function clickRow(page, handle) {
  const visible = await handle.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && !!el.offsetParent;
  });
  if (visible) {
    try {
      await handle.click();
      return 'mouse';
    } catch {
      // fall through to the in-page click
    }
  }
  await handle.evaluate((el) => el.click());
  return 'script';
}

async function shoot(page, name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  // Chrome will not encode a PNG past ~16k pixels and a 40k-row tab is no use to a
  // human anyway: past the cut it is the first screenful that gets saved.
  const fullPage = height <= 6000;
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage });
  return { height, fullPage };
}

test('browser: walk every tab of the live page', { skip, timeout: 30 * MINUTE }, async (t) => {
  const puppeteer = await import('puppeteer-core');
  const cli = await locateFmCli();
  assert.ok(cli, 'fm CLI located');
  mkdirSync(SHOTS, { recursive: true });
  const downloads = mkdtempSync(join(tmpdir(), 'inspector-export-'));

  const consoleErrors = [];
  const consoleWarnings = [];
  const pageErrors = [];
  const requestFailures = [];
  // Chrome's own console error for a 404 says only "Failed to load resource": the
  // URL is here, so a broken asset can be named rather than hunted for.
  const badResponses = [];

  const timings = {};
  const clock = async (label, fn) => {
    const started = Date.now();
    const value = await fn();
    timings[label] = Date.now() - started;
    console.log(`[${label}] ${timings[label]}ms`);
    return value;
  };

  // Both live outside the try only so `finally` can reach them. Everything that
  // can throw -- binding a port, launching a Chrome that exists but will not
  // start -- happens INSIDE it, so a half-built setup is still torn down: a
  // listening server or a live Chrome left behind hangs the test run.
  let server = null;
  let browser = null;
  try {
    server = createServer({ cli, root, username, noPrompt: true });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}`;

    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--disable-gpu'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });

    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
      else if (m.type() === 'warning') consoleWarnings.push(m.text());
    });
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('requestfailed', (r) => requestFailures.push(`${r.url()} ${r.failure()?.errorText}`));
    page.on('response', (r) => { if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`); });

    await clock('discovery', async () => {
      await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
      // Discovery is ~200 fm reads in one invocation: the header stops saying
      // "connecting" and the progress line ends with the count of files read.
      await page.waitForFunction(
        () => document.getElementById('context').textContent !== 'connecting'
          && /Read \d+ file/.test(document.getElementById('progress').textContent),
        { timeout: 5 * MINUTE, polling: 500 },
      );
    });
    console.log('context:', await page.$eval('#context', (e) => e.textContent));
    console.log('progress:', await page.$eval('#progress', (e) => e.textContent));

    const tabs = await page.$$eval('#nav a.nav-item', (as) => as.map((a) => ({ href: a.getAttribute('href'), label: a.textContent })));
    assert.ok(tabs.length >= 11, `the sidebar drew its tabs: ${tabs.length}`);

    for (const tab of tabs) {
      const id = tab.href.replace(/^#/, '').split('/')[0];
      await t.test(`tab ${id} (${tab.label})`, async () => {
        await clock(`tab:${id}`, async () => {
          await page.click(`#nav a.nav-item[href="${tab.href}"]`);
          await page.waitForFunction(
            (want) => document.querySelector('#nav a.nav-item.active')?.getAttribute('href')?.startsWith(want),
            { timeout: MINUTE }, tab.href,
          );
          await settled(page);

          const heading = await page.$eval('#main h2', (h) => h.textContent.trim());
          assert.ok(heading.length > 0, `${id}: the first heading is not empty`);

          const before = faultsIn(await page.evaluate(mainText));
          assert.deepEqual(before, [], `${id}: the rendered text is free of renderer faults`);

          const row = await page.$('#main [data-select]');
          if (row) {
            const how = await clickRow(page, row);
            await settled(page);
            await page.waitForFunction(() => !!document.querySelector('#main h2'), { timeout: MINUTE });
            const selection = await page.evaluate(() => location.hash);
            console.log(`  ${id}: selected ${selection} (${how} click)`);
            const after = faultsIn(await page.evaluate(mainText));
            assert.deepEqual(after, [], `${id}: the selected row's render is free of renderer faults`);
          } else {
            console.log(`  ${id}: nothing selectable`);
          }

          if (id === 'gaps') {
            // The tab's own hashchange handler fetches the 3MB register; the check
            // button is disabled while that runs, so wait for the register first.
            await page.waitForFunction(() => !!window.inspector?.solution?.register, { timeout: 5 * MINUTE, polling: 500 });
            await settled(page);
            await clock('gaps:live-check', async () => {
              await page.click('button[data-action="gaps-check"]');
              await page.waitForFunction(
                () => /Ran .* against fm |The batch failed/.test(document.getElementById('main').textContent),
                { timeout: 10 * MINUTE, polling: 500 },
              );
            });
            const ran = await page.evaluate(() => window.inspector.solution.gaps);
            console.log(`  gaps: live check ran at ${ran?.ranAt}, ${ran?.entries} entries`);
            assert.ok(ran?.ranAt, 'the live check reports when it ran');
            // A finished read says what it did: the header still reading "Running the
            // register's probes" is a page that looks like it never stopped.
            const said = await page.$eval('#progress', (e) => e.textContent);
            assert.match(said, /^Ran \d+ of the register's probes$/, 'the progress line reports the finished check');
            const checked = faultsIn(await page.evaluate(mainText));
            assert.deepEqual(checked, [], 'gaps: the live check outcome is free of renderer faults');
          }

          const shot = await shoot(page, id);
          console.log(`  ${id}: ${shot.height}px page, screenshot ${shot.fullPage ? 'full' : 'first screenful'}`);
        });
      });
    }

    await t.test('the Markdown export downloads', async () => {
      const client = await page.createCDPSession();
      await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, eventsEnabled: true });
      await clock('export:markdown', async () => {
        await page.select('#export', 'markdown');
        await page.waitForFunction(
          () => /^Exported .*\.md$/.test(document.getElementById('progress').textContent),
          { timeout: 5 * MINUTE, polling: 250 },
        );
        // Chrome writes a .crdownload beside the file until the last byte lands.
        const done = () => readdirSync(downloads).filter((f) => f.endsWith('.md')
          && !readdirSync(downloads).includes(`${f}.crdownload`) && statSync(join(downloads, f)).size > 0);
        const deadline = Date.now() + 2 * MINUTE;
        let files = done();
        while (!files.length && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 250));
          files = done();
        }
        assert.equal(files.length, 1, `exactly one .md landed in the download directory: ${JSON.stringify(readdirSync(downloads))}`);
        const text = readFileSync(join(downloads, files[0]), 'utf8');
        console.log(`  export: ${files[0]}, ${text.length} bytes`);
        assert.ok(text.startsWith('# '), `the export opens with a Markdown heading: ${JSON.stringify(text.slice(0, 40))}`);
      });
    });

    await t.test('the console stayed quiet', async () => {
      for (const w of consoleWarnings) console.log(`  console warning: ${w}`);
      for (const f of requestFailures) console.log(`  request failed: ${f}`);
      assert.deepEqual(pageErrors, [], 'no uncaught exception on the page');
      assert.deepEqual(consoleErrors, [], 'no console error on the page');
      assert.deepEqual(requestFailures, [], 'no failed request');
      // Every asset the page asks for is one the server serves. A 404 here is a
      // broken href the console only ever calls "Failed to load resource", and
      // it was being printed and then passed over.
      assert.deepEqual(badResponses, [], 'no response of 400 or worse');
    });
    console.log('timings:', JSON.stringify(timings));
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise((r) => server.close(r));
    rmSync(downloads, { recursive: true, force: true });
  }
});
