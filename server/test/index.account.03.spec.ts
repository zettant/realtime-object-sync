import {WebSocketWithQueue, wsSetup, wsCloseAll, sleep, generateJwt} from './socketUtils';
import {sendCloseMessage, sendOpenMessage, sendRequestMessage} from "../src/syncMessage";
import {rtObjSync} from '../src/proto/messages';
import * as http from 'http';
import {serverInit} from '../src/index';
import DoneCallback = jest.DoneCallback;
const config = require('config');

const PORT = 8803;

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

  it('open two document (one after another) ', async (done) => {
    let token: string;
    let decoded: any;
    let accountInfo: any;
    const sockets: WebSocketWithQueue[] = [];
    sockets.push(await wsSetup(PORT));
    sockets.push(await wsSetup(PORT));

    // ---- test1 creates a new doc "testDoc1"
    token = generateJwt({documentName: "testDoc1"});
    sendOpenMessage(sockets[0], token, {email: 'test@example.com', displayName: 'test1'});
    decoded = await sockets[0].getMessage();
    expect(decoded.connected.sessionId).toBe('1');
    expect(decoded.connected.hasInitialData).toBe(false);

    // ---- test2 joins testDoc1
    sendOpenMessage(sockets[1], token, {email: 'test2@example.com', displayName: 'test2'});
    decoded = await sockets[1].getMessage();
    expect(decoded.connected.sessionId).toBe('2');
    expect(decoded.connected.hasInitialData).toBe(false);

    //    -> test1 receives notification
    decoded = await sockets[0].getMessage();
    expect(decoded.accountNotify.sessionId).toBe('2');
    expect(decoded.accountNotify.opType).toBe(rtObjSync.Operation.ADD);
    accountInfo = JSON.parse(decoded.accountNotify.accountInfo);
    expect(accountInfo.email).toBe('test2@example.com');


    // ---- test1 creates a new doc "testDoc2"
    token = generateJwt({documentName: "testDoc2"});
    sendOpenMessage(sockets[0], token, {email: 'test@example.com', displayName: 'test1'});
    decoded = await sockets[0].getMessage();
    expect(decoded.connected.sessionId).toBe('3');
    expect(decoded.connected.hasInitialData).toBe(false);

    //    -> test2 receives notification
    decoded = await sockets[1].getMessage();
    expect(decoded.accountNotify.sessionId).toBe('1');
    expect(decoded.accountNotify.opType).toBe(rtObjSync.Operation.DEL);

    // ---- test2 gets all accounts in testDoc1
    sendRequestMessage(sockets[1], rtObjSync.ReqType.ALL_ACCOUNT);
    decoded = await sockets[1].getMessage();
    expect(decoded.accountAll.documentName).toBe('testDoc1');
    accountInfo = JSON.parse(decoded.accountAll.allAccounts);
    expect(Object.keys(accountInfo).length).toBe(1);

    await sleep(1000);
    await wsCloseAll(sockets);
    done();
  });
});

//