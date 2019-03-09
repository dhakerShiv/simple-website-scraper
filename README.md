
# Simple website scraper

#### About this Package
This is contentstack headless cms specific only
Provide urls and what to extract and you are good to go

Install:
```
npm install simple-website-scraper

```

You will need to create a config.json and urls.json files as following

config.json

```
{
  "api_key"   : "stack api key",
  "email"     : "xyz@raweng.com",
  "password"  : "xyz",
  "parentUid" : "asstes folder uid",
  "contentUid": "contenttype uid",
  "baseUrl"   : "https://xyz.com",
  "schemaFile": "xyz.json",
  "ssr"       : false,
  "locale"    :"en-us",
  "import"    : false
}

```

urls.json

```
{
  "urls": ["https://xyz.com", "https://xyz.com/abcd", "https://xyz.com/pqrs"]
}

```

Start scraping

```
const scrap = require('simple-website-scraper').scrap

scrap()
.then( response => response)
.catch( err => console.log(err))
```


You have access to some internal variables like - 

```
relativePageUrl 
```