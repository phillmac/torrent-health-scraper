'use strict'

const { docopt } = require('docopt')
const { version } = require('../package.json')

class Cli {
  constructor () {
    const doc =
      `
Debug v${version}
Usage:
    prune-queue.js -h | --help | --version
    prune-queue.js [options]
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

const { redisClient, lock } = require('./redis.js')

setInterval(async () => {
  const queued = await redisClient.smembersAsync('queue')
  setTimeout(async () => {
    const unlock = await lock('qLock')
    const remove =
    (await redisClient.smembersAsync('queue'))
      .filter(q => queued.includes(q))

    if (remove.length > 0) {
      await redisClient.sremAsync('queue', ...remove)
      console.info(`Removed ${remove}`)
    }
    unlock()
  }, 60 * 60 * 1000)
}, 60 * 60 * 1000)
