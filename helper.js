const path      = require('path')
const basePath  = path.dirname(require.main.filename)
const config    = require(path.join(basePath, 'config.json'))
const request   = require('request-promise-native')
const fs        = require('fs')
const apiRunner = require(path.join(__dirname, 'apis')).apiRunner

function login() {
  print(`\rLogging in...`)
  const options = { 
    method : 'POST',
    url    : 'https://api.contentstack.io/v3/user-session',
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
    url    : 'https://api.contentstack.io/v3/user-session',
    headers: {
      'content-type': 'application/json',
      'authtoken'   : config.authtoken,
    },
    json: true 
  }
  return request(options)
}

function importEntries (data, contentTypeUid = config.contentUid, method = "POST") {
  print(`\rImporting Entry...`)
	const options = {
		url:'https://api.contentstack.io/v3/content_types/' + contentTypeUid + '/entries/',
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

async function getAndUploadAssets (url) {
  let filename  = url.split("/")[url.split("/").length-1]

  if (!/^http|^https|^www./.test(url))
    url = config.baseUrl + url.replace(/^\//, '')

  let headerInfo = await request.head(url)

  // Call modifyAssetName node api
  const newFilename = await apiRunner('modifyAssetName', {}, {headerInfo, url})

  filename = newFilename || filename

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