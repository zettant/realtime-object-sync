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

//import {rtObjSync} from "./proto/messages.js";
const rtObjSync = require("./proto/messages.js").rtObjSync;

export interface IDataUpdate {
  sessionId: string,
  target: number,
  opType: number,
  revision: number,
  targetKey: any,
  data?: any
}


const createMessage = (payload: any) => {
  const message = rtObjSync.Message.create(payload);
  return rtObjSync.Message.encode(message).finish();
}

export const sendMessage = (ws: any, payload: any) => {
  ws.send(createMessage(payload));
}

export const sendOpenMessage = (ws: any, token: string, accountInfo: any) => {
  const payload: any = {
    msgType: rtObjSync.Message.MessageType.OPEN,
    open: {
      jwt: token,
      accountInfo: JSON.stringify(accountInfo)
    }
  }
  sendMessage(ws, payload);
}


export const sendConnectedMessage = (ws: any, sessionId: string, data?: any, revision?: number) => {
  const payload: any = {
    msgType: rtObjSync.Message.MessageType.CONNECTED,
    connected: {
      sessionId,
      hasInitialData: data != undefined,
    }
  }
  if (data) {
    payload.connected.data = JSON.stringify(data);
    payload.connected.revision = revision;
  }
  sendMessage(ws, payload);
}


export const sendCloseMessage = (ws: any, reason: number) => {
  const payload: any = {
    msgType: rtObjSync.Message.MessageType.CLOSE,
    close: { reason }
  }
  sendMessage(ws, payload);
}


export const sendRequestMessage = (ws: any, type: number) => {
  const payload: any = {
    msgType: rtObjSync.Message.MessageType.REQUEST,
    request: { type }
  }
  sendMessage(ws, payload);
}


export const sendAccountAllMessage = (ws: any, documentName: string, allAccounts: any) => {
  const payload: any = {
    msgType: rtObjSync.Message.MessageType.ACCOUNT_ALL,
    accountAll: {documentName, allAccounts: JSON.stringify(allAccounts)}
  }
  sendMessage(ws, payload);
}


export const sendAccountUpdateMessage = (ws: any, accountInfo: any): any => {
  const payload: any = {
    msgType: rtObjSync.Message.MessageType.ACCOUNT_UPDATE,
    accountUpdate: {accountInfo: JSON.stringify(accountInfo)}
  };
  sendMessage(ws, payload);
}


export const createAccountNotifyMessage = (sessionId: string, opType: number, accountInfo: any) => {
  return createMessage({
    msgType: rtObjSync.Message.MessageType.ACCOUNT_NOTIFY,
    accountNotify: {sessionId, opType, accountInfo: JSON.stringify(accountInfo)}
  });
}


export const sendDocumentUploadMessage = (ws: any, data: any) => {
  const payload: any = {
    msgType: rtObjSync.Message.MessageType.DOCUMENT_UPLOAD,
    doc: {data: JSON.stringify(data)}
  }
  sendMessage(ws, payload);
}


export const createDataUpdateMessage = (info: IDataUpdate) => {
  if (!info.data) info.data = null;
  return createMessage({
    msgType: rtObjSync.Message.MessageType.DATA_UPDATE,
    data: {
      sessionId: info.sessionId,
      target: info.target,
      opType: info.opType,
      revision: info.revision,
      targetKey: JSON.stringify(info.targetKey),
      data: JSON.stringify(info.data)
    }
  });
}
