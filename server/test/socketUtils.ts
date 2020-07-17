import * as jwt from "jsonwebtoken";
import {rtObjSync} from "../src/proto/messages";
const config = require('config');

const invalidKey = '-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEICjMCUCDbfNed1e+A16Y85JgPrv1aO6LTENS0rAXbVFRoAoGCCqGSM49\nAwEHoUQDQgAEpy96NUeU2WQVHckqpoe9JpbwJ4V9QSTZZRVndLPaEoBbaEC2ge8L\niet9qyZffF7/8r6U35u7OQ58OaMfl79dow==\n-----END EC PRIVATE KEY-----';

export class WebSocketWithQueue extends WebSocket {
  queue: any = [];

  getMessage = async (): Promise<any> => {
    while (this.queue.length === 0) {  // TODO: need to improve
      await sleep(10);
    }
    return this.queue.shift();
  }
}

export const wsSetup = (port: number): Promise<WebSocketWithQueue> => {
  return new Promise((resolve, reject) => {
    const ws: WebSocketWithQueue = new WebSocketWithQueue(`ws://localhost:${port}/`);
    ws.binaryType = 'arraybuffer';
    ws.onmessage = (msgEvent: any) => {
      ws.queue.push(parseMessage(msgEvent.data));
    }
    ws.onopen = () => {
      //console.log("....connected...");
      resolve(ws);
    };
    ws.onerror = (err: any) => {
      reject(err);
    };
  });
}

export const wsCloseAll = (sockets: WebSocket[]) => {
  return Promise.all(sockets.map( (s) => {
    return new Promise((resolve, reject) => {
      if (s.CLOSED) {
        resolve();
      }
      else {
        s.close();
        s.onclose = () => {
          //console.log(">>>>closed");
          resolve();
        };
      }
    });
  }));
}

export const messageWait = (ws: WebSocket): Promise<any> => {
  return new Promise((resolve, reject) => {
    ws.onmessage = (msgEvent: any) => {
      resolve(parseMessage(msgEvent.data));
    }
  });
}


export const sleep = (ms: number) => {
  return new Promise( (resolve, reject) => {
    setTimeout(() => {
      resolve();
    }, ms);
  })
}

function toBuffer(ab: any) {
  const buf = Buffer.alloc(ab.byteLength);
  const view = new Uint8Array(ab);
  for (let i = 0; i < buf.length; ++i) {
    buf[i] = view[i];
  }
  return buf;
}

export const parseMessage = (data: any): any => {
  const message = toBuffer(data);
  return rtObjSync.Message.decode(message);
}

export const generateJwt = (payload: {[key: string]: string}) => {
  const jwtOptions = {
    algorithm: 'ES256',
    audience: 'SyncServer',
    expiresIn: 86400*30
  };
  //const currentTime = Math.floor(new Date().getTime());
  // @ts-ignore
  return jwt.sign(payload, config.keys.privateKey, jwtOptions);
}

export const generateInvalidJwt = (payload: {[key: string]: string}) => {
  const jwtOptions = {
    algorithm: 'ES256',
    audience: 'SyncServer',
    expiresIn: 86400*30
  };
  //const currentTime = Math.floor(new Date().getTime());
  // @ts-ignore
  return jwt.sign(payload, invalidKey, jwtOptions);
}
