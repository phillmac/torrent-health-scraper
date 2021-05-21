'use strict'

const { docopt } = require('docopt')
const { version } = require('../package.json')

class Cli {
    constructor () {
        const doc =
        `
Preload v${version}
Usage:
    preload.js [--torrents-file=TORRENTS_FILE] [options]
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

if (args['--torrents-file']) {
    process.env.TORRENTS_FILE = args['--torrents-file']
}


if (!process.env.TORRENTS_FILE) {
  throw Error('TORRENTS_FILE is required')
}

const torrents = require(process.env.TORRENTS_FILE)

const { redisClient } = require('./redis.js')

async function populate () {
  const existing = await redisClient.hkeysAsync('torrents')
  const missing = torrents.filter(t => !(existing?.includes(t._id)))
  console.info(`${missing.length} torrents to add`)

  for (const t of missing) {
    await redisClient.hset('torrents', t._id, JSON.stringify(t))
  }
  process.exit()
}

populate()
