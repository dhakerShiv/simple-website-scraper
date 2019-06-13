const path          = require('path')
const basePath      = path.dirname(require.main.filename)
const userNodeApis  = require(path.join(basePath, 'apis-node'))

async function apiRunner (funcName, actions, ...args) {
  if (userNodeApis[funcName])
    return userNodeApis[funcName].call(null, actions, ...args)
}

module.exports.apiRunner = apiRunner