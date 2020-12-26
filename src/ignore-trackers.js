'use strict'
if (!process.env.MAX_ERRORS) {
  throw Error('MAX_ERRORS is required')
}

if (!process.env.MIN_ERRORS) {
  throw Error('MIN_ERRORS is required')
}

if (!process.env.ERROR_AGE) {
  throw Error('ERROR_AGE is required')
}

if (!process.env.EVENT_AGE) {
  throw Error('EVENT_AGE is required')
}

const { redisClient, lock } = require('./redis.js')

const maxErrors = parseInt(process.env.MAX_ERRORS)

const minErrors = parseInt(process.env.MIN_ERRORS)

const errorAge = parseInt(process.env.ERROR_AGE)

const eventAge = parseInt(process.env.EVENT_AGE)

console.info({ maxErrors, minErrors, errorAge, eventAge })

let lockout = false

async function run () {
  if (!lockout) {
    try {
      lockout = true
      const fails = {}
      const unlock = await lock('eLock')
      const trackerErrors = await redisClient.hgetallAsync('tracker_errors')
      const trackerEventsRaw = (await redisClient.hgetallAsync('tracker_events') ?? {})
      const trackerEvents = Object.fromEntries(Object.keys(trackerEventsRaw).map(k => [k, JSON.parse(trackerEventsRaw[k]) ?? []]))
      const events = Object.fromEntries(Object.keys(trackerEvents).map(k => [k, Array.from(trackerEvents[k])]))
      const tNow = Math.floor(new Date() / 1000)
      const trackerIgnore = []

      for (const tErr of Object.keys(trackerErrors)) {
        fails[tErr] = JSON.parse(trackerErrors[tErr]).filter((f) => f + errorAge > tNow)
        if (trackerErrors[tErr].length !== fails[tErr].length) {
          await redisClient.hsetAsync('tracker_errors', tErr, JSON.stringify(fails[tErr]))
        }
        if (fails[tErr].length >= maxErrors) {
          trackerIgnore.push(tErr)
        }
        console.debug(tErr, fails[tErr].length)
      }

      console.debug({ trackerIgnore })

      const expBackoffFilter = (tracker) => {
        const eventsList = events[tracker]
        if (!eventsList) {
          console.debug(`No events for ${tracker}`)
          return true
        }
        const last = Math.max(...eventsList)
        const backoffTL = Math.pow(2, eventsList.length)
        const result = last + backoffTL < tNow
        console.debug(`${tracker} backoff expired: ${JSON.stringify({ last, tNow, result, count: eventsList.length, backoffTL })}`)
        return result
      }
      const blContents = await redisClient.smembersAsync('tracker_ignore')

      const blAdd = trackerIgnore.filter((tAdd) => !(blContents.includes(tAdd)))
      if (blAdd.length > 0) {
        await redisClient.saddAsync('tracker_ignore', ...blAdd)
        for (const addedItem of blAdd) {
          if (!(Object.keys(events).includes(addedItem))) {
            events[addedItem] = []
          }
          events[addedItem].push(tNow)
          console.info(`Added ${addedItem} to blacklist`)
        }
      }

      for (const tEvt of Object.keys(events)) {
        events[tEvt] = events[tEvt].filter((e) => e + eventAge > tNow)
        if (!(trackerEvents[tEvt]) || trackerEvents[tEvt].length !== events[tEvt].length) {
          await redisClient.hsetAsync('tracker_events', tEvt, JSON.stringify(events[tEvt]))
        }
      }

      const blRemove = blContents
        .filter((tRem) =>
          (!(trackerIgnore.includes(tRem)) && (fails[tRem].length < minErrors)))
        .filter((tRem) => expBackoffFilter(tRem))
      if (blRemove.length > 0) {
        await redisClient.sremAsync('tracker_ignore', ...blRemove)
        console.info(`Removed ${blRemove} from blacklist`)
      }

      console.debug({ blContents, blAdd, blRemove })

      unlock()
    } catch (err) {
      console.error(err)
      process.exit()
    }
    console.debug(new Date())
    lockout = false
  } else {
    console.debug('Already running')
  }

  if (doRecycle) {
    process.exit()
  }
}

const runInterval = process.env.RUN_INTERVAL ? parseInt(process.env.RUN_INTERVAL) : 180

let doRecycle = false

setInterval(run, runInterval * 1000)

if (process.env.RECYCLE_TIMEOUT) {
  setTimeout(function () {
    doRecycle = true
  }, parseInt(process.env.RECYCLE_TIMEOUT) * 1000)
}
