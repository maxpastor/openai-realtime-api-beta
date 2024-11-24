import { RealtimeEventHandler } from './event_handler.js';
import { RealtimeUtils } from './utils.js';

export class RealtimeAPI extends RealtimeEventHandler {
  /**
   * Create a new RealtimeAPI instance
   * @param {{url?: string, apiKey?: string, dangerouslyAllowAPIKeyInBrowser?: boolean, debug?: boolean}} [settings]
   * @returns {RealtimeAPI}
   */
  constructor({ url, apiKey, dangerouslyAllowAPIKeyInBrowser, debug } = {}) {
    super();
    this.defaultUrl = 'wss://api.openai.com/v1/realtime';
    this.url = url || this.defaultUrl;
    this.apiKey = apiKey || null;
    this.debug = !!debug;
    this.logLevel = this.debug ? 'debug' : 'error'; // Log level
    this.ws = null;
    this.reconnectDelay = 5000; // Reconnection delay (ms)
    if (globalThis.document && this.apiKey) {
      if (!dangerouslyAllowAPIKeyInBrowser) {
        throw new Error(
          `Can not provide API key in the browser without "dangerouslyAllowAPIKeyInBrowser" set to true`,
        );
      }
    }
  }

  /**
   * Tells us whether or not the WebSocket is connected
   * @returns {boolean}
   */
  isConnected() {
    return !!this.ws;
  }

  /**
   * Writes WebSocket logs to console
   * @param {'debug' | 'error'} level
   * @param  {...any} args
   * @returns {true}
   */
  log(level, ...args) {
    if (this.logLevel === 'debug' || level === 'error') {
      const date = new Date().toISOString();
      const logs = [`[Websocket/${date}]`].concat(args).map((arg) => {
        if (typeof arg === 'object' && arg !== null) {
          return JSON.stringify(arg, null, 2);
        } else {
          return arg;
        }
      });
      console.log(...logs);
    }
    return true;
  }

  /**
   * Connects to Realtime API Websocket Server
   * @param {{model?: string}} [settings]
   * @returns {Promise<true>}
   */
  async connect({ model } = { model: 'gpt-4o-realtime-preview-2024-10-01' }) {
    if (!this.apiKey && this.url === this.defaultUrl) {
      console.warn(`No apiKey provided for connection to "${this.url}"`);
    }
    if (this.isConnected()) {
      throw new Error(`Already connected`);
    }

    if (globalThis.WebSocket) {
      const WebSocket = globalThis.WebSocket;
      const ws = new WebSocket(`${this.url}${model ? `?model=${model}` : ''}`, [
        'realtime',
        `openai-insecure-api-key.${this.apiKey}`,
        'openai-beta.realtime-v1',
      ]);

      // Set up WebSocket event listeners
      this.setupWebSocketListeners(ws);

      return this.handleWebSocketConnection(ws);
    } else {
      const moduleName = 'ws';
      const wsModule = await import(/* webpackIgnore: true */ moduleName);
      const WebSocket = wsModule.default;
      const ws = new WebSocket(
        `${this.url}${model ? `?model=${model}` : ''}`,
        [],
        {
          finishRequest: (request) => {
            request.setHeader('Authorization', `Bearer ${this.apiKey}`);
            request.setHeader('OpenAI-Beta', 'realtime=v1');
            request.end();
          },
        },
      );

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        this.receive(message.type, message);
      });

      // Set up WebSocket event listeners
      this.setupWebSocketListeners(ws);

      return this.handleWebSocketConnection(ws);
    }
  }

  /**
   * Sets up WebSocket listeners for open, error, message, and close events
   * @param {WebSocket} ws
   */
  setupWebSocketListeners(ws) {
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      this.receive(message.type, message);
    });

    ws.on('error', (err) => {
      this.log('error', `Error occurred:`, err);
    });

    ws.on('close', () => {
      this.log('debug', `Disconnected from "${this.url}"`);
      this.dispatch('close', { error: false });
      this.ws = null;
      setTimeout(() => this.connect(), this.reconnectDelay); // Reconnect with delay
    });
  }

  /**
   * Handles the WebSocket connection promise
   * @param {WebSocket} ws
   * @returns {Promise<true>}
   */
  handleWebSocketConnection(ws) {
    return new Promise((resolve, reject) => {
      ws.on('open', () => {
        this.log('debug', `Connected to "${this.url}"`);
        this.ws = ws;
        resolve(true);
      });

      ws.on('error', () => {
        this.log('error', `Could not connect to "${this.url}"`);
        this.disconnect(ws);
        reject(new Error(`Could not connect to "${this.url}"`));
      });
    });
  }

  /**
   * Disconnects from Realtime API server
   * @param {WebSocket} [ws]
   * @returns {true}
   */
  disconnect(ws) {
    if (!ws || this.ws === ws) {
      if (this.ws) {
        this.ws.removeAllListeners(); // Remove all event listeners
        this.ws.close();
      }
      this.ws = null;
      return true;
    }
  }

  /**
   * Receives an event from WebSocket and dispatches as "server.{eventName}" and "server.*" events
   * @param {string} eventName
   * @param {{[key: string]: any}} event
   * @returns {true}
   */
  receive(eventName, event) {
    this.log('debug', `received:`, eventName, event);
    this.dispatch(`server.${eventName}`, event);
    this.dispatch('server.*', event);
    return true;
  }

  /**
   * Sends an event to WebSocket and dispatches as "client.{eventName}" and "client.*" events
   * @param {string} eventName
   * @param {{[key: string]: any}} event
   * @returns {true}
   */
  send(eventName, data) {
    if (!this.isConnected()) {
      throw new Error(`RealtimeAPI is not connected`);
    }
    data = data || {};
    if (typeof data !== 'object') {
      throw new Error(`data must be an object`);
    }

    // Compress data if size exceeds a threshold (e.g., 1024 bytes)
    const event = {
      event_id: RealtimeUtils.generateId('evt_'),
      type: eventName,
      ...data,
    };
    const serializedEvent = JSON.stringify(event);
    this.dispatch(`client.${eventName}`, event);
    this.dispatch('client.*', event);
    this.log('debug', `sent:`, eventName, event);
    this.ws.send(serializedEvent);
    return true;
  }
}
