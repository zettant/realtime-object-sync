import {WebSocketWithQueue, wsSetup, wsCloseAll, sleep, generateJwt, generateInvalidJwt} from './socketUtils';
import {sendCloseMessage, sendOpenMessage, sendRequestMessage, createDataUpdateMessage} from "../src/syncMessage";
import {rtJsonSync} from '../src/proto/messages';
import * as http from 'http';
import {serverInit} from '../src/index';
import DoneCallback = jest.DoneCallback;
const config = require('config');

const PORT = 8813;

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
    sendOpenMessage(sockets[0], token, {email: 'test@zettant.com', displayName: 'test1'});
    decoded = await sockets[0].getMessage();
    expect(decoded.connected.sessionId).toBe('1');
    expect(decoded.connected.hasInitialData).toBe(false);

    // ---- test2 joins testDoc2
    sendOpenMessage(sockets[1], token, {email: 'test2@zettant.com', displayName: 'test2'});
    decoded = await sockets[1].getMessage();
    expect(decoded.connected.sessionId).toBe('2');
    expect(decoded.connected.hasInitialData).toBe(false);


    //    -> test1 receives notification
    decoded = await sockets[0].getMessage();
    expect(decoded.accountNotify.sessionId).toBe('2');
    expect(decoded.accountNotify.opType).toBe(rtJsonSync.Operation.ADD);

    // ---- test1 sends its initial state
    message = createDataUpdateMessage(
      "",
      rtJsonSync.TargetType.STATE,
      rtJsonSync.Operation.ADD,
      0,
      [],
      {"pointer": [10, 20], "color": "blue", "hierarchy": {"x": [100, 3000], "y": 200}}
      );
    sockets[0].send(message);

    //    -> test2 receives notification
    decoded = await sockets[1].getMessage();
    expect(decoded.data.sessionId).toBe('1');
    expect(decoded.data.target).toBe(rtJsonSync.TargetType.STATE);
    expect(decoded.data.opType).toBe(rtJsonSync.Operation.ADD);
    data = JSON.parse(decoded.data.data);
    expect(data.pointer[0]).toBe(10);
    expect(data.color).toBe('blue');


    // ---- test2 sends its initial state
    message = createDataUpdateMessage(
      "",
      rtJsonSync.TargetType.STATE,
      rtJsonSync.Operation.ADD,
      0,
      [],
      {"pointer": [100, 200], "color": "yellow", "hierarchy": {"x": [98, 76], "y": 660}}
    );
    sockets[1].send(message);

    //    -> test1 receives notification
    decoded = await sockets[0].getMessage();
    expect(decoded.data.sessionId).toBe('2');
    expect(decoded.data.target).toBe(rtJsonSync.TargetType.STATE);
    expect(decoded.data.opType).toBe(rtJsonSync.Operation.ADD);
    data = JSON.parse(decoded.data.data);
    expect(data.pointer[0]).toBe(100);
    expect(data.color).toBe('yellow');


    // ---- test1 changes state
    message = createDataUpdateMessage(
      "",
      rtJsonSync.TargetType.STATE,
      rtJsonSync.Operation.ADD,
      0,
      ["hierarchy", "x"],
      [256, 512]
    );
    sockets[0].send(message);

    //    -> test2 receives notification
    decoded = await sockets[1].getMessage();
    expect(decoded.data.sessionId).toBe('1');
    expect(decoded.data.target).toBe(rtJsonSync.TargetType.STATE);
    expect(decoded.data.opType).toBe(rtJsonSync.Operation.ADD);
    data = JSON.parse(decoded.data.targetKey);
    expect(data[0]).toBe('hierarchy');
    expect(data[1]).toBe('x');
    data = JSON.parse(decoded.data.data);
    expect(data[0]).toBe(256);
    expect(data[1]).toBe(512);


    // ---- test2 changes state
    message = createDataUpdateMessage(
      "",
      rtJsonSync.TargetType.STATE,
      rtJsonSync.Operation.DEL,
      0,
      ["hierarchy", "y"],
      null
    );
    sockets[1].send(message);

    //    -> test1 receives notification
    decoded = await sockets[0].getMessage();
    expect(decoded.data.sessionId).toBe('2');
    expect(decoded.data.target).toBe(rtJsonSync.TargetType.STATE);
    expect(decoded.data.opType).toBe(rtJsonSync.Operation.DEL);
    data = JSON.parse(decoded.data.targetKey);
    expect(data[0]).toBe('hierarchy');
    expect(data[1]).toBe('y');

    await sleep(1000);

    // ---- test1 close session
    sendCloseMessage(sockets[0], 0);
    await sleep(1000);
    await wsCloseAll(sockets);
    done();
  });
});

//