const sleep = (t) => new Promise((r) => setTimeout(() => r(), t));

export class RealtimeEventHandler {
  constructor() {
    this.eventHandlers = {};
    this.nextEventHandlers = {};
  }

  clearEventHandlers() {
    this.eventHandlers = {};
    this.nextEventHandlers = {};
    return true;
  }

  on(eventName, callback) {
    if (typeof eventName !== 'string') {
      throw new Error('Event name must be a string');
    }
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }
    this.eventHandlers[eventName] = this.eventHandlers[eventName] || [];
    this.eventHandlers[eventName].push(callback);
    return callback;
  }

  onNext(eventName, callback) {
    if (typeof eventName !== 'string') {
      throw new Error('Event name must be a string');
    }
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }
    this.nextEventHandlers[eventName] = this.nextEventHandlers[eventName] || [];
    this.nextEventHandlers[eventName].push(callback);
    return callback;
  }

  off(eventName, callback) {
    const handlers = this.eventHandlers[eventName] || [];
    if (callback) {
      const index = handlers.indexOf(callback);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    } else {
      delete this.eventHandlers[eventName];
    }
    return true;
  }

  offNext(eventName, callback) {
    const nextHandlers = this.nextEventHandlers[eventName] || [];
    if (callback) {
      const index = nextHandlers.indexOf(callback);
      if (index !== -1) {
        nextHandlers.splice(index, 1);
      }
    } else {
      delete this.nextEventHandlers[eventName];
    }
    return true;
  }

  async waitForNext(eventName, timeout = null) {
    return new Promise((resolve) => {
      let timer = null;
      if (timeout) {
        timer = setTimeout(() => {
          this.offNext(eventName);
          resolve(null);
        }, timeout);
      }
      this.onNext(eventName, (event) => {
        if (timer) clearTimeout(timer);
        resolve(event);
      });
    });
  }

  dispatch(eventName, event) {
    const handlers = [...(this.eventHandlers[eventName] || [])];
    const nextHandlers = [...(this.nextEventHandlers[eventName] || [])];
    for (const handler of handlers) {
      handler(event);
    }
    for (const nextHandler of nextHandlers) {
      nextHandler(event);
    }
    delete this.nextEventHandlers[eventName];
    return true;
  }

  onMultiple(events, callback) {
    for (const eventName of events) {
      this.on(eventName, callback);
    }
  }

  offMultiple(events, callback) {
    for (const eventName of events) {
      this.off(eventName, callback);
    }
  }
}
