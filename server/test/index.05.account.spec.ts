import {WebSocketWithQueue, wsSetup, wsCloseAll, sleep, generateJwt, generateInvalidJwt} from './socketUtils';
import {
  sendCloseMessage,
  sendOpenMessage,
  sendRequestMessage,
  sendAccountUpdateMessage,
  sendDocumentUploadMessage
} from "../src/syncMessage";
import {rtJsonSync} from '../src/proto/messages';
import * as http from 'http';
import {serverInit} from '../src/index';
import DoneCallback = jest.DoneCallback;
const config = require('config');

const PORT = 8805;

const serverSetup = () => {
  let server: any;

  beforeAll((done: DoneCallback) => {
    server = http.createServer()
    serverInit(server, config);
    server.listen(PORT, () => {
      //console.log(`Server started on port ${server.address().port}`);
    });
    done();
  });

  afterAll((done: DoneCallback) => {
    server.close();
    //console.log("server shutdown");
    done();
  });
}

describe('server test (for account related features)', () => {
  serverSetup();

  const initialDocument = {
    "info1": 100,
    "info2": ["a", "b", "c"],
    "info3": "xxxxx",
    "info4": {
      "info4-1": "aaaa",
      "info4-2": 2000,
    }
  };

  it('open document simply, and upload/sync initial document', async (done) => {
    let token: string;
    let decoded: any;
    const sockets: WebSocketWithQueue[] = [];
    sockets.push(await wsSetup(PORT));
    sockets.push(await wsSetup(PORT));

    token = generateJwt({documentName: "testDoc1"});

    // ---- test1 creates a new doc "testDoc1"
    sendOpenMessage(sockets[0], token, {email: 'test1@zettant.com', displayName: 'test1'});
    decoded = await sockets[0].getMessage();
    expect(decoded.connected.sessionId).toBe('1');
    expect(decoded.connected.hasInitialData).toBe(false);

    // ---- test1 upload initial document
    sendDocumentUploadMessage(sockets[0], initialDocument);
    await sleep(1000);


    // ---- test2 joins testDoc2
    sendOpenMessage(sockets[1], token, {email: 'test2@zettant.com', displayName: 'test2'});
    decoded = await sockets[1].getMessage();
    expect(decoded.connected.sessionId).toBe('2');
    expect(decoded.connected.hasInitialData).toBe(true);
    const initData = JSON.parse(decoded.connected.data);
    console.log(initData);
    expect(initData['info1']).toBe(initialDocument['info1']);
    expect(initData['info2'][1]).toBe(initialDocument['info2'][1]);
    expect(initData['info3']).toBe(initialDocument['info3']);
    expect(initData['info4']['info4-2']).toBe(initialDocument['info4']['info4-2']);

    //    -> test1 receives notification
    decoded = await sockets[0].getMessage();
    expect(decoded.accountNotify.sessionId).toBe('2');
    expect(decoded.accountNotify.opType).toBe(rtJsonSync.Operation.ADD);
    const accountInfo = JSON.parse(decoded.accountNotify.accountInfo);
    expect(accountInfo.email).toBe('test2@zettant.com');

    // ---- test2,3,4 close their sessions
    await sleep(1000);
    await wsCloseAll(sockets);
    done();
  });

});

//