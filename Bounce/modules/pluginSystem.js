/**
 * Lightweight plugin system for GenArt.
 *
 * Plugins register via {@link registerPlugin} and receive lifecycle hooks:
 *   - `init(context)`   — called once when the plugin is registered
 *   - `update(context)` — called every frame from the main loop
 *   - `destroy()`       — called when the plugin is unregistered
 *
 * Plugins can also subscribe to named events emitted by the core or other
 * plugins via {@link emit}.
 *
 * @module pluginSystem
 */

/**
 * @typedef {Object} Plugin
 * @property {string}                     name    - Unique plugin identifier.
 * @property {function(Object): void}     [init]  - Called once on registration.
 * @property {function(Object): void}     [update]- Called every frame.
 * @property {function(): void}           [destroy]- Called on unregistration.
 * @property {Object<string, function>}   [on]    - Map of event name → handler.
 */

/** @type {Map<string, Plugin>} */
const plugins = new Map();

/** @type {Map<string, Set<function>>} */
const eventListeners = new Map();

/**
 * Registers a plugin. If the plugin defines an `init` hook it is called
 * immediately with the provided context. Event handlers declared in
 * `plugin.on` are wired up automatically.
 *
 * @param {Plugin} plugin  - Plugin descriptor object.
 * @param {Object} [context={}] - Shared context passed to lifecycle hooks.
 * @throws {Error} If a plugin with the same name is already registered.
 * @returns {void}
 */
export function registerPlugin(plugin, context = {}) {
  if (!plugin || typeof plugin.name !== 'string' || !plugin.name.trim()) {
    throw new Error('Plugin must have a non-empty "name" string property');
  }
  if (plugins.has(plugin.name)) {
    throw new Error(`Plugin "${plugin.name}" is already registered`);
  }

  plugins.set(plugin.name, plugin);

  // Wire event handlers declared in plugin.on
  if (plugin.on && typeof plugin.on === 'object') {
    for (const [eventName, handler] of Object.entries(plugin.on)) {
      if (typeof handler === 'function') {
        subscribe(eventName, handler);
      }
    }
  }

  if (typeof plugin.init === 'function') {
    plugin.init(context);
  }
}

/**
 * Unregisters a plugin by name, calling its `destroy` hook if defined.
 * Event handlers declared in `plugin.on` are automatically removed.
 *
 * @param {string} name - The plugin name to remove.
 * @returns {boolean} `true` if the plugin was found and removed.
 */
export function unregisterPlugin(name) {
  const plugin = plugins.get(name);
  if (!plugin) return false;

  if (typeof plugin.destroy === 'function') {
    plugin.destroy();
  }

  // Remove event handlers
  if (plugin.on && typeof plugin.on === 'object') {
    for (const [eventName, handler] of Object.entries(plugin.on)) {
      if (typeof handler === 'function') {
        unsubscribe(eventName, handler);
      }
    }
  }

  plugins.delete(name);
  return true;
}

/**
 * Calls the `update` hook of every registered plugin.
 *
 * @param {Object} context - Frame context (surfaces, physics state, etc.).
 * @returns {void}
 */
export function updatePlugins(context) {
  for (const plugin of plugins.values()) {
    if (typeof plugin.update === 'function') {
      try {
        plugin.update(context);
      } catch (err) {
        console.error(`[pluginSystem] Error in plugin "${plugin.name}" update:`, err);
      }
    }
  }
}

/**
 * Subscribes a handler to a named event.
 *
 * @param {string} eventName - Event identifier.
 * @param {function} handler - Callback invoked when the event is emitted.
 * @returns {void}
 */
export function subscribe(eventName, handler) {
  if (!eventListeners.has(eventName)) {
    eventListeners.set(eventName, new Set());
  }
  eventListeners.get(eventName).add(handler);
}

/**
 * Removes a handler from a named event.
 *
 * @param {string} eventName - Event identifier.
 * @param {function} handler - The exact function reference to remove.
 * @returns {void}
 */
export function unsubscribe(eventName, handler) {
  const listeners = eventListeners.get(eventName);
  if (listeners) {
    listeners.delete(handler);
    if (listeners.size === 0) eventListeners.delete(eventName);
  }
}

/**
 * Emits a named event to all subscribers.
 *
 * @param {string} eventName - Event identifier.
 * @param {*} data - Payload passed to each handler.
 * @returns {void}
 */
export function emit(eventName, data) {
  const listeners = eventListeners.get(eventName);
  if (!listeners) return;
  for (const handler of listeners) {
    try {
      handler(data);
    } catch (err) {
      console.error(`[pluginSystem] Error in "${eventName}" handler:`, err);
    }
  }
}

/**
 * Returns the names of all currently registered plugins.
 *
 * @returns {string[]}
 */
export function getRegisteredPlugins() {
  return [...plugins.keys()];
}

/**
 * Removes all plugins (calling their `destroy` hooks) and clears all event
 * listeners. Useful for teardown / testing.
 *
 * @returns {void}
 */
export function resetPluginSystem() {
  for (const name of [...plugins.keys()]) {
    unregisterPlugin(name);
  }
  eventListeners.clear();
}

