/**
 * Modular plugin system for GenArt.
 * Provides lifecycle hooks so external plugins can tap into the pipeline.
 * @module pluginSystem
 */

/** All available hook names in pipeline order. */
export const HOOKS = [
  'onInit',
  'onBeforeFrame',
  'onAfterDetection',
  'onAfterStabilize',
  'onAfterPhysicsSync',
  'onRender',
  'onConfigChange',
  'onDestroy'
];

/**
 * Manages plugin registration, lifecycle, and hook dispatch.
 *
 * @example
 * const pm = new PluginManager();
 * pm.register({ name: 'myPlugin', version: '1.0', hooks: { onRender({ ctx }) { ... } } });
 * pm.run('onRender', { ctx });
 */
export class PluginManager {
  constructor() {
    /** @type {Map<string, Object>} */
    this._plugins = new Map();
  }

  /**
   * Register a plugin.
   * @param {Object} plugin
   * @param {string} plugin.name — unique identifier
   * @param {string} [plugin.version]
   * @param {string} [plugin.description]
   * @param {Function} [plugin.init] — called once at registration
   * @param {Function} [plugin.destroy] — called once at unregistration
   * @param {Object} [plugin.hooks] — map of hookName → function
   */
  register(plugin) {
    if (!plugin || !plugin.name) throw new Error('Plugin must have a name');
    if (this._plugins.has(plugin.name)) throw new Error(`Plugin "${plugin.name}" is already registered`);

    // Validate hook names
    if (plugin.hooks) {
      for (const key of Object.keys(plugin.hooks)) {
        if (!HOOKS.includes(key)) {
          console.warn(`[PluginManager] Unknown hook "${key}" in plugin "${plugin.name}"`);
        }
      }
    }

    plugin.enabled = plugin.enabled !== false; // default true
    this._plugins.set(plugin.name, plugin);
    try { plugin.init?.(); } catch (e) { console.error(`[Plugin:${plugin.name}] init error:`, e); }
  }

  /**
   * Unregister a plugin by name.
   * @param {string} name
   */
  unregister(name) {
    const plugin = this._plugins.get(name);
    if (!plugin) return;
    try { plugin.destroy?.(); } catch (e) { console.error(`[Plugin:${name}] destroy error:`, e); }
    this._plugins.delete(name);
  }

  /**
   * Toggle a plugin enabled/disabled.
   * @param {string} name
   * @param {boolean} [force] — if provided, sets to this value
   * @returns {boolean} new enabled state
   */
  toggle(name, force) {
    const plugin = this._plugins.get(name);
    if (!plugin) return false;
    plugin.enabled = force !== undefined ? !!force : !plugin.enabled;
    return plugin.enabled;
  }

  /**
   * Run a hook across all enabled plugins.
   * @param {string} hookName
   * @param {...*} args
   */
  run(hookName, ...args) {
    for (const plugin of this._plugins.values()) {
      if (!plugin.enabled) continue;
      const fn = plugin.hooks?.[hookName];
      if (!fn) continue;
      try {
        fn(...args);
      } catch (e) {
        console.error(`[Plugin:${plugin.name}] ${hookName} error:`, e);
      }
    }
  }

  /**
   * List all registered plugins.
   * @returns {Array<{name: string, version: string, description: string, enabled: boolean}>}
   */
  list() {
    return [...this._plugins.values()].map(p => ({
      name: p.name,
      version: p.version || '0.0',
      description: p.description || '',
      enabled: !!p.enabled
    }));
  }

  /**
   * Get a plugin by name.
   * @param {string} name
   * @returns {Object|undefined}
   */
  get(name) { return this._plugins.get(name); }

  /** Unregister all plugins. */
  clear() {
    for (const name of [...this._plugins.keys()]) this.unregister(name);
  }
}

