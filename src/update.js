'use strict'

const { docopt } = require('docopt')
const { version } = require('../package.json')

class Cli {
  constructor () {
    const doc =
      `
Update v${version}
Usage:
    update.js [--torrent-url=TORRENT_URL] [options]
    update.js -h | --help | --version
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

const { torrentFromUrl, sleep } = require('./utils.js')

async function run () {
  if (process.env.TORRENT_URL) {
    const fetchedTorrent = await torrentFromUrl(process.env.TORRENT_URL)
    if (fetchedTorrent) {
      await add(process.env.TORRENT_URL, fetchedTorrent)
    }
  }
  process.exit()
}

async function add (link, torrent) {
  const { redisClient, lock } = require('./redis.js')
  const { infoHash, name, created, length, files, announce } = torrent
  const existing = await redisClient.hgetAsync('torrents', infoHash)
  const exists = existing !== null
  const created_unix = Math.floor(Date.parse(created) / 1000)
  const { dhtData, trackerData } = existing
  if (exists) {
    const trackers = Array.from(new Set([...announce, ...existing.trackers]))
    console.log({ infoHash, name, exists, created_unix, length, files: files.length, trackers: trackers.length })
    const updated = { _id: infoHash, name, link, created_unix, size_bytes: length, trackers, dhtData, trackerData }
    const isQueued = true
    while (isQueued) {
      const unlock = await lock('qLock')
      isQueued = queued.includes(updated._id)
      if (!isQueued) {
        await redisClient.hsetAsync('torrents', updated._id, JSON.stringify(updated))
        console.log('Updated')
      }
      unlock()
      sleep(100)
    }
  } else {
    console.log(`Torrent with hash ${infoHash} not found`)
  }
}

run()
