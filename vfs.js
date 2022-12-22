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

module.exports = function (RED, _teamID, _projectID, _token) {
    'use strict'
    const teamID = _teamID || (process.env.FF_FS_TEST_CONFIG ? process.env.FLOWFORGE_TEAM_ID : null) || RED.settings.flowforge?.teamID
    const projectID = _projectID || (process.env.FF_FS_TEST_CONFIG ? process.env.FLOWFORGE_PROJECT_ID : null) || RED.settings.flowforge?.projectID
    const projectToken = _token || (process.env.FF_FS_TEST_CONFIG ? process.env.FLOWFORGE_PROJECT_TOKEN : null) || RED.settings.flowforge?.fileStore?.token
    const fileStoreURL = RED.settings.flowforge?.fileStore?.url || 'http://127.0.0.1:3001'

    const client = got.extend({
        // prefixUrl: `${app.config.base_url}/account/check/project`,
        prefixUrl: `${fileStoreURL}/v1/files/${teamID}/${projectID}`,
        headers: {
            'user-agent': 'FlowForge Node-RED File Nodes for Storage Server',
            authorization: 'Bearer ' + projectToken
        },
        timeout: {
            request: 3000
        },
        retry: {
            limit: 0
        }
    })

    const normaliseError = (err, filename) => {
        const niceError = new Error('Unknown Error')
        let statusCode = null
        let childErr = {}
        if (typeof err === 'string') {
            err = new Error(err)
        } else if (err?._normalised) {
            return err // already normalised
        }
        err = err || {}
        if (err?.response) {
            statusCode = err.response.statusCode
            if (err.response.body) {
                try {
                    if (err.response.body && typeof err.response.body === 'object') {
                        childErr = err.response.body
                    } else {
                        childErr = { ...JSON.parse(err.response.body.toString()) }
                    }
                } catch (_error) { /* do nothing */ }
                if (!childErr || typeof childErr !== 'object') {
                    childErr = {}
                }
                Object.assign(niceError, childErr)
                niceError.message = childErr.error || childErr.message || niceError.message
                niceError.code = childErr.code || niceError.code
                niceError.stack = childErr.stack || niceError.stack
            }
        }
        if (err?.code === 'ETIMEDOUT') {
            niceError.code = err.code
            niceError.message = err.message
            niceError.stack = err.stack
        }
        if (/route.*not found/gi.test(niceError.message) && statusCode === 404) {
            niceError.message = 'ENOENT: no such file or directory' + (filename ? `, '${filename}'` : '')
            niceError.code = 'ENOENT'
        } else if (statusCode === 413) {
            niceError.message = 'Quota exceeded.'
            if (childErr && childErr.limit) {
                niceError.message += ` The current limit is ${childErr.limit} bytes.`
            }
            niceError.code = 'quota_exceeded'
        }
        niceError.stack = niceError.stack || err.stack
        niceError.code = niceError.code || err.code || 'unexpected_error'
        niceError._normalised = true // prevent double processing
        return niceError
    }

    return {
        unlink (filename, callback) {
            client.delete(filename)
                .then(() => {
                    callback()
                })
                .catch(err => {
                    callback(normaliseError(err, filename))
                })
        },
        ensureDir (dirName, callback) {
            const options = {
                headers: {
                    FF_MODE: 'ensureDir'
                }
            }
            client.post(dirName, options)
                .then((body) => {
                    callback(null, (body && body.rawBody) || null)
                })
                .catch(_err => {
                    callback(normaliseError('operation not permitted'))
                })
        },
        writeFile (filename, buffer, callback) {
            const options = {
                headers: {
                    'Content-Type': 'application/octet-stream'
                },
                body: buffer
            }
            client.post(filename, options)
                .then((body) => {
                    callback(null, (body && body.rawBody) || null)
                })
                .catch(err => {
                    callback(normaliseError(err))
                })
        },
        appendFile (filename, buffer, callback) {
            const options = {
                headers: {
                    'Content-Type': 'application/octet-stream',
                    FF_MODE: 'append'
                },
                body: buffer
            }
            client.post(filename, options)
                .then((body) => {
                    callback(null, (body && body.rawBody) || null)
                })
                .catch(err => {
                    callback(normaliseError(err, filename))
                })
        },
        readFile (filename, callback) {
            const options = {
                headers: {
                    'Content-Type': 'application/octet-stream'
                }
            }
            client.get(filename, options)
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
