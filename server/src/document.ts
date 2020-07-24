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

import * as AsyncLock from 'async-lock';
import {Logger} from './logger';
import {ExtWebSocket} from './extWebsock';
import {rtObjSync} from "./proto/messages";
import {
  createAccountNotifyMessage, createDataUpdateMessage,
  sendAccountAllMessage, sendConnectedMessage
} from "./syncMessage";
import {IDataUpdate} from './syncMessage';


export class SyncDocument {
  private readonly documentName: string;
  private users: Map<ExtWebSocket, string>;
  private revision = 0;
  private document: any = {};
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
      try {
        ws.send(message);
      } catch {}
    });
  }

  addUser = (ws: ExtWebSocket, sessionId: string, accountInfo: string) => {
    this.users.set(ws, sessionId);
    this.accounts[sessionId] = JSON.parse(accountInfo);
    this.states[sessionId] = {};
    const message = createAccountNotifyMessage(sessionId, rtObjSync.Operation.ADD, this.accounts[sessionId]);
    Logger.Debug(`add user: ${accountInfo} => sessionId: ${sessionId}`);
    this.broadcast(message, sessionId);
    sendConnectedMessage(ws,
      sessionId,
      Object.keys(this.document).length > 0 ? this.document: undefined,
      this.document ? this.document.revision : undefined);
  }

  delUser = (ws: ExtWebSocket) => {
    const sessionId = this.users.get(ws);
    if (!sessionId) return;
    this.users.delete(ws);
    delete this.accounts[sessionId];
    delete this.states[sessionId];
    const message = createAccountNotifyMessage(sessionId, rtObjSync.Operation.DEL, null);
    Logger.Debug(`del user of sessionId: ${sessionId}`);
    this.broadcast(message);
  }

  setDocument = (data: string) => {
    if (Object.keys(this.document).length > 0) return; // すでに登録済みなら、更に上書きはしない
    // TODO: 初期データをセットするタイミングとセット前に他の人が編集してしまった場合の対処
    //console.log("setDocument:", data);
    this.document = JSON.parse(data);
  }

  replyAllAccounts = (ws: ExtWebSocket) => {
    sendAccountAllMessage(ws, this.documentName, this.accounts);
  }

  updateAccountInfo = (ws: ExtWebSocket, accountInfo: string) => {
    const sessionId = this.users.get(ws);
    if (!sessionId) return;
    this.accounts[sessionId] = JSON.parse(accountInfo);
    const message = createAccountNotifyMessage(sessionId, rtObjSync.Operation.ADD, this.accounts[sessionId]);
    this.broadcast(message, sessionId);
  }


  updateData = (target: any, keyArray: string[], info: IDataUpdate): boolean => {
    const lastKey: string | undefined = keyArray.pop();
    if (!lastKey) return false;

    for (let i = 0; i < keyArray.length; i++) {
      if (!target || !target.hasOwnProperty(keyArray[i])) {
        target = null;
        break;
      }
      target = target[keyArray[i]];
    }
    if (!target) return false;
    if (info.opType === rtObjSync.Operation.DEL) {
      if (!target[lastKey]) return false;
      delete target[lastKey];
    } else {
      target[lastKey] = info.data;
    }
    keyArray.push(lastKey)
    return true;
  }

  updateState = (ws: ExtWebSocket, info: IDataUpdate) => {
    const sessionId = this.users.get(ws);
    if (!sessionId) return;

    info.data = JSON.parse(info.data);
    const keyArray: any = JSON.parse(info.targetKey);
    if (!keyArray) return null;

    if (keyArray.length === 0) {
      this.states[sessionId] = info.data;
    }
    else {
      if (!this.updateData(this.states[sessionId], keyArray, info)) return null;
    }
    this.broadcast(createDataUpdateMessage(
      {sessionId, target: info.target, opType: info.opType,
        revision: info.revision, targetKey: keyArray, data: info.data}
        ), sessionId);
  }

  updateDocument = async (ws: ExtWebSocket, info: IDataUpdate) => {
    const sessionId = this.users.get(ws);
    if (!sessionId) return;

    const lock = new AsyncLock();
    await lock.acquire(this.documentName, () => {

      info.data = JSON.parse(info.data);
      const keyArray: any = JSON.parse(info.targetKey);
      if (!keyArray) return;

      if (!this.updateData(this.document, keyArray, info)) return;
      this.revision += 1;
      this.broadcast(createDataUpdateMessage(
        {sessionId, target: info.target, opType: info.opType,
          revision: this.revision, targetKey: keyArray, data: info.data}
      ), sessionId);
      // console.log(">>>revision:", this.revision);
      // console.log(JSON.stringify(this.document));
    });
  }
}
