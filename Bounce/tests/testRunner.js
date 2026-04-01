/**
 * Minimal browser-based test runner for GenArt.
 *
 * Provides `describe`, `it`, and basic assertion helpers. Results are
 * rendered into the DOM and also logged to the console.
 *
 * @module testRunner
 */

/** @type {Array<{suiteName: string, tests: Array<{name: string, fn: function}>}>} */
const suites = [];

/** @type {{passed: number, failed: number, errors: Array<{suite: string, test: string, error: Error}>}} */
const results = { passed: 0, failed: 0, errors: [] };

let currentSuite = null;

/**
 * Defines a test suite.
 *
 * @param {string} suiteName - Name of the test suite.
 * @param {function} fn - Function containing `it()` calls.
 * @returns {void}
 */
export function describe(suiteName, fn) {
  currentSuite = { suiteName, tests: [] };
  suites.push(currentSuite);
  fn();
  currentSuite = null;
}

/**
 * Defines a single test case within a `describe` block.
 *
 * @param {string} testName - Name of the test.
 * @param {function} fn - Test function. Throw to indicate failure.
 * @returns {void}
 */
export function it(testName, fn) {
  if (!currentSuite) {
    throw new Error(`it("${testName}") must be called inside a describe() block`);
  }
  currentSuite.tests.push({ name: testName, fn });
}

/**
 * Basic assertion helpers.
 */
export const assert = {
  /**
   * Asserts that a value is truthy.
   *
   * @param {*} value - Value to check.
   * @param {string} [msg] - Optional failure message.
   * @returns {void}
   */
  ok(value, msg) {
    if (!value) throw new Error(msg || `Expected truthy, got ${JSON.stringify(value)}`);
  },

  /**
   * Asserts strict equality (===).
   *
   * @param {*} actual
   * @param {*} expected
   * @param {string} [msg]
   * @returns {void}
   */
  equal(actual, expected, msg) {
    if (actual !== expected) {
      throw new Error(msg || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  },

  /**
   * Asserts deep equality (JSON-based comparison for plain objects/arrays).
   *
   * @param {*} actual
   * @param {*} expected
   * @param {string} [msg]
   * @returns {void}
   */
  deepEqual(actual, expected, msg) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a !== b) {
      throw new Error(msg || `Deep equality failed.\n  Actual:   ${a}\n  Expected: ${b}`);
    }
  },

  /**
   * Asserts that a function throws an error.
   *
   * @param {function} fn - Function expected to throw.
   * @param {string|RegExp} [pattern] - Optional pattern to match against error message.
   * @param {string} [msg]
   * @returns {void}
   */
  throws(fn, pattern, msg) {
    let threw = false;
    try {
      fn();
    } catch (err) {
      threw = true;
      if (pattern instanceof RegExp && !pattern.test(err.message)) {
        throw new Error(msg || `Error message "${err.message}" did not match ${pattern}`);
      }
      if (typeof pattern === 'string' && !err.message.includes(pattern)) {
        throw new Error(msg || `Error message "${err.message}" did not include "${pattern}"`);
      }
    }
    if (!threw) {
      throw new Error(msg || 'Expected function to throw, but it did not');
    }
  },

  /**
   * Asserts that actual is approximately equal to expected within a tolerance.
   *
   * @param {number} actual
   * @param {number} expected
   * @param {number} [tolerance=0.001]
   * @param {string} [msg]
   * @returns {void}
   */
  closeTo(actual, expected, tolerance = 0.001, msg) {
    if (Math.abs(actual - expected) > tolerance) {
      throw new Error(msg || `Expected ${actual} to be close to ${expected} (±${tolerance})`);
    }
  },
};

/**
 * Runs all registered suites and renders results into the page.
 *
 * @returns {{passed: number, failed: number, errors: Array<{suite: string, test: string, error: Error}>}}
 */
export function runAll() {
  results.passed = 0;
  results.failed = 0;
  results.errors = [];

  const container = document.getElementById('test-results') || document.body;

  for (const suite of suites) {
    const header = document.createElement('h2');
    header.textContent = suite.suiteName;
    header.style.cssText = 'font-family:monospace;margin:16px 0 6px;';
    container.appendChild(header);

    for (const test of suite.tests) {
      const row = document.createElement('div');
      row.style.cssText = 'font-family:monospace;padding:3px 8px;font-size:14px;';

      try {
        test.fn();
        results.passed++;
        row.textContent = `  ✅ ${test.name}`;
        row.style.color = '#4a4';
        console.log(`  ✅ ${suite.suiteName} > ${test.name}`);
      } catch (err) {
        results.failed++;
        results.errors.push({ suite: suite.suiteName, test: test.name, error: err });
        row.textContent = `  ❌ ${test.name}: ${err.message}`;
        row.style.color = '#c44';
        console.error(`  ❌ ${suite.suiteName} > ${test.name}:`, err.message);
      }
      container.appendChild(row);
    }
  }

  // Summary
  const summary = document.createElement('div');
  summary.style.cssText = 'font-family:monospace;margin-top:20px;padding:10px;border-top:2px solid #555;font-size:15px;font-weight:bold;';
  const totalColor = results.failed === 0 ? '#4a4' : '#c44';
  summary.innerHTML = `<span style="color:${totalColor}">${results.passed} passed, ${results.failed} failed</span> out of ${results.passed + results.failed} tests`;
  container.appendChild(summary);
  console.log(`\n${results.passed} passed, ${results.failed} failed`);

  return results;
}

