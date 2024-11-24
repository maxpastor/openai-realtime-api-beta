import { RealtimeUtils } from './utils.js';

export class RealtimeConversation {
  defaultFrequency = 24_000; // 24,000 Hz

  constructor() {
    this.clear();
  }

  clear() {
    this.itemLookup = {};
    this.items = [];
    this.responseLookup = {};
    this.responses = [];
    this.queuedSpeechItems = {};
    this.queuedTranscriptItems = {};
    this.queuedInputAudio = null;

    // Buffer circulaire pour audio
    this.audioBuffer = new CircularBuffer(10_000); // Taille configurable
    return true;
  }

  queueInputAudio(inputAudio) {
    this.queuedInputAudio = inputAudio;
    return inputAudio;
  }

  processEvent(event, ...args) {
    if (!event.event_id) {
      console.error(event);
      throw new Error(`Missing "event_id" on event`);
    }
    if (!event.type) {
      console.error(event);
      throw new Error(`Missing "type" on event`);
    }
    const eventProcessor = this.EventProcessors[event.type];
    if (!eventProcessor) {
      throw new Error(
        `Missing conversation event processor for "${event.type}"`,
      );
    }
    try {
      return eventProcessor.call(this, event, ...args);
    } catch (error) {
      console.error(`Error processing event "${event.type}":`, error.message);
      return { item: null, delta: null };
    }
  }

  getItem(id) {
    return this.itemLookup[id] || null;
  }

  getItems() {
    return this.items.slice();
  }

  EventProcessors = {
    'conversation.item.created': (event) => {
      const { item } = event;
      const newItem = JSON.parse(JSON.stringify(item)); // Deep copy
      if (!this.itemLookup[newItem.id]) {
        this.itemLookup[newItem.id] = newItem;
        this.items.push(newItem);
      }
      newItem.formatted = {
        audio: new Int16Array(0),
        text: '',
        transcript: '',
      };

      if (this.queuedSpeechItems[newItem.id]) {
        newItem.formatted.audio = this.queuedSpeechItems[newItem.id].audio;
        delete this.queuedSpeechItems[newItem.id];
      }

      if (newItem.content) {
        const textContent = newItem.content.filter((c) =>
          ['text', 'input_text'].includes(c.type),
        );
        for (const content of textContent) {
          newItem.formatted.text += content.text;
        }
      }

      if (this.queuedTranscriptItems[newItem.id]) {
        newItem.formatted.transcript =
          this.queuedTranscriptItems[newItem.id].transcript;
        delete this.queuedTranscriptItems[newItem.id];
      }

      if (newItem.type === 'message') {
        newItem.status = newItem.role === 'user' ? 'completed' : 'in_progress';
        if (this.queuedInputAudio) {
          newItem.formatted.audio = this.queuedInputAudio;
          this.queuedInputAudio = null;
        }
      } else if (newItem.type === 'function_call') {
        newItem.formatted.tool = {
          type: 'function',
          name: newItem.name,
          call_id: newItem.call_id,
          arguments: '',
        };
        newItem.status = 'in_progress';
      } else if (newItem.type === 'function_call_output') {
        newItem.status = 'completed';
        newItem.formatted.output = newItem.output;
      }
      return { item: newItem, delta: null };
    },

    'conversation.item.deleted': (event) => {
      const { item_id } = event;
      const item = this.itemLookup[item_id];
      if (!item) {
        console.error(`Item "${item_id}" not found`);
        return { item: null, delta: null };
      }
      delete this.itemLookup[item.id];
      const index = this.items.indexOf(item);
      if (index > -1) {
        this.items.splice(index, 1);
      }
      return { item, delta: null };
    },

    'response.audio.delta': (event) => {
      const { item_id, delta } = event;
      const item = this.itemLookup[item_id];
      if (!item) {
        console.error(`Item "${item_id}" not found`);
        return { item: null, delta: null };
      }

      try {
        const arrayBuffer = RealtimeUtils.base64ToArrayBuffer(delta);
        const appendValues = new Int16Array(arrayBuffer);

        // Utilisation du buffer circulaire
        this.audioBuffer.append(appendValues);
        item.formatted.audio = this.audioBuffer.getAll();

        return { item, delta: { audio: appendValues } };
      } catch (error) {
        console.error(`Error in audio delta processing: ${error.message}`);
        return { item: null, delta: null };
      }
    },

    'response.text.delta': (event) => {
      const { item_id, delta } = event;
      const item = this.itemLookup[item_id];
      if (!item) {
        console.error(`Item "${item_id}" not found`);
        return { item: null, delta: null };
      }

      // Concaténation optimisée via tableau temporaire
      const textParts = [];
      textParts.push(delta);
      item.formatted.text += textParts.join('');

      return { item, delta: { text: delta } };
    },
  };
}

/**
 * CircularBuffer class for managing audio data efficiently
 */
class CircularBuffer {
  constructor(size) {
    this.buffer = new Int16Array(size);
    this.size = size;
    this.start = 0;
    this.end = 0;
    this.length = 0;
  }

  append(data) {
    for (let i = 0; i < data.length; i++) {
      this.buffer[this.end] = data[i];
      this.end = (this.end + 1) % this.size;
      if (this.length < this.size) {
        this.length++;
      } else {
        this.start = (this.start + 1) % this.size; // Écrase les données les plus anciennes
      }
    }
  }

  getAll() {
    const result = new Int16Array(this.length);
    for (let i = 0; i < this.length; i++) {
      result[i] = this.buffer[(this.start + i) % this.size];
    }
    return result;
  }
}
