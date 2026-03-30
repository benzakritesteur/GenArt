/**
 * Minimal browser-based test runner for GenArt.
 * @module testRunner
 */

let _suites = [];
let _currentSuite = null;

/**
 * Describe a test suite.
 * @param {string} name
 * @param {Function} fn
 */
export function describe(name, fn) {
  const suite = { name, tests: [], beforeEachFn: null, afterEachFn: null };
  _currentSuite = suite;
  _suites.push(suite);
  fn();
  _currentSuite = null;
}

/**
 * Define a single test.
 * @param {string} name
 * @param {Function} fn - Can be async.
 */
export function it(name, fn) {
  if (!_currentSuite) throw new Error('it() must be called inside describe()');
  _currentSuite.tests.push({ name, fn });
}

export function beforeEach(fn) {
  if (_currentSuite) _currentSuite.beforeEachFn = fn;
}
export function afterEach(fn) {
  if (_currentSuite) _currentSuite.afterEachFn = fn;
}

// ─── Assertions ───

export function assert(cond, msg = 'Assertion failed') {
  if (!cond) throw new Error(msg);
}

export function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

export function assertNotEqual(a, b, msg) {
  if (a === b) throw new Error(msg || `Expected values to differ, both are ${JSON.stringify(a)}`);
}

export function assertDeepEqual(a, b, msg) {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) throw new Error(msg || `Deep equal failed:\n  got:    ${ja}\n  expect: ${jb}`);
}

export function assertThrows(fn, msg) {
  let threw = false;
  try { fn(); } catch (_) { threw = true; }
  if (!threw) throw new Error(msg || 'Expected function to throw');
}

export async function assertRejects(fn, msg) {
  let threw = false;
  try { await fn(); } catch (_) { threw = true; }
  if (!threw) throw new Error(msg || 'Expected async function to reject');
}

export function assertIncludes(arr, item, msg) {
  if (!arr.includes(item)) throw new Error(msg || `Expected array to include ${JSON.stringify(item)}`);
}

export function assertGreaterThan(a, b, msg) {
  if (!(a > b)) throw new Error(msg || `Expected ${a} > ${b}`);
}

// ─── Runner ───

/**
 * Run all registered test suites and render results into the page.
 * @returns {Promise<{passed:number, failed:number, total:number}>}
 */
export async function runAll() {
  const results = [];
  let passed = 0, failed = 0;

  for (const suite of _suites) {
    for (const test of suite.tests) {
      const entry = { suite: suite.name, test: test.name, pass: false, error: null };
      try {
        if (suite.beforeEachFn) await suite.beforeEachFn();
        await test.fn();
        entry.pass = true;
        passed++;
      } catch (e) {
        entry.error = e;
        failed++;
      } finally {
        try { if (suite.afterEachFn) await suite.afterEachFn(); } catch (_) {}
      }
      results.push(entry);
    }
  }

  const total = passed + failed;

  // Render to DOM
  const container = document.getElementById('results') || document.body;
  const summary = document.createElement('div');
  summary.style.cssText = `padding:12px 20px;margin:12px;border-radius:8px;font:bold 16px monospace;color:#fff;
    background:${failed === 0 ? '#2a2' : '#c22'};`;
  summary.textContent = `${passed}/${total} passed` + (failed > 0 ? ` — ${failed} FAILED` : ' ✓ All green');
  container.appendChild(summary);

  for (const r of results) {
    const row = document.createElement('div');
    row.style.cssText = `padding:6px 20px;margin:2px 12px;border-radius:4px;font:13px monospace;
      background:${r.pass ? '#1a3a1a' : '#3a1a1a'};color:${r.pass ? '#6f6' : '#f66'};`;
    row.textContent = `${r.pass ? '✓' : '✗'} [${r.suite}] ${r.test}`;
    if (r.error) {
      const err = document.createElement('div');
      err.style.cssText = 'color:#faa;font-size:11px;margin-left:20px;white-space:pre-wrap;';
      err.textContent = r.error.message || String(r.error);
      row.appendChild(err);
    }
    container.appendChild(row);
  }

  // Also log
  console.log(`\n=== Tests: ${passed}/${total} passed ===`);
  for (const r of results) {
    if (!r.pass) console.error(`  FAIL [${r.suite}] ${r.test}:`, r.error?.message);
  }

  _suites = [];
  return { passed, failed, total };
}

