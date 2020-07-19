import {WebSocketWithQueue, wsSetup, wsCloseAll, sleep, generateJwt, generateInvalidJwt} from './socketUtils';
import {
  sendCloseMessage,
  sendOpenMessage,
  sendRequestMessage,
  createDataUpdateMessage,
  sendDocumentUploadMessage
} from "../src/syncMessage";
import {rtObjSync} from '../src/proto/messages';
import * as http from 'http';
import {serverInit} from '../src/index';
import DoneCallback = jest.DoneCallback;
const config = require('config');

const PORT = 8821;

const initialDocument = {
  'a1': {
    'a2-1': {
      'a3-1': 'a3string',
      'a3-2': 'a3string2'
    },
    'a2-2': 'a22string',
  },
  'b1': {
    'b2-1': 100,
    'b2-2': {
      'b3-1': 200,
      'b3-2': 'BBB'
    },
    'b2-3': {
      'b3-1': {
        'b3-1-1': {
          'b3-1-1-1': {
            'b3-1-1-1-1': 'XXXX'
          },
          'b3-1-1-2': {
            'b3-1-1-1-2': 300
          },
        }
      }
    }
  }
}


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

describe('server test (for document related features)', () => {
  serverSetup();

  it('one user joins in a doc and upload document', async (done) => {
    let decoded;
    let message;
    const sockets: WebSocketWithQueue[] = [];
    sockets.push(await wsSetup(PORT));
    sockets.push(await wsSetup(PORT));

    // ---- test1 creates a new doc
    const token = generateJwt({documentName: "testDoc1"});
    sendOpenMessage(sockets[0], token, {email: 'test@example.com', displayName: 'test1'});
    decoded = await sockets[0].getMessage();
    expect(decoded.connected.sessionId).toBe('1');
    expect(decoded.connected.hasInitialData).toBe(false);

    // ---- test1 upload initial data
    sendDocumentUploadMessage(sockets[0], initialDocument);

    // ---- test2 joins testDoc2
    sendOpenMessage(sockets[1], token, {email: 'test2@example.com', displayName: 'test2'});
    decoded = await sockets[1].getMessage();
    expect(decoded.connected.sessionId).toBe('2');
    expect(decoded.connected.hasInitialData).toBe(true);
    expect(decoded.connected.revision).toBe(0);
    let data = JSON.parse(decoded.connected.data);
    expect(data['b1']['b2-2']['b3-1']).toBe(200);
    expect(data['b1']['b2-3']['b3-1']['b3-1-1']['b3-1-1-1']['b3-1-1-1-1']).toBe('XXXX');

    //    -> test1 receives notification
    decoded = await sockets[0].getMessage();
    expect(decoded.accountNotify.sessionId).toBe('2');
    expect(decoded.accountNotify.opType).toBe(rtObjSync.Operation.ADD);

    // ---- test1 changes document
    const keys1 = ['a1', 'a2-1', 'a3-1'];
    message = createDataUpdateMessage({
      sessionId: '',
      target: rtObjSync.TargetType.DOCUMENT,
      opType: rtObjSync.Operation.ADD,
      revision: 0,
      targetKey: keys1,
      data: 'modifiedA'
    });
    sockets[0].send(message);

    // ---- test2 changes document
    const keys2 = ['b1', 'b2-3', 'b3-1', 'b3-1-1', 'b3-1-1-2', 'b3-1-1-1-2'];
    message = createDataUpdateMessage({
      sessionId: '',
      target: rtObjSync.TargetType.DOCUMENT,
      opType: rtObjSync.Operation.ADD,
      revision: 0,
      targetKey: keys2,
      data: 9999
    });
    sockets[1].send(message);

    //    -> test2 receives document update
    decoded = await sockets[1].getMessage();
    expect(decoded.data.sessionId).toBe('1');  // modified by test1
    expect(decoded.data.target).toBe(rtObjSync.TargetType.DOCUMENT);
    expect(decoded.data.opType).toBe(rtObjSync.Operation.ADD);
    expect(decoded.data.revision).toBe(1);
    data = JSON.parse(decoded.data.targetKey);
    for (let i=0; i<keys1.length; i++) expect(data[i]).toBe(keys1[i]);
    data = JSON.parse(decoded.data.data);
    expect(data).toBe('modifiedA');

    //    -> test1 receives document update
    decoded = await sockets[0].getMessage();
    expect(decoded.data.sessionId).toBe('2');  // modified by test2
    expect(decoded.data.target).toBe(rtObjSync.TargetType.DOCUMENT);
    expect(decoded.data.opType).toBe(rtObjSync.Operation.ADD);
    expect(decoded.data.revision).toBe(2);
    data = JSON.parse(decoded.data.targetKey);
    for (let i=0; i<keys2.length; i++) expect(data[i]).toBe(keys2[i]);
    data = JSON.parse(decoded.data.data);
    expect(data).toBe(9999);

    // ---- test1 deletes document element
    const keys3 = ['b1', 'b2-2'];
    message = createDataUpdateMessage({
      sessionId: '',
      target: rtObjSync.TargetType.DOCUMENT,
      opType: rtObjSync.Operation.DEL,
      revision: 0,
      targetKey: keys3,
    });
    sockets[0].send(message);

    //    -> test2 receives document update
    decoded = await sockets[1].getMessage();
    expect(decoded.data.sessionId).toBe('1');  // modified by test1
    expect(decoded.data.target).toBe(rtObjSync.TargetType.DOCUMENT);
    expect(decoded.data.opType).toBe(rtObjSync.Operation.DEL);
    expect(decoded.data.revision).toBe(3);
    data = JSON.parse(decoded.data.targetKey);
    for (let i=0; i<keys3.length; i++) expect(data[i]).toBe(keys3[i]);

    // ---- test2 deletes invalid document element (this should be ignored by the server, so revision is unchanged)
    const keys4 = ['a1', 'b2-3'];
    message = createDataUpdateMessage({
      sessionId: '',
      target: rtObjSync.TargetType.DOCUMENT,
      opType: rtObjSync.Operation.DEL,
      revision: 0,
      targetKey: keys4,
    });
    sockets[1].send(message);

    // ---- test1 changes document
    const keys5 = ['a1', 'a2-1', 'a3-1'];
    message = createDataUpdateMessage({
      sessionId: '',
      target: rtObjSync.TargetType.DOCUMENT,
      opType: rtObjSync.Operation.ADD,
      revision: 0,
      targetKey: keys5,
      data: 'modifiedA2'
    });
    sockets[0].send(message);

    //    -> test2 receives document update
    decoded = await sockets[1].getMessage();
    expect(decoded.data.sessionId).toBe('1');  // modified by test1
    expect(decoded.data.target).toBe(rtObjSync.TargetType.DOCUMENT);
    expect(decoded.data.opType).toBe(rtObjSync.Operation.ADD);
    expect(decoded.data.revision).toBe(4);  // revision is increased by 1 because the prior deletion was invalid
    data = JSON.parse(decoded.data.targetKey);
    for (let i=0; i<keys5.length; i++) expect(data[i]).toBe(keys5[i]);
    data = JSON.parse(decoded.data.data);
    expect(data).toBe('modifiedA2');

    await sleep(1000);
    await wsCloseAll(sockets);
    done();
  });
});

//