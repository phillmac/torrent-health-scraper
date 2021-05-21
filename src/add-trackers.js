'use strict'

const { docopt } = require('docopt')
const { version } = require('../package.json')

class Cli {
  constructor () {
    const doc =
      `
Add-Trackers v${version}
Usage:
    add-trackers.js [--trackers-file=TRACKERS_FILE] [options]
    add-trackers.js -h | --help | --version
Options:
    --redis-host=REDIS_HOST             Connect to redis on REDIS_HOST
    --redis-port=REDIS_PORT             Connect to redis on REDIS_PORT
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

if (args['--trackers-file']) {
  process.env.TRACKERS_FILE = args['--trackers-file']
}

if (!process.env.TRACKERS_FILE) {
  throw Error('TRACKERS_FILE is required')
}

if (!process.env.REDIS_HOST) {
  throw Error('REDIS_HOST is required')
}

if (!process.env.REDIS_PORT) {
  throw Error('REDIS_PORT is required')
}

const redis = require('redis-promisify')

const trackers = require(process.env.TRACKERS_FILE)

const redisClient = redis.createClient({ host: process.env.REDIS_HOST, port: parseInt(process.env.REDIS_PORT) })

redisClient.on('connect', function () {
  console.info('Redis client connected')
})

redisClient.on('error', function (err) {
  console.error('Redis error', err)
})

async function addTrackers () {
  const torrents = Object.values(await redisClient.hgetallAsync('torrents')).map(t => JSON.parse(t))
  let addedCount = 0
  for (const t of torrents) {
    for (const a of trackers) {
      if (!(t.trackers.includes(a))) {
        // console.debug(t)
        t.trackers.push(a)
        addedCount++
      }
    }
    await redisClient.hsetAsync('torrents', t._id, JSON.stringify(t))
  }
  console.info(`Updated ${addedCount} torrents`)
}

addTrackers().then(() => process.exit())
