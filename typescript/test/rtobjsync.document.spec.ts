import * as chai from 'chai';
const expect = chai.expect;

import {getTestEnv} from './prepare';
import {RealtimeSyncClient, convertDocumentNodeElement} from '../src';

const env = getTestEnv();
const clientlib = env.library;

const envName = env.envName;

const serverURL = 'ws://localhost:8888';
const token = 'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJkb2N1bWVudE5hbWUiOiJ0ZXN0RG9jMSIsImlhdCI6MTU5NDk1MTkwOCwiZXhwIjoxNTk3NTQzOTA4LCJhdWQiOiJTeW5jU2VydmVyIn0.xRk9rlgxlI4OkylNKkheUfKZ_DmiKC8fEBm_iZhnI3Tgvj6WPXyVPD40WZB0vvkjADmikZCwjO-T4QgPMpZ9-Q';

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

const sleep = (ms: number) => {
  return new Promise( (resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  })
}

describe(`${envName}: rt-objsync-client document modification`, async function () {

  before(async function () {
    console.log("# NOTE: Please start realtime-object-sync server at localhost:8888");
    this.timeout(100000);
  });

  it('just set initial data in document', async function () {
    const rtClient: RealtimeSyncClient = new clientlib.RealtimeSyncClient();
    await rtClient.open(serverURL, token, {email: 'test@example.com'}, initialDocument);
    expect(rtClient).not.null;
    expect(rtClient.document).not.null;
    if (!rtClient.document) return;

    rtClient.document.setAutoNodeCreation('a1', -1);
    rtClient.document.setAutoNodeCreation('b1', 3)
    rtClient.document.setDocument(initialDocument, true);

    // @ts-ignore
    console.log(rtClient.document.dump());

    // @ts-ignore
    let node = rtClient.document.getNodeAt(['a1', 'a2-2']);
    expect(node.value).equals('a22string');

    // @ts-ignore
    node = rtClient.document.getNodeAt(['b1', 'b2-2']);
    expect(node.value['b3-1']).equals(200);
    console.log(node.value);

    // @ts-ignore
    node = rtClient.document.getNodeAt(['b1', 'b2-3', 'b3-1']);
    expect(node.value['b3-1-1']['b3-1-1-1']['b3-1-1-1-1']).equals('XXXX');
    console.log(node.value);

    rtClient.close();
    rtClient.disconnect();
  });

  it('two users connect with server and update document', async function () {
    const doc1 = Object.assign({}, initialDocument);
    let doc2: any = null;
    this.timeout(100000);
    const rtClients: RealtimeSyncClient[] = [];
    rtClients.push(new clientlib.RealtimeSyncClient());
    rtClients.push(new clientlib.RealtimeSyncClient());

    // ---- test1 and test2 join document edit
    await rtClients[0].open(serverURL, token, {email: 'test1@example.com'}, doc1);
    await rtClients[1].open(serverURL, token, {email: 'test2@example.com'});

    doc2 = rtClients[1].getDownloadedDocument();
    expect(doc2).not.null;

    if (!rtClients[0].document || !rtClients[1].document) return;

    rtClients[0].document.setAutoNodeCreation('a1', -1);
    rtClients[0].document.setAutoNodeCreation('b1', 3)
    rtClients[0].document.setDocument(doc1, true);

    rtClients[1].document.setAutoNodeCreation('a1', -1);
    rtClients[1].document.setAutoNodeCreation('b1', 3)
    rtClients[1].document.setDocument(doc2, true);


    // ---- test1 changes document and test2 receives notification
    const docUpdateHandler2 = (sessionId: string, opType: string, keys: string[], data: any) => {
      console.log("doc >>>", sessionId, opType, keys, data);
      convertDocumentNodeElement(doc2, opType, keys, data);
    }
    rtClients[1].processMessageForDocument = docUpdateHandler2;

    const nodeAX = rtClients[0].document.getNodeAt(['ax']);
    expect(nodeAX).undefined;

    const nodeA1 = rtClients[0].document.getNodeAt(['a1']);
    rtClients[0].document.addChildNode(nodeA1, 'a2-3', {'a3-3-1': 200});
    rtClients[0].document.addLevel1( 'c1', {'c2': 'YYYY'});

    const nodeB1 = rtClients[0].document.getNodeAt(['b1', 'b2-3']);
    rtClients[0].document.removeChild(nodeB1, 'b3-1');

    await sleep(1000);
    console.log(doc2);
    expect(doc2.a1['a2-3']['a3-3-1']).equals(200);
    expect(doc2.c1.c2).equals('YYYY');
    expect(doc2.b1['b2-3']['b3-1']).undefined;

    rtClients.forEach((c) => {
      c.close();
      c.disconnect();
    })
  });

});