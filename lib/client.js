import { RealtimeEventHandler } from './event_handler.js';
import { RealtimeAPI } from './api.js';
import { RealtimeConversation } from './conversation.js';
import { RealtimeUtils } from './utils.js';

export class RealtimeClient extends RealtimeEventHandler {
  constructor({ url, apiKey, dangerouslyAllowAPIKeyInBrowser, debug } = {}) {
    super();
    this.defaultSessionConfig = {
      modalities: ['text', 'audio'],
      instructions: '',
      voice: 'verse',
      input_audio_format: 'pcm16',
      output_audio_format: 'pcm16',
      input_audio_transcription: null,
      turn_detection: null,
      tools: [],
      tool_choice: 'auto',
      temperature: 0.8,
      max_response_output_tokens: 4096,
    };
    this.sessionConfig = {};
    this.transcriptionModels = [
      { model: 'whisper-1' },
    ];
    this.defaultServerVadConfig = {
      type: 'server_vad',
      threshold: 0.5,
      prefix_padding_ms: 300,
      silence_duration_ms: 200,
    };
    this.realtime = new RealtimeAPI({
      url,
      apiKey,
      dangerouslyAllowAPIKeyInBrowser,
      debug,
    });
    this.conversation = new RealtimeConversation();
    this._resetConfig();
    this._addAPIEventHandlers();
    this.reconnectDelay = 5000; // Reconnection delay
    this.debug = debug || false; // Control debug logs
  }


  updateSession({
    modalities = void 0,
    instructions = void 0,
    voice = void 0,
    input_audio_format = void 0,
    output_audio_format = void 0,
    input_audio_transcription = void 0,
    turn_detection = void 0,
    tools = void 0,
    tool_choice = void 0,
    temperature = void 0,
    max_response_output_tokens = void 0,
  } = {}) {
    modalities !== void 0 && (this.sessionConfig.modalities = modalities);
    instructions !== void 0 && (this.sessionConfig.instructions = instructions);
    voice !== void 0 && (this.sessionConfig.voice = voice);
    input_audio_format !== void 0 &&
      (this.sessionConfig.input_audio_format = input_audio_format);
    output_audio_format !== void 0 &&
      (this.sessionConfig.output_audio_format = output_audio_format);
    input_audio_transcription !== void 0 &&
      (this.sessionConfig.input_audio_transcription =
        input_audio_transcription);
    turn_detection !== void 0 &&
      (this.sessionConfig.turn_detection = turn_detection);
    tools !== void 0 && (this.sessionConfig.tools = tools);
    tool_choice !== void 0 && (this.sessionConfig.tool_choice = tool_choice);
    temperature !== void 0 && (this.sessionConfig.temperature = temperature);
    max_response_output_tokens !== void 0 &&
      (this.sessionConfig.max_response_output_tokens =
        max_response_output_tokens);
    // Load tools from tool definitions + already loaded tools
    const useTools = [].concat(
      (tools || []).map((toolDefinition) => {
        const definition = {
          type: 'function',
          ...toolDefinition,
        };
        if (this.tools[definition?.name]) {
          throw new Error(
            `Tool "${definition?.name}" has already been defined`,
          );
        }
        return definition;
      }),
      Object.keys(this.tools).map((key) => {
        return {
          type: 'function',
          ...this.tools[key].definition,
        };
      }),
    );
    const session = { ...this.sessionConfig };
    session.tools = useTools;
    if (this.realtime.isConnected()) {
      this.realtime.send('session.update', { session });
    }
    return true;
  }

  _resetConfig() {
    this.sessionCreated = false;
    this.tools = {};
    this.sessionConfig = JSON.parse(JSON.stringify(this.defaultSessionConfig));
    this.inputAudioBuffer = new Int16Array(0);
    return true;
  }

  _addAPIEventHandlers() {
    this.realtime.on('client.*', (event) => {
      if (this.debug) {
        const realtimeEvent = {
          time: new Date().toISOString(),
          source: 'client',
          event: event,
        };
        this.dispatch('realtime.event', realtimeEvent);
      }
    });

    this.realtime.on('server.*', (event) => {
      if (this.debug) {
        const realtimeEvent = {
          time: new Date().toISOString(),
          source: 'server',
          event: event,
        };
        this.dispatch('realtime.event', realtimeEvent);
      }
    });

    this.realtime.on('server.session.created', () => {
      this.sessionCreated = true;
    });

    const handlerWithDispatch = (event, ...args) => {
      try {
        const { item, delta } = this.conversation.processEvent(event, ...args);
        if (item) {
          this.dispatch('conversation.updated', { item, delta });
        }
        return { item, delta };
      } catch (error) {
        console.error(`Error processing event: ${error.message}`);
        return {};
      }
    };

    this.realtime.on('server.conversation.item.created', (event) => {
      const { item } = handlerWithDispatch(event);
      if (item) {
        this.dispatch('conversation.item.appended', { item });
        if (item.status === 'completed') {
          this.dispatch('conversation.item.completed', { item });
        }
      }
    });

    this.realtime.on('server.response.output_item.done', async (event) => {
      const { item } = handlerWithDispatch(event);
      if (item && item.status === 'completed' && item.formatted.tool) {
        await this.callTool(item.formatted.tool);
      }
    });

    return true;
  }

  async callTool(tool) {
    try {
      const jsonArguments = JSON.parse(tool.arguments);
      const toolConfig = this.tools[tool.name];
      if (!toolConfig) {
        throw new Error(`Tool "${tool.name}" has not been added`);
      }
      const result = await toolConfig.handler(jsonArguments);
      this.realtime.send('conversation.item.create', {
        item: {
          type: 'function_call_output',
          call_id: tool.call_id,
          output: JSON.stringify(result),
        },
      });
    } catch (e) {
      this.realtime.send('conversation.item.create', {
        item: {
          type: 'function_call_output',
          call_id: tool.call_id,
          output: JSON.stringify({ error: e.message }),
        },
      });
    }
    this.createResponse();
  }

  async waitForSessionCreated() {
    if (!this.isConnected()) {
      throw new Error(`Not connected, use .connect() first`);
    }
    while (!this.sessionCreated) {
      await new Promise((r) => setTimeout(r, 50)); // Increased delay to reduce CPU usage
    }
    return true;
  }

  reset() {
    this.disconnect();
    this.clearEventHandlers();
    this.realtime.clearEventHandlers(); // Ensure listeners are removed
    this._resetConfig();
    this._addAPIEventHandlers();
    return true;
  }

  async connect() {
    if (this.isConnected()) {
      throw new Error(`Already connected, use .disconnect() first`);
    }
    try {
      await this.realtime.connect();
      this.updateSession();
    } catch (error) {
      console.error(`Connection failed: ${error.message}`);
      setTimeout(() => this.connect(), this.reconnectDelay); // Retry connection after delay
    }
    return true;
  }

  disconnect() {
    this.sessionCreated = false;
    if (this.realtime.isConnected()) {
      this.realtime.disconnect();
    }
    this.conversation.clear();
  }

  appendInputAudio(arrayBuffer) {
    if (arrayBuffer.byteLength > 0) {
      const base64Audio = RealtimeUtils.arrayBufferToBase64(arrayBuffer);
      this.realtime.send('input_audio_buffer.append', { audio: base64Audio });
      this.inputAudioBuffer = new Int16Array([
        ...this.inputAudioBuffer,
        ...new Int16Array(arrayBuffer),
      ]);
    }
    return true;
  }

  sendUserMessageContent(content = []) {
    if (content.length) {
      for (const c of content) {
        if (c.type === 'input_audio' && (c.audio instanceof ArrayBuffer || c.audio instanceof Int16Array)) {
          c.audio = RealtimeUtils.arrayBufferToBase64(c.audio);
        }
      }
      this.realtime.send('conversation.item.create', {
        item: {
          type: 'message',
          role: 'user',
          content,
        },
      });
    }
    this.createResponse();
    return true;
  }

  createResponse() {
    if (
      this.getTurnDetectionType() === null &&
      this.inputAudioBuffer.byteLength > 0
    ) {
      this.realtime.send('input_audio_buffer.commit');
      this.conversation.queueInputAudio(this.inputAudioBuffer);
      this.inputAudioBuffer = new Int16Array(0);
    }
    this.realtime.send('response.create');
    return true;
  }
}
