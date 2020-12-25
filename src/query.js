'use strict'

const { docopt } = require('docopt')
const { version } = require('../package.json')

class Cli {
  constructor () {
    const doc =
      `
Query v${version}
Usage:
    query.js --torrent-url=TORRENT_URL [options]
    query.js --hash=HASH [options]
    query.js -h | --help | --version
Options:
    --health-url=HEALTH_URL             Get health info from api url
    --redis-host=REDIS_HOST             Connect to redis on REDIS_HOST
    --redis-port=REDIS_PORT             Connect to redis on REDIS_PORT
    --max-age=MAX_AGE                   Maximum age before considering torrent health info stale
`
    const _args = docopt(doc, {
      version: version
    })
    this.args = () => {
      return _args
    }
  }
}

const cli = new Cli()
const args = cli.args()

if (args['--redis-host']) {
  process.env.REDIS_HOST = args['--redis-host']
}

if (args['--redis-port']) {
  process.env.REDIS_PORT = args['--redis-port']
}

if (args['--max-age']) {
  process.env.MAX_AGE = args['--max-age']
}

const { torrentFromUrl, healthFromUrl } = require('./utils.js')

async function run () {
  if (args['--torrent-url']) {
    const torrentUrl = args['--torrent-url']
    const { infoHash } = await torrentFromUrl(torrentUrl)
    query(infoHash)
  }
}

async function query (infoHash) {
  const healthUrl = args['--health-url']
  if (healthUrl) {
    const torrent = await healthFromUrl(healthUrl, infoHash)
    console.log(torrent)
  } else {
    const { redisClient } = require('./redis.js')
    // const torrents = await redisClient.hgetallAsync('torrents')
    // const trackerIgnore = await redisClient.smembersAsync('tracker_ignore')
  }
}

run()
