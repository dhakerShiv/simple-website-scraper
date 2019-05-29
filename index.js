const basePath      = "../.."
const cheerio       = require('cheerio')
const request       = require('request-promise-native')
const URL           = require('url-parse')
const config        = require(basePath + '/config.json')
const writeJsonFile = require('write-json-file')
const urlsArray     = require(basePath + '/urls.json').urls
const puppeteer     = require('puppeteer')
const helper        = require('./helper')
const fs            = require('fs')
const winston       = require('winston')
let $
let relativePageUrl
let currentUrl
const failedUrls    = []
let browserInstance
let assetsJson = {}

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' })
  ]
})

async function schemaReader (schemaFile, dependency, contenttypeUid) {
  let schema = require(basePath + '/' + schemaFile)
  let schemaResponse = {}
  let resposne
  let mapperJSON = {}

  if (dependency && config.import)
  {
    try {
      mapperJSON = require(basePath + '/mappers/' + schemaFile)
      let title  = eval(schema.title) 
        if (mapperJSON[title])
          return mapperJSON[title].uid
    } catch (ex) {
        mapperJSON = {}
    }
  }

  const schemaKeys = Object.keys(schema)
  
  for (let i = 0; i < schemaKeys.length; i++)
  {
    try {
      // Handle dependency
      if (typeof schema[schemaKeys[i]] === 'object')
        resposne = await schemaReader(schema[schemaKeys[i]].schemaFile, true, schema[schemaKeys[i]].uid)

      if (typeof schema[schemaKeys[i]] !== 'object')
        resposne = await eval(schema[schemaKeys[i]])
      
      schemaResponse[schemaKeys[i]] = resposne
    }
    catch (err) {
      // handle error
      errorHandler(err)
    }
  }

  let uid

  if (config.import)
  {
    let importedResponse = await helper.importEntries(schemaResponse, contenttypeUid)

    if (dependency)
    {
      mapperJSON[importedResponse.entry.title] = {
        uid: importedResponse.entry.uid
      }
  
      uid = importedResponse.entry.uid
      await writeJsonFile("./mappers/" + schemaFile, mapperJSON)
    }
  }

  let fileInParts = schemaFile.split('.')
  fileInParts.pop()
  let dir = "/" + fileInParts.join('')

  let fileName = relativePageUrl.replace(/\//g, "-")

  if (fileName.charAt(0) == '-')
    fileName = fileName.substr(1)

  if (fileName.charAt(fileName.length-1) == '-')
    fileName = fileName.substr(0, fileName.length-1)

  await writeJsonFile("./entries" + dir + "/" + fileName.substring(0, 254) + ".json", schemaResponse)

  return uid
}

async function startProcess () {
  helper.print(`\rStarting process...`)

  if (!fs.existsSync('media'))
  {
    fs.mkdirSync('media')
  }

  try {
    assetsJson = require(basePath + '/assetsMapping.json')
  } catch (e) {
    assetsJson = {}
  }

  // If we need to render pages server side
  if (config.ssr)
    browserInstance =  await puppeteer.launch()

  config.authtokenExists = true

  if (!config.authtoken || config.authtoken == "")
  {
    config.authtokenExists = false
    let response = await helper.login()
    config.authtoken = response.user.authtoken  
  }
  
  return scrapeAll(urlsArray)
  .catch( err => errorHandler(err))
  .then( async () => {
    if (config.ssr)
      await browserInstance.close()

    if (!config.authtokenExists)
      await helper.logout()

    if (failedUrls.length)
      await writeJsonFile("./errors/failed.json", {
        "failed": failedUrls
      })

    let successUrls = urlsArray.filter( url => !failedUrls.includes(url)) || []

    await writeJsonFile("./success/success.json", {
      urls: successUrls
    })

    helper.print(`\r`)

    return {
      "total"  : urlsArray.length,
      "success": successUrls.length,
      "fail"   : failedUrls.length
    }
  })
}

async function scrapeAll (urls) {
  let tempUrl
  let counter       = 0
  let tempUrlsArray = [...urls]

  while (tempUrlsArray.length)
  {
    tempUrl    = tempUrlsArray.pop()
    currentUrl = tempUrl
    
    // Page url
    relativePageUrl = (new URL(tempUrl)).pathname

    await getOnePage(tempUrl)

    if (config.import)
      await writeJsonFile('./assetsMapping.json', assetsJson)

    ++counter
    helper.print(`\rCompleted ${counter} records`)
  }
}

async function getOnePage(url) {
  if (!url)
    return

  return getHtml(url)
  .then( html => {
    $  = cheerio.load(html)
    return schemaReader(config.schemaFile)
  })
  .catch(err => errorHandler(err))
}

function errorHandler (err) {
  logger.log({
    level: 'error',
    message: err.message
  })
  failedUrls.push(currentUrl)
}

async function getHtml (url) {

  if (!config.ssr)
  {
    const options = {
      uri: url
    }
    return request(options)
  }
    
  let tab = await browserInstance.newPage()
  await tab.goto(url, {
    waitUntil: 'networkidle0',
    timeout: 120000,
  })
  let page = await tab.content();
  await tab.close();
  return page;
}

async function rteHandler (dom) {
  if (!dom)
    return ""

  const aTags = dom.find('a')
  let response

  for (let i = 0; i < aTags.length; i++)
  {
    let href = $(aTags[i]).attr('href')
    
    if (/.pdf$/.test(href))
    {
      response = await assetsHandler(href)
      $(aTags[i]).attr('href', response.url)
    }
  }
  
  let imags = dom.find('img')
  
  for (let i = 0; i < imags.length; i++)
  {
    src      = $(imags[i]).attr('src')

    if ((/\.(gif|jpg|jpeg|tiff|png|exif|bmp|webp|bat|bpg)$/i).test(src))
    {
      response = await assetsHandler(src)
      $(imags[i]).attr('src', response.url)
    }
  }

  return dom.html()
}

function seoHandler () {
  seo = {}
  seo.title       = $('title').text()
  seo.description = $('meta[name=description]').attr("content")
  seo.keywords    = $('meta[name=keywords]').attr("content")
  return seo
}

function getRelativeUrl () {
  return relativePageUrl
}

function getUrl () {
  return currentUrl 
}

async function imageHandler (url, type) {
  let response = await assetsHandler(url)

  if (type && type == 'url')
    return response.url

  return response.uid
}

async function assetsHandler (url) {
  if (!url)
    return ""

  let fileName = url.split('/')[url.split('/').length - 1]
  
  let checkFileName = fileName.replace(/[,=]/ig,"_")

  if (assetsJson[checkFileName])
    return assetsJson[checkFileName]

  response = await helper.getAndUploadAssets(url)

  let prefix = "https://images.contentstack.io"

  if (/.pdf$/.test(fileName))
    prefix = "https://assets.contentstack.io"

  response.asset.url = prefix + response.asset.url

  assetsJson[response.asset.filename] = {
    uid: response.asset.uid,
    url: response.asset.url
  }

  return assetsJson[response.asset.filename]
}

exports.scrap             = startProcess
exports.puppeteer         = puppeteer
exports.logger            = logger
exports.imageHandler      = imageHandler
exports.assetsHandler     = assetsHandler
exports.getAndUploadAssets= helper.getAndUploadAssets
exports.rteHandler        = rteHandler
exports.importEntries     = helper.importEntries
exports.getHtml           = getHtml
exports.print             = helper.print