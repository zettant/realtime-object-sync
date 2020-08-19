import * as chai from 'chai';
const expect = chai.expect;

import {getTestEnv} from './prepare';
import {RealtimeSyncClient, convertDocumentNodeElement} from '../src';
import {replacer} from "../src/utils";

const env = getTestEnv();
const clientlib = env.library;

const envName = env.envName;

const serverURL = 'ws://127.0.0.1:8888';
const token = "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJkb2N1bWVudE5hbWUiOiJ0ZXN0RG9jMSIsImlhdCI6MTU5NzgwNjkxMCwiZXhwIjoxNjAwMzk4OTEwLCJhdWQiOiJTeW5jU2VydmVyIn0.I6nhfbjBYg8qn_1eaycziaYFDtNM8Gxg0a4fh5aO6ROkFVekYMxNfyhlr2TBH8ukQy8BndE9G7wvztlr-CV8DA";

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
    const doc = Object.assign({}, initialDocument);
    const rtClient: RealtimeSyncClient = new clientlib.RealtimeSyncClient();
    await rtClient.open(serverURL, token, {email: 'test@example.com'}, doc);
    expect(rtClient).not.null;
    expect(rtClient.document).not.null;
    if (!rtClient.document) return;

    rtClient.document.setDocument(doc);
    rtClient.document.makeTopNodeInDocument('a1', -1, null);
    rtClient.document.makeTopNodeInDocument('b1', 3, null)

    //console.log(JSON.stringify(rtClient.document.getDocument()));

    let node = rtClient.document.getNodeAt(['a1', 'a2-2']);
    expect(node).equals('a22string');

    // @ts-ignore
    node = rtClient.document.getNodeAt(['b1', 'b2-2']);
    expect(node['b3-1']).equals(200);

    // @ts-ignore
    node = rtClient.document.getNodeAt(['b1', 'b2-3', 'b3-1']);
    expect(node['b3-1-1']['b3-1-1-1']['b3-1-1-1-1']).equals('XXXX');

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

    const docUpdateHandler2 = (sessionId: string, opType: string, keys: string[], data: any) => {
      console.log("doc >>>", sessionId, opType, keys, data);
      convertDocumentNodeElement(doc2, opType, keys, data);
    }

    rtClients[0].document.setDocument(doc1);
    rtClients[0].document.makeTopNodeInDocument('a1', -1, docUpdateHandler2);
    rtClients[0].document.makeTopNodeInDocument('b1', 3, docUpdateHandler2);

    rtClients[1].document.setDocument(doc2);
    rtClients[1].document.makeTopNodeInDocument('a1', -1, docUpdateHandler2);
    rtClients[1].document.makeTopNodeInDocument('b1', 3, docUpdateHandler2);


    // ---- test1 changes document and test2 receives notification
    const nodeAX = rtClients[0].document.getNodeAt(['ax']);
    expect(nodeAX).null;

    const nodeA1 = rtClients[0].document.getNodeAt(['a1']);
    rtClients[0].document.addChildNode(nodeA1, 'a2-3', {'a3-3-1': 200});
    //console.log("DUMP: ", rtClients[0].document.dumpNode());

    rtClients[0].document.addChildNode(nodeA1, 'a2-2', 'newString');
    //console.log("DUMP: ", rtClients[0].document.dumpNode());

    const nodeB1 = rtClients[0].document.getNodeAt(['b1', 'b2-3']);
    rtClients[0].document.removeChildNode(nodeB1, 'b3-1');

    await sleep(1000);
    console.log(JSON.stringify(doc2, replacer));
    expect(doc2.a1['a2-2']).equals('newString');
    expect(doc2.a1['a2-3']['a3-3-1']).equals(200);
    expect(doc2.b1['b2-3']['b3-1']).undefined;

    rtClients.forEach((c) => {
      c.close();
      c.disconnect();
    })
  });

});