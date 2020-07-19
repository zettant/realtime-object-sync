import * as chai from 'chai';
const expect = chai.expect;

import {getTestEnv} from './prepare';
import {RealtimeSyncClient} from '../src';

const env = getTestEnv();
const clientlib = env.library;

const envName = env.envName;

const serverURL = 'ws://localhost:8888';
const token = 'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJkb2N1bWVudE5hbWUiOiJ0ZXN0RG9jMSIsImlhdCI6MTU5NDk1MTkwOCwiZXhwIjoxNTk3NTQzOTA4LCJhdWQiOiJTeW5jU2VydmVyIn0.xRk9rlgxlI4OkylNKkheUfKZ_DmiKC8fEBm_iZhnI3Tgvj6WPXyVPD40WZB0vvkjADmikZCwjO-T4QgPMpZ9-Q';

const sleep = (ms: number) => {
  return new Promise( (resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  })
}

describe(`${envName}: rt-objsync-client`, async function () {

  before(async function () {
    console.log("# NOTE: Please start realtime-object-sync server at localhost:8888");
    this.timeout(100000);
  });

  it('single user connects with server and disconnects', async function () {
    const rtClient: RealtimeSyncClient = new clientlib.RealtimeSyncClient();
    await rtClient.open(serverURL, token, {email: 'test@example.com'});

    rtClient.close();
    rtClient.disconnect();
  });

  it('two users connect with server and get account info', async function () {
    const rtClients: RealtimeSyncClient[] = [];
    rtClients.push(new clientlib.RealtimeSyncClient());
    rtClients.push(new clientlib.RealtimeSyncClient());

    // ---- test1 joins document edit
    await rtClients[0].open(serverURL, token, {email: 'test1@example.com'});

    // ---- test2 joins document edit
    await rtClients[1].open(serverURL, token, {email: 'test2@example.com'});

    // ---- test2 gets all accounts
    const allAccounts = await rtClients[1].getAllAccounts();
    expect(Object.keys(allAccounts).length).equals(2);
    console.log(allAccounts);

    rtClients.forEach((c) => {
      c.close();
      c.disconnect();
    })
  });

  it('two users connect with server and update their states', async function () {
    this.timeout(100000);
    const rtClients: RealtimeSyncClient[] = [];
    rtClients.push(new clientlib.RealtimeSyncClient());
    rtClients.push(new clientlib.RealtimeSyncClient());

    // ---- test1 and test2 join document edit
    await rtClients[0].open(serverURL, token, {email: 'test1@example.com'});
    await rtClients[1].open(serverURL, token, {email: 'test2@example.com'});

    // ---- test1 changes its account info and test2 receives notification
    const funcAccount = (sessionId: string|null, opType: string, info: any) => {
      console.log("account >>>", sessionId, opType, info);
      expect(opType).equals('ADD');
      expect(info.email).equals('test2-1@example.com');
      expect(info.displayName).equals('test2-1');
    }
    rtClients[0].addListener('account', funcAccount);
    rtClients[1].account = {email: 'test2-1@example.com', displayName: 'test2-1'};

    // ---- test2 changes its state info and test1 receives notification
    const funcState = (sessionId: string, opType: string, keys: any, data: any) => {
      console.log("state >>>", sessionId, opType, keys, data);
      expect(keys.length).equals(1);
      expect(keys[0]).equals('item1');
      if (opType === 'ADD') {
        expect(data.x).equals(10);
        expect(data.y).equals(20);
      }
    }
    rtClients[1].addListener('state', funcState);
    rtClients[0].setState('item1', {x:10, y:20});
    rtClients[0].delState('item1');

    await sleep(1000);
    rtClients.forEach((c) => {
      c.close();
      c.disconnect();
    })
  });

});