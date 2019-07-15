module.exports = ({http}, config) => {
    Array.prototype.flatMap = function(callback) {
        return this.reduce((acc, el) => acc.concat(callback(el)), [])
    }

    const GET = http.GET({auth: config.auth})

    const api = (url, resultKey, listKey) => {
        const fetch = start => GET(url.includes('?') ? `${url}&os_authType=basic&start-index=${start}` : `${url}?os_authType=basic&start-index=${start}`, null, config.cache)
            .then(JSON.parse)
            .then(result => result.errors
                ? Promise.reject(result.errors)
                : result)
            .then(result => !resultKey || result[resultKey]['start-index'] + result[resultKey]['max-result'] > result[resultKey].size
                ? resultKey && listKey ? result[resultKey][listKey] : result
                : fetch(result[resultKey]['start-index'] + result[resultKey]['max-result'])
                    .then(nextResult => result[resultKey][listKey].concat(nextResult)))
        return fetch(0)
    }

    const state = build => {
        if (build.lifeCycleState === 'InProgress') return 'InProgress'
        if (build.lifeCycleState === 'NotBuilt') return 'Failed'
        if (build.lifeCycleState === 'Queued') return 'InProgress'
        return build.state
    }

    return {
        builds: () => api(`${config.host}/rest/api/latest/result/${config.project}-${config.plan}.json?includeAllStates`, 'results', 'result')
            .then(builds => builds.map(build => ({
                id: build.key,
                state: state(build),
                number: build.number,
                url: `https://${config.host}/browse/${config.project}-${config.plan}-${build.number}`
            }))),
        deployments: () => api(`${config.host}/rest/api/latest/deploy/project/forPlan.json?planKey=${config.project}-${config.plan}`)
            .then(deployments => Promise.all(deployments.map(deployment => api(`${config.host}/rest/api/latest/deploy/dashboard/${deployment.id}.json`).then(deployments => deployments[0]))))
            .then(deployments => deployments.flatMap(deployment => deployment.environmentStatuses.map(environment => ({
                id: environment.deploymentResult.id,
                state: environment.deploymentResult.deploymentState,
                url: `https://${config.host}/deploy/viewDeploymentResult.action?deploymentResultId=${environment.deploymentResult.id}`,
                date: environment.deploymentResult.finishedDate || (new Date()).getTime()
            }))))
    }
}
