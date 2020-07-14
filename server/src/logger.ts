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

import * as Log4js from "log4js";
import * as fs from 'fs';

const defaultLogDir = "./log";

const defaultConfig = {
  "appenders": {
    "debug": {
      "type":     "dateFile",
      "filename": `${defaultLogDir}/all.log`
    },
    "info": {
      "type":     "dateFile",
      "filename": `${defaultLogDir}/all.log`
    },
    "warning": {
      "type":     "dateFile",
      "filename": `${defaultLogDir}/all.log`
    },
    "error": {
      "type":     "dateFile",
      "filename": `${defaultLogDir}/all.log`
    },
    "console": {
      "type": "console"
    },
    "stdout": {
      "type": "stdout"
    }
  },
  "categories": {
    "default": {
      "appenders": [
        "info"
        ,"console"
        ,"stdout"
      ]
      ,"level": "INFO"
    },
    "debug": {
      "appenders": [
        "debug"
        ,"console"
        ,"stdout"
      ]
      ,"level": "DEBUG"
    },
    "info": {
      "appenders": [
        "info"
        ,"console"
        ,"stdout"
      ]
      ,"level": "INFO"
    },
    "warning": {
      "appenders": [
        "warning"
        ,"console"
        ,"stdout"
      ]
      ,"level": "WARN"
    },
    "error": {
      "appenders": [
        "error"
        ,"console"
        ,"stdout"
      ]
      ,"level": "ERROR"
    }
  }
}


export class Logger {

  public static init(path?: any) {
    let conf: any = defaultConfig;
    if (path) conf = JSON.parse(fs.readFileSync(path, 'utf8'));
    Log4js.configure(conf as Log4js.Configuration);
  }

  public static Debug(message: string): void {
   Log4js.getLogger("debug").debug(message);
  }

  public static Info(message: string): void {
    Log4js.getLogger("info").info(message);
  }

  public static Warning(message: string): void {
    Log4js.getLogger("warning").warn(message);
  }

  public static Error(message: string): void {
    Log4js.getLogger("error").error(message);
  }
}