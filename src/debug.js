'use strict'

const { docopt } = require('docopt')
const { version } = require('../package.json')
const readline = require('readline')
const fs = require('fs')

class Cli {
  constructor () {
    const doc =
      `
Debug v${version}
Usage:
    debug.js [options]
    debug.js --torrent-hash=TORRENT_HASH [options]
    debug.js --torrent-hashes-stdin [options]
    debug.js --torrent-hashes-stdin-ln [options]
    debug.js -h | --help | --version
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
const functions = (require('./functions.js')(redisClient, lock, true))

async function debugScrape (hash, ignoreQueueLock = false) {
  let unlock
  try {
    const torrentHashes = await redisClient.hkeysAsync('torrents')

    if (!(torrentHashes.includes(hash))) {
      console.error(`Hash ${hash} is not valid`)
    } else {
      const trackerIgnore = await redisClient.smembersAsync('tracker_ignore')
      console.debug('Waiting for queue lock')
      if (ignoreQueueLock) {
        console.info('Ignoring queue lock')
      } else {
        unlock = await lock('qLock')
        console.debug('Fetching queue contents')
        const queued = await redisClient.smembersAsync('queue')
        if (queued.includes(hash)) {
          console.error(`Hash ${hash} is already queued`)
          unlock()
          return
        }
      }

      const torrent = JSON.parse(await redisClient.hgetAsync('torrents', hash))
      const isStale = functions.isStale(torrent, trackerIgnore)
      const isStaleDHT = functions.isStaleDHT(torrent)
      const dhtScraped = torrent?.dhtData?.scraped_date
      // const trackers = torrent.trackers.map(tracker => {
      //   return {
      //     tracker,
      //     stale: functions.isStaleTracker(torrent, tracker, trackerIgnore),
      //     lastScraped: torrent?.trackerData && tracker in torrent.trackerData ? torrent.trackerData[tracker].scraped_date : 'never',
      //     isBlacklisted: trackerIgnore.includes(tracker)
      //   }
      // })
      console.info({
        hash,
        isStale,
        isStaleDHT,
        dhtScraped //,
        // trackers
      })
      if (isStale) {
        if (!unlock) unlock = await lock('qLock')
        await redisClient.saddAsync('queue', hash)
        unlock()
        await redisClient.hsetAsync('torrents', hash, JSON.stringify(await functions.scrape(torrent, trackerIgnore)))
        unlock = await lock('qLock')
        await redisClient.sremAsync('queue', hash)
        unlock()
      } else {
        if (unlock) unlock()
      }
    }
  } catch (err) {
    console.error(err)
  }
}

if (process.env.TORRENT_HASH !== '' && process.env.TORRENT_HASH !== undefined) {
  (async () => {
    console.info(`Debugging hash ${process.env.TORRENT_HASH}`)
    await debugScrape(process.env.TORRENT_HASH)
    console.info('Finished')
    await redisClient.quitAsync()
    process.exit()
  })()
} else if (args['--torrent-hashes-stdin']) {
  (async () => {
    const hashesRaw = fs.readFileSync(0, 'utf-8').trim()
    const hashes = hashesRaw.split(' ')
    for (const h of hashes) {
      console.info(`Debugging hash ${h} [${hashes.indexOf(h)}/${hashes.length + 1}]`)
      await debugScrape(h, Boolean(args['--ignore-queue-lock']))
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
      console.info(`Debugging hash ${h}`)
      await debugScrape(h, Boolean(args['--ignore-queue-lock']))
      console.info('Finished')
    }
    await redisClient.quitAsync()
    process.exit()
  })()
} else {
  module.exports = debugScrape
}
