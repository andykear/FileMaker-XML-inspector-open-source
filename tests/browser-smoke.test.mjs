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
// Five things are walked further than that, because each is an answer about WHERE
// or HOW a thing is drawn rather than whether it draws at all:
//
//   * during discovery, `#main` is non-empty within a second of the page loading and
//     says `Reading` -- the read log, which is all there is to look at for the ten
//     seconds fm takes. It is screenshot as `read-log.png` before the wait goes on.
//   * Scripts: the first row of the step index opens, and its `Step <name>` section
//     is asserted to come BEFORE the `Scripts` tree in document order.
//   * Gaps: after the register lands, the first kind row opens, then the first entry
//     row inside it, and the `Entry <id>` section is asserted to draw.
//   * Tables: the `Fields` header sorts the column it names -- ascending puts the
//     smallest count first, a second click the largest -- and the hash never moves.
//   * Relationships: the graph carries relation groups with a `<title>` and key
//     labels on the lines, so the drawing says what each line joins.
//
// What this does NOT check, so a green run is not read as more than it is:
//
//   * only `#main` is scanned. The sidebar, the header, the progress line and the
//     export menu are drawn by the same code and are never looked at here.
//   * `span.detail` -- the Scripts tab's raw step options, fm's own text -- is not
//     inside <code> or <pre>, so it IS scanned as if it were the page's prose. A
//     file whose step option legitimately reads `undefined` would be reported as a
//     renderer fault here. ooe has none; another solution might.
//   * one row per tab, bar the three that click twice. The FIRST `[data-select]` is
//     clicked and nothing else, so a tab is proved to render one selection, not all
//     of them -- the kind of row that comes second (a relation after an occurrence,
//     a folder after a script) is never opened. Even on Scripts and Gaps it is the
//     first row of the next list, never the tenth.
//   * what the drawing LOOKS like. The graph is asserted to have labels; whether two
//     of them land on top of each other is a question for a human with the
//     screenshot, and nothing here reads one back.
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

/** The section a tab drew under a heading matching `source` (a RegExp source
 *  string, so it crosses into the page), as an element handle, or null. A tab
 *  draws several sections and the test names the one it means by its own <h2>,
 *  never by its position -- the position is the thing being asserted. */
async function sectionByHeading(page, source) {
  const handle = await page.evaluateHandle((src) => {
    const re = new RegExp(src);
    return [...document.querySelectorAll('#main section')]
      .find((s) => re.test(s.querySelector('h2')?.textContent?.trim() ?? '')) ?? null;
  }, source);
  const element = handle.asElement();
  if (!element) await handle.dispose();
  return element;
}

/** Waits until some <h2> of #main matches `source`. A render is a hashchange
 *  away from the click that asked for it, so nothing is read until it lands. */
async function waitForHeading(page, source) {
  await page.waitForFunction(
    (src) => [...document.querySelectorAll('#main h2')].some((h) => new RegExp(src).test(h.textContent.trim())),
    { timeout: MINUTE }, source,
  );
}

/** A name as a RegExp source that matches only itself: a step is called
 *  `Set Field [...]` and the brackets are a character class otherwise. */
const literal = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** True when `first` comes before `second` in document order. */
function precedes(page, first, second) {
  return page.evaluate(
    (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING),
    first, second,
  );
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

/** A click that asks for a render, waited out. The shell renders on `hashchange`
 *  -- a task of its own, after the click returns -- and it replaces #main
 *  wholesale, so the clicked element is detached exactly when the new render is
 *  on the page. Waiting for anything less races it: the next thing the test
 *  clicks is a node that is about to be thrown away, and the click does nothing
 *  because a detached node's event reaches no listener on #main. */
async function clickAndRender(page, handle) {
  const how = await clickRow(page, handle);
  await page.waitForFunction((el) => !el.isConnected, { timeout: MINUTE, polling: 'raf' }, handle);
  return how;
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
      // The ten seconds discovery takes used to be a blank rectangle. The read
      // log fills it, and it is there within a second of the page loading --
      // the first phase event arrives as soon as fm is spawned.
      await page.waitForFunction(
        () => (document.getElementById('main')?.innerText ?? '').trim() !== '',
        { timeout: 1000, polling: 50 },
      );
      await clock('read-log', async () => {
        await page.waitForFunction(
          () => /Reading/.test(document.getElementById('main')?.innerText ?? ''),
          { timeout: MINUTE, polling: 100 },
        );
      });
      const lines = await page.evaluate(() => document.querySelectorAll('#main .read-log li').length);
      console.log(`  read log: ${lines} line(s) while fm is still reading`);
      await shoot(page, 'read-log');
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
            const how = await clickAndRender(page, row);
            await settled(page);
            const selection = await page.evaluate(() => location.hash);
            console.log(`  ${id}: selected ${selection} (${how} click)`);
            const after = faultsIn(await page.evaluate(mainText));
            assert.deepEqual(after, [], `${id}: the selected row's render is free of renderer faults`);
          } else {
            console.log(`  ${id}: nothing selectable`);
          }

          if (id === 'scripts') {
            // The step index is the second way into a script: a step TYPE, and
            // the scripts that use it. Its answer draws ABOVE the tree.
            const index = await sectionByHeading(page, '^Step index');
            assert.ok(index, 'scripts: the step index drew');
            // Not the row already open: the walk's own click above may have
            // landed on it, and re-selecting it is no hash change and so no
            // render for clickAndRender to wait for.
            const stepRow = await index.$('tr[data-select]:not(.selected)');
            assert.ok(stepRow, 'scripts: the step index has a row to open');
            const key = await stepRow.evaluate((el) => el.dataset.select);
            const name = key.slice(key.indexOf(':') + 1);
            const how = await clickAndRender(page, stepRow);
            await settled(page);
            await waitForHeading(page, `^Step ${literal(name)}$`);
            const step = await sectionByHeading(page, `^Step ${literal(name)}$`);
            assert.ok(step, `scripts: the step index opened ${name}`);
            const tree = await sectionByHeading(page, '^Scripts$');
            assert.ok(tree, 'scripts: the tree is still drawn under it');
            assert.ok(await precedes(page, step, tree), `scripts: "Step ${name}" draws above the tree`);
            console.log(`  scripts: step index opened ${JSON.stringify(name)} (${how} click)`);
            const faults = faultsIn(await page.evaluate(mainText));
            assert.deepEqual(faults, [], 'scripts: the step drill-down is free of renderer faults');
            await shoot(page, 'scripts-step');
          }

          if (id === 'tables') {
            // One header click sorts the column it names, in the DOM, without
            // touching the hash: the reader's selection and route survive it.
            const hashBefore = await page.evaluate(() => location.hash);
            const handle = await page.evaluateHandle(() => [...document.querySelectorAll('#main th')]
              .find((h) => h.textContent.trim() === 'Fields') ?? null);
            const header = handle.asElement();
            assert.ok(header, 'tables: the Fields column has a header');
            const column = () => page.evaluate(() => {
              const th = [...document.querySelectorAll('#main th')].find((h) => h.textContent.trim() === 'Fields');
              const rows = [...th.closest('table').tBodies[0].rows];
              // A cell with no digit in it is not a number, and Number('') is 0:
              // reading a blank as a zero would make an empty column "sorted".
              const numbers = rows.map((tr) => {
                const text = tr.cells[th.cellIndex].textContent;
                return /\d/.test(text) ? Number(text.replace(/[^\d.-]/g, '')) : NaN;
              });
              return { dir: th.dataset.dir ?? null, first: numbers[0], numbers };
            });
            await clickRow(page, header);
            const asc = await column();
            assert.ok(asc.numbers.every(Number.isFinite), `tables: every Fields cell is a number: ${JSON.stringify(asc.numbers)}`);
            assert.equal(asc.dir, 'asc', 'tables: the first click points the Fields column up');
            assert.equal(asc.first, Math.min(...asc.numbers), 'tables: ascending puts the smallest field count first');
            await clickRow(page, header);
            const desc = await column();
            assert.equal(desc.dir, 'desc', 'tables: the second click turns the Fields column around');
            assert.equal(desc.first, Math.max(...desc.numbers), 'tables: descending puts the largest field count first');
            assert.equal(await page.evaluate(() => location.hash), hashBefore, 'tables: sorting leaves the hash alone');
            console.log(`  tables: Fields sorted ${asc.first} up, ${desc.first} down over ${asc.numbers.length} rows`);
          }

          if (id === 'graph') {
            // The drawing is the answer here: every line carries what it joins,
            // as a tooltip on the group and as the key fields at each end.
            const drawn = await page.evaluate(() => ({
              groups: document.querySelectorAll('svg.graph .rel-group title').length,
              keys: document.querySelectorAll('svg.graph text.key').length,
            }));
            assert.ok(drawn.groups > 0, `graph: the relation lines carry their predicates: ${drawn.groups}`);
            assert.ok(drawn.keys > 0, `graph: the relation lines carry their key fields: ${drawn.keys}`);
            console.log(`  graph: ${drawn.groups} relation group(s), ${drawn.keys} key label(s)`);
          }

          if (id === 'gaps') {
            // The tab's own hashchange handler fetches the 3MB register; the check
            // button is disabled while that runs, so wait for the register first.
            await page.waitForFunction(() => !!window.inspector?.solution?.register, { timeout: 5 * MINUTE, polling: 500 });
            await settled(page);

            // The register is three tables deep: kinds, then a kind's entries,
            // then the entry's own facts. Both clicks are made here, because
            // the entry row only exists once a kind has been opened.
            const kinds = await sectionByHeading(page, '^What fm cannot read yet$');
            assert.ok(kinds, 'gaps: the register drew its kinds');
            // The walk's own click above lands on the first kind row, so the
            // one opened here is the first that is not already open.
            const kindRow = await kinds.$('tr[data-select]:not(.selected)');
            assert.ok(kindRow, 'gaps: the kinds table has a row to open');
            await clickAndRender(page, kindRow);
            await settled(page);
            await waitForHeading(page, '^Kind ');
            const kindSection = await sectionByHeading(page, '^Kind ');
            assert.ok(kindSection, 'gaps: the opened kind drew above the kinds table');
            const entryRow = await kindSection.$('tr[data-select]');
            assert.ok(entryRow, 'gaps: the opened kind lists its entries');
            await clickAndRender(page, entryRow);
            await settled(page);
            await waitForHeading(page, '^Entry ');
            const entry = await sectionByHeading(page, '^Entry ');
            assert.ok(entry, 'gaps: the entry drew its facts');
            const drilled = faultsIn(await page.evaluate(mainText));
            assert.deepEqual(drilled, [], 'gaps: the entry drill-down is free of renderer faults');
            console.log(`  gaps: opened ${await page.evaluate(() => location.hash)}`);
            await shoot(page, 'gaps-entry');

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
