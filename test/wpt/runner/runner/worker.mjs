import buffer from 'node:buffer'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setFlagsFromString } from 'node:v8'
import { runInNewContext, runInThisContext } from 'node:vm'
import { parentPort, workerData } from 'node:worker_threads'
import {
  fetch, File, FileReader, FormData, Headers, Request, Response, setGlobalOrigin
} from '../../../../index.js'
import { CloseEvent } from '../../../../lib/websocket/events.js'
import { WebSocket } from '../../../../lib/websocket/websocket.js'

const { initScripts, meta, test, url, path } = workerData

process.on('uncaughtException', (err) => {
  parentPort.postMessage({
    type: 'error',
    error: {
      message: err.message,
      name: err.name,
      stack: err.stack
    }
  })
})

const basePath = join(process.cwd(), 'test/wpt/tests')
const urlPath = path.slice(basePath.length)

const globalPropertyDescriptors = {
  writable: true,
  enumerable: false,
  configurable: true
}

Object.defineProperties(globalThis, {
  fetch: {
    ...globalPropertyDescriptors,
    enumerable: true,
    value: fetch
  },
  File: {
    ...globalPropertyDescriptors,
    value: buffer.File ?? File
  },
  FormData: {
    ...globalPropertyDescriptors,
    value: FormData
  },
  Headers: {
    ...globalPropertyDescriptors,
    value: Headers
  },
  Request: {
    ...globalPropertyDescriptors,
    value: Request
  },
  Response: {
    ...globalPropertyDescriptors,
    value: Response
  },
  FileReader: {
    ...globalPropertyDescriptors,
    value: FileReader
  },
  WebSocket: {
    ...globalPropertyDescriptors,
    value: WebSocket
  },
  CloseEvent: {
    ...globalPropertyDescriptors,
    value: CloseEvent
  },
  Blob: {
    ...globalPropertyDescriptors,
    // See https://github.com/nodejs/node/pull/45659
    value: buffer.Blob
  }
})

// self is required by testharness
// GLOBAL is required by self
runInThisContext(`
  globalThis.self = globalThis
  globalThis.GLOBAL = {
    isWorker () {
      return false
    },
    isShadowRealm () {
      return false
    },
    isWindow () {
      return false
    }
  }
  globalThis.window = globalThis
  globalThis.location = new URL('${url}')
  globalThis.Window = Object.getPrototypeOf(globalThis).constructor
`)

const harness = readFileSync(join(basePath, '../runner/resources/testharness.cjs'), 'utf-8')
runInThisContext(harness)

// add_*_callback comes from testharness
// stolen from node's wpt test runner
// eslint-disable-next-line no-undef
add_result_callback((result) => {
  parentPort.postMessage({
    type: 'result',
    result: {
      status: result.status,
      name: result.name,
      message: result.message,
      stack: result.stack
    }
  })
})

// eslint-disable-next-line no-undef
add_completion_callback((_, status) => {
  parentPort.postMessage({
    type: 'completion',
    status
  })
})

setGlobalOrigin(new URL(urlPath, url))

// Inject any script the user provided before
// running the tests.
for (const initScript of initScripts) {
  runInThisContext(initScript)
}

// Inject any files from the META tags
for (const script of meta.scripts) {
  runInThisContext(script)
}

// A few tests require gc, which can't be passed to a Worker.
// see https://github.com/nodejs/node/issues/16595#issuecomment-340288680
setFlagsFromString('--expose-gc')
globalThis.gc = runInNewContext('gc')

// Finally, run the test.
runInThisContext(test)
