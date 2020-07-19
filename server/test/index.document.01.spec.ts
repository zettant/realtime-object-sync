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

    await sleep(1000);
    await wsCloseAll(sockets);
    done();
  });
});

//