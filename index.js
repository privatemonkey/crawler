const xml = require('xml')
const promisify = require('util.promisify');
const request = require('request')
const cheerio = require('cheerio')
const { writeFile } = require('fs');
const { empty } = require('cheerio/lib/api/manipulation');

const writeFileAsync = promisify(writeFile);

const URL = 'https://scb.se/hitta-statistik'
const domain = 'https://scb.se'

const file = './data.json';
const fileArr = './dataArr.json';

let COUNT_PROCESSED = 0
let COUNT_WRITTEN = 0
const MAX_PROCESS = 60
const MAX_LEVEL = 4

const callback = (err) => { /** Handle errors */ };

// Follow links only within doFollow
const noFollowStatic = ['footer','sitemap','body','primary-navigation','secondary-navigation','menu-buttons-mobile','header']
const doFollow = ['pageContent','relatedcontentList']
const noFollow = ['menu-buttons-mobile']
const isSameDomain = ['//www.scb.se', '//scb.se']

const skipFiles = ['.aspx','.doc','.docx','.pdf','.xls']
const skipURLs = ["app-eu.readspeaker.com", "contentassets","Javascriptvoid(0)"]


let processedPages = []

let data = {}
let dataArr = []

function toArray(obj) {
  let arr = []

  for (const key in obj) {
    if (Object.entries(obj[key]).length!==0) {

      if (obj[key].isValidURL===true) {
        arr.push(obj[key])
      }
    }
  }

  return arr.sort((arr,b) =>  (arr.id > b.id ? 1 : -1) )
}

function toPath(href) {
  href = href.replace(':','')

  if (href.indexOf('/')>-1) {
    return href.split('/')
  } else {
    return href.split('_')
  }
}

function isSkipURL(el) {
  if (skipURLs.includes(el)) {
    return true;
  } else {
    return false;
  }
}

function checkURL(href) {
  let arrPath = toPath(href)
  let isValidPage = !arrPath.some(isSkipURL)

  if (!skipFiles.some(o => href.indexOf(o)>-1) && isValidPage) {
    return true
  } else {
    return false
  }
}

function toRelations(arr, target) {
  let root = target["root"];

  arr.forEach((el) => {
    let parentId = el.parent

    if (parentId!=='') {
      let parent = target[parentId]

      if (parent.children) {
        if (!parent.children.includes(el.id)) {
          parent.children.push(el.id)
        }
      }
    }
  });

  return arr
}

async function saveXML() {
  const indexItem = {
    //build index item
    url: [
      {
        loc: `${domain}`,
      },
      {
        lastmod: new Date(
          Math.max.apply(
            null,
            dataArr.map((page) => {
              return new Date('05 October 2011 14:48 UTC');
            })
          )
        ).toISOString().split("T")[0],
      },
      { changefreq: "daily" },
      { priority: "1.0" },
    ],
  };

  let items = []

  function toSiteMapItem(items, item) {
    let newItem = {
        url: [
          {
            loc: (`${domain}/${item.href}`).replace('.se//','.se/'),
          },
          {
            lastmod: new Date('05 October 2011 14:48 UTC')
              .toISOString()
              .split("T")[0],
          },
        ],
      }

      items.push(newItem)

      return items;
    }

  const sitemapItems = dataArr.reduce(toSiteMapItem, items);

  const sitemapObject = {
    urlset: [
      {
        _attr: {
          xmlns: "http://www.sitemaps.org/schemas/sitemap/0.9",
        },
      },
      indexItem,
      ...sitemapItems,
    ],
  };

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>${xml(sitemapObject)}`;

  await writeFileAsync("./sitemap.xml", sitemap, "utf8");
}
async function save() {
  if (COUNT_PROCESSED>=MAX_PROCESS && COUNT_WRITTEN>=MAX_PROCESS) {
    console.log('Saving')
    dataArr = toArray(data)
    dataRel = toRelations(dataArr, data)

    await writeFileAsync(file, JSON.stringify({"data":data}), callback)
    await writeFileAsync(fileArr, JSON.stringify(dataArr), callback)

    saveXML()

  } else {
     COUNT_WRITTEN += 1
  }

}

// Array of links
// Key and level from URLs
// Not all pages will have a parent
// Automatic URL hacking (Step by step)

function addKeys(obj, keys) {
  let str = ''

  keys.forEach((key, index) => {
    str = keys.slice(0, index + 1).join('_')

    if (str==="") {
      str = "root"
      keys = ["root"]
    }

    if (!obj[str] && str!=='') {
      obj[str] = {
        id: str,
        href: str,
        short: keys.slice(-1)[0],
        parent: keys.slice(0, (keys.length - 1)).join('_'),
        processed: false,
        level: keys.length,
        isValidURL: checkURL(keys.join('_'))
      }
    }
  })
}

/*
** Add link to collection
*/
function addLink(link) {
  if (link.isInternal) {
    // Register link

    if ((COUNT_PROCESSED <= MAX_PROCESS) && !processedPages.includes(link.id) && link.isValidURL && (link.level <= (MAX_LEVEL + ''))) {
      processedPages.push(link.key)

      addKeys(data, link.path)

      let key = link.path.join('_')

      if (key==="") {
        str = "root"
      }

      data[key] = link
      data[key].processed = true

      console.log('FETCHING ' + COUNT_PROCESSED + '/' + MAX_PROCESS + ': ' + link.href)

      getPage(link.href)
    } else {
      // Debug: console.log('Register ' + link.href)
      addKeys(data, link.path)

      let key = link.path.join('_')

      if (key==="") {
        key = "root"
      }

      // Join link data with existing data
      if (data[key]===undefined) {
        data[key] = link
        data[key].processed = false
      } else {
        // Existing link. Do nothing
      }
    }

    // Check count
    // Check if page has been processed

  } else {
    // Register external link
    //console.log('External' + link.href)
  }
}

function sleep(milliseconds) {
  var start = new Date().getTime();
  for (var i = 0; i < 1e7; i++) {
    if ((new Date().getTime() - start) > milliseconds){
      break;
    }
  }
}

/*
** Find the closest parent ID. If none found, return 'body'
*/
function getParentElement(self) {
  if (self.attribs.id!==undefined) {
    return self.attribs.id
  } else {
    if (self.parent.tagName==='body') {
      return 'body'
    } else {
      return getParentElement(self.parent)
    }
  }
}

function firstCharacter(start, href) {
  if (href.indexOf(start)===0) {
    return true
  } else {
    return false
  }
}


/*
** Check if link is part of the site
** Return a link object
**
** TODO: Checks and warn on missing https (explicit http)
** TODO: Check and warn for javascript links (expecially void)
**
** /hitta-statistik/sverige-i-siffror/miljo/atervinning-av-forpackningar-i-sverige/
*/
function toJSONLink(self, uri) {
  const host = [uri.host]

  let href = self.attribs.href
  let parentElementId = getParentElement(self)
  let arrPath = toPath(href)
  let keys = arrPath.filter((a) => a)
  let id = keys.join('_')
  let parentId = keys.slice(0, (keys.length - 1)).join('_')

  let isValid = (arrPath[0]!==arrPath[1]) ? true : false

  if (checkURL(href)===false) {
    isValid = false
  }

  if (id==="") {
    id = "root"
  }

  if (parentId==="" && id!=="root") {
    parentId = "root"
  }

  let obj = {
    href: href,
    id: id,
    short: keys.slice(-1)[0],
    path: keys,
    parent: parentId,
    parentElement: parentElementId, // Closes ID
    level: keys.length,
    isHTTPS: (arrPath[0]==='https') ? true : false,
    isHTTP:  (arrPath[0]==='http') ? true : false,
    isAnchor: firstCharacter('#', href),
    isRelative: (arrPath[0]==='') ? true : false,
    isOrg: firstCharacter('/', href) + host.some(o => href.indexOf(o)>-1),
    isInternal: (arrPath[0]==='') ? true : false + isSameDomain.some(o => (arrPath[2]===o) ? true : false,),
    group: parentId,
    isValidURL: isValid,
    children: []
  }

  if (obj.isRelative && isValid) {
    obj.href = 'https://' + host + href
  }
  // DEBUG: console.log(obj)
  return obj

}

async function getPage(url) {
  COUNT_PROCESSED += 1
  sleep(1000)

  await request(url, function (err, res, body) {
    if(err)
    {
        console.log(err, "error occured while hitting URL");
    }
    else
    {
        // console.log(body);
        let $ = cheerio.load(body);  //loading of complete HTML body
        let uri = res.request.uri

        let totalLinks = 0
        let contentLinks = 0
        let pageLinks = []

        let pageKey = toPath(uri.pathname).filter((a) => a)

        // Add page to JSON
        addKeys(data, pageKey)

        pageKey = pageKey.join('_')

        $('a').each(function(index){
          if (this.attribs.href) {
            totalLinks += 1

            let link = toJSONLink(this, uri)

            // Link belongs to an area where crawler should follow links
            if (!noFollow.includes(link.parentElement) && link.isValidURL) {
              // console.log(this.attribs.href)
              contentLinks += 1
              addLink(link)
            } else {
              // console.log(link.href)
              addLink(link)
            }

            if (!pageLinks.includes(link.id)) {
              pageLinks.push(link.id)
            }
          }
        })

        let title = $('title').text()
        let modified = $('meta[name="Epi.Revision"]').attr('content')
        let ingres = $('.ingress').text()
        let header = $('h1').text()

        if (pageKey==="") {
          pageKey = "root"
        }

        data[pageKey].id = pageKey
        data[pageKey].modified = modified
        data[pageKey].header = header
        data[pageKey].contentLinks = contentLinks
        data[pageKey].totalLinks = totalLinks
        data[pageKey].href = uri.pathname
        data[pageKey].processed = true
        data[pageKey].isValidURL = true
        data[pageKey].title = title
        data[pageKey].ingres = ingres
        data[pageKey].links = pageLinks
        data[pageKey].children = []

        save()
    }
  })
}

getPage(URL)

