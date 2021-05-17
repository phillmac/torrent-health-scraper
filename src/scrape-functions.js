const { Client } = require('bittorrent-tracker')
const DHT = require('bittorrent-dht')
const Crypto = require('crypto')

if (!process.env.MAX_AGE) {
  throw Error('MAX_AGE is required')
}

const maxAge = parseInt(process.env.MAX_AGE)

module.exports = function (redisClient, lock, debugVerbose = false) {
  async function scrape (torrent, trackerIgnore) {
    let wasStale = false
    if (isStaleDHT(torrent)) {
      wasStale = true
      await scrapeDHT(torrent).catch(err => console.error(err))
    } else {
      console.info('Skipping DHT scrape')
    }
    const staleTrackers = torrent.trackers
      .filter((tracker) => isStaleTracker(torrent, tracker, trackerIgnore))

    if (staleTrackers.length > 0) {
      wasStale = true

      const trackerResults = await scrapeTrackers(torrent._id, staleTrackers)
      Object.assign(torrent.trackerData, trackerResults)

      const sucessfullTrackers = Object.keys(trackerResults)
      const missingTrackers = staleTrackers.map(t => !sucessfullTrackers.includes(t))
      if (missingTrackers.length > 0) await appendTrackerErrors()
    }

    console.info(`Finished scraping ${torrent._id}`)

    return { wasStale, torrent }
  }

  function scrapeDHT (torrent) {
    return new Promise((resolve, reject) => {
      console.debug('Scraping DHT peers ...')
      try {
        const dht = new DHT()
        const peers = []
        dht.on('error', err => reject(err))
        dht.on('peer', function (peer, _ih, _from) {
          const peerhash = Crypto.createHash('md5').update(peer.host + peer.port).digest('hex')
          if (!(peers.includes(peerhash))) {
            peers.push(peerhash)
          }
        })
        dht.lookup(torrent._id, function () {
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

  function scrapeTrackers (infoHash, announce) {
    return new Promise((resolve, reject) => {
      console.info(`Scraping trackers for ${infoHash}`)
      const results = {}
      let trackersPending = announce.length

      const trackerClient = new Client({
        infoHash,
        announce,
        peerId: new Buffer.from('01234567890123456789'),
        port: 6881
      })

      const resultsComplete = () => {
        trackersPending -= 1
        if (trackersPending <= 0) {
          trackerClient.stop()
          resolve(results)
        }
      }

      trackerClient.on('warning', (err) => {
        console.warn(err)
        resultsComplete()
      })

      trackerClient.on('error', (err) => {
        trackerClient.destroy()
        reject(err)
      })

      trackerClient.on('scrape', (data) => {
        console.info('scrape data', data)
        data.scraped_date = Math.floor(new Date() / 1000)
        results[data.announce] = data
        resultsComplete()
      })

      trackerClient.scrape()
    })
  }

  async function appendTrackerErrors (trackers) {
    const unlock = await lock('eLock')
    for (const t of trackers) {
      const trackerErrors = JSON.parse(await redisClient.hgetAsync('tracker_errors', t)) || []
      trackerErrors.push(Math.floor(new Date() / 1000))
      await redisClient.hsetAsync('tracker_errors', t, JSON.stringify(trackerErrors))
    }
    unlock()
    console.info('Added errors for trackers:', trackers )
  }

  async function updateStats (hash, ignoreQueueLock = false) {
    let unlock
    try {
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

      if (!torrent._id) {
        throw new Error(`Unable to find info for torrent with id ${hash}`)
      }

      if (!unlock) unlock = await lock('qLock')
      await redisClient.saddAsync('queue', hash)
      unlock()
      const { wasStale } = await scrape(torrent, trackerIgnore)
      if (wasStale) {
        await redisClient.hsetAsync('torrents', hash, JSON.stringify(torrent))
      }
      unlock = await lock('qLock')
      await redisClient.sremAsync('queue', hash)
      unlock()
    } catch (err) {
      console.error(err)
    }
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
    return false
  }

  return { scrape, scrapeDHT, scrapeTrackers, appendTrackerErrors, updateStats, isStale, isStaleTracker, isStaleDHT }
}
