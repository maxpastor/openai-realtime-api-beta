/**
 * Basic utilities for the RealtimeAPI
 * @class
 */
export class RealtimeUtils {
  /**
   * Converts Float32Array of amplitude data to ArrayBuffer in Int16Array format
   * @param {Float32Array} float32Array
   * @returns {ArrayBuffer}
   */
  static floatTo16BitPCM(float32Array) {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    let offset = 0;
    for (let i = 0; i < float32Array.length; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buffer;
  }

  /**
   * Converts a base64 string to an ArrayBuffer
   * @param {string} base64
   * @returns {ArrayBuffer}
   */
  static base64ToArrayBuffer(base64) {
    const binary = Buffer.from(base64, 'base64');
    return binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength);
  }

  /**
   * Converts an ArrayBuffer, Int16Array or Float32Array to a base64 string
   * @param {ArrayBuffer|Int16Array|Float32Array} arrayBuffer
   * @returns {string}
   */
  static arrayBufferToBase64(arrayBuffer) {
    if (arrayBuffer instanceof Float32Array) {
      arrayBuffer = this.floatTo16BitPCM(arrayBuffer);
    } else if (arrayBuffer instanceof Int16Array) {
      arrayBuffer = arrayBuffer.buffer;
    }
    const buffer = Buffer.from(arrayBuffer);
    return buffer.toString('base64');
  }

  /**
   * Merge two Int16Arrays from Int16Arrays or ArrayBuffers
   * @param {ArrayBuffer|Int16Array} left
   * @param {ArrayBuffer|Int16Array} right
   * @returns {Int16Array}
   */
  static mergeInt16Arrays(left, right) {
    if (left instanceof ArrayBuffer) {
      left = new Int16Array(left);
    }
    if (right instanceof ArrayBuffer) {
      right = new Int16Array(right);
    }
    if (!(left instanceof Int16Array) || !(right instanceof Int16Array)) {
      throw new Error(`Both items must be Int16Array`);
    }
    const newValues = new Int16Array(left.length + right.length);
    newValues.set(left);
    newValues.set(right, left.length);
    return newValues;
  }

  /**
   * Generates an id to send with events and messages
   * @param {string} prefix
   * @param {number} [length]
   * @returns {string}
   */
  static generateId(prefix, length = 21) {
    // base58; non-repeating chars
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const str = Array(length - prefix.length)
      .fill(0)
      .map(() => chars[Math.floor(Math.random() * chars.length)])
      .join('');
    return `${prefix}${str}`;
  }
}
