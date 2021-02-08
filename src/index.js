'use strict'

const { redisClient, lock } = require('./redis.js')
const functions = (require('./functions.js')(redisClient, lock))

let lockout = false

async function getWorkItems () {
  const torrentKeys = await redisClient.hkeysAysnc('torrents')
  const trackerIgnore = await redisClient.smembersAsync('tracker_ignore')
  const candidates = torrents
    .filter(t => functions.isStale(t, trackerIgnore))
  const unlock = await lock('qLock')
  const queued = await redisClient.smembersAsync('queue')
  const staleTorrents = candidates
    .filter(t => !(queued.includes(t._id)))
  if (staleTorrents.length > 0) {
    await redisClient.saddAsync('queue', staleTorrents.map(t => t._id))
  }
  unlock()
  return staleTorrents
}

async function process (workItems) {
  for (const wItem of workItems) {
    try {
      await redisClient.hsetAsync('torrents', wItem._id, JSON.stringify(await functions.scrape(wItem, trackerIgnore)))
      await redisClient.sremAsync('queue', wItem._id)
    } catch (err) {
      console.error(err)
    }
  }
}

async function run () {
  if (!lockout) {
    try {
      lockout = true
      const workItems = getWorkItems()
      if (workItems.length > 0) {
        await process(workItems)
      } else {
        console.info('No stale torrents')
      }
    } catch (err) {
      console.error(err)
      process.exit()
    }
    console.debug(new Date())
    lockout = false
  }

  if (doRecycle) {
    process.exit()
  }
}

const runInterval = process.env.RUN_INTERVAL ? parseInt(process.env.RUN_INTERVAL) : 30

let doRecycle = false

setInterval(run, runInterval * 1000)

if (process.env.RECYCLE_TIMEOUT) {
  setTimeout(function () {
    doRecycle = true
  }, parseInt(process.env.RECYCLE_TIMEOUT) * 1000)
}
