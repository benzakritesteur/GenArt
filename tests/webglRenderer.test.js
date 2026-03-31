/**
 * Tests for modules/webglRenderer.js
 */
import { describe, it, assert } from './testRunner.js';
import { isWebGL2Supported } from '../modules/webglRenderer.js';

describe('webglRenderer', () => {

  it('should export isWebGL2Supported as a function', () => {
    assert.equal(typeof isWebGL2Supported, 'function');
  });

  it('should return a boolean', () => {
    const result = isWebGL2Supported();
    assert.equal(typeof result, 'boolean', 'isWebGL2Supported must return a boolean');
  });
});

