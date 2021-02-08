'use strict'

const { redisClient, lock } = require('./redis.js')
const functions = (require('./functions.js')(redisClient, lock))

let lockout = false

async function run () {
  if (!lockout) {
    try {
      let unlock
      lockout = true
      const torrents = Object.values(await redisClient.hgetallAsync('torrents'))
        .map(t => JSON.parse(t))
      const trackerIgnore = await redisClient.smembersAsync('tracker_ignore')
      unlock = await lock('qLock')
      const queued = await redisClient.smembersAsync('queue')
      const workItem = torrents
        .filter(t => !(queued.includes(t._id)))
        .find(t => functions.isStale(t, trackerIgnore))
      if (workItem) {
        await redisClient.saddAsync('queue', workItem._id)
        unlock()
        await redisClient.hsetAsync('torrents', workItem._id, JSON.stringify(await functions.scrape(workItem, trackerIgnore)))
        //unlock = await lock('qLock')
        await redisClient.sremAsync('queue', workItem._id)
        //unlock()
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
    //console.debug('Already running')
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
