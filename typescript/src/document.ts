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

export const DOCUMENT_NODE_NAME = '__DOCNODE__';
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
    this.document[DOCUMENT_NODE_NAME] = {
      parent: null,
      name: 'root',
      level: 0,
      level1Key: '',
      keys: []
    };
  }

  public makeTopNodeInDocument = (key: string, autoNodeLevel: number, func: ((sessionId: string, opType: string, keys: string[], data: any)=>void)|null) => {
    this.autoNodeCreateLevel[key] = autoNodeLevel < 0 ? KEY_PRESERVE_LEVEL : autoNodeLevel;

    this.setNode(this.document, this.document[key], key, true);
    if (typeof this.document[key] !== 'object') return;

    Object.keys(this.document[key]).forEach((name: string) => {
      if (name === DOCUMENT_NODE_NAME) return;
      this.setChildNodeRecursive(this.document[key], this.document[key][name], name, true)
    });
    if (func) this.client.addListenerForDocumentMessage(key, func);
  }

  public setChildNodeRecursive = (parent: any, node: any, nodeName: string, noSync?: boolean) => {
    if (typeof node !== 'object') {
      if (!noSync) this.addRemote(parent[DOCUMENT_NODE_NAME].keys, node);
      return;
    }
    this.setNode(parent, node, nodeName, noSync);

    Object.keys(node).forEach((name: string) => {
      if (name === DOCUMENT_NODE_NAME) return;
      if (node[DOCUMENT_NODE_NAME].level < this.autoNodeCreateLevel[node[DOCUMENT_NODE_NAME].level1Key]) { // 一定の階層までしか管理しない
        this.setChildNodeRecursive(node, node[name], name, noSync)
      }
    });
  }

  setNode = (parent: any, node: any, nodeName: string, noSync?: boolean) => {
    node[DOCUMENT_NODE_NAME] = {
      parent,
      name: nodeName,
      level: parent[DOCUMENT_NODE_NAME].level + 1,
      level1Key: parent[DOCUMENT_NODE_NAME].level === 0 ? nodeName : parent[DOCUMENT_NODE_NAME].level1Key,
      keys: parent[DOCUMENT_NODE_NAME].keys.concat([nodeName])
    };
    if (!noSync) this.addRemote(node[DOCUMENT_NODE_NAME].keys, node);
  }

  public addChildNode = (parent: any, key: string, value: any, noSync?: boolean, noKeyCreate?: boolean): any => {
    parent[key] = value;
    if (typeof value === 'object' && !noKeyCreate) {
      this.setNode(parent, parent[key], key, noSync);
    } else {
      const keys = parent[DOCUMENT_NODE_NAME].keys.concat(key)
      if (!noSync) this.addRemote(keys, value);
    }
    return parent[key];
  }

  public removeChildNode = (parent: any, key: string, noSync?: boolean) => {
    if (!parent[key]) return;
    if (!noSync) this.delRemote(parent[DOCUMENT_NODE_NAME].keys.concat([key]));
    delete parent[key];
  }

  public removeNode = (node: any, noSync?: boolean) => {
    const myName = node[DOCUMENT_NODE_NAME].name;
    if (!node[DOCUMENT_NODE_NAME].parent[myName]) return;
    if (!noSync) this.delRemote(node[DOCUMENT_NODE_NAME].keys);
    delete node[DOCUMENT_NODE_NAME].parent[myName];
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
