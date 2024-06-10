const should = require('should') // eslint-disable-line no-unused-vars
const utils = require('../utils.js')

describe('utils', () => {
    describe('getHTTPProxyAgent', function () {
        const HttpProxyAgent = require('http-proxy-agent').HttpProxyAgent
        const HttpsProxyAgent = require('https-proxy-agent').HttpsProxyAgent

        it('should return an agent object without any http or https proxy when env vars are not set', function () {
            process.env.http_proxy = ''
            process.env.https_proxy = ''
            const agent = utils.getHTTPProxyAgent()
            agent.should.not.have.property('http')
            agent.should.not.have.property('https')
        })
        it('should return an agent object with http property when http_proxy is set', function () {
            process.env.http_proxy = 'http://proxy:8080'
            process.env.https_proxy = ''
            const agent = utils.getHTTPProxyAgent()
            agent.should.have.property('http').instanceOf(HttpProxyAgent)
            agent.http.should.have.property('proxy')
            agent.http.proxy.should.have.property('hostname', 'proxy')
            agent.http.proxy.should.have.property('port', '8080')
        })
        it('should return an agent object with https property when https_proxy is set', function () {
            process.env.http_proxy = ''
            process.env.https_proxy = 'http://proxy:8080'
            const agent = utils.getHTTPProxyAgent()
            agent.should.have.property('https').instanceOf(HttpsProxyAgent)
            agent.https.should.have.property('proxy')
            agent.https.proxy.should.have.property('hostname', 'proxy')
            agent.https.proxy.should.have.property('port', '8080')
        })
        it('should return an agent object with both http and https properties', function () {
            process.env.http_proxy = 'http://proxy:8080'
            process.env.https_proxy = 'http://proxy:8081'
            const agent = utils.getHTTPProxyAgent()
            agent.should.have.property('http').instanceOf(HttpProxyAgent)
            agent.http.should.have.property('proxy')
            agent.http.proxy.should.have.property('hostname', 'proxy')
            agent.http.proxy.should.have.property('port', '8080')
            agent.should.have.property('https').instanceOf(HttpsProxyAgent)
            agent.https.should.have.property('proxy')
            agent.https.proxy.should.have.property('hostname', 'proxy')
            agent.https.proxy.should.have.property('port', '8081')
        })
        it('should set proxy options', function () {
            process.env.http_proxy = 'http://proxy:8080'
            process.env.https_proxy = 'http://proxy:8081'
            const agent = utils.getHTTPProxyAgent({ timeout: 2345 })
            agent.http.connectOpts.should.have.property('timeout', 2345)
            agent.https.connectOpts.should.have.property('timeout', 2345)
        })
    })
})
