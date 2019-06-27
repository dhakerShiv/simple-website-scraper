const path      = require('path')
const basePath  = path.dirname(require.main.filename)
const config    = require(path.join(basePath, 'config.json'))
const request   = require('request-promise-native')
const fs        = require('fs')
const apiRunner = require(path.join(__dirname, 'apis')).apiRunner
const cdnUrl    = "https://cdn.contentstack.io/v3"
const serverUrl = "https://api.contentstack.io/v3"

function login() {
  print(`\rLogging in...`)
  const options = { 
    method : 'POST',
    url    : serverUrl + '/user-session',
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
    url    : serverUrl + '/user-session',
    headers: {
      'content-type': 'application/json',
      'authtoken'   : config.authtoken,
    },
    json: true 
  }
  return request(options)
}

function checkEntry(contentTypeUid, title) {
  const options = {
    url: cdnUrl + '/content_types/' + contentTypeUid + '/entries/',
    method: "GET",
    headers : {
      "api_key"      : config.api_key,
      "authtoken"    : config.authtoken
    },
    qs: {
      locale     : "en-us",
      query      : {
        title : title
      }
    },
    json: true
  }

  return request(options)
}

async function importEntries (data, contentTypeUid = config.contentUid, method = "POST") {
  const response = await checkEntry(contentTypeUid, data.title)

  if (response && response.entries && response.entries.length)
  {
    response.entry = response.entries[0]

    if (method === "POST")
      return response

    data.uid = response.entry .uid
  }

  let url = serverUrl + '/content_types/' + contentTypeUid + '/entries/' + (method == "put" && data.uid || '')

  print(`\rImporting Entry...`)
	const options = {
		url,
		method,
		headers : {
      "api_key"      : config.api_key,
      "authtoken"    : config.authtoken,
      'Content-Type' : 'application/json'
    },
    body: {
      entry: data
    },
    qs: {
      "locale": config.locale
    },
    json: true
  }
  return request(options)
}

function download (uri, filename) {
  print(`\rDownloading ${filename}`)
	return new Promise( (resolve, reject) => {
    request(uri)
    .pipe(fs.createWriteStream("./media/" + filename))
    .on('close', function(){
      resolve()
    })
    .on('error', function(err){
      reject(err)
    })
	})
}

function checkAsset (filename) {
  const options = {
    url     : cdnUrl + '/assets/',
    method  : "GET",
    headers : {
      "api_key"   : config.api_key,
      "authtoken" : config.authtoken
    },
    qs: {
      locale : "en-us",
      query  : {
        filename : filename
      }
    },
    json: true
  }

  return request(options)
}

async function getAndUploadAssets (url) {
  let filename  = url.split("/")[url.split("/").length-1]

  if (!/^http|^https|^www./.test(url))
    url = config.baseUrl + url.replace(/^\//, '')

  const headerInfo = await request.head(url)

  // Call modifyAssetName node api
  const newFilename = await apiRunner('modifyAssetName', {}, {headerInfo, url})

  filename = newFilename || filename

  const response = await checkAsset(filename)

  if (response && response.assets && response.assets.length)
  {
    response.asset = response.assets[0]
    return response
  }

  return download(url, filename)
  .then( (data) => uploadAssets(filename))
}

function uploadAssets(filename) {
  print(`\rUploading ${filename}`)
  const requestOptions = {
    uri    : "https://api.contentstack.io/v3/assets",
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

  assets.append('asset[upload]', fs.createReadStream(path.join(basePath, "./media/", filename)))
  assets.append("asset[parent_uid]", config.parentUid)
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