'use strict'
const parseTorrent = require('parse-torrent')
const fetch = require('isomorphic-unfetch')
const { redisClient, lock } = require('./redis.js')


async function torrentFromUrl (url) {
  const resp = await fetch(url)
  const buffer = await resp.buffer()
  return parseTorrent(buffer)
}

async function healthFromUrl (url, hash) {
  const resp = await fetch(url,
    {
      method: 'post',
      body: JSON.stringify({ hash }),
      headers: { 'Content-Type': 'application/json' }
    }
  )
  const result = await resp.json()
  if (Array.isArray(result)) {
    return result.find(t => t._id === hash)
  }
  return result
}

function sleep (ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function add (link, torrent) {
  const { infoHash, name, created, length, files, announce } = torrent
  const existing = await redisClient.hgetAsync('torrents', infoHash)
  const exists = existing !== null
  const created_unix = Math.floor(Date.parse(created) / 1000)
  console.log({ infoHash, name, exists, created_unix, length, files: files.length, trackers: announce.length })
  if (!exists) {
    const newTorrent = { _id: infoHash, name, link, created_unix, size_bytes: length, trackers: announce }
    if (process.env.TORRENT_TYPE) {
      newTorrent.type = process.env.TORRENT_TYPE
    }
    await redisClient.hsetAsync('torrents', newTorrent._id, JSON.stringify(newTorrent))
    console.log('Added to db')
  }
}

async function update (link, torrent) {
  const { infoHash, name, created, length, files, announce } = torrent
  const existing = JSON.parse(await redisClient.hgetAsync('torrents', infoHash))
  const exists = existing !== null
  const created_unix = Math.floor(Date.parse(created) / 1000)
  if (exists) {
    const { dhtData, trackerData } = existing
    const trackers = Array.from(new Set([...announce, ...existing.trackers]))
    console.log({ infoHash, name, exists, created_unix, length, files: files.length, trackers: trackers.length })
    const updated = { _id: infoHash, name, link, created_unix, size_bytes: length, trackers, dhtData, trackerData }

    if (process.env.TORRENT_TYPE) {
      updated.type = process.env.TORRENT_TYPE
    }
    let count =0
    let isQueued = true
    while (isQueued) {
      const unlock = await lock('qLock')
      const queued = await redisClient.smembersAsync('queue')
      isQueued = queued.includes(updated._id)
      if (!isQueued) {
        await redisClient.hsetAsync('torrents', updated._id, JSON.stringify(updated))
        console.log('Updated')
      }
      unlock()
      await sleep(100)
    }
  } else {
    console.log(`Torrent with hash ${infoHash} not found`)
    add(link, torrent)
  }
}
module.exports = { torrentFromUrl, healthFromUrl, sleep, add, update }
