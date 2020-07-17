import {WebSocketWithQueue, wsSetup, wsCloseAll, sleep, generateJwt, generateInvalidJwt} from './socketUtils';
import {sendCloseMessage, sendOpenMessage, sendRequestMessage, sendAccountUpdateMessage} from "../src/syncMessage";
import {rtJsonSync} from '../src/proto/messages';
import * as http from 'http';
import {serverInit} from '../src/index';
import DoneCallback = jest.DoneCallback;
const config = require('config');

const PORT = 8801;

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

  it('open document simply', async (done) => {
    const sockets: WebSocketWithQueue[] = [];
    sockets.push(await wsSetup(PORT));

    // ---- test1 creates a new doc
    const token = generateJwt({documentName: "testDoc1"});
    sendOpenMessage(sockets[0], token, {email: 'test@example.com', displayName: 'test1'});
    const decoded = await sockets[0].getMessage();
    expect(decoded.connected.sessionId).toBe('1');
    expect(decoded.connected.hasInitialData).toBe(false);

    // ---- test1 close session
    sendCloseMessage(sockets[0], 0);
    await sleep(1000);
    await wsCloseAll(sockets);
    done();
  });

  it('open document simply with invalid jwt', async (done) => {
    const sockets: WebSocketWithQueue[] = [];
    sockets.push(await wsSetup(PORT));

    // ---- test1 creates a new doc with invalid token
    const token = generateInvalidJwt({documentName: "testDoc1"});
    sendOpenMessage(sockets[0], token, {email: 'test@example.com', displayName: 'test1'});
    const decoded = await sockets[0].getMessage();
    expect(decoded.close.reason).toBe(1);

    await wsCloseAll(sockets);
    done();
  });

  it('open document by multiple users, also test notification', async (done) => {
    let token: string;
    let decoded: any;
    let accountInfo: any;
    const sockets: WebSocketWithQueue[] = [];
    for (let i=0; i<4; i++) {
      sockets.push(await wsSetup(PORT));
    }

    token = generateJwt({documentName: "testDoc2"});

    // ---- test1 creates a new doc "testDoc2"
    sendOpenMessage(sockets[0], token, {email: 'test1@example.com', displayName: 'test1'});
    decoded = await sockets[0].getMessage();
    expect(decoded.connected.sessionId).toBe('2');
    expect(decoded.connected.hasInitialData).toBe(false);

    // ---- test2 joins testDoc2
    sendOpenMessage(sockets[1], token, {email: 'test2@example.com', displayName: 'test2'});
    decoded = await sockets[1].getMessage();
    expect(decoded.connected.sessionId).toBe('3');
    expect(decoded.connected.hasInitialData).toBe(false);

    //    -> test1 receives notification
    decoded = await sockets[0].getMessage();
    expect(decoded.accountNotify.sessionId).toBe('3');
    expect(decoded.accountNotify.opType).toBe(rtJsonSync.Operation.ADD);
    accountInfo = JSON.parse(decoded.accountNotify.accountInfo);
    expect(accountInfo.email).toBe('test2@example.com');

    // ---- test3 joins testDoc2
    sendOpenMessage(sockets[2], token, {email: 'test3@example.com', displayName: 'test3'});
    decoded = await sockets[2].getMessage();
    expect(decoded.connected.sessionId).toBe('4');
    expect(decoded.connected.hasInitialData).toBe(false);

    //    -> test1 receives notification
    decoded = await sockets[0].getMessage();
    expect(decoded.accountNotify.sessionId).toBe('4');
    expect(decoded.accountNotify.opType).toBe(rtJsonSync.Operation.ADD);
    accountInfo = JSON.parse(decoded.accountNotify.accountInfo);
    expect(accountInfo.email).toBe('test3@example.com');

    //    -> test2 receives notification
    decoded = await sockets[1].getMessage();
    expect(decoded.accountNotify.sessionId).toBe('4');
    expect(decoded.accountNotify.opType).toBe(rtJsonSync.Operation.ADD);
    accountInfo = JSON.parse(decoded.accountNotify.accountInfo);
    expect(accountInfo.email).toBe('test3@example.com');

    // ---- test4 joins testDoc2
    sendOpenMessage(sockets[3], token, {email: 'test4@example.com', displayName: 'test4'});
    decoded = await sockets[3].getMessage();
    expect(decoded.connected.sessionId).toBe('5');
    expect(decoded.connected.hasInitialData).toBe(false);

    //    -> test1 receives notification
    decoded = await sockets[0].getMessage();
    expect(decoded.accountNotify.sessionId).toBe('5');
    expect(decoded.accountNotify.opType).toBe(rtJsonSync.Operation.ADD);
    accountInfo = JSON.parse(decoded.accountNotify.accountInfo);
    expect(accountInfo.email).toBe('test4@example.com');

    //    -> test2 receives notification
    decoded = await sockets[1].getMessage();
    expect(decoded.accountNotify.sessionId).toBe('5');
    expect(decoded.accountNotify.opType).toBe(rtJsonSync.Operation.ADD);
    accountInfo = JSON.parse(decoded.accountNotify.accountInfo);
    expect(accountInfo.email).toBe('test4@example.com');

    //    -> test3 receives notification
    decoded = await sockets[2].getMessage();
    expect(decoded.accountNotify.sessionId).toBe('5');
    expect(decoded.accountNotify.opType).toBe(rtJsonSync.Operation.ADD);
    accountInfo = JSON.parse(decoded.accountNotify.accountInfo);
    expect(accountInfo.email).toBe('test4@example.com');

    // ---- test4 gets all accounts who are editing testDoc2
    sendRequestMessage(sockets[3], rtJsonSync.ReqType.ALL_ACCOUNT);
    decoded = await sockets[3].getMessage();
    expect(decoded.accountAll.documentName).toBe('testDoc2');
    accountInfo = JSON.parse(decoded.accountAll.allAccounts);
    expect(Object.keys(accountInfo).length).toBe(4);
    //console.log(accountInfo);

    // ---- test1 leaves testDoc2 editing
    sendCloseMessage(sockets[0], 0);

    //    -> test2 receives notification
    decoded = await sockets[1].getMessage();
    expect(decoded.accountNotify.sessionId).toBe('2');
    expect(decoded.accountNotify.opType).toBe(rtJsonSync.Operation.DEL);

    //    -> test3 receives notification
    decoded = await sockets[2].getMessage();
    expect(decoded.accountNotify.sessionId).toBe('2');
    expect(decoded.accountNotify.opType).toBe(rtJsonSync.Operation.DEL);

    //    -> test4 receives notification
    decoded = await sockets[3].getMessage();
    expect(decoded.accountNotify.sessionId).toBe('2');
    expect(decoded.accountNotify.opType).toBe(rtJsonSync.Operation.DEL);

    // ---- test2 changes its account information
    sendAccountUpdateMessage(sockets[1], {email: 'test2@example.com', displayName: 'test2-2'});

    //    -> test3 receives notification
    decoded = await sockets[2].getMessage();
    expect(decoded.accountNotify.sessionId).toBe('3');
    expect(decoded.accountNotify.opType).toBe(rtJsonSync.Operation.ADD);
    accountInfo = JSON.parse(decoded.accountNotify.accountInfo);
    expect(accountInfo.displayName).toBe('test2-2');

    //    -> test4 receives notification
    decoded = await sockets[3].getMessage();
    expect(decoded.accountNotify.sessionId).toBe('3');
    expect(decoded.accountNotify.opType).toBe(rtJsonSync.Operation.ADD);
    accountInfo = JSON.parse(decoded.accountNotify.accountInfo);
    expect(accountInfo.displayName).toBe('test2-2');

    // ---- test2,3,4 close their sessions
    sendCloseMessage(sockets[1], 0);
    sendCloseMessage(sockets[2], 0);
    sendCloseMessage(sockets[3], 0);
    await sleep(1000);
    await wsCloseAll(sockets);
    done();
  });

});

//