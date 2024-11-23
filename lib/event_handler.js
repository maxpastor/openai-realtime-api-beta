/**
 * EventHandler callback
 * @typedef {(event: {[key: string]: any}) => void | Promise<void>} EventHandlerCallbackType
 */

/**
 * Sleep function for delaying execution
 * @param {number} t - Time in milliseconds to sleep
 * @returns {Promise<void>}
 */
const sleep = (t) => new Promise((r) => setTimeout(r, t));

/**
 * Inherited class for RealtimeAPI and RealtimeClient
 * Adds basic event handling
 * @class
 */
export class RealtimeEventHandler {
  /**
   * Create a new RealtimeEventHandler instance
   * @param {boolean} [debug=false] - Enable or disable debug mode
   */
  constructor(debug = false) {
    this.eventHandlers = {};
    this.nextEventHandlers = {};
    this.debug = debug;
    this.activeTimers = new Set(); // Keep track of active timers
  }

  /**
   * Clears all event handlers
   * @returns {true}
   */
  clearEventHandlers() {
    if (this.debug) {
      console.log('Clearing all event handlers.');
    }
    this.eventHandlers = {};
    this.nextEventHandlers = {};
    return true;
  }

  /**
   * Listen to specific events
   * @param {string} eventName - The name of the event to listen to
   * @param {EventHandlerCallbackType} callback - Code to execute on event
   * @returns {EventHandlerCallbackType}
   */
  on(eventName, callback) {
    this.eventHandlers[eventName] = this.eventHandlers[eventName] || [];
    this.eventHandlers[eventName].push(callback);
    if (this.debug) {
      console.log(
        `Handler added for event "${eventName}". Total handlers: ${this.eventHandlers[eventName].length}`
      );
    }
    return callback;
  }

  /**
   * Listen for the next event of a specified type
   * @param {string} eventName - The name of the event to listen to
   * @param {EventHandlerCallbackType} callback - Code to execute on event
   * @returns {EventHandlerCallbackType}
   */
  onNext(eventName, callback) {
    this.nextEventHandlers[eventName] = this.nextEventHandlers[eventName] || [];
    this.nextEventHandlers[eventName].push(callback);
    if (this.debug) {
      console.log(
        `Next handler added for event "${eventName}". Total next handlers: ${this.nextEventHandlers[eventName].length}`
      );
    }
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
          `Could not turn off specified event listener for "${eventName}": not found as a listener`
        );
      }
      handlers.splice(index, 1);
      if (this.debug) {
        console.log(
          `Handler removed for event "${eventName}". Remaining handlers: ${handlers.length}`
        );
      }
      if (handlers.length === 0) {
        delete this.eventHandlers[eventName];
        if (this.debug) {
          console.log(`No more handlers for event "${eventName}".`);
        }
      }
    } else {
      delete this.eventHandlers[eventName];
      if (this.debug) {
        console.log(`All handlers removed for event "${eventName}".`);
      }
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
          `Could not turn off specified next event listener for "${eventName}": not found as a listener`
        );
      }
      nextHandlers.splice(index, 1);
      if (this.debug) {
        console.log(
          `Next handler removed for event "${eventName}". Remaining next handlers: ${nextHandlers.length}`
        );
      }
      if (nextHandlers.length === 0) {
        delete this.nextEventHandlers[eventName];
        if (this.debug) {
          console.log(`No more next handlers for event "${eventName}".`);
        }
      }
    } else {
      delete this.nextEventHandlers[eventName];
      if (this.debug) {
        console.log(`All next handlers removed for event "${eventName}".`);
      }
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
        if (timer) {
          clearTimeout(timer);
          this.activeTimers.delete(timer);
          if (this.debug) {
            console.log(`Timer cleared for event "${eventName}". Active timers: ${this.activeTimers.size}`);
          }
        }
        this.offNext(eventName, handler);
        resolve(event);
      };
      this.onNext(eventName, handler);
      if (this.debug) {
        console.log(`Waiting for next event "${eventName}" with timeout: ${timeout}`);
      }
      if (timeout !== null) {
        timer = setTimeout(() => {
          this.offNext(eventName, handler);
          this.activeTimers.delete(timer);
          if (this.debug) {
            console.log(`Timeout reached for event "${eventName}". Active timers: ${this.activeTimers.size}`);
          }
          resolve(null);
        }, timeout);
        this.activeTimers.add(timer);
        if (this.debug) {
          console.log(`Timer set for event "${eventName}". Active timers: ${this.activeTimers.size}`);
        }
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
    const nextHandlers = [].concat(this.nextEventHandlers[eventName] || []);
    if (this.debug) {
      console.log(
        `Dispatching event "${eventName}". Handlers: ${handlers.length}, Next handlers: ${nextHandlers.length}`
      );
    }
    for (const handler of handlers) {
      try {
        const start = Date.now();
        const result = handler(event);
        if (result && typeof result.then === 'function') {
          result.catch((error) => {
            console.error(`Error in handler for event "${eventName}":`, error);
          });
        }
        const end = Date.now();
        if (this.debug) {
          console.log(`Handler execution time for event "${eventName}": ${end - start} ms`);
        }
      } catch (error) {
        console.error(`Error in handler for event "${eventName}":`, error);
      }
    }
    for (const nextHandler of nextHandlers) {
      try {
        const start = Date.now();
        const result = nextHandler(event);
        if (result && typeof result.then === 'function') {
          result.catch((error) => {
            console.error(`Error in next handler for event "${eventName}":`, error);
          });
        }
        const end = Date.now();
        if (this.debug) {
          console.log(`Next handler execution time for event "${eventName}": ${end - start} ms`);
        }
      } catch (error) {
        console.error(`Error in next handler for event "${eventName}":`, error);
      }
    }
    delete this.nextEventHandlers[eventName];
    if (this.debug) {
      console.log(`Next handlers cleared for event "${eventName}".`);
    }
    return true;
  }
}
