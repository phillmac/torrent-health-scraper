'use strict'

const { docopt } = require('docopt')
const { version } = require('../package.json')
const readline = require('readline')
const fs = require('fs')

class Cli {
  constructor() {
    const doc =
      `
Scrape v${version}
Usage:
    scrape.js [options]
    scrape.js --torrent-hash=TORRENT_HASH [options]
    scrape.js --torrent-hashes-stdin [options]
    scrape.js --torrent-hashes-stdin-ln [options]
    scrape.js -h | --help | --version
Options:
    --redis-host=REDIS_HOST             Connect to redis on REDIS_HOST
    --redis-port=REDIS_PORT             Connect to redis on REDIS_PORT
    --ignore-queue-lock
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

if (args['--torrent-hash']) {
  process.env.TORRENT_HASH = args['--torrent-hash']
}

const { redisClient, lock } = require('./redis.js')
const { updateStats } = require('./scrape-functions.js')(redisClient, lock)

const ignoreQueueLock = Boolean(args['--ignore-queue-lock'])

if (process.env.TORRENT_HASH !== '' && process.env.TORRENT_HASH !== undefined) {
  (async () => {
    console.info(`Scraping hash ${process.env.TORRENT_HASH}`)
    await updateStats(process.env.TORRENT_HASH, ignoreQueueLock)
    console.info('Finished')
    await redisClient.quitAsync()
    process.exit()
  })()
} else if (args['--torrent-hashes-stdin']) {
  (async () => {
    const hashesRaw = fs.readFileSync(0, 'utf-8').trim()
    const hashes = hashesRaw.split(' ')
    for (const h of hashes) {
      console.info(`Scraping hash ${h} [${hashes.indexOf(h)}/${hashes.length + 1}]`)
      await updateStats(h, ignoreQueueLock)
      console.info('Finished')
    }
    await redisClient.quitAsync()
    process.exit()
  })()
} else if (args['--torrent-hashes-stdin-ln']) {
  (async () => {
    const rl = readline.createInterface({
      input: process.stdin
    })

    for await (const line of rl) {
      const h = line.trim()
      console.info(`Scraping hash ${h}`)
      await updateStats(h, ignoreQueueLock)
      console.info('Finished')
    }
    await redisClient.quitAsync()
    process.exit()
  })()
}
