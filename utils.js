module.exports = {
    getHTTPProxyAgent
}

/**
 * Get proxy agents for HTTP and/or HTTPS connections
 * @param {import('http').AgentOptions} proxyOptions - proxy options
 * @returns {{http: import('http-proxy-agent').HttpProxyAgent | undefined, https: import('https-proxy-agent').HttpsProxyAgent | undefined}}
 */
function getHTTPProxyAgent (proxyOptions) {
    const agent = {}
    if (process.env.http_proxy) {
        const HttpAgent = require('http-proxy-agent').HttpProxyAgent
        agent.http = new HttpAgent(process.env.http_proxy, proxyOptions)
    }
    if (process.env.https_proxy) {
        const HttpsAgent = require('https-proxy-agent').HttpsProxyAgent
        agent.https = new HttpsAgent(process.env.https_proxy, proxyOptions)
    }
    return agent
}
