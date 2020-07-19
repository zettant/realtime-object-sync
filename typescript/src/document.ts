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
import {createDataUpdateMessage} from "./syncMessage";
import {rtObjSync} from "./proto/messages";


const KEY_PRESERVE_LEVEL = 3;

export interface IDocumentNode {
  parent: IDocumentNode|null;
  children: {[key: string]: IDocumentNode};
  name: string;
  level: number;
  level1Key: string;
  keys?: string[];
  value: any;
}

export class DocumentObject {
  private client: RealtimeSyncClient;
  private readonly documentNode: IDocumentNode;
  private autoNodeCreateLevel: {[key: string]: number} = {};

  constructor(client: RealtimeSyncClient) {
    this.client = client;
    this.documentNode = { parent: null, children: {}, name: 'root', level: 0, level1Key: '', keys:[], value: null };
  }

  public getDocumentNode = () => this.documentNode;

  public setDocument = (doc: any, noSync?: boolean) => {
    Object.keys(doc).forEach((name: string) => {
      const newNode: IDocumentNode = this.addLevel1(name, doc[name], noSync, true);
      this.setChildRecursive(newNode, doc[name], noSync)
    });
  }

  public setChildRecursive = (node: IDocumentNode, value: any, noSync?: boolean) => {
    if (typeof value !== 'object') return;
    Object.keys(value).forEach((name: string) => {
      const newNode = this.addChildNode(node, name, value[name], noSync, true);
      if (newNode.level <= this.autoNodeCreateLevel[newNode.level1Key]) { // 一定の階層までしか管理しない
        this.setChildRecursive(newNode, value[name], noSync)
      }
    });
  }

  public setAutoNodeCreation = (key: string, autoNodeLevel: number) => {
    this.autoNodeCreateLevel[key] = autoNodeLevel < 0 ? KEY_PRESERVE_LEVEL : autoNodeLevel;
  }

  public addLevel1 = (key: string, value: any, noSync?: boolean, isRecursive?: boolean): IDocumentNode => {
    return this.addChildNode(this.documentNode, key, value, noSync, isRecursive);
  }

  public addChildNode = (parent: IDocumentNode, key: string, value: any, noSync?: boolean, isRecursive?: boolean): IDocumentNode => {
    if (parent.children[key]) {
      parent.children[key].value = value;
    }
    else {
      parent.children[key] = {
        parent,
        children: {},
        name: key,
        level: parent.level+1,
        level1Key: parent.level1Key,
        value
      }
      if (parent.level === 0) parent.children[key].level1Key = key;
      if (!isRecursive || parent.children[key].level <= this.autoNodeCreateLevel[parent.children[key].level1Key]) {
        if (!parent.keys) parent.keys = this.getKeyHierarchy(parent);
        parent.children[key].keys = parent.keys.concat([key]);
      }
    }

    // @ts-ignore
    const keys: string[] = parent.children[key].keys ? parent.children[key].keys : this.getKeyHierarchy(parent.children[key]);
    if (!noSync) this.addRemote(keys, value);
    return parent.children[key];
  }

  public removeChild = (parent: IDocumentNode, key: string, noSync?: boolean) => {
    if (!parent.children[key]) return;
    if (!noSync) {
      // @ts-ignore
      const keys: string[] = parent.children[key].keys ? parent.children[key].keys : this.getKeyHierarchy(parent.children[key]);
      this.delRemote(keys)
    }
    delete parent.children[key];
  }

  public removeNode = (node: IDocumentNode, noSync?: boolean) => {
    if (!node.parent || !node.name || !node.parent.children[node.name]) return;
    if (!noSync) {
      // @ts-ignore
      const keys: string[] = parent.children[key].keys ? parent.children[key].keys : this.getKeyHierarchy(parent.children[key]);
      this.delRemote(keys)
    }
    delete node.parent.children[node.name];
  }

  public getNodeAt = (keys: string[]): IDocumentNode => {
    let node: IDocumentNode = this.documentNode;
    keys.forEach((k) => {
      node = node.children[k];
    });
    return node;
  }

  private getKeyHierarchy = (startNode: IDocumentNode): string[] => {
    const keys: string[] = [];
    let parent = startNode.parent;
    while (parent) {
      if (parent.keys) return parent.keys.concat(keys);
      keys.unshift(parent.name);
    }
    return keys;
  }

  private addRemote = (keys: string[], value: any) => {
    if (!this.client.ws) return;
    const message = createDataUpdateMessage({
      sessionId: this.client.sessionId,
      target: rtObjSync.TargetType.DOCUMENT,
      opType: rtObjSync.Operation.ADD,
      revision: 0,
      targetKey: keys,
      data: value
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

  public dump = () => {  // for debugging
    const result = {keys: [], children: {} as any};
    Object.keys(this.documentNode.children).forEach((n) => {
      result.children[n] = this.dumpNode(this.documentNode.children[n]);
    })
    return JSON.stringify(result);
  }

  private dumpNode = (node: IDocumentNode) => {
    const result = {keys: node.keys, children: {} as any};//, value: node.value};
    Object.keys(node.children).forEach((n) => {
      result.children[n] = this.dumpNode(node.children[n]);
    })
    return result;
  }
}
