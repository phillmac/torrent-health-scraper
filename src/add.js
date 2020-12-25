'use strict'

const { docopt } = require('docopt')
const { version } = require('../package.json')

class Cli {
  constructor () {
    const doc =
      `
Add v${version}
Usage:
    add.js [--torrent-url=TORRENT_URL] [options]
    add.js -h | --help | --version
Options:
    --redis-host=REDIS_HOST             Connect to redis on REDIS_HOST
    --redis-port=REDIS_PORT             Connect to redis on REDIS_PORT
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

if (args['--torrent-url']) {
  process.env.TORRENT_URL = args['--torrent-url']
}

async function run () {
  if (process.env.TORRENT_URL) {
    add(await torrentFromUrl(process.env.TORRENT_URL))
  }
}

async function add (torrent) {
    const { redisClient } = require('./redis.js')
    const { infoHash } = torrent
    const exists = null !== await redisClient.hgetAsync('torrents', infoHash)
    console.log({exists, torrent})
}

run()
