module.exports = async function debugScrape (hash) {
  const { redisClient, lock } = require('./redis.js')
  const functions = (require('./functions.js')(redisClient, lock, true))
  let unlock
  try {
    const rawTorrents = await redisClient.hgetallAsync('torrents')
    const torrentHashes = Object.keys(rawTorrents)
    console.debug({torrentHashes})

    if (!(hash in torrentHashes)) {
      console.error(`Hash ${hash} is not valid`)
    }
    const torrent = JSON.parse(rawTorrents[hash])

    const trackerIgnore = await redisClient.smembersAsync('tracker_ignore')
    console.debug('Waiting for queue lock')
    unlock = await lock('qLock')
    console.debug('Fetching queue contents')
    const queued = await redisClient.smembersAsync('queue')
    if (hash in queued) {
      console.error(`Hash ${hash} is already queued`)
    } else {
      const isStale = functions.isStale(torrent, trackerIgnore)
      const isStaleDHT = functions.isStaleDHT(torrent)
      const dhtScraped = torrent.dhtData.scraped_date
      const trackers = torrent.trackers.map(tracker => {
        return {
          tracker,
          stale: functions.isStaleTracker(torrent, tracker, trackerIgnore),
          lastScraped: torrent.trackerData[tracker].scraped_date
        }
      })
      console.info({
        hash,
        isStale,
        isStaleDHT,
        dhtScraped,
        trackers
      })
      if (isStale) {
        await redisClient.hsetAsync('torrents', hash, JSON.stringify(await functions.scrape(torrent, trackerIgnore)))
        await redisClient.sremAsync('queue', hash)
      }
    }
  } catch (err) {
    console.error(err)
  } finally {
    if (typeof unlock === 'function') unlock()
  }
}
