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

import * as jwt from 'jsonwebtoken';
import {Logger} from './logger';
import {rtJsonSync} from "./proto/messages";
import {ExtWebSocket} from './extWebsock';
import {SyncDocument} from './document';
import {sendCloseMessage} from './syncMessage';


export interface IDataUpdate {
  sessionId: string,
  target: number,
  opType: number,
  revision: number,
  targetKey: any,
  data?: any
}

export class SyncServer {
  private documents: {[key: string]: SyncDocument} = {};
  private wsDocMap: Map<ExtWebSocket, string>;  // mapping between websocket and documentName
  private config: any;
  private nextSessionId = "1";
  // @ts-ignore
  private wss: ExtWebSocket.Server;
  private pubkeyPem: string;

  // @ts-ignore
  constructor(conf: any, wss: ExtWebSocket.Server) {
    this.config = conf;
    this.wss = wss;
    this.wsDocMap = new Map<ExtWebSocket, string>();
    this.pubkeyPem = this.config.keys.publicKey;
  }

  dispatch = (ws: ExtWebSocket, message: any) => {
    const decodedMessage: any = rtJsonSync.Message.decode(message);
    if (!decodedMessage) return;
    //console.log(decodedMessage);

    switch (decodedMessage.msgType) {
      case rtJsonSync.Message.MessageType.OPEN:
        if (!this.verifyAndJoin(ws, decodedMessage.open.jwt, this.pubkeyPem, decodedMessage.open.accountInfo)) ws.close();
        break;

      case rtJsonSync.Message.MessageType.CLOSE:
        this.close(ws);
        break;

      case rtJsonSync.Message.MessageType.REQUEST:
        const reqType = decodedMessage.request.type;
        if (reqType === rtJsonSync.ReqType.ALL_ACCOUNT) this.getAndSendAccounts(ws);
        break;

      case rtJsonSync.Message.MessageType.ACCOUNT_UPDATE:
        this.updateAccountInfo(ws, decodedMessage.accountUpdate.accountInfo)
        break;
        
      case rtJsonSync.Message.MessageType.DOCUMENT_UPLOAD:
        this.setDocument(ws, decodedMessage.doc.data);
        break;

      case rtJsonSync.Message.MessageType.DATA_UPDATE:
        this.updateData(ws, decodedMessage.data)
        break;
    }
  }

  close = (ws: ExtWebSocket) => {
    const doc = this.wsDocMap.get(ws);
    if (!doc || !this.documents[doc]) return;
    this.documents[doc].delUser(ws);
    if (this.documents[doc].getCount() === 0) {
      this.beforeDocumentDelete(doc);
      delete this.documents[doc];
      this.afterDocumentDelete(doc);
    }
    this.wsDocMap.delete(ws);
  }

  beforeDocumentDelete = (documentName: string) => {}
  afterDocumentDelete = (documentName: string) => {}

  incrementSessionId = () => {
    this.nextSessionId = `${(parseInt(this.nextSessionId, 10) + 1) % 10000000}`;
  }

  verifyAndJoin = (ws: ExtWebSocket, token: string, publicKey: string, accountInfo: string) => {
    let decoded: any;
    try {
      decoded = jwt.verify(token, publicKey, {algorithms: ['ES256']});
    } catch {
      sendCloseMessage(ws, 1);
      return false;
    }

    if (!decoded.documentName) {
      sendCloseMessage(ws, 1);
      return false;
    }

    const doc = this.wsDocMap.get(ws);
    if (doc) {
      if (doc === decoded.documentName) return true;   // no change
      this.documents[doc].delUser(ws);
    }
    this.wsDocMap.set(ws, decoded.documentName);
    const sessionId = this.nextSessionId;
    this.incrementSessionId();
    if (!this.documents[decoded.documentName]) {
      this.documents[decoded.documentName] = new SyncDocument(decoded.documentName);
    }
    this.documents[decoded.documentName].addUser(ws, sessionId, accountInfo);
    return true;
  }

  getAndSendAccounts = (ws: ExtWebSocket) => {
    const doc = this.wsDocMap.get(ws);
    if (doc) this.documents[doc].replyAllAccounts(ws);
  }

  updateAccountInfo = (ws: ExtWebSocket, accountInfo: string) => {
    const doc = this.wsDocMap.get(ws);
    if (doc) this.documents[doc].updateAccountInfo(ws, accountInfo);
  }

  setDocument = (ws: ExtWebSocket, data: string) => {
    const doc = this.wsDocMap.get(ws);
    if (doc) this.documents[doc].setDocument(data);
  }

  updateData = (ws: ExtWebSocket, info: IDataUpdate) => {
    const doc = this.wsDocMap.get(ws);
    if (!doc) return;

    if (info.target === rtJsonSync.TargetType.STATE) {
      this.documents[doc].updateState(ws, info);
    } else if (info.target === rtJsonSync.TargetType.DOCUMENT) {
      this.documents[doc].updateDocument(ws, info);
    }
  }
}