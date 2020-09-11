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

import {RealtimeSyncClient} from './client';
import {createDataUpdateMessage} from './syncMessage';
import {rtObjSync} from './proto/messages';
import {replacer} from './utils';

export const DOCUMENT_META_NODE = '__DOCNODE__';
const KEY_PRESERVE_LEVEL = 3;


export class DocumentObject {
  private client: RealtimeSyncClient;
  private document: any = null;
  private autoNodeCreateLevel: {[key: string]: number} = {};

  constructor(client: RealtimeSyncClient) {
    this.client = client;
  }

  public getDocument = (key?: string) => {
    if (!key) return JSON.parse(JSON.stringify(this.document, replacer));
    return JSON.parse(JSON.stringify(this.document[key], replacer));
  }

  public setDocument = (doc?: any) => {
    this.document = doc ? doc : {};
    this.document[DOCUMENT_META_NODE] = {
      parent: null,
      name: 'root',
      level: 0,
      level1Key: '',
      keys: []
    };
  }

  public makeTopNodeInDocument = (key: string, autoNodeLevel: number, func: ((sessionId: string, opType: string, keys: string[], data: any)=>void)|null) => {
    this.autoNodeCreateLevel[key] = autoNodeLevel < 0 ? KEY_PRESERVE_LEVEL : autoNodeLevel;

    this.setMetaNode(this.document, key, [key]);
    if (Object.prototype.toString.call(this.document[key]) !== '[object Object]') return;

    Object.keys(this.document[key]).forEach((name: string) => {
      if (name === DOCUMENT_META_NODE) return;
      this.setChildMetaNodeRecursive(this.document[key], name)
    });
    if (func) this.client.addListenerForDocumentMessage(key, func);
  }

  public setChildMetaNodeRecursive = (parent: any, nodeName: string) => {
    if (!parent[DOCUMENT_META_NODE]) return null;  // 親が管理下になければ子を追加できない
    if (Object.prototype.toString.call(parent[nodeName]) !== '[object Object]') return;

    const keys = parent[DOCUMENT_META_NODE].keys.concat(nodeName);
    this.setMetaNode(parent, nodeName, keys);

    Object.keys(parent[nodeName]).forEach((name: string) => {
      if (name === DOCUMENT_META_NODE) return;
      if (parent[nodeName][DOCUMENT_META_NODE].level < this.autoNodeCreateLevel[parent[nodeName][DOCUMENT_META_NODE].level1Key]) { // 一定の階層までしか管理しない
        this.setChildMetaNodeRecursive(parent[nodeName], name)
      }
    });
  }

  setMetaNode = (parent: any, nodeName: string, keys: string[]) => {
    parent[nodeName][DOCUMENT_META_NODE] = {
      parent,
      name: nodeName,
      level: parent[DOCUMENT_META_NODE].level + 1,
      level1Key: parent[DOCUMENT_META_NODE].level === 0 ? nodeName : parent[DOCUMENT_META_NODE].level1Key,
      keys: keys
    };
  }

  public addChildNode = (parent: any, key: string, value: any, noSync?: boolean): any => {
    if (!parent[DOCUMENT_META_NODE]) return null;  // 親が管理下になければ子を追加できない
    const keys = parent[DOCUMENT_META_NODE].keys.concat(key)

    parent[key] = value;
    if (Object.prototype.toString.call(value) === '[object Object]') {
      this.setChildMetaNodeRecursive(parent, key);
    }

    if (!noSync) this.addRemote(keys, parent[key]);
    return parent[key];
  }

  public removeChildNode = (parent: any, key: string, noSync?: boolean) => {
    if (!parent[key]) return;
    if (!noSync) this.delRemote(parent[DOCUMENT_META_NODE].keys.concat([key]));
    delete parent[key];
  }

  public removeNode = (node: any, noSync?: boolean) => {
    const myName = node[DOCUMENT_META_NODE].name;
    if (!node[DOCUMENT_META_NODE].parent[myName]) return;
    if (!noSync) this.delRemote(node[DOCUMENT_META_NODE].keys);
    delete node[DOCUMENT_META_NODE].parent[myName];
  }

  public getNodeAt = (keys: string[]): any => {
    let node: any = this.document;
    let flag = true;
    keys.forEach((k) => {
      if (!node[k]) {
        flag = false;
        return;
      }
      node = node[k]
    });
    return flag ? node : null;
  }

  private addRemote = (keys: string[], value: any) => {
    if (!this.client.ws) return;
    const message = createDataUpdateMessage({
      sessionId: this.client.sessionId,
      target: rtObjSync.TargetType.DOCUMENT,
      opType: rtObjSync.Operation.ADD,
      revision: 0,
      targetKey: keys,
      data: JSON.parse(JSON.stringify(value, replacer))
    });
    this.client.ws.send(message);
  }

  private delRemote = (keys: string[]) => {
    if (!this.client.ws) return;
    const message = createDataUpdateMessage({
      sessionId: this.client.sessionId,
      target: rtObjSync.TargetType.DOCUMENT,
      opType: rtObjSync.Operation.DEL,
      revision: 0,
      targetKey: keys
    });
    this.client.ws.send(message);
  }

  dumpNode = (node?: any) => {
    const replacer2 = (key: string, value: any) => {
      return key === 'parent' ? undefined : value;
    }
    return JSON.stringify(node ? node : this.document, replacer2);
  }
}
