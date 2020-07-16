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

import {Logger} from './logger';
import {ExtWebSocket} from './extWebsock';
import {rtJsonSync} from "./proto/messages";
import {
  createAccountNotifyMessage, createDataUpdateMessage,
  sendAccountAllMessage, sendConnectedMessage
} from "./syncMessage";
import {IDataUpdate} from './server';

export class SyncDocument {
  private readonly documentName: string;
  private users: Map<ExtWebSocket, string>;
  private document: any = null;
  private accounts: any = {};
  private states: any = {};

  constructor(documentName: string) {
    this.documentName = documentName;
    this.users = new Map<ExtWebSocket, string>();
  }

  getCount = () => this.users.size;

  broadcast = (message: any, exclude?: string) => {
    this.users.forEach((sessionId: string, ws: ExtWebSocket) => {
      if (sessionId === exclude) return;
      ws.send(message);
    });
  }

  addUser = (ws: ExtWebSocket, sessionId: string, accountInfo: string) => {
    this.users.set(ws, sessionId);
    this.accounts[sessionId] = JSON.parse(accountInfo);
    this.states[sessionId] = {};
    const message = createAccountNotifyMessage(sessionId, rtJsonSync.Operation.ADD, this.accounts[sessionId]);
    Logger.Debug(`add user: ${accountInfo} => sessionId: ${sessionId}`);
    this.broadcast(message, sessionId);
    sendConnectedMessage(ws, sessionId, this.document ? this.document: undefined);
  }

  delUser = (ws: ExtWebSocket) => {
    const sessionId = this.users.get(ws);
    if (!sessionId) return;
    this.users.delete(ws);
    delete this.accounts[sessionId];
    delete this.states[sessionId];
    const message = createAccountNotifyMessage(sessionId, rtJsonSync.Operation.DEL, null);
    Logger.Debug(`del user of sessionId: ${sessionId}`);
    this.broadcast(message);
  }

  setDocument = (data: string) => {
    this.document = JSON.parse(data);
  }

  replyAllAccounts = (ws: ExtWebSocket) => {
    sendAccountAllMessage(ws, this.documentName, this.accounts);
  }

  updateAccountInfo = (ws: ExtWebSocket, accountInfo: string) => {
    const sessionId = this.users.get(ws);
    if (!sessionId) return;
    this.accounts[sessionId] = JSON.parse(accountInfo);
    const message = createAccountNotifyMessage(sessionId, rtJsonSync.Operation.MOD, this.accounts[sessionId]);
    console.log(this.accounts[sessionId])
    this.broadcast(message, sessionId);
  }

  updateState = (ws: ExtWebSocket, info: IDataUpdate) => {
    const sessionId = this.users.get(ws);
    if (!sessionId) return;

    info.data = JSON.parse(info.data);
    const keyArray: any = JSON.parse(info.targetKey);
    if (!keyArray) return;
    if (keyArray.length === 0) {
      this.states[sessionId] = info.data;
    }
    else {
      let target: any = this.states[sessionId];
      const lastKey: string = keyArray.pop();
      for (let i = 0; i < keyArray.length; i++) {
        if (!target || !target.hasOwnProperty(keyArray[i])) {
          target = null;
          break;
        }
        target = target[keyArray[i]];
      }
      if (!target) return;
      if (info.opType === rtJsonSync.Operation.DEL) {
        // @ts-ignore
        delete target[lastKey];
      } else {
        target[lastKey] = info.data;
      }
      keyArray.push(lastKey)
    }

    const message = createDataUpdateMessage(sessionId, info.target, info.opType, info.revision, keyArray, info.data);
    this.broadcast(message, sessionId);
  }

  updateDocument = (ws: ExtWebSocket, info: IDataUpdate) => {

  }
}
