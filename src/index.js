'use strict'
if (!process.env.MAX_AGE) {
  throw Error('MAX_AGE is required')
}

if (!process.env.REDIS_HOST) {
  throw Error('REDIS_HOST is required')
}

if (!process.env.REDIS_PORT) {
  throw Error('REDIS_PORT is required')
}

const redis = require('redis-promisify')
const Tracker = require('bittorrent-tracker')
const DHT = require('bittorrent-dht')
const crypto = require('crypto')
const { promisify } = require('util')

const redisClient = redis.createClient({ host: process.env.REDIS_HOST, port: parseInt(process.env.REDIS_PORT) })

const lock = promisify(require('redis-lock')(redisClient))

redisClient.on('connect', function () {
  console.info('Redis client connected')
})

redisClient.on('error', function (err) {
  console.error('Redis error', err)
})

const maxAge = parseInt(process.env.MAX_AGE)
let lockout = false

async function run () {
  if (!lockout) {
    try {
      lockout = true
      const torrents = await redisClient.hgetallAsync('torrents')
      const unlock = await lock('qLock')
      const queued = await redisClient.smembersAsync('queue')
      const workItem = Object.values(torrents)
        .map(t => JSON.parse(t))
        .filter(t => !(queued.includes(t._id)))
        .find(t => isStale(t))
      if (workItem) {
        await redisClient.saddAsync('queue', workItem._id)
        unlock()
        await redisClient.hsetAsync('torrents', workItem._id, JSON.stringify(await scrape(workItem)))
        await redisClient.sremAsync('queue', workItem._id)
      } else {
        unlock()
        console.info('No stale torrents')
      }
    } catch (err) {
      console.error(err)
      process.exit()
    }
    console.debug(new Date())
    lockout = false
  } else {
    console.debug('Already running')
  }
}

async function scrape (torrent) {
  console.debug(`Scraping ${torrent._id}`)
  if (isStaleDHT(torrent)) {
    await scrapeDHT(torrent).catch(err => console.error(err))
  } else {
    console.info('Skipping DHT scrape')
  }
  await scrapeTrackers(torrent)

  console.debug(torrent)
  return torrent
}

function scrapeDHT (torrent) {
  return new Promise((resolve, reject) => {
    console.debug('Scraping DHT peers ...')
    try {
      const dht = new DHT()
      const peers = []
      dht.on('peer', function (peer, _ih, _from) {
        const peerhash = crypto.createHash('md5').update(peer.host + peer.port).digest('hex')
        if (!(peers.includes(peerhash))) {
          peers.push(peerhash)
        }
      })
      dht.lookup(torrent._id, async function () {
        console.debug('DHT scrape complete')
        torrent.dhtData = {
          infoHash: torrent._id,
          peers: peers.length,
          scraped_date: Math.floor(new Date() / 1000)
        }
        resolve()
      })
    } catch (err) {
      reject(err)
    }
  })
}

async function scrapeTrackers (torrent) {
  const trackerData = torrent.trackerData || {}
  const trackers = torrent.trackers.filter((tracker) => isStaleTracker(torrent, tracker))
  const infoHash = torrent._id
  for (const announce of trackers) {
    try {
      console.debug(`Scraping tracker ${announce} ...`)
      trackerData[announce] = await new Promise((resolve, reject) => {
        Tracker.scrape({ infoHash, announce }, (err, data) => {
          console.debug(`Scraped ${announce}`)
          if (err) {
            reject(err)
          } else {
            data.scraped_date = Math.floor(new Date() / 1000)
            resolve(data)
          }
        })
      })
    } catch (err) {
      console.error(err)
    }
  }
  torrent.trackerData = trackerData
}

function isStale (torrent) {
  if (torrent.trackers.length === 0) {
    console.warn(`${torrent._id} has no trackers`)
  }

  if (!(torrent.trackerData)) {
    return true
  }

  if (isStaleDHT(torrent)) {
    return true
  }

  for (const tracker of torrent.trackers) {
    if (isStaleTracker(torrent, tracker)) {
      return true
    }
  }
  return false
}

function isStaleTracker (torrent, tracker) {
  if (!(torrent.trackerData)) {
    return true
  }

  if (!(torrent.trackerData[tracker])) {
    return true
  }

  if (torrent.trackerData[tracker].scraped_date + maxAge < Math.floor(new Date() / 1000)) {
    return true
  }
  return false
}

function isStaleDHT (torrent) {
  if (!(torrent.dhtData)) {
    return true
  }

  if (torrent.dhtData.scraped_date + maxAge < Math.floor(new Date() / 1000)) {
    return true
  }
}

const runInterval = process.env.RUN_INTERVAL ? parseInt(process.env.RUN_INTERVAL) : 30

setInterval(run, runInterval * 1000)
