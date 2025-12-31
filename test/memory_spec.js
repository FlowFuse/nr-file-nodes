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
const path = require('path')
const fs = require('fs-extra')
const helper = require('node-red-node-test-helper')
const fileNode = require('../file.js')
const RED = require('node-red/lib/red')
const TeamID = 'test-team-1'
const ProjectID = 'test-project-1'
const testFilesDir = path.join('test', 'resources')
const setup = require('./setup')
const util = require('util')

// Setup the test environment
const driverType = 'memory'
const fileServerPort = 3061
const authServerPort = 3062
const fileServerHost = '127.0.0.1'
const fileServerURL = `http://${fileServerHost}:${fileServerPort}`
const authServerURL = `http://${fileServerHost}:${authServerPort}`

describe('File Nodes with memory backed filer-server', function () {
    let app, authServer
    before(async function () {
        authServer = setup.authServer({
            port: authServerPort,
            authConfig: [
                { token: 'test-token-1', projectId: ProjectID },
                { token: 'test-token-2', projectId: 'test-project-2' }
            ]
        })
        app = await setup.setupFileServerApp({
            teamId: TeamID,
            projectId: ProjectID,
            token: 'test-token-1',
            host: fileServerHost,
            port: fileServerPort,
            base_url: authServerURL,
            driverType
        })
        // sleep 500ms to allow the auth server to start
        await new Promise(resolve => setTimeout(resolve, 500))
    })

    after(async function () {
        if (authServer) {
            const closeAuthServer = util.promisify(authServer.close).bind(authServer)
            await closeAuthServer()
            authServer = null
        }
        if (app) {
            await app.close()
            app = null
        }
    })

    describe('file out Node', function () {
        const relativePathToFile = '50-file-test-file.txt'
        const resourcesDir = testFilesDir
        try {
            fs.mkdirSync(resourcesDir)
        } catch (error) {
            // ignore
        }
        const fileToTest = relativePathToFile
        const wait = 250

        beforeEach(function (done) {
            // fs.writeFileSync(fileToTest, "File message line 1\File message line 2\n");
            process.env.TEST_FILE = fileToTest
            RED.settings.flowforge = {
                teamID: TeamID,
                projectID: ProjectID,
                fileStore: {
                    url: fileServerURL,
                    token: 'test-token-1'
                }
            }
            helper.startServer(done)
        })

        afterEach(function (done) {
            delete RED.settings.fileWorkingDirectory
            fs.removeSync(path.join(resourcesDir, 'file-out-node'))
            helper.unload().then(function () {
                // fs.unlinkSync(fileToTest);
                helper.stopServer(done)
            })
            delete process.env.TEST_FILE
        })

        it('should write to a file', function (done) {
            const flow = [{ id: 'fileNode1', type: 'file', name: 'fileNode', filename: fileToTest, appendNewline: false, overwriteFile: true, wires: [['helperNode1']] },
                { id: 'helperNode1', type: 'helper' }]
            helper.load(fileNode, flow, function () {
                const n1 = helper.getNode('fileNode1')
                const n2 = helper.getNode('helperNode1')
                n2.on('input', function (msg) {
                    try {
                        msg.should.have.property('payload', 'test')
                        done()
                    } catch (e) {
                        done(e)
                    }
                })
                n1.receive({ payload: 'test' })
            })
        })

        it('should write to a file using RED.settings.fileWorkingDirectory', function (done) {
            RED.settings.fileWorkingDirectory = 'my-working-dir'
            const flow = [{ id: 'fileNode1', type: 'file', name: 'fileNode', filename: relativePathToFile, appendNewline: false, overwriteFile: true, wires: [['helperNode1']] },
                { id: 'helperNode1', type: 'helper' }]
            helper.load(fileNode, flow, function () {
                const n1 = helper.getNode('fileNode1')
                const n2 = helper.getNode('helperNode1')
                n2.on('input', function (msg) {
                    try {
                        msg.should.have.property('payload', 'test')
                        done()
                    } catch (e) {
                        done(e)
                    }
                })
                n1.receive({ payload: 'test' })
            })
        })

        it('should write multi-byte string to a file', function (done) {
            const flow = [{ id: 'fileNode1', type: 'file', name: 'fileNode', filename: fileToTest, appendNewline: false, overwriteFile: true, wires: [['helperNode1']] },
                { id: 'helperNode1', type: 'helper' }]
            helper.load(fileNode, flow, function () {
                const n1 = helper.getNode('fileNode1')
                const n2 = helper.getNode('helperNode1')
                n2.on('input', function (msg) {
                    try {
                        msg.should.have.property('payload', '試験')
                        done()
                    } catch (e) {
                        done(e)
                    }
                })
                n1.receive({ payload: '試験' })
            })
        })

        it('should append to a file and add newline', function (done) {
            const flow = [{ id: 'fileNode1', type: 'file', name: 'fileNode', filename: fileToTest, appendNewline: true, overwriteFile: false, wires: [['helperNode1']] },
                { id: 'helperNode1', type: 'helper' }]
            helper.load(fileNode, flow, function () {
                const n1 = helper.getNode('fileNode1')
                const n2 = helper.getNode('helperNode1')
                let count = 0
                const data = ['test2', true, 999, [2]]

                n2.on('input', function (msg) {
                    try {
                        msg.should.have.property('payload')
                        data.should.containDeep([msg.payload])
                        if (count === 3) {
                            done()
                        }
                        count++
                    } catch (e) {
                        done(e)
                    }
                })

                n1.receive({ payload: 'test2' }) // string
                setTimeout(function () {
                    n1.receive({ payload: true }) // boolean
                }, 30)
                setTimeout(function () {
                    n1.receive({ payload: 999 }) // number
                }, 60)
                setTimeout(function () {
                    n1.receive({ payload: [2] }) // object (array)
                }, 90)
            })
        })

        it('should append to a file after it has been deleted ', function (done) {
            const flow = [{ id: 'fileNode1', type: 'file', name: 'fileNode', filename: fileToTest, appendNewline: false, overwriteFile: false, wires: [['helperNode1']] },
                { id: 'helperNode1', type: 'helper' }]

            helper.load(fileNode, flow, function () {
                const n1 = helper.getNode('fileNode1')
                const n2 = helper.getNode('helperNode1')
                const data = ['one', 'two', 'three', 'four']
                let count = 0

                n2.on('input', function (msg) {
                    try {
                        msg.should.have.property('payload')
                        data.should.containDeep([msg.payload])
                        try {
                            if (count === 1) {
                                setTimeout(function () {
                                    // Send two more messages to the file
                                    n1.receive({ payload: 'three' })
                                    n1.receive({ payload: 'four' })
                                }, wait)
                            }
                            if (count === 3) {
                                done()
                            }
                        } catch (err) {
                            done(err)
                        }
                        count++
                    } catch (e) {
                        done(e)
                    }
                })

                // Send two messages to the file
                n1.receive({ payload: 'one' })
                n1.receive({ payload: 'two' })
            })
        })
        it('should not be able to write beyond set quota', function (done) {
            const flow = [{ id: 'fileNode1', type: 'file', name: 'fileNode', filename: 'test.txt', appendNewline: true, overwriteFile: true, wires: [['helperNode1']] },
                { id: 'helperNode1', type: 'helper' },
                { id: 'catchNode1', type: 'catch', wires: [['helperNode1']] }]
            helper.load(fileNode, flow, function () {
                const n1 = helper.getNode('fileNode1')
                const n2 = helper.getNode('helperNode1')
                n2.on('input', function (msg) {
                    msg.should.have.property('error')
                    msg.error.should.have.property('source').and.be.an.Object()
                    msg.error.source.should.have.property('id', 'fileNode1')
                    done()
                })
                n1.emit('input', { topic: 'test', payload: Buffer.from(Array(3000)).fill('a') })
            })
        })
    })
})
