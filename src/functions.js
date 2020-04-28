'use strict'
const Tracker = require('bittorrent-tracker')
const DHT = require('bittorrent-dht')
const crypto = require('crypto')

if (!process.env.MAX_AGE) {
  throw Error('MAX_AGE is required')
}

const maxAge = parseInt(process.env.MAX_AGE)

module.exports = function (redisClient, lock, debugVerbose = false) {
  async function scrape (torrent, trackerIgnore) {
    console.info(`Scraping ${torrent._id}`)
    if (isStaleDHT(torrent)) {
      await scrapeDHT(torrent).catch(err => console.error(err))
    } else {
      console.info('Skipping DHT scrape')
    }
    await scrapeTrackers(torrent, trackerIgnore)

    // console.debug(torrent)
    console.info(`Finished scraping ${torrent._id}`)

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

  async function scrapeTrackers (torrent, trackerIgnore) {
    const trackerData = torrent.trackerData || {}
    const trackers = torrent.trackers
      .filter((tracker) => isStaleTracker(torrent, tracker, trackerIgnore))
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
        const unlock = await lock('eLock')
        const trackerErrors = JSON.parse(await redisClient.hgetAsync('tracker_errors', announce)) || []
        trackerErrors.push(Math.floor(new Date() / 1000))
        await redisClient.hsetAsync('tracker_errors', announce, JSON.stringify(trackerErrors))
        unlock()
      }
    }
    torrent.trackerData = trackerData
  }

  function isStale (torrent, trackerIgnore) {
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
      if (isStaleTracker(torrent, tracker, trackerIgnore)) {
        return true
      }
    }
    return false
  }

  function isStaleTracker (torrent, tracker, trackerIgnore) {
    if (trackerIgnore.includes(tracker)) {
    // console.debug(`Ignoring tracker ${tracker}`)
      return false
    }

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

  return { scrape, scrapeDHT, scrapeTrackers, isStale, isStaleTracker, isStaleDHT }
}
