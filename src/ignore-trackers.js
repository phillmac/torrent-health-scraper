'use strict'
if (!process.env.MAX_ERRORS) {
  throw Error('MAX_ERRORS is required')
}

if (!process.env.ERROR_AGE) {
  throw Error('ERROR_AGE is required')
}

if (!process.env.REDIS_HOST) {
  throw Error('REDIS_HOST is required')
}

if (!process.env.REDIS_PORT) {
  throw Error('REDIS_PORT is required')
}

const redis = require('redis-promisify')
const { promisify } = require('util')

const redisClient = redis.createClient({ host: process.env.REDIS_HOST, port: parseInt(process.env.REDIS_PORT) })

const lock = promisify(require('redis-lock')(redisClient))

redisClient.on('connect', function () {
  console.info('Redis client connected')
})

redisClient.on('error', function (err) {
  console.error('Redis error', err)
})

const maxErrors = parseInt(process.env.MAX_ERRORS)

const errorAge = parseInt(process.env.ERROR_AGE)

console.info({maxErrors, errorAge})

let lockout = false

async function run () {
  if (!lockout) {
    try {
      lockout = true
      const unlock = await lock('eLock')
      const trackerErrors = await redisClient.hgetallAsync('tracker_errors')
      const tNow = Math.floor(new Date() / 1000)
      const trackerIgnore = []

      for (const tErr of Object.keys(trackerErrors)) {
        const fails = JSON.parse(trackerErrors[tErr]).filter((f) => f + errorAge > tNow)
        if (trackerErrors[tErr].lenght !== fails.lenght) {
          await redisClient.hsetAsync('tracker_errors', tErr, JSON.stringify(fails))
          trackerErrors[tErr] = fails
        }
        if(fails.length >= maxErrors) {
          trackerIgnore.push(tErr)
        }
        console.debug(tErr, fails.length, fails)
      }

      console.debug({trackerIgnore})

      const blContents = await redisClient.smembersAsync('tracker_ignore')
      const blRemove = blContents.filter((tRem) => !(trackerIgnore.includes(tRem)))
      if (blRemove.length > 0) {
        await redisClient.sremAsync('tracker_ignore', ...blRemove)
        console.info(`Removed ${blRemove} from blacklist`)
      }

      const blAdd = trackerIgnore.filter((tAdd) => !(blContents.includes(tAdd)))
      if (blAdd.lenght > 0) {
        await redisClient.saddAsync('tracker_ignore', ...blAdd)
        console.info(`Added ${blAdd} to blacklist`)
      }

      console.debug({blContents, blAdd, blRemove})

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
