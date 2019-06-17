const path          = require('path')
const basePath      = path.dirname(require.main.filename)
const cheerio       = require('cheerio')
const request       = require('request-promise-native')
const URL           = require('url-parse')
const config        = require(path.join(basePath, 'config.json'))
const writeJsonFile = require('write-json-file')
const urlsArray     = require(path.join(basePath, 'urls.json')).urls
const puppeteer     = require('puppeteer')
const helper        = require(path.join(__dirname, 'helper'))
const fs            = require('fs')
const winston       = require('winston')
const apiRunner     = require(path.join(__dirname, 'apis')).apiRunner
let $
let relativePageUrl
let currentUrl
let browserInstance
const failedUrls    = []
let assetsJson      = {}
const logger        = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' })
  ]
})
const actions       = {
  errorHandler,
  logger,
  puppeteer,
  imageHandler,
  assetsHandler,
  getAndUploadAssets: helper.getAndUploadAssets,
  rteHandler,
  importEntries: helper.importEntries,
  getHtml,
  print: helper.print,
  seoHandler
}

async function schemaReader (schemaFile, dependency, contenttypeUid) {
  let schema = require(path.join(basePath, schemaFile))
  let schemaResponse = {}
  let resposne
  let mapperJSON = {}

  if (dependency && config.import)
  {
    try {
      mapperJSON = require(path.join(basePath, 'mappers', schemaFile))
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
     {
       if (schema[schemaKeys[i]].multiple)
       {
         if (!schema[schemaKeys[i]].selector)
           console.log(`Error: Please provide a selector which is applicable for each element in ${schemaKeys[i]} object, inside ${schemaFile} file`) || process.exit()

         const childNodes = await eval(schema[schemaKeys[i]].selector)
         const parentNode = childNodes.parent()
         const childsEntryIds = []
         let childId
         
         for (let j = 0; j < childNodes.length; j++)
         {
           childNodes.remove()
           parentNode.append(childNodes[j])
           childId = await schemaReader(schema[schemaKeys[i]].schemaFile, true, schema[schemaKeys[i]].uid)
           childsEntryIds.push(childId)
         }

         resposne = childsEntryIds
       }

       if (!schema[schemaKeys[i]].multiple)
       {
         resposne = await schemaReader(schema[schemaKeys[i]].schemaFile, true, schema[schemaKeys[i]].uid)
       }
     }

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
    // Call preImport node api
    schemaResponse       = await apiRunner('preImport', actions, schemaResponse)
    let importedResponse = await helper.importEntries(schemaResponse, contenttypeUid)

    if (dependency)
    {
      uid = importedResponse.entry.uid
      mapperJSON[importedResponse.entry.title] = { uid }
  
      await writeJsonFile(path.join("mappers", schemaFile), mapperJSON)
    }
  }

  const dir      = schemaFile.split('.')[0]
  const fileName = (schemaResponse.title || relativePageUrl).replace(/[^a-zA-Z]/g, ' ').trim().replace(/ +/g, '-')

  await writeJsonFile(path.join("entries", dir, fileName.substring(0, 254) + ".json"), schemaResponse)

  return uid
}

async function startProcess () {
  helper.print(`\rStarting process...`)

  if (!fs.existsSync('media'))
  {
    fs.mkdirSync('media')
  }

  try {
    assetsJson = require(path.join(basePath, 'assetsMapping.json'))
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
      await writeJsonFile(path.join(basePath, "./errors/failed.json"), {
        "failed": failedUrls
      })

    let successUrls = urlsArray.filter( url => !failedUrls.includes(url)) || []

    await writeJsonFile(path.join(basePath, "./success/success.json"), {
      urls: successUrls
    })

    console.log("\n")

    return {
      "total"  : urlsArray.length,
      "success": successUrls.length,
      "fail"   : failedUrls.length
    }
  })
}

async function scrapeAll (urls) {
  let PageDOM
  let counter         = 0
  let failure         = 0
  const tempUrlsArray = [...urls]

  // Call scrap node api
  await apiRunner('scrap', actions)
  
  if (config.import)
      await writeJsonFile(path.join(basePath, './assetsMapping.json'), assetsJson)

  while (tempUrlsArray.length)
  {
    currentUrl      = tempUrlsArray.pop()
    relativePageUrl = (new URL(currentUrl)).pathname

    try {
      PageDOM = await getHtml(currentUrl)
      $       = cheerio.load(PageDOM)
      await schemaReader(config.schemaFile)
    }
    catch (err) {
      failedUrls.push(currentUrl)
      await errorHandler(err)
      ++failure
    }

    if (config.import)
      await writeJsonFile(path.join(basePath, './assetsMapping.json'), assetsJson)

    ++counter
    helper.print(`\rScrapped ${counter} URL${ counter > 1 && 's' || ''}, success: ${counter-failure}, fail: ${failure}`)
  }
}

async function errorHandler (err) {
  await logger.log({
    level   : 'error',
    message : err.message,
    stack   : err.stack
  })
}

async function getHtml (url) {
  if (!config.ssr)
  {
    const options = {
      uri: url
    }
    return request(options)
  }
    
  const tab = await browserInstance.newPage()

  await tab.goto(url, {
    waitUntil : 'networkidle0',
    timeout   : 120000,
  })

  const page = await tab.content();
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
  seo.title       = $('meta[name=title]').attr("content")
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

  const fileName      = url.split('/')[url.split('/').length - 1]
  const checkFileName = fileName.replace(/[,=]/ig,"_")

  if (assetsJson[checkFileName])
    return assetsJson[checkFileName]

  response   = await helper.getAndUploadAssets(url)
  let prefix = "https://images.contentstack.io"

  if (/.pdf$/.test(fileName))
    prefix = "https://assets.contentstack.io"

  response.asset.url                  = path.join(prefix, response.asset.url)
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