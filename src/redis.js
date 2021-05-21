'use strict'

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
  process.stderr.write('Redis client connected\n')
})

redisClient.on('error', function (err) {
  console.error('Redis error', err)
})

module.exports = { redisClient, lock }
