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

import {DocumentObject} from './document';
import {
  sendDocumentUploadMessage,
  sendOpenMessage,
  sendCloseMessage,
  sendRequestMessage,
  sendAccountUpdateMessage,
  createDataUpdateMessage
} from "./syncMessage";
import {rtObjSync} from "./proto/messages";
import {toBuffer} from './utils';


export class RealtimeSyncClient {
  private serverURL: string = '';
  public ws: WebSocket|null = null;
  private handler: any = {close: [], error: [], state: [], account: []};
  private messageHandler: Map<rtObjSync.Message.MessageType, (msg: rtObjSync.Message)=>void>;
  private allAccountGetHandler: ((msg: rtObjSync.Message) => void)| null = null;
  private messageQ: rtObjSync.Message[] = [];
  private isConnected = false;
  private _sessionId = '';
  public document: DocumentObject|null = null;
  private _account: any = {};
  private state: any = {};

  constructor() {
    this.messageHandler = new Map<rtObjSync.Message.MessageType, (msg: rtObjSync.Message)=>void>();
  }

  get sessionId() {
    return this._sessionId;
  }

  get account() {
    return this._account;
  }

  set account(value: any) {
    sendAccountUpdateMessage(this.ws, value);
    this._account = value;
  }

  getState = () => this.state;

  setState = (key: string, value: any) => {
    if (!this.ws) return;
    const message = createDataUpdateMessage({
      sessionId: '',
      target: rtObjSync.TargetType.STATE,
      opType: rtObjSync.Operation.ADD,
      revision: 0,
      targetKey: [key],
      data: value
    });
    this.ws.send(message);
    this.state[key] = value;
  }

  delState = (key: string) => {
    if (!this.ws) return;
    const message = createDataUpdateMessage({
      sessionId: '',
      target: rtObjSync.TargetType.STATE,
      opType: rtObjSync.Operation.DEL,
      revision: 0,
      targetKey: [key],
    });
    this.ws.send(message);
    delete this.state[key];
  }

  onError = () => {
    this.handler['error'].forEach((f: Function) => {f()})
  }

  onClose = () => {
    this.isConnected = false;
    this.handler['close'].forEach((f: Function) => {f()})
  }

  onMessage = (message: MessageEvent) => {
    const msgTypeEnum = rtObjSync.Message.MessageType;
    const msg = rtObjSync.Message.decode(toBuffer(message.data));
    const func = this.messageHandler.get(msg.msgType);
    if (func) {
      func(msg);
      return;
    }
    if (msg.msgType === msgTypeEnum.ACCOUNT_NOTIFY && msg.accountNotify && msg.accountNotify.sessionId) {
      const sessionId = msg.accountNotify.sessionId;
      // @ts-ignore
      const opType = ['ADD', 'DEL', 'MOV'][msg.accountNotify.opType];
      const info = msg.accountNotify.accountInfo;
      this.handler.account.forEach(
        (f: (sessionId: string, opType: string, info: any) => void) => {
          f(sessionId, opType, info ? JSON.parse(info) : null);
        });
      return;
    }
    if (msg.msgType === msgTypeEnum.ACCOUNT_ALL && this.allAccountGetHandler) {
      this.allAccountGetHandler(msg);
      return;
    }
    if (msg.msgType === msgTypeEnum.DATA_UPDATE && msg.data && msg.data.target === rtObjSync.TargetType.STATE && msg.data.sessionId) {
      const sessionId = msg.data.sessionId;
      // @ts-ignore
      const opType = ['ADD', 'DEL', 'MOV'][msg.data.opType];
      const key: string|null = !msg.data.targetKey ? null : msg.data.targetKey;
      const data = msg.data.data;
      this.handler.state.forEach(
        (f: (sessionId: string, opType: string, key: string|null, data: any) => void) => {
          f(sessionId, opType, key, data ? JSON.parse(data) : null)
        });
      return;
    }

    if (!this.isConnected) {
      this.messageQ.push(msg);
      return;
    }
    this.processMessageForDocument(msg);
  }

  public addListener = (target: string, func: Function) => {
    const array = this.handler[target];
    if (!array) return;
    if (array.indexOf(func) > -1) return;
    array.push(func);
  }

  public removeListener = (target: string, func: Function) => {
    const array = this.handler[target];
    if (!array || array.indexOf(func) === -1) return;
    this.handler[target] = array.filter((f: Function) => f != func);
  }

  public open = async (serverURL: string, token: string, accountInfo: any, documentName: string, initialData?: any): Promise<boolean> => {
    this.serverURL = serverURL;
    this.ws = new WebSocket(this.serverURL);
    this.ws.binaryType = 'arraybuffer';
    this.ws.onerror = this.onError;
    this.ws.onmessage = this.onMessage;
    this.ws.onclose = this.onClose;
    const result = await this.waitSocketOpen()
    if (!result) return false;
    sendOpenMessage(this.ws, token, accountInfo);

    const response = await this.waitConnectedOrCloseMessage();
    if (response.msgType === rtObjSync.Message.MessageType.CLOSE) return this.isConnected;
    this.document = new DocumentObject(this, documentName);

    if (response.connected && response.connected.sessionId) {
      this._sessionId = response.connected.sessionId;
      if (response.connected.hasInitialData && response.connected.data && response.connected.revision) {
        this.document.setDocument(response.connected.data, response.connected.revision);
      }
    }
    else {
      if (initialData) {
        this.document.setDocument(JSON.stringify(initialData), 0);
        sendDocumentUploadMessage(this.ws, initialData);
      }
    }

    // TODO: messageQに溜まっているここまでの変更分を適用する
    this.isConnected = true;
    return this.isConnected;
  }

  public close = () => {
    if (!this.ws) return;
    sendCloseMessage(this.ws, 0);
    this.isConnected = false;
    this._sessionId = '';
  }

  public disconnect = () => {
    if (!this.ws) return;
    this.ws.close();
    this.ws = null;
  }

  public getAllAccounts = async (): Promise<any> => {
    const p:Promise<rtObjSync.Message> = new Promise((resolve) => {
      this.allAccountGetHandler = (msg: rtObjSync.Message) => {
        if (msg.msgType !== rtObjSync.Message.MessageType.ACCOUNT_ALL || !msg.accountAll || !msg.accountAll.allAccounts) return;
        this.allAccountGetHandler = null;
        resolve(JSON.parse(msg.accountAll.allAccounts));
      }
    });
    sendRequestMessage(this.ws, rtObjSync.ReqType.ALL_ACCOUNT);
    return p;
  }

  private waitSocketOpen = (): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      if (!this.ws) {
        reject(false);
      } else {
        this.ws.onopen = () => resolve(true);
      }
    });
  }

  private waitConnectedOrCloseMessage = (): Promise<rtObjSync.Message> => {
    return new Promise((resolve) => {
      const func = (msg: rtObjSync.Message) => {
        this.messageHandler.delete(rtObjSync.Message.MessageType.CONNECTED);
        this.messageHandler.delete(rtObjSync.Message.MessageType.CLOSE);
        resolve(msg);
      }
      this.messageHandler.set(rtObjSync.Message.MessageType.CONNECTED, func);
      this.messageHandler.set(rtObjSync.Message.MessageType.CLOSE, func);
    });
  }

  private processMessageForDocument = (msg: rtObjSync.Message) => {
    console.log(msg);
  }

  // private accountUpdated = (before: any, after: any) => {
  //   console.log(">>account:", before, after);
  // }
  //
  // private stateUpdated = (before: any, after: any) => {
  //   console.log(">>state:", before, after);
  // }

}