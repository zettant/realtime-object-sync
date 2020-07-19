/**
 MIT License

 Copyright (c) 2020 Zettant Inc.

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 SOFTWARE.
 */

/**
 * convert array buffer to buffer
 * @param arraybuffer
 */
export const toBuffer = (arraybuffer: any) => {
  const buf = Buffer.alloc(arraybuffer.byteLength);
  const view = new Uint8Array(arraybuffer);
  for (let i = 0; i < buf.length; ++i) {
    buf[i] = view[i];
  }
  return buf;
}

/**
 * Apply document node element info to target object
 * @param target
 * @param opType
 * @param keys
 * @param value
 */
export const convertDocumentNodeElement = (target: any, opType: string, keys: string[], value: any) => {
  if (keys.length === 0) return;
  // @ts-ignore
  const lastKey: string = keys.pop();

  for (let i = 0; i < keys.length; i++) {
    if (!target || !target.hasOwnProperty(keys[i])) {
      target = null;
      break;
    }
    target = target[keys[i]];
  }
  if (!target) return;

  if (opType === 'DEL') {
    if (!target[lastKey]) return;
    delete target[lastKey];
  }
  else {
    target[lastKey] = value;
  }
}