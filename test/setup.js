const FORGE_PROJECT_ID = 'test-project-1'
const FORGE_TEAM_ID = 'test-team-1'
const FORGE_STORAGE_URL = 'http://127.0.0.1:3001'
const FORGE_STORAGE_TOKEN = 'test-token-1'

const should = require('should') // eslint-disable-line no-unused-vars
const http = require('http')
const path = require('path')

// setup authentication endpoint
function authServer (config = {}) {
    const host = config.host || 'localhost'
    const port = config.port || 3002
    const authConfig = config.authConfig || [
        { token: FORGE_STORAGE_TOKEN, projectId: FORGE_PROJECT_ID }
    ]
    const requestListener = function (req, res) {
        try {
            let authToken
            const urlParts = req.url.split('/')
            const projectId = urlParts.pop()
            const route = urlParts.join('/')
            switch (route) {
                case '/account/check/project':
                    authToken = authConfig.find(auth => auth.projectId === projectId)
                    if (req.headers.authorization === ('Bearer ' + authToken.token)) {
                        res.writeHead(200)
                        res.end('{}')
                        return
                    }
                    throw new Error('Unknown request')
                default:
                    res.writeHead(404)
                    res.end(JSON.stringify({ error: 'Resource not found' }))
            }
        } catch (error) {
            res.writeHead(401)
            res.end(JSON.stringify({ error: 'unauthorised' }))
        }
    }

    const authServer = http.createServer(requestListener)
    authServer.listen(port, host, () => {
        // listening for requests on port 3002
    })
    return authServer
}

async function setupFileServerApp (config = {}) {
    process.env.FLOWFORGE_TEAM_ID = config.teamId || FORGE_TEAM_ID
    process.env.FLOWFORGE_PROJECT_ID = config.projectId || FORGE_PROJECT_ID
    process.env.FLOWFORGE_PROJECT_TOKEN = config.token || FORGE_STORAGE_TOKEN
    process.env.FF_FS_TEST_CONFIG = `
FLOWFORGE_HOME: ${config.home || process.cwd()}
FLOWFORGE_PROJECT_ID: ${config.projectId || FORGE_PROJECT_ID}
FLOWFORGE_TEAM_ID: ${config.teamId || FORGE_TEAM_ID}
host: ${config.host || '0.0.0.0'}
port: ${config.port || 3001}
base_url: ${config.base_url || FORGE_STORAGE_URL || 'http://localhost:3002'}
driver:
  # s3, localfs, memory
  type: ${config.driverType || 'localfs'}
  quota: ${config.quota || 2000}
`
    if (config.driverType !== 'memory') {
        process.env.FF_FS_TEST_CONFIG +=
`  options:
    root: ${config.root || path.join('test', 'resources')}
`
    }
    const app = await require('@flowfuse/file-server')
    return app
}

module.exports = {
    authServer,
    setupFileServerApp
}
