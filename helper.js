const basePath   = '../..'
const config     = require(basePath + '/config.json')
const request    = require('request-promise-native')
const fs         = require('fs')
const cmsBaseUrl = 'https://api.contentstack.io/v3'

function login() {
  print(`\rLogging in...`)
  const options = { 
    method : 'POST',
    url    : cmsBaseUrl + '/user-session',
    headers: {
      'content-type': 'application/json' 
    },
    body: { 
      user: {
        email   : config.email,
        password: config.password
      } 
    },
    json: true 
  }
  return request(options)
}

function logout () {
  print(`\rLogging out...`)
  const options = { 
    method : 'DELETE',
    url    : cmsBaseUrl + '/user-session',
    headers: {
      'content-type': 'application/json',
      'authtoken'   : config.authtoken,
    },
    json: true 
  }
  return request(options)
}

function importEntries (data, contentTypeUid = config.contentUid) {
  print(`\rImporting Entry...`)
	const options = {
		url    : cmsBaseUrl + '/content_types/' + contentTypeUid + '/entries/',
		method : 'POST',
		headers: {
      'api_key'      : config.api_key,
      'authtoken'    : config.authtoken,
      'Content-Type' : 'application/json'
    },
    body: {
      entry: data
    },
    qs: {
      'locale': config.locale
    },
    json: true
  }
  return request(options)
}

function download (uri, filename) {
  print(`\rDownloading ${filename}`)
	return new Promise( (resolve, reject) => {
    request(uri)
    .pipe(fs.createWriteStream('./media/' + filename))
    .on('close', function(){
      resolve({
        'filename': filename,
        'url'     : uri
      })
    })
    .on('error', function(err){
      reject(err)
    })
	})		
}

function getAssets(url) {
  const filename  = url.split('/')[url.split('/').length-1]

  if (!/^http|^https|^www./.test(url))
    url = config.baseUrl + url
  
  return download(url, filename)
}

function getAndUploadAssets (url) {
  return getAssets(url)
  .then( (data) => uploadAssets(data.filename, data.url))
}

function uploadAssets(filename, url) {
  print(`\rUploading ${filename}`)
  const requestOptions = {
    uri    : cmsBaseUrl + '/assets',
    headers: {
      api_key   : config.api_key,
      authtoken : config.authtoken
    },
    method: 'POST',
    qs    : {
      relative_urls: true
    },
    json: true
  }
  
 return new Promise( (resolve, reject) => {
  let assets = request.post(requestOptions, function (err, res, body) {
    if (!err && res.statusCode == 201 && body && body.asset)
      return resolve(body)
    
    reject(err)
  })
  .form()

  assets.append('asset[upload]', fs.createReadStream('./media/' + filename))
  assets.append('asset[parent_uid]', config.parentUid)
 })
}

function print (str) {
  process.stdout.clearLine()
  process.stdout.write(str)
}

exports.print              = print
exports.login              = login
exports.logout             = logout 
exports.importEntries      = importEntries
exports.getAndUploadAssets = getAndUploadAssets