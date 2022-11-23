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

module.exports = function (RED) {
    'use strict'

    // Do not register nodes in runtime if settings are not provided
    if (
        !RED.settings.flowforge ||
        !RED.settings.flowforge.projectID ||
        !RED.settings.flowforge.teamID ||
        !RED.settings.flowforge.fileStore ||
        !RED.settings.flowforge.fileStore.url
    ) {
        throw new Error('FlowForge file nodes cannot be loaded without required settings')
    }
    const VFS = require('./vfs')
    const os = require('os')
    const path = require('path')
    const iconv = require('iconv-lite')

    function encode (data, enc) {
        if (enc !== 'none') {
            return iconv.encode(data, enc)
        }
        return Buffer.from(data)
    }

    function decode (data, enc) {
        if (enc !== 'none') {
            return iconv.decode(data, enc)
        }
        return data.toString()
    }

    function FileNode (n) {
        // Write/delete a file
        RED.nodes.createNode(this, n)
        this.filename = n.filename
        this.filenameType = n.filenameType
        this.appendNewline = n.appendNewline
        this.overwriteFile = n.overwriteFile.toString()
        this.createDir = n.createDir || false
        this.encoding = n.encoding || 'none'
        const node = this
        const fs = VFS(RED)
        node.wstream = null
        node.msgQueue = []
        node.closing = false
        node.closeCallback = null

        function processMsg (msg, nodeSend, done) {
            let filename = node.filename || ''
            // Pre V3 compatibility - if filenameType is empty, do in place upgrade
            if (typeof node.filenameType === 'undefined' || node.filenameType === '') {
                // existing node AND filenameType is not set - inplace (compatible) upgrade
                if (filename === '') { // was using empty value to denote msg.filename
                    node.filename = 'filename'
                    node.filenameType = 'msg'
                } else { // was using a static filename - set typedInput type to str
                    node.filenameType = 'str'
                }
            }

            RED.util.evaluateNodeProperty(node.filename, node.filenameType, node, msg, (err, value) => {
                if (err) {
                    node.error(err, msg)
                    return done()
                } else {
                    filename = value
                }
            })
            filename = filename || ''
            msg.filename = filename
            let fullFilename = filename
            if (filename && RED.settings.fileWorkingDirectory && !path.isAbsolute(filename)) {
                // fullFilename = path.resolve(path.join(RED.settings.fileWorkingDirectory, filename))
                fullFilename = path.join(RED.settings.fileWorkingDirectory, filename)
            }
            if ((!node.filename) && (!node.tout)) {
                node.tout = setTimeout(function () {
                    node.status({ fill: 'grey', shape: 'dot', text: filename })
                    clearTimeout(node.tout)
                    node.tout = null
                }, 333)
            }
            if (path.isAbsolute(fullFilename)) {
                fullFilename = fullFilename.slice(1)
            }
            if (filename === '') {
                node.warn(RED._('file.errors.nofilename'))
                done()
            } else if (node.overwriteFile === 'delete') {
                fs.unlink(fullFilename, function (err) {
                    if (err) {
                        node.error(RED._('file.errors.deletefail', { error: err.toString() }), msg)
                    } else {
                        node.debug(RED._('file.status.deletedfile', { file: filename }))
                        nodeSend(msg)
                    }
                    done()
                })
            // eslint-disable-next-line no-prototype-builtins
            } else if (msg.hasOwnProperty('payload') && (typeof msg.payload !== 'undefined')) {
                async function ensureDir (name, successCallback) {
                    const dir = path.dirname(name)
                    if (node.createDir) {
                        fs.ensureDir(dir, function (err) {
                            if (err) {
                                node.error(RED._('file.errors.createfail', { error: err.toString() }), msg)
                            }
                            successCallback()
                        })
                    } else {
                        successCallback()
                    }
                }

                ensureDir(fullFilename, function success () {
                    let data = msg.payload
                    if ((typeof data === 'object') && (!Buffer.isBuffer(data))) {
                        data = JSON.stringify(data)
                    }
                    if (typeof data === 'boolean') { data = data.toString() }
                    if (typeof data === 'number') { data = data.toString() }
                    if ((node.appendNewline) && (!Buffer.isBuffer(data))) { data += os.EOL }
                    let buf
                    if (node.encoding === 'setbymsg') {
                        buf = encode(data, msg.encoding || 'none')
                    } else { buf = encode(data, node.encoding) }
                    if (node.overwriteFile === 'true') {
                        fs.writeFile(fullFilename, buf, function (err) {
                            if (err) {
                                node.error(RED._('file.errors.writefail', { error: err.toString() }), msg)
                            } else {
                                nodeSend(msg)
                            }
                            done()
                        })
                    } else {
                        fs.appendFile(fullFilename, buf, function (err) {
                            if (err) {
                                node.error(RED._('file.errors.appendfail', { error: err.toString() }), msg)
                            } else {
                                nodeSend(msg)
                            }
                            done()
                        })
                    }
                })
            } else {
                done()
            }
        }

        function processQueue (queue) {
            const event = queue[0]
            processMsg(event.msg, event.send, function () {
                event.done()
                queue.shift()
                if (queue.length > 0) {
                    processQueue(queue)
                } else if (node.closing) {
                    closeNode()
                }
            })
        }

        this.on('input', function (msg, nodeSend, nodeDone) {
            const msgQueue = node.msgQueue
            msgQueue.push({
                msg,
                send: nodeSend,
                done: nodeDone
            })
            if (msgQueue.length > 1) {
                // pending write exists
                return
            }
            try {
                processQueue(msgQueue)
            } catch (e) {
                node.msgQueue = []
                if (node.closing) {
                    closeNode()
                }
                throw e
            }
        })

        function closeNode () {
            if (node.wstream) { node.wstream.end() }
            if (node.tout) { clearTimeout(node.tout) }
            node.status({})
            const cb = node.closeCallback
            node.closeCallback = null
            node.closing = false
            if (cb) {
                cb()
            }
        }

        this.on('close', function (done) {
            if (node.closing) {
                // already closing
                return
            }
            node.closing = true
            if (done) {
                node.closeCallback = done
            }
            if (node.msgQueue.length > 0) {
                // close after queue processed

            } else {
                closeNode()
            }
        })
    }
    RED.nodes.registerType('file', FileNode)

    function FileInNode (n) {
        // Read a file
        RED.nodes.createNode(this, n)
        this.filename = n.filename
        this.filenameType = n.filenameType
        this.format = n.format
        this.chunk = false
        this.encoding = n.encoding || 'none'
        this.allProps = n.allProps || false
        if (n.sendError === undefined) {
            this.sendError = true
        } else {
            this.sendError = n.sendError
        }
        if (this.format === 'lines') { this.chunk = true }
        if (this.format === 'stream') { this.chunk = true }
        const node = this
        const fs = VFS(RED)
        this.on('input', function (msg, nodeSend, nodeDone) {
            let filename = node.filename || ''
            // Pre V3 compatibility - if filenameType is empty, do in place upgrade
            if (typeof node.filenameType === 'undefined' || node.filenameType === '') {
                // existing node AND filenameType is not set - inplace (compatible) upgrade
                if (filename === '') { // was using empty value to denote msg.filename
                    node.filename = 'filename'
                    node.filenameType = 'msg'
                } else { // was using a static filename - set typedInput type to str
                    node.filenameType = 'str'
                }
            }
            let propertyError = false
            RED.util.evaluateNodeProperty(node.filename, node.filenameType, node, msg, (err, value) => {
                if (err) {
                    node.error(err, msg)
                    propertyError = true
                    // return done()
                } else {
                    filename = (value || '').replace(/\t|\r|\n/g, '')
                }
            })
            if (propertyError) {
                return
            }
            filename = filename || ''
            let fullFilename = filename

            if (filename && RED.settings.fileWorkingDirectory && !path.isAbsolute(filename)) {
                // fullFilename = path.resolve(path.join(RED.settings.fileWorkingDirectory, filename))
                fullFilename = path.join(RED.settings.fileWorkingDirectory, filename)
            }
            if (!node.filename) {
                node.status({ fill: 'grey', shape: 'dot', text: filename })
            }
            if (path.isAbsolute(fullFilename)) {
                fullFilename = fullFilename.slice(1)
            }
            if (filename === '') {
                node.warn(RED._('file.errors.nofilename'))
                nodeDone()
            } else {
                msg.filename = filename
                let lines = Buffer.from([])
                let spare = ''
                let count = 0
                let type = 'buffer'
                let ch = ''
                if (node.format === 'lines') {
                    ch = '\n'
                    type = 'string'
                }
                let getout = false

                const rs = fs.createReadStream(fullFilename)
                    .on('readable', function () {
                        let chunk
                        let m
                        const hwm = rs._readableState.highWaterMark
                        while ((chunk = rs.read()) !== null) {
                            if (node.chunk === true) {
                                getout = true
                                if (node.format === 'lines') {
                                    spare += decode(chunk, node.encoding)
                                    const bits = spare.split('\n')
                                    let i = 0
                                    for (i = 0; i < bits.length - 1; i++) {
                                        m = {}
                                        if (node.allProps === true) {
                                            m = RED.util.cloneMessage(msg)
                                        } else {
                                            m.topic = msg.topic
                                            m.filename = msg.filename
                                        }
                                        m.payload = bits[i]
                                        m.parts = { index: count, ch, type, id: msg._msgid }
                                        count += 1
                                        nodeSend(m)
                                    }
                                    spare = bits[i]
                                }
                                if (node.format === 'stream') {
                                    m = {}
                                    if (node.allProps === true) {
                                        m = RED.util.cloneMessage(msg)
                                    } else {
                                        m.topic = msg.topic
                                        m.filename = msg.filename
                                    }
                                    m.payload = chunk
                                    m.parts = { index: count, ch, type, id: msg._msgid }
                                    count += 1
                                    if (chunk.length < hwm) { // last chunk is smaller that high water mark = eof
                                        getout = false
                                        m.parts.count = count
                                    }
                                    nodeSend(m)
                                }
                            } else {
                                lines = Buffer.concat([lines, chunk])
                            }
                        }
                    })
                    .on('error', function (err) {
                        node.error(err, msg)
                        if (node.sendError) {
                            const sendMessage = RED.util.cloneMessage(msg)
                            delete sendMessage.payload
                            sendMessage.error = err
                            nodeSend(sendMessage)
                        }
                        nodeDone()
                    })
                    .on('end', function () {
                        if (node.chunk === false) {
                            if (node.format === 'utf8') {
                                msg.payload = decode(lines, node.encoding)
                            } else { msg.payload = lines }
                            nodeSend(msg)
                        } else if (node.format === 'lines') {
                            let m = {}
                            if (node.allProps) {
                                m = RED.util.cloneMessage(msg)
                            } else {
                                m.topic = msg.topic
                                m.filename = msg.filename
                            }
                            m.payload = spare
                            m.parts = {
                                index: count,
                                count: count + 1,
                                ch,
                                type,
                                id: msg._msgid
                            }
                            nodeSend(m)
                        } else if (getout) { // last chunk same size as high water mark - have to send empty extra packet.
                            const m = { parts: { index: count, count, ch, type, id: msg._msgid } }
                            nodeSend(m)
                        }
                        nodeDone()
                    })
            }
        })
        this.on('close', function () {
            node.status({})
        })
    }
    RED.nodes.registerType('file in', FileInNode)
}
