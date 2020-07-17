import {WebSocketWithQueue, wsSetup, wsCloseAll, sleep, generateJwt, generateInvalidJwt} from './socketUtils';
import {sendCloseMessage, sendOpenMessage, sendRequestMessage, createDataUpdateMessage} from "../src/syncMessage";
import {rtObjSync} from '../src/proto/messages';
import * as http from 'http';
import {serverInit} from '../src/index';
import DoneCallback = jest.DoneCallback;
const config = require('config');

const PORT = 8811;

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

describe('server test (for state related features)', () => {
  serverSetup();

  it('one user joins in a doc and update its state', async (done) => {
    let decoded;
    const sockets: WebSocketWithQueue[] = [];
    sockets.push(await wsSetup(PORT));
    sockets.push(await wsSetup(PORT));

    // ---- test1 creates a new doc
    const token = generateJwt({documentName: "testDoc1"});
    sendOpenMessage(sockets[0], token, {email: 'test@example.com', displayName: 'test1'});
    decoded = await sockets[0].getMessage();
    expect(decoded.connected.sessionId).toBe('1');
    expect(decoded.connected.hasInitialData).toBe(false);

    // ---- test2 joins testDoc2
    sendOpenMessage(sockets[1], token, {email: 'test2@example.com', displayName: 'test2'});
    decoded = await sockets[1].getMessage();
    expect(decoded.connected.sessionId).toBe('2');
    expect(decoded.connected.hasInitialData).toBe(false);

    //    -> test1 receives notification
    decoded = await sockets[0].getMessage();
    expect(decoded.accountNotify.sessionId).toBe('2');
    expect(decoded.accountNotify.opType).toBe(rtObjSync.Operation.ADD);

    // ---- test1 send its initial state
    const message = createDataUpdateMessage({
      sessionId: '',
      target: rtObjSync.TargetType.STATE,
      opType: rtObjSync.Operation.ADD,
      revision: 0,
      targetKey: [],
      data: {"pointer": [10, 20], "color": "blue"}
    });
    sockets[0].send(message);

    //    -> test2 receives notification
    decoded = await sockets[1].getMessage();
    expect(decoded.data.sessionId).toBe('1');
    expect(decoded.data.target).toBe(rtObjSync.TargetType.STATE);
    expect(decoded.data.opType).toBe(rtObjSync.Operation.ADD);
    const data = JSON.parse(decoded.data.data);
    expect(data.pointer[0]).toBe(10);
    expect(data.color).toBe('blue');

    await sleep(1000);

    // ---- test1 close session
    sendCloseMessage(sockets[0], 0);
    await sleep(1000);
    await wsCloseAll(sockets);
    done();
  });
});

//