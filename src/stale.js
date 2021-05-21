'use strict'

const { docopt } = require('docopt')
const { version } = require('../package.json')

class Cli {
  constructor () {
    const doc =
      `
Stale v${version}
Usage:
    stale.js [options]
    stale.js -h | --help | --version
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
const { isStale } = require('./scrape-functions.js')(redisClient, lock)

async function getStale () {
  const staleList = (await redisClient.hkeysAsync('torrents'))
    .map(h => {
      return JSON.parse(await redisClient.hgetAsync('torrents', h))
    })
    .filter(t => isStale(t))
  process.stdout.write(staleList.join('\n'))
  await redisClient.quitAsync()
}

getStale()
