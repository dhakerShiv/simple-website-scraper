
# Simple website scraper

#### About this Package
This is contentstack headless cms specific only
Provide urls and what to extract and you are good to go

Install:
```
npm install simple-website-scraper

```

You will need to create a config.json, urls.json and schemaFile files as following

config.json

```
{
  "api_key"   : "stack api key",
  "email"     : "xyz@raweng.com",
  "password"  : "xyz",
  "parentUid" : "asstes folder uid",
  "contentUid": "contenttype uid",
  "baseUrl"   : "https://xyz.com",
  "schemaFile": "authors.json",
  "ssr"       : false,
  "locale"    :"en-us",
  "import"    : false
}

```
1. You can also use authtoken instead of email and password here.

2. ssr = true , turn on server side rendering

3. import = false, import entries and dump on system and do not upload to Contentstack
4. schemaFile: It will guide the framework what needs to be scrapped from the provided URLs using jQuery.


authors.json (schemaFile) : we will map page elements that needs to be scrapped

```json
{
  "title": "$('title')",
  "url": "getRelativeUrl()"
  "name": "$('.author_name').text()",
  "profile_description": "rteHandler($('.author_description'))"
  "seo": {
    "title": "$('meta[name=title]').attr('content')",
    "description": "$('meta[name=description]').attr('content')",
    "keywords": "$('meta[name=keywords]').attr('content')"
  }
}
```

urls.json

```
{
  "urls": ["https://example.com/blog/authors/lucy", "https://example.com/blog/authors/shern", "https://example.com/blog/authors/kety"]
}
```

You have access to some internal variables like - 

```
1. relativePageUrl  //  /blog/authors/shern
2. currentUrl //  https://example.com/blog/authors/shern
3. $ - DOM of the current page
```
You have access to some internal functions like - 

```
seoHandler: It will return meta title, keywords and descriptions in following format
 {
 	"title": "current page meta title",
	"description": "current page meta description",
	"keywords": "current page meta keywords",
 }
 
 getRelativeUrl: It will return relativePageUrl
 getUrl: it will return full URL of current page
 imageHandler: input - src of image, output - uid of image uploaded of Contentstack
 rteHandler: input - dom, output - it will upload all assets/images to Contentstack and update the srcs and links to uploaded assets/images to Contentstack and return updated DOM
 
```

Start scraping

```
const scrap = require('simple-website-scraper').scrap

scrap()
.then( response => response)
.catch( err => console.log(err))
```
