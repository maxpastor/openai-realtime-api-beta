/**
 * EventHandler callback
 * @typedef {(event: {[key: string]: any}) => void | Promise<void>} EventHandlerCallbackType
 */

const sleep = (t) => new Promise((r) => setTimeout(() => r(), t));

/**
 * Inherited class for RealtimeAPI and RealtimeClient
 * Adds basic event handling
 * @class
 */
export class RealtimeEventHandler {
  /**
   * Create a new RealtimeEventHandler instance
   */
  constructor() {
    this.eventHandlers = {};
    this.nextEventHandlers = {};
  }

  /**
   * Clears all event handlers
   * @returns {true}
   */
  clearEventHandlers() {
    this.eventHandlers = {};
    this.nextEventHandlers = {};
    return true;
  }

  /**
   * Listen to specific events
   * @param {string} eventName The name of the event to listen to
   * @param {EventHandlerCallbackType} callback Code to execute on event
   * @returns {EventHandlerCallbackType}
   */
  on(eventName, callback) {
    this.eventHandlers[eventName] = this.eventHandlers[eventName] || [];
    this.eventHandlers[eventName].push(callback);
    return callback;
  }

  /**
   * Listen for the next event of a specified type
   * @param {string} eventName The name of the event to listen to
   * @param {EventHandlerCallbackType} callback Code to execute on event
   * @returns {EventHandlerCallbackType}
   */
  onNext(eventName, callback) {
    this.nextEventHandlers[eventName] = this.nextEventHandlers[eventName] || [];
    this.nextEventHandlers[eventName].push(callback);
    return callback;
  }

  /**
   * Turns off event listening for specific events
   * Calling without a callback will remove all listeners for the event
   * @param {string} eventName
   * @param {EventHandlerCallbackType} [callback]
   * @returns {true}
   */
  off(eventName, callback) {
    const handlers = this.eventHandlers[eventName] || [];
    if (callback) {
      const index = handlers.indexOf(callback);
      if (index === -1) {
        throw new Error(
          `Could not turn off specified event listener for "${eventName}": not found as a listener`,
        );
      }
      handlers.splice(index, 1);
      if (handlers.length === 0) {
        delete this.eventHandlers[eventName];
      }
    } else {
      delete this.eventHandlers[eventName];
    }
    return true;
  }

  /**
   * Turns off event listening for the next event of a specific type
   * Calling without a callback will remove all listeners for the next event
   * @param {string} eventName
   * @param {EventHandlerCallbackType} [callback]
   * @returns {true}
   */
  offNext(eventName, callback) {
    const nextHandlers = this.nextEventHandlers[eventName] || [];
    if (callback) {
      const index = nextHandlers.indexOf(callback);
      if (index === -1) {
        throw new Error(
          `Could not turn off specified next event listener for "${eventName}": not found as a listener`,
        );
      }
      nextHandlers.splice(index, 1);
      if (nextHandlers.length === 0) {
        delete this.nextEventHandlers[eventName];
      }
    } else {
      delete this.nextEventHandlers[eventName];
    }
    return true;
  }

  /**
   * Waits for next event of a specific type and returns the payload
   * @param {string} eventName
   * @param {number|null} [timeout]
   * @returns {Promise<{[key: string]: any}|null>}
   */
  waitForNext(eventName, timeout = null) {
    return new Promise((resolve) => {
      let timer;
      const handler = (event) => {
        if (timer) clearTimeout(timer);
        this.offNext(eventName, handler);
        resolve(event);
      };
      this.onNext(eventName, handler);
      if (timeout !== null) {
        timer = setTimeout(() => {
          this.offNext(eventName, handler);
          resolve(null);
        }, timeout);
      }
    });
  }

  /**
   * Executes all events in the order they were added, with .on() event handlers executing before .onNext() handlers
   * @param {string} eventName
   * @param {any} event
   * @returns {true}
   */
  dispatch(eventName, event) {
    const handlers = [].concat(this.eventHandlers[eventName] || []);
    for (const handler of handlers) {
      try {
        const result = handler(event);
        if (result && typeof result.then === 'function') {
          result.catch((error) => {
            console.error(`Error in handler for event "${eventName}":`, error);
          });
        }
      } catch (error) {
        console.error(`Error in handler for event "${eventName}":`, error);
      }
    }
    const nextHandlers = [].concat(this.nextEventHandlers[eventName] || []);
    for (const nextHandler of nextHandlers) {
      try {
        const result = nextHandler(event);
        if (result && typeof result.then === 'function') {
          result.catch((error) => {
            console.error(`Error in next handler for event "${eventName}":`, error);
          });
        }
      } catch (error) {
        console.error(`Error in next handler for event "${eventName}":`, error);
      }
    }
    delete this.nextEventHandlers[eventName];
    return true;
  }
}
