import 'ses'
import '../core/lockdown'
import './bootstrap'

import fs from 'fs-extra'
import path from 'path'
import Fastify from 'fastify'
import ws from '@fastify/websocket'
import cors from '@fastify/cors'
import compress from '@fastify/compress'
import statics from '@fastify/static'
import multipart from '@fastify/multipart'

import { createServerWorld } from '../core/createServerWorld'
import { getDB } from './db'
import { Storage } from './Storage'
import { assets } from './assets'
import { collections } from './collections'
import { cleaner } from './cleaner'

const rootDir = path.join(__dirname, '../')
const worldDir = path.join(rootDir, process.env.WORLD)
const port = process.env.PORT

// check envs
if (!process.env.WORLD) {
  throw new Error('[envs] WORLD not set')
}
if (!process.env.PORT) {
  throw new Error('[envs] PORT not set')
}
if (!process.env.JWT_SECRET) {
  throw new Error('[envs] JWT_SECRET not set')
}
if (!process.env.ADMIN_CODE) {
  console.warn('[envs] ADMIN_CODE not set - all users will have admin permissions!')
}
if (!process.env.SAVE_INTERVAL) {
  throw new Error('[envs] SAVE_INTERVAL not set')
}
if (!process.env.PUBLIC_MAX_UPLOAD_SIZE) {
  throw new Error('[envs] PUBLIC_MAX_UPLOAD_SIZE not set')
}
if (!process.env.PUBLIC_WS_URL) {
  throw new Error('[envs] PUBLIC_WS_URL not set')
}
if (!process.env.PUBLIC_WS_URL.startsWith('ws')) {
  throw new Error('[envs] PUBLIC_WS_URL must start with ws:// or wss://')
}
if (!process.env.PUBLIC_API_URL) {
  throw new Error('[envs] PUBLIC_API_URL must be set')
}
if (!process.env.ASSETS) {
  throw new Error(`[envs] ASSETS must be set to 'local' or 's3'`)
}
if (!process.env.ASSETS_BASE_URL) {
  throw new Error(`[envs] ASSETS_BASE_URL must be set`)
}
if (process.env.ASSETS === 's3' && !process.env.ASSETS_S3_URI) {
  throw new Error(`[envs] ASSETS_S3_URI must be set when using ASSETS=s3`)
}

const fastify = Fastify({ logger: { level: 'error' } })

// create world folder if needed
await fs.ensureDir(worldDir)

// init assets
await assets.init({ rootDir, worldDir })

// init collections
await collections.init({ rootDir, worldDir })

// init db
const db = await getDB({ worldDir })

// init cleaner
await cleaner.init({ db })

// init storage
const storage = new Storage(path.join(worldDir, '/storage.json'))

// create world
const world = createServerWorld()
await world.init({
  assetsDir: assets.dir,
  assetsUrl: assets.url,
  db,
  assets,
  storage,
  collections: collections.list,
})

fastify.register(cors)
fastify.register(compress, {
  // Only compress text-based files, exclude binary and already compressed formats
  customTypes: /text\/|application\/json|application\/javascript|text\/css/,
  encodings: ['gzip', 'deflate'],
  brotli: {
    quality: 4,
    lgwin: 22
  },
  inflateIfDeflated: false,
  // Skip compression based on file extension or request path
  skipOnPath(req) {
    const path = req.url || req.raw.url || ''
    // Skip compression for splat files that are already compressed
    return path.endsWith('.spz') ||
           path.endsWith('.sogs') ||
           path.endsWith('.ksplat') ||
           path.endsWith('.zip')
  }
})
fastify.get('/', async (req, reply) => {
  const title = world.settings.title || 'World'
  const desc = world.settings.desc || ''
  const image = world.resolveURL(world.settings.image?.url) || ''
  const url = process.env.ASSETS_BASE_URL
  const filePath = path.join(__dirname, 'public', 'index.html')
  let html = fs.readFileSync(filePath, 'utf-8')
  html = html.replaceAll('{url}', url)
  html = html.replaceAll('{title}', title)
  html = html.replaceAll('{desc}', desc)
  html = html.replaceAll('{image}', image)
  reply.type('text/html').send(html)
})
fastify.register(statics, {
  root: path.join(__dirname, 'public'),
  prefix: '/',
  decorateReply: false,
  setHeaders: res => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')
  },
})
if (world.assetsDir) {
  // Add a hook to transform SPZ files to base64 before serving
  fastify.addHook('onSend', async (request, reply, payload) => {
    if (request.url.startsWith('/assets/') && request.url.endsWith('.spz') && request.method === 'GET') {
      // Only transform if this is actually binary SPZ file content (not JSON responses)
      if (Buffer.isBuffer(payload) && payload.length > 100) { // SPZ files should be reasonably sized
        const base64Data = payload.toString('base64')

        reply.header('Content-Type', 'text/plain')
        reply.header('X-SPZ-Format', 'base64-gzip')

        return base64Data
      }
    }
    return payload
  })

  fastify.register(statics, {
    root: world.assetsDir,
    prefix: '/assets/',
    decorateReply: false,
    // Add better error handling for file serving
    acceptRanges: true, // Enable range requests for large files
    cacheControl: true,
    lastModified: true,
    etag: true,
    setHeaders: (res, path) => {
      // all assets are hashed & immutable so we can use aggressive caching
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable') // 1 year
      res.setHeader('Expires', new Date(Date.now() + 31536000000).toUTCString()) // older browsers
      
      // Handle Gaussian Splat files with proper MIME types and compression headers
      const ext = path.split('.').pop()?.toLowerCase()
      
      if (ext === 'ply') {
        res.setHeader('Content-Type', 'application/octet-stream')
        res.setHeader('Accept-Ranges', 'bytes')
      } else if (ext === 'splat') {
        res.setHeader('Content-Type', 'application/octet-stream')
        res.setHeader('Accept-Ranges', 'bytes')
      } else if (ext === 'ksplat') {
        res.setHeader('Content-Type', 'application/octet-stream')
        res.setHeader('Accept-Ranges', 'bytes')
      } else if (ext === 'spz') {
        // SPZ files are pre-compressed and need special handling
        // Serve as base64 to prevent browser auto-decompression
        res.setHeader('Content-Type', 'text/plain')
        res.setHeader('Accept-Ranges', 'bytes')
        // Add custom header to indicate this is base64-encoded SPZ data
        res.setHeader('X-SPZ-Format', 'base64-gzip')
        // Add CORS headers for cross-origin requests
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Range')
      }
    },
  })
}
fastify.register(multipart, {
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB
  },
  // Ensure binary files are handled correctly
  attachFieldsToBody: false,
  // Don't parse SPZ files as text
  onFile: async (part) => {
    const filename = part.filename
    const ext = filename.split('.').pop()?.toLowerCase()
    
    // For binary files like SPZ, ensure proper handling
    if (['spz', 'ply', 'splat', 'ksplat'].includes(ext)) {
      part.file.readable = true
    }
  }
})
fastify.register(ws)
fastify.register(worldNetwork)

const publicEnvs = {}
for (const key in process.env) {
  if (key.startsWith('PUBLIC_')) {
    const value = process.env[key]
    publicEnvs[key] = value
  }
}
const envsCode = `
  if (!globalThis.env) globalThis.env = {}
  globalThis.env = ${JSON.stringify(publicEnvs)}
`
fastify.get('/env.js', async (req, reply) => {
  reply.type('application/javascript').send(envsCode)
})

fastify.post('/api/upload', async (req, reply) => {
  const mp = await req.file()
  
  // Check if this is a binary file that needs special handling
  const ext = mp.filename.split('.').pop()?.toLowerCase()
  const isBinaryFormat = ['spz', 'ply', 'splat', 'ksplat', 'glb', 'vrm'].includes(ext)
  
  // collect into buffer with proper binary handling
  const chunks = []
  for await (const chunk of mp.file) {
    chunks.push(chunk)
  }
  const buffer = Buffer.concat(chunks)
  
  // Set correct MIME type for binary formats
  let mimeType = mp.mimetype || 'application/octet-stream'
  if (isBinaryFormat) {
    mimeType = 'application/octet-stream'
  }
  
  // Upload: ${mp.filename} (${(buffer.length / 1024 / 1024).toFixed(1)}MB)
  
  // Basic validation for SPZ files
  if (ext === 'spz') {
    // SPZ files should start with specific magic bytes for gzip
    const magicBytes = buffer.slice(0, 3)
    const isValidGzip = magicBytes[0] === 0x1f && magicBytes[1] === 0x8b && magicBytes[2] === 0x08
    
    if (!isValidGzip) {
      console.warn(`⚠️ SPZ file ${mp.filename} doesn't appear to be valid gzip format`)
      // Continue anyway, maybe it's a different SPZ variant
    } else {
    }
  }
  
  // convert to file
  const file = new File([buffer], mp.filename, {
    type: mimeType,
  })
  
  // upload
  await assets.upload(file)
  
  // File uploaded successfully
})

fastify.get('/api/upload-check', async (req, reply) => {
  const exists = await assets.exists(req.query.filename)
  return { exists }
})

fastify.get('/health', async (request, reply) => {
  try {
    // Basic health check
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    }

    return reply.code(200).send(health)
  } catch (error) {
    console.error('Health check failed:', error)
    return reply.code(503).send({
      status: 'error',
      timestamp: new Date().toISOString(),
    })
  }
})

fastify.get('/status', async (request, reply) => {
  try {
    const status = {
      uptime: Math.round(world.time),
      protected: process.env.ADMIN_CODE !== undefined ? true : false,
      connectedUsers: [],
      commitHash: process.env.COMMIT_HASH,
    }
    for (const socket of world.network.sockets.values()) {
      status.connectedUsers.push({
        id: socket.player.data.userId,
        position: socket.player.position.value.toArray(),
        name: socket.player.data.name,
      })
    }

    return reply.code(200).send(status)
  } catch (error) {
    console.error('Status failed:', error)
    return reply.code(503).send({
      status: 'error',
      timestamp: new Date().toISOString(),
    })
  }
})

fastify.setErrorHandler((err, req, reply) => {
  console.error(err)
  reply.status(500).send()
})

try {
  await fastify.listen({ port, host: '0.0.0.0' })
} catch (err) {
  console.error(err)
  console.error(`failed to launch on port ${port}`)
  process.exit(1)
}

async function worldNetwork(fastify) {
  fastify.get('/ws', { websocket: true }, (ws, req) => {
    world.network.onConnection(ws, req.query)
  })
}

console.log(`server listening on port ${port}`)

// Graceful shutdown
process.on('SIGINT', async () => {
  await fastify.close()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await fastify.close()
  process.exit(0)
})
