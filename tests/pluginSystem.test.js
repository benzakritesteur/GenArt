import { describe, it, assert, assertEqual, assertThrows, assertIncludes } from './testRunner.js';
import { PluginManager, HOOKS } from '../modules/pluginSystem.js';

describe('PluginManager', () => {
  it('registers a plugin and lists it', () => {
    const pm = new PluginManager();
    pm.register({ name: 'test', version: '1.0', description: 'A test plugin' });
    const list = pm.list();
    assertEqual(list.length, 1);
    assertEqual(list[0].name, 'test');
    assertEqual(list[0].enabled, true);
  });

  it('throws on duplicate register', () => {
    const pm = new PluginManager();
    pm.register({ name: 'dup' });
    assertThrows(() => pm.register({ name: 'dup' }));
  });

  it('throws on missing name', () => {
    const pm = new PluginManager();
    assertThrows(() => pm.register({}));
    assertThrows(() => pm.register(null));
  });

  it('calls init on register', () => {
    const pm = new PluginManager();
    let called = false;
    pm.register({ name: 'initTest', init: () => { called = true; } });
    assert(called, 'init should be called');
  });

  it('calls destroy on unregister', () => {
    const pm = new PluginManager();
    let called = false;
    pm.register({ name: 'destroyTest', destroy: () => { called = true; } });
    pm.unregister('destroyTest');
    assert(called, 'destroy should be called');
    assertEqual(pm.list().length, 0);
  });

  it('run invokes hooks with arguments', () => {
    const pm = new PluginManager();
    let received = null;
    pm.register({ name: 'hookTest', hooks: { onRender(ctx) { received = ctx; } } });
    pm.run('onRender', { foo: 42 });
    assertEqual(received.foo, 42);
  });

  it('run skips disabled plugins', () => {
    const pm = new PluginManager();
    let called = false;
    pm.register({ name: 'skipTest', hooks: { onRender() { called = true; } } });
    pm.toggle('skipTest', false);
    pm.run('onRender');
    assert(!called, 'should not call disabled plugin');
  });

  it('run does not crash on hook error', () => {
    const pm = new PluginManager();
    pm.register({ name: 'badPlugin', hooks: { onRender() { throw new Error('boom'); } } });
    pm.register({ name: 'goodPlugin', hooks: { onRender() {} } });
    // Should not throw
    pm.run('onRender');
  });

  it('toggle returns new state', () => {
    const pm = new PluginManager();
    pm.register({ name: 'tog' });
    assertEqual(pm.toggle('tog'), false); // was true → false
    assertEqual(pm.toggle('tog'), true);  // was false → true
    assertEqual(pm.toggle('tog', false), false); // forced false
  });

  it('clear removes all plugins', () => {
    const pm = new PluginManager();
    pm.register({ name: 'a' });
    pm.register({ name: 'b' });
    pm.clear();
    assertEqual(pm.list().length, 0);
  });

  it('HOOKS constant has expected entries', () => {
    assertIncludes(HOOKS, 'onInit');
    assertIncludes(HOOKS, 'onBeforeFrame');
    assertIncludes(HOOKS, 'onRender');
    assertIncludes(HOOKS, 'onDestroy');
  });
});

