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
