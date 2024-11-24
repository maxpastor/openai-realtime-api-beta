const atob = globalThis.atob || ((base64) => Buffer.from(base64, 'base64').toString('binary'));
const btoa = globalThis.btoa || ((binary) => Buffer.from(binary, 'binary').toString('base64'));

export class RealtimeUtils {
  /**
   * Converts Float32Array of amplitude data to ArrayBuffer in Int16Array format
   * Optimized to reduce CPU usage by avoiding unnecessary overhead
   * @param {Float32Array} float32Array
   * @returns {ArrayBuffer}
   */
  static floatTo16BitPCM(float32Array) {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new Int16Array(buffer);
    for (let i = 0; i < float32Array.length; i++) {
      view[i] = Math.max(-1, Math.min(1, float32Array[i])) * 0x7fff;
    }
    return buffer;
  }

  /**
   * Converts a base64 string to an ArrayBuffer
   * @param {string} base64
   * @returns {ArrayBuffer}
   */
  static base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Converts an ArrayBuffer, Int16Array or Float32Array to a base64 string
   * Optimized for large data by using chunks and reducing memory overhead
   * @param {ArrayBuffer|Int16Array|Float32Array} arrayBuffer
   * @returns {string}
   */
  static arrayBufferToBase64(arrayBuffer) {
    if (arrayBuffer instanceof Float32Array) {
      arrayBuffer = this.floatTo16BitPCM(arrayBuffer);
    } else if (arrayBuffer instanceof Int16Array) {
      arrayBuffer = arrayBuffer.buffer;
    }
    const bytes = new Uint8Array(arrayBuffer);
    const chunks = [];
    for (let i = 0; i < bytes.length; i += 0x8000) {
      const chunk = bytes.subarray(i, i + 0x8000);
      chunks.push(String.fromCharCode(...chunk));
    }
    return btoa(chunks.join(''));
  }

  /**
   * Merge two Int16Arrays from Int16Arrays or ArrayBuffers
   * Optimized using set to reduce CPU usage during merging
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
    newValues.set(left, 0);
    newValues.set(right, left.length);
    return newValues;
  }

  static generateId(prefix, length = 21) {
    // base58; non-repeating chars
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const str = Array(length - prefix.length)
      .fill(0)
      .map((_) => chars[Math.floor(Math.random() * chars.length)])
      .join('');
    return `${prefix}${str}`;
  }
}
