/**
 * Tests for modules/pluginSystem.js
 */
import { describe, it, assert } from './testRunner.js';
import {
  registerPlugin,
  unregisterPlugin,
  updatePlugins,
  emit,
  getRegisteredPlugins,
  resetPluginSystem,
} from '../modules/pluginSystem.js';

describe('pluginSystem', () => {

  it('should register and list a plugin', () => {
    resetPluginSystem();
    registerPlugin({ name: 'testA' });
    const names = getRegisteredPlugins();
    assert.ok(names.includes('testA'), 'testA should be registered');
    resetPluginSystem();
  });

  it('should throw when registering a plugin without a name', () => {
    resetPluginSystem();
    assert.throws(() => registerPlugin({}), 'non-empty "name"');
    assert.throws(() => registerPlugin({ name: '' }), 'non-empty "name"');
    assert.throws(() => registerPlugin(null), 'non-empty "name"');
  });

  it('should throw when registering a duplicate plugin name', () => {
    resetPluginSystem();
    registerPlugin({ name: 'dup' });
    assert.throws(() => registerPlugin({ name: 'dup' }), 'already registered');
    resetPluginSystem();
  });

  it('should call init on registration', () => {
    resetPluginSystem();
    let initCalled = false;
    registerPlugin({
      name: 'initTest',
      init() { initCalled = true; },
    });
    assert.ok(initCalled, 'init should be called');
    resetPluginSystem();
  });

  it('should call destroy on unregistration', () => {
    resetPluginSystem();
    let destroyed = false;
    registerPlugin({
      name: 'destroyTest',
      destroy() { destroyed = true; },
    });
    unregisterPlugin('destroyTest');
    assert.ok(destroyed, 'destroy should be called');
    assert.ok(!getRegisteredPlugins().includes('destroyTest'), 'plugin should be removed');
    resetPluginSystem();
  });

  it('should return false when unregistering an unknown plugin', () => {
    resetPluginSystem();
    assert.equal(unregisterPlugin('nonexistent'), false);
  });

  it('should call update on all plugins', () => {
    resetPluginSystem();
    let countA = 0, countB = 0;
    registerPlugin({ name: 'updA', update() { countA++; } });
    registerPlugin({ name: 'updB', update() { countB++; } });
    updatePlugins({});
    assert.equal(countA, 1);
    assert.equal(countB, 1);
    resetPluginSystem();
  });

  it('should not crash if a plugin update throws', () => {
    resetPluginSystem();
    registerPlugin({ name: 'bad', update() { throw new Error('boom'); } });
    // Should not throw
    let threw = false;
    try {
      updatePlugins({});
    } catch (_) {
      threw = true;
    }
    assert.ok(!threw, 'updatePlugins should catch plugin errors');
    resetPluginSystem();
  });

  it('should wire event handlers from plugin.on', () => {
    resetPluginSystem();
    let received = null;
    registerPlugin({
      name: 'evtTest',
      on: {
        myEvent(data) { received = data; },
      },
    });
    emit('myEvent', 42);
    assert.equal(received, 42, 'Event handler should receive emitted data');
    resetPluginSystem();
  });

  it('should remove event handlers on unregistration', () => {
    resetPluginSystem();
    let count = 0;
    registerPlugin({
      name: 'evtClean',
      on: { tick() { count++; } },
    });
    emit('tick');
    assert.equal(count, 1);
    unregisterPlugin('evtClean');
    emit('tick');
    assert.equal(count, 1, 'Handler should not fire after unregister');
    resetPluginSystem();
  });

  it('should remove all plugins on resetPluginSystem', () => {
    resetPluginSystem();
    registerPlugin({ name: 'a' });
    registerPlugin({ name: 'b' });
    resetPluginSystem();
    assert.equal(getRegisteredPlugins().length, 0, 'All plugins should be removed');
  });
});

