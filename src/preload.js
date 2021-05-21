'use strict'

const { docopt } = require('docopt')
const { version } = require('../package.json')
const { torrentsFromPreload } = require('./utils.js')

class Cli {
  constructor () {
    const doc =
      `
Preload v${version}
Usage:
    preload.js [--preload-url=PRELOAD_URL] [options]
    preload.js -h | --help | --version
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

if (args['--preload-url']) {
  process.env.PRELOAD_URL = args['--preload-url']
}

if (!process.env.PRELOAD_URL) {
  throw Error('PRELOAD_URL is required')
}

if (!process.env.REDIS_HOST) {
  throw Error('REDIS_HOST is required')
}

if (!process.env.REDIS_PORT) {
  throw Error('REDIS_PORT is required')
}

const asyncRedis = require('async-redis')

const redisClient = asyncRedis.createClient({ host: process.env.REDIS_HOST, port: parseInt(process.env.REDIS_PORT) })

redisClient.on('connect', function () {
  console.info('Redis client connected')
})

redisClient.on('error', function (err) {
  console.error('Redis error', err)
})

const torrents = torrentsFromPreload(process.env.PRELOAD_URL)

async function preload () {
  const existing = await redisClient.hkeys('torrents')
  const missing = torrents.filter(t => !(existing.includes(t._id)))
  console.info(`${missing.length} torrents to add`)

  for (const t of missing) {
    await redisClient.hset('torrents', t._id, JSON.stringify(t))
  }
  process.exit()
}

preload()
