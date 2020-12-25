'use strict'

const { docopt } = require('docopt')
const { version } = require('../package.json')

class Cli {
  constructor () {
    const doc =
      `
Add v${version}
Usage:
    add.js [--torrent-url=TORRENT_URL] [--type=TYPE] [options]
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

if (args['--type']) {
  process.env.TORRENT_TYPE = args['--type']
}

const { torrentFromUrl, add } = require('./utils.js')

async function run () {
  if (process.env.TORRENT_URL) {
    const fetchedTorrent = await torrentFromUrl(process.env.TORRENT_URL)
    if (fetchedTorrent) {
      await add(process.env.TORRENT_URL, fetchedTorrent)
    }
  }
  process.exit()
}

run()
