if (!process.env.TORRENTS_FILE) {
  throw Error('TORRENTS_FILE is required')
}

if (!process.env.REDIS_HOST) {
  throw Error('REDIS_HOST is required')
}

if (!process.env.REDIS_PORT) {
  throw Error('REDIS_PORT is required')
}

const asyncRedis = require('async-redis')

const torrents = require(process.env.TORRENTS_FILE)

const redisClient = asyncRedis.createClient({ host: process.env.REDIS_HOST, port: parseInt(process.env.REDIS_PORT) })

redisClient.on('connect', function () {
  console.info('Redis client connected')
})

redisClient.on('error', function (err) {
  console.error('Redis error', err)
})

async function populate () {
  const existing = await redisClient.hkeys('torrents')
  const missing = torrents.filter(t => !(existing.includes(t._id)))
  console.info(`${missing.length} torrents to add`)

  for (const t of missing) {
    await redisClient.hset('torrents', t._id, JSON.stringify(t))
  }
}

populate()
