import {WebSocketWithQueue, wsSetup, wsCloseAll, sleep, generateJwt, generateInvalidJwt} from './socketUtils';
import {sendCloseMessage, sendOpenMessage, sendRequestMessage, createDataUpdateMessage} from "../src/syncMessage";
import {rtObjSync} from '../src/proto/messages';
import * as http from 'http';
import {serverInit} from '../src/index';
import DoneCallback = jest.DoneCallback;
const config = require('config');

const PORT = 8812;

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

  it('one user joins in a doc and update a part of its state', async (done) => {
    let decoded;
    let message;
    let data;
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

    // ---- test1 sends its initial state
    message = createDataUpdateMessage({
      sessionId: '',
      target: rtObjSync.TargetType.STATE,
      opType: rtObjSync.Operation.ADD,
      revision: 0,
      targetKey: [],
      data: {"pointer": [10, 20], "color": "blue", "hierarchy": {"x": [100, 3000], "y": 200}}
    });
    sockets[0].send(message);

    //    -> test2 receives notification
    decoded = await sockets[1].getMessage();
    expect(decoded.data.sessionId).toBe('1');
    expect(decoded.data.target).toBe(rtObjSync.TargetType.STATE);
    expect(decoded.data.opType).toBe(rtObjSync.Operation.ADD);
    data = JSON.parse(decoded.data.data);
    expect(data.pointer[0]).toBe(10);
    expect(data.color).toBe('blue');

    // ---- test1 changes state
    message = createDataUpdateMessage({
      sessionId: '',
      target: rtObjSync.TargetType.STATE,
      opType: rtObjSync.Operation.ADD,
      revision: 0,
      targetKey: ["color"],
      data: "red"
    });
    sockets[0].send(message);

    //    -> test2 receives notification
    decoded = await sockets[1].getMessage();
    expect(decoded.data.sessionId).toBe('1');
    expect(decoded.data.target).toBe(rtObjSync.TargetType.STATE);
    expect(decoded.data.opType).toBe(rtObjSync.Operation.ADD);
    data = JSON.parse(decoded.data.targetKey);
    expect(data[0]).toBe('color');
    data = JSON.parse(decoded.data.data);
    expect(data).toBe('red');

    // ---- test1 changes state
    message = createDataUpdateMessage({
      sessionId: '',
      target: rtObjSync.TargetType.STATE,
      opType: rtObjSync.Operation.ADD,
      revision: 0,
      targetKey: ["hierarchy", "x"],
      data: [2, 5]
    });
    sockets[0].send(message);

    //    -> test2 receives notification
    decoded = await sockets[1].getMessage();
    expect(decoded.data.sessionId).toBe('1');
    expect(decoded.data.target).toBe(rtObjSync.TargetType.STATE);
    expect(decoded.data.opType).toBe(rtObjSync.Operation.ADD);
    data = JSON.parse(decoded.data.targetKey);
    expect(data[0]).toBe('hierarchy');
    expect(data[1]).toBe('x');
    data = JSON.parse(decoded.data.data);
    expect(data[0]).toBe(2);
    expect(data[1]).toBe(5);

    // ---- test1 changes state
    message = createDataUpdateMessage({
      sessionId: '',
      target: rtObjSync.TargetType.STATE,
      opType: rtObjSync.Operation.ADD,
      revision: 0,
      targetKey: ["hierarchy", "z"],
      data: {"z1": 100}
    });
    sockets[0].send(message);

    //    -> test2 receives notification
    decoded = await sockets[1].getMessage();
    expect(decoded.data.sessionId).toBe('1');
    expect(decoded.data.target).toBe(rtObjSync.TargetType.STATE);
    expect(decoded.data.opType).toBe(rtObjSync.Operation.ADD);
    data = JSON.parse(decoded.data.targetKey);
    expect(data[0]).toBe('hierarchy');
    expect(data[1]).toBe('z');
    data = JSON.parse(decoded.data.data);
    expect(data['z1']).toBe(100);


    // ---- test1 changes state
    message = createDataUpdateMessage({
      sessionId: '',
      target: rtObjSync.TargetType.STATE,
      opType: rtObjSync.Operation.DEL,
      revision: 0,
      targetKey: ["hierarchy", "z"]
    });
    sockets[0].send(message);

    //    -> test2 receives notification
    decoded = await sockets[1].getMessage();
    expect(decoded.data.sessionId).toBe('1');
    expect(decoded.data.target).toBe(rtObjSync.TargetType.STATE);
    expect(decoded.data.opType).toBe(rtObjSync.Operation.DEL);
    data = JSON.parse(decoded.data.targetKey);
    expect(data[0]).toBe('hierarchy');
    expect(data[1]).toBe('z');

    await sleep(1000);

    // ---- test1 close session
    sendCloseMessage(sockets[0], 0);
    await sleep(1000);
    await wsCloseAll(sockets);
    done();
  });
});

//