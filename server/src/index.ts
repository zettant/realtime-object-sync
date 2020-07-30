/**
 MIT License

 Copyright (c) 2020 Zettant Inc.

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 SOFTWARE.
 */

import * as express from 'express';
import * as http from 'http';
import * as https from 'https';

import {Logger} from './logger';
import {ExtWebSocket} from './extWebsock';
import {SyncServer} from './server';
import * as fs from 'fs';

Logger.init();
const conf = require('config');

const app = express();
let server: any;
if (conf.cert && conf.cert.serverCert && conf.cert.serverKey && conf.cert.caCert &&
  fs.existsSync(conf.cert.serverKey) &&
  fs.existsSync(conf.cert.serverCert) &&
  fs.existsSync(conf.cert.caCert)) {
  const options = {
    key: fs.readFileSync( conf.cert.serverKey ),
    cert: fs.readFileSync( conf.cert.serverCert ),
    ca: fs.readFileSync( conf.cert.caCert ),
  };
  server = https.createServer(options, app);
} else {
  server = http.createServer(app);
}


export const serverInit = (server: any, config: any) => {
  const wss = new ExtWebSocket.Server({server});
  const syncServer = new SyncServer(config, wss);
  wss.on('connection', (ws: ExtWebSocket) => {
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (message: any) => {
      syncServer.dispatch(ws, message)
    });

    ws.on('close', () => {
      syncServer.close(ws);
      ws.terminate();
    });

    ws.on('error', () => {
      syncServer.close(ws);
      ws.terminate();
    });
  });

  // keep-alive
  setInterval(() => {
    // @ts-ignore
    wss.clients.forEach((ws: ExtWebSocket) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping(null, false);
    })}, 10000);
}

serverInit(server, conf);


if (!module.parent && server) {
  server.listen(process.env.PORT || conf.port, () => {
    // @ts-ignore
    Logger.Info(`Server started on port ${server.address().port}`);
  });
}

export default app;
