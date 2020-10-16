import {getTestEnv} from './prepare';
import {RealtimeSyncClient} from '../src';
import {testToken} from './token';

const env = getTestEnv();
const clientlib = env.library;

const serverURL = 'ws://127.0.0.1:8888';

const sleep = (ms: number) => {
  return new Promise( (resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  })
}

const token = testToken;

describe(`${env.envName}: rt-objsync-client`, function () {

  beforeEach(() => {
    console.log("# NOTE: Please start realtime-object-sync server at localhost:8888");
    if(typeof window === 'undefined') jest.setTimeout(10000);
    else try{ jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;} catch { console.log('possibly will timeout...')}
  });

  it('single user connects with server and disconnects', async function () {
    const rtClient: RealtimeSyncClient = new clientlib.RealtimeSyncClient();
    await rtClient.open(serverURL, token, {email: 'test@example.com'});

    rtClient.close();
    rtClient.disconnect();
    await sleep(1000);
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
    expect(Object.keys(allAccounts).length).toBe(2);
    console.log(allAccounts);

    rtClients.forEach((c) => {
      c.close();
      c.disconnect();
    })
  });

  it('two users connect with server and update their states', async function () {
    const rtClients: RealtimeSyncClient[] = [];
    rtClients.push(new clientlib.RealtimeSyncClient());
    rtClients.push(new clientlib.RealtimeSyncClient());

    // ---- test1 and test2 join document edit
    await rtClients[0].open(serverURL, token, {email: 'test1@example.com'});
    await rtClients[1].open(serverURL, token, {email: 'test2@example.com'});

    // ---- test1 changes its account info and test2 receives notification
    const funcAccount = (sessionId: string|null, opType: string, info: any) => {
      console.log("account >>>", sessionId, opType, info);
      expect(opType).toBe('ADD');
      expect(info.email).toBe('test2@example.com');
      expect(info.displayName).toBe('test2');
    }
    rtClients[0].addListener('account', funcAccount);
    rtClients[1].account = {email: 'test2@example.com', displayName: 'test2'};

    // ---- test2 changes its state info and test1 receives notification
    const funcState = (sessionId: string, opType: string, keys: any, data: any) => {
      console.log("state >>>", sessionId, opType, keys, data);
      expect(keys.length).toBe(1);
      expect(keys[0]).toBe('item1');
      if (opType === 'ADD') {
        expect(data.x).toBe(10);
        expect(data.y).toBe(20);
      }
    }
    rtClients[1].addListener('state', funcState);
    rtClients[0].setState('item1', {x:10, y:20});
    rtClients[0].delState('item1');

    await sleep(1000);
    rtClients.forEach((c) => {
      c.close();
      c.disconnect();
    });
    await sleep(2000);
  });

});