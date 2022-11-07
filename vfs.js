/**
 * Copyright JS Foundation and other contributors, http://js.foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

const Stream = require('stream')
const got = require('got')

module.exports = function (teamId, projectId) {
    'use strict'

    const makeURL = (filename) => {
        const fn = encodeURI(filename.replace(/\\/g, '/'))
        const ti = encodeURI(teamId)
        const pi = encodeURI(projectId)
        return `http://127.0.0.1:3001/v1/files/${ti}/${pi}/${fn}`
    }
    const normaliseError = (err, filename) => {
        let niceError = new Error('Unknown Error')
        let statusCode = null
        niceError.code = 'UNKNOWN'
        if (typeof err === 'string') {
            niceError = new Error(err)
        } else if (err?._normalised) {
            return err // already normailised
        }
        if (err?.response) {
            statusCode = err.response.statusCode
            if (err.response.body) {
                let childErr = {}
                try {
                    childErr = { ...JSON.parse(err.response.body) }
                } catch (_error) { /* do nothing */ }
                niceError.message = childErr.message || niceError.message
                niceError.code = childErr.code || niceError.code
                niceError.stack = childErr.stack || niceError.stack
            }
        }
        if (/route.*not found/gi.test(niceError.message) && statusCode === 404) {
            niceError.message = 'ENOENT: no such file or directory' + (filename ? `, '${filename}'` : '')
            niceError.code = 'ENOENT'
        }
        niceError.stack = niceError.stack || err.stack
        niceError.code = niceError.code || err.code
        niceError._normalised = true // prevent double processing
        return niceError
    }

    return {
        unlink (filename, callback) {
            const url = makeURL(filename)
            got.delete(url)
                .then(() => {
                    callback()
                })
                .catch(err => {
                    callback(normaliseError(err, filename))
                })
        },
        ensureDir (dirName, callback) {
            const url = makeURL(dirName)
            const options = {
                headers: {
                    FF_MODE: 'ensureDir'
                }
            }
            got.post(url, options)
                .then((body) => {
                    callback(null, (body && body.rawBody) || null)
                })
                .catch(_err => {
                    callback(normaliseError('operation not permitted'))
                })
        },
        writeFile (filename, buffer, callback) {
            const url = makeURL(filename)
            const options = {
                headers: {
                    'Content-Type': 'application/octet-stream'
                },
                body: buffer
            }
            got.post(url, options)
                .then((body) => {
                    callback(null, (body && body.rawBody) || null)
                })
                .catch(err => {
                    callback(normaliseError(err))
                })
        },
        appendFile (filename, buffer, callback) {
            const url = makeURL(filename)
            const options = {
                headers: {
                    'Content-Type': 'application/octet-stream',
                    FF_MODE: 'append'
                },
                body: buffer
            }
            got.post(url, options)
                .then((body) => {
                    callback(null, (body && body.rawBody) || null)
                })
                .catch(err => {
                    callback(normaliseError(err, filename))
                })
        },
        readFile (filename, callback) {
            const url = makeURL(filename)
            const options = {
                headers: {
                    'Content-Type': 'application/octet-stream'
                }
            }
            got.get(url, options)
                .then((body) => {
                    callback(null, (body && body.rawBody) || null)
                })
                .catch(err => {
                    if (err?.request?.statusCode === 404) {
                        callback(normaliseError({ code: 'ENOENT', message: 'ENOENT: no such file or directory' }, filename))
                    } else {
                        callback(normaliseError(err, filename))
                    }
                })
        },
        createReadStream (filename) {
            const readableStream = new Stream.Readable({
                highWaterMark: 64000,
                read () { }
            })
            this.readFile(filename, (err, buf) => {
                if (err) {
                    readableStream.emit('error', err)
                    readableStream.destroy()
                    return
                }
                readableStream.push(buf)
                setImmediate(() => {
                    if (readableStream && readableStream.readable) {
                        readableStream.push(null) // end of file
                    }
                })
            })
            return readableStream
        }
    }
}
