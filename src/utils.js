'use strict'
const parseTorrent = require('parse-torrent')
const fetch = require('isomorphic-unfetch')

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
module.exports = { torrentFromUrl, healthFromUrl, sleep }
