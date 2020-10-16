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

/*
 * This script generates a code containing JWT which will be imported by test codes.
 * The output code is "token.ts".
 */

const jwt = require('jsonwebtoken');
const fs = require('fs');


const generateJwt = (email) => {
  const payload = {
    'sub': email,
    'iat': Math.floor(new Date().getTime()),
    'aud': 'testRtObj',
    'iss': 'test',
    email,
    'documentName': 'TestDocument'
  };
  const jsonObject = JSON.parse(fs.readFileSync('./test.json', 'utf8'));
  return jwt.sign(payload, jsonObject.token.privateKey, {algorithm: 'ES256'});
};


const token = generateJwt('test@example.com');

const tokenSource = `export const testToken = '${token}';`;
fs.writeFile('token.ts', tokenSource, (err) => {
  if (err) throw err;
  console.log('success');
});
