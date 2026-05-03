import moment from 'moment'
import { writePacket } from '../packets'
import { Socket } from '../Socket'
import { uuid } from '../utils'
import { System } from './System'
import { createJWT, readJWT } from '../utils-server'
import { cloneDeep, isNumber } from 'lodash-es'
import * as THREE from '../extras/three'
import { Ranks } from '../extras/ranks'

const SAVE_INTERVAL = parseInt(process.env.SAVE_INTERVAL || '60') // seconds
const PING_RATE = 10 // seconds
const defaultSpawn = '{ "position": [0, 0, 0], "quaternion": [0, 0, 0, 1] }'
const AUTH_GATEWAY_URL = process.env.AUTH_GATEWAY_URL || 'http://localhost:3000'

const HEALTH_MAX = 100

/**
 * Fetch user profile from Auth Gateway
 * @param {string} authToken - JWT token
 * @returns {Promise<Object|null>} User profile or null if fetch fails
 */
async function fetchUserProfile(authToken) {
  try {
    const response = await fetch(`${AUTH_GATEWAY_URL}/api/internal/profile?token=${encodeURIComponent(authToken)}`)
    if (!response.ok) {
      console.log('[Auth] Failed to fetch user profile:', response.status)
      return null
    }
    return await response.json()
  } catch (err) {
    console.log('[Auth] Error fetching user profile:', err.message)
    return null
  }
}

/**
 * Sync user changes back to Auth Gateway
 * @param {string} authToken - JWT token
 * @param {Object} changes - Changes to sync
 */
async function syncUserToAuthGateway(authToken, changes) {
  try {
    await fetch(`${AUTH_GATEWAY_URL}/api/internal/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(changes)
    })
  } catch (err) {
    console.log('[Auth] Error syncing user:', err.message)
  }
}

/**
 * Server Network System
 *
 * - runs on the server
 * - provides abstract network methods matching ClientNetwork
 *
 */
export class ServerNetwork extends System {
  constructor(world) {
    super(world)
    this.id = 0
    this.ids = -1
    this.sockets = new Map()
    this.socketIntervalId = setInterval(() => this.checkSockets(), PING_RATE * 1000)
    this.saveTimerId = null
    this.dirtyBlueprints = new Set()
    this.dirtyApps = new Set()
    this.isServer = true
    this.queue = []
  }

  init({ db }) {
    this.db = db
  }

  async start() {
    // get spawn
    const spawnRow = await this.db('config').where('key', 'spawn').first()
    this.spawn = JSON.parse(spawnRow?.value || defaultSpawn)
    // hydrate blueprints
    const blueprints = await this.db('blueprints')
    for (const blueprint of blueprints) {
      const data = JSON.parse(blueprint.data)
      this.world.blueprints.add(data, true)
    }
    // hydrate entities
    const entities = await this.db('entities')
    for (const entity of entities) {
      const data = JSON.parse(entity.data)
      data.state = {}
      this.world.entities.add(data, true)
    }
    // hydrate settings
    let settingsRow = await this.db('config').where('key', 'settings').first()
    try {
      const settings = JSON.parse(settingsRow?.value || '{}')
      this.world.settings.deserialize(settings)
      this.world.settings.setHasAdminCode(!!process.env.ADMIN_CODE)
    } catch (err) {
      console.error(err)
    }
    // watch settings changes
    this.world.settings.on('change', this.saveSettings)
    // queue first save
    if (SAVE_INTERVAL) {
      this.saveTimerId = setTimeout(this.save, SAVE_INTERVAL * 1000)
    }
  }

  preFixedUpdate() {
    this.flush()
  }

  send(name, data, ignoreSocketId) {
    // console.log('->>>', name, data)
    const packet = writePacket(name, data)
    this.sockets.forEach(socket => {
      if (socket.id === ignoreSocketId) return
      socket.sendPacket(packet)
    })
  }

  sendTo(socketId, name, data) {
    const socket = this.sockets.get(socketId)
    socket?.send(name, data)
  }

  checkSockets() {
    // see: https://www.npmjs.com/package/ws#how-to-detect-and-close-broken-connections
    const dead = []
    this.sockets.forEach(socket => {
      if (!socket.alive) {
        dead.push(socket)
      } else {
        socket.ping()
      }
    })
    dead.forEach(socket => socket.disconnect())
  }

  enqueue(socket, method, data) {
    this.queue.push([socket, method, data])
  }

  flush() {
    while (this.queue.length) {
      try {
        const [socket, method, data] = this.queue.shift()
        this[method]?.(socket, data)
      } catch (err) {
        console.error(err)
      }
    }
  }

  getTime() {
    return performance.now() / 1000 // seconds
  }

  save = async () => {
    const counts = {
      upsertedBlueprints: 0,
      upsertedApps: 0,
      deletedApps: 0,
    }
    const now = moment().toISOString()
    // blueprints
    for (const id of this.dirtyBlueprints) {
      const blueprint = this.world.blueprints.get(id)
      try {
        const record = {
          id: blueprint.id,
          data: JSON.stringify(blueprint),
        }
        await this.db('blueprints')
          .insert({ ...record, createdAt: now, updatedAt: now })
          .onConflict('id')
          .merge({ ...record, updatedAt: now })
        counts.upsertedBlueprints++
        this.dirtyBlueprints.delete(id)
      } catch (err) {
        console.log(`error saving blueprint: ${blueprint.id}`)
        console.error(err)
      }
    }
    // app entities
    for (const id of this.dirtyApps) {
      const entity = this.world.entities.get(id)
      if (entity) {
        // it needs creating/updating
        if (entity.data.uploader || entity.data.mover) {
          continue // ignore while uploading or moving
        }
        try {
          const data = cloneDeep(entity.data)
          data.state = null
          const record = {
            id: entity.data.id,
            data: JSON.stringify(entity.data),
          }
          await this.db('entities')
            .insert({ ...record, createdAt: now, updatedAt: now })
            .onConflict('id')
            .merge({ ...record, updatedAt: now })
          counts.upsertedApps++
          this.dirtyApps.delete(id)
        } catch (err) {
          console.log(`error saving entity: ${entity.data.id}`)
          console.error(err)
        }
      } else {
        // it was removed
        await this.db('entities').where('id', id).delete()
        counts.deletedApps++
        this.dirtyApps.delete(id)
      }
    }
    // log
    const didSave = counts.upsertedBlueprints > 0 || counts.upsertedApps > 0 || counts.deletedApps > 0
    if (didSave) {
      console.log(
        `world saved (${counts.upsertedBlueprints} blueprints, ${counts.upsertedApps} apps, ${counts.deletedApps} apps removed)`
      )
    }
    // queue again
    this.saveTimerId = setTimeout(this.save, SAVE_INTERVAL * 1000)
  }

  saveSettings = async () => {
    const data = this.world.settings.serialize()
    const value = JSON.stringify(data)
    await this.db('config')
      .insert({
        key: 'settings',
        value,
      })
      .onConflict('key')
      .merge({
        value,
      })
  }

  async onConnection(ws, params, headers = {}) {
    try {
      // check player limit
      const playerLimit = this.world.settings.playerLimit
      if (isNumber(playerLimit) && playerLimit > 0 && this.sockets.size >= playerLimit) {
        const packet = writePacket('kick', 'player_limit')
        ws.send(packet)
        ws.close()
        return
      }

      // check connection params
      let authToken = params.authToken
      let name = params.name
      let avatar = params.avatar

      // get or create user
      let user

      // Check for Auth Gateway headers (trusted proxy)
      const trustProxyHeaders = process.env.TRUST_PROXY_HEADERS === 'true'
      const proxyUserId = headers['x-auth-user-id']
      const proxyUserEmail = headers['x-auth-user-email']
      const proxyUserName = headers['x-auth-user-name']
      const proxyUserRank = headers['x-auth-user-rank']

      if (trustProxyHeaders && proxyUserId) {
        // User authenticated via Auth Gateway
        user = await this.db('users').where('id', proxyUserId).first()

        if (!user) {
          // Create user from Auth Gateway info
          user = {
            id: proxyUserId,
            name: proxyUserName ? decodeURIComponent(proxyUserName) : 'User',
            avatar: null,
            rank: proxyUserRank ? parseInt(proxyUserRank) : 0,
            createdAt: moment().toISOString(),
          }
          await this.db('users').insert(user)
        } else {
          // Update user info from Auth Gateway if changed
          const updates = {}
          if (proxyUserName) {
            const decodedName = decodeURIComponent(proxyUserName)
            if (user.name !== decodedName) updates.name = decodedName
          }
          if (proxyUserRank && user.rank !== parseInt(proxyUserRank)) {
            updates.rank = parseInt(proxyUserRank)
          }
          if (Object.keys(updates).length > 0) {
            await this.db('users').where('id', proxyUserId).update(updates)
            user = { ...user, ...updates }
          }
        }

        // Create a JWT for this session (for client-side use)
        authToken = await createJWT({ userId: user.id })
      } else if (authToken) {
        // Standard JWT authentication - try to fetch profile from Auth Gateway
        let authProfile = null
        try {
          // First try to get full profile from Auth Gateway
          authProfile = await fetchUserProfile(authToken)
        } catch (err) {
          console.log('[Auth] Could not fetch profile from Auth Gateway')
        }

        if (authProfile) {
          // User authenticated via Auth Gateway - use their profile data
          user = await this.db('users').where('id', authProfile.id).first()

          if (!user) {
            // Create user from Auth Gateway profile
            // Note: Hyperfy DB uses 'rank' (integer), not 'roles' (string)
            user = {
              id: authProfile.id,
              name: authProfile.name || 'User',
              avatar: authProfile.avatar_url || null,
              rank: authProfile.rank || 0,
              createdAt: moment().toISOString(),
            }
            await this.db('users').insert(user)
          } else {
            // Sync user data from Auth Gateway
            const updates = {}
            if (authProfile.name && user.name !== authProfile.name) {
              updates.name = authProfile.name
            }
            if (authProfile.avatar_url && user.avatar !== authProfile.avatar_url) {
              updates.avatar = authProfile.avatar_url
            }
            if (authProfile.rank !== undefined && user.rank !== authProfile.rank) {
              updates.rank = authProfile.rank
            }
            if (Object.keys(updates).length > 0) {
              await this.db('users').where('id', authProfile.id).update(updates)
              user = { ...user, ...updates }
            }
          }

          // Override name/avatar from Auth profile if not in URL params
          if (!name && authProfile.name) name = authProfile.name
          if (!avatar && authProfile.avatar_url) avatar = authProfile.avatar_url
          if (!avatar && authProfile.equippedAvatar?.url) avatar = authProfile.equippedAvatar.url
        } else {
          // Fallback: Try to read JWT directly (for tokens not from Auth Gateway)
          try {
            const { userId } = await readJWT(authToken)
            user = await this.db('users').where('id', userId).first()
          } catch (err) {
            console.error('failed to read authToken:', authToken)
          }
        }
      }

      if (!user) {
        user = {
          id: uuid(),
          name: 'Anonymous',
          avatar: null,
          rank: 0,
          createdAt: moment().toISOString(),
        }
        await this.db('users').insert(user)
        authToken = await createJWT({ userId: user.id })
      }

      // disconnect if user already in this world
      if (this.sockets.has(user.id)) {
        const packet = writePacket('kick', 'duplicate_user')
        ws.send(packet)
        ws.close()
        return
      }

      // livekit options
      const livekit = await this.world.livekit.serialize(user.id)

      // create socket
      const socket = new Socket({ id: user.id, ws, network: this })
      socket.authToken = authToken // Store for syncing back to Auth Gateway

      // spawn player
      socket.player = this.world.entities.add(
        {
          id: user.id,
          type: 'player',
          position: this.spawn.position.slice(),
          quaternion: this.spawn.quaternion.slice(),
          owner: socket.id, // deprecated, same as userId
          userId: user.id, // deprecated, same as userId
          name: name || user.name,
          health: HEALTH_MAX,
          avatar: user.avatar || this.world.settings.avatar?.url || 'asset://avatar.vrm',
          sessionAvatar: avatar || null,
          rank: user.rank,
          enteredAt: Date.now(),
        },
        true
      )

      // send snapshot
      socket.send('snapshot', {
        id: socket.id,
        serverTime: performance.now(),
        assetsUrl: process.env.ASSETS_BASE_URL,
        apiUrl: process.env.PUBLIC_API_URL,
        maxUploadSize: process.env.PUBLIC_MAX_UPLOAD_SIZE,
        collections: this.world.collections.serialize(),
        settings: this.world.settings.serialize(),
        chat: this.world.chat.serialize(),
        ai: this.world.ai.serialize(),
        blueprints: this.world.blueprints.serialize(),
        entities: this.world.entities.serialize(),
        livekit,
        authToken,
        hasAdminCode: !!process.env.ADMIN_CODE,
      })

      this.sockets.set(socket.id, socket)

      // enter events on the server are sent after the snapshot.
      // on the client these are sent during PlayerRemote.js entity instantiation!
      this.world.events.emit('enter', { playerId: socket.player.data.id })
    } catch (err) {
      console.error(err)
    }
  }

  onChatAdded = async (socket, msg) => {
    this.world.chat.add(msg, false)
    this.send('chatAdded', msg, socket.id)
  }

  onCommand = async (socket, data) => {
    const { args } = data
    // handle slash commands
    const player = socket.player
    const playerId = player.data.id
    const [cmd, arg1, arg2] = args
    // become admin command
    if (cmd === 'admin') {
      const code = arg1
      if (process.env.ADMIN_CODE && process.env.ADMIN_CODE === code) {
        const id = player.data.id
        const userId = player.data.userId
        const granted = !player.isAdmin()
        let rank
        if (granted) {
          rank = Ranks.ADMIN
        } else {
          rank = Ranks.VISITOR
        }
        player.modify({ rank })
        this.send('entityModified', { id, rank })
        socket.send('chatAdded', {
          id: uuid(),
          from: null,
          fromId: null,
          body: granted ? 'Admin granted!' : 'Admin revoked!',
          createdAt: moment().toISOString(),
        })
        await this.db('users').where('id', userId).update({ rank })
        // Sync rank to Auth Gateway
        if (socket.authToken) {
          syncUserToAuthGateway(socket.authToken, { rank })
        }
      }
    }
    if (cmd === 'name') {
      const name = arg1
      if (name) {
        const id = player.data.id
        const userId = player.data.userId
        player.data.name = name
        player.modify({ name })
        this.send('entityModified', { id, name })
        socket.send('chatAdded', {
          id: uuid(),
          from: null,
          fromId: null,
          body: `Name set to ${name}!`,
          createdAt: moment().toISOString(),
        })
        await this.db('users').where('id', userId).update({ name })
        // Sync name to Auth Gateway
        if (socket.authToken) {
          syncUserToAuthGateway(socket.authToken, { name })
        }
      }
    }
    if (cmd === 'spawn') {
      const op = arg1
      this.onSpawnModified(socket, op)
    }
    if (cmd === 'chat') {
      const op = arg1
      if (op === 'clear' && socket.player.isBuilder()) {
        this.world.chat.clear(true)
      }
    }
    if (cmd === 'server') {
      const op = arg1
      if (op === 'stats') {
        function send(body) {
          socket.send('chatAdded', {
            id: uuid(),
            from: null,
            fromId: null,
            body,
            createdAt: moment().toISOString(),
          })
        }
        const stats = await this.world.monitor.getStats()
        send(`CPU: ${stats.currentCPU.toFixed(3)}%`)
        send(
          `Memory: ${stats.currentMemory} / ${stats.maxMemory} MB (${((stats.currentMemory / stats.maxMemory) * 100).toFixed(1)}%)`
        )
      }
    }
    // emit event for all except admin
    if (cmd !== 'admin') {
      this.world.events.emit('command', { playerId, args })
    }
  }

  onModifyRank = async (socket, data) => {
    if (!socket.player.isAdmin()) return
    const { playerId, rank } = data
    if (!playerId) return
    if (!isNumber(rank)) return
    const player = this.world.entities.get(playerId)
    if (!player || !player.isPlayer) return
    player.modify({ rank })
    this.send('entityModified', { id: playerId, rank })
    await this.db('users').where('id', playerId).update({ rank })
    // Sync rank to Auth Gateway for the target player
    const targetSocket = this.sockets.get(playerId)
    if (targetSocket?.authToken) {
      syncUserToAuthGateway(targetSocket.authToken, { rank })
    }
  }

  onKick = (socket, playerId) => {
    const player = this.world.entities.get(playerId)
    if (!player) return
    // admins can kick builders + visitors
    // builders can kick visitors
    // visitors cannot kick anyone
    if (socket.player.data.rank <= player.data.rank) return
    const tSocket = this.sockets.get(playerId)
    tSocket.send('kick', 'moderation')
    tSocket.disconnect()
  }

  onMute = (socket, data) => {
    const player = this.world.entities.get(data.playerId)
    if (!player) return
    // admins can mute builders + visitors
    // builders can mute visitors
    // visitors cannot mute anyone
    if (socket.player.data.rank <= player.data.rank) return
    this.world.livekit.setMuted(data.playerId, data.muted)
  }

  onBlueprintAdded = (socket, blueprint) => {
    if (!socket.player.isBuilder()) {
      return console.error('player attempted to add blueprint without builder permission')
    }
    this.world.blueprints.add(blueprint)
    this.send('blueprintAdded', blueprint, socket.id)
    this.dirtyBlueprints.add(blueprint.id)
  }

  onBlueprintModified = (socket, data) => {
    if (!socket.player.isBuilder()) {
      return console.error('player attempted to modify blueprint without builder permission')
    }
    const blueprint = this.world.blueprints.get(data.id)
    // if new version is greater than current version, allow it
    if (data.version > blueprint.version) {
      this.world.blueprints.modify(data)
      this.send('blueprintModified', data, socket.id)
      this.dirtyBlueprints.add(data.id)
    }
    // otherwise, send a revert back to client, because someone else modified before them
    else {
      socket.send('blueprintModified', blueprint)
    }
  }

  onEntityAdded = (socket, data) => {
    if (!socket.player.isBuilder()) {
      return console.error('player attempted to add entity without builder permission')
    }
    const entity = this.world.entities.add(data)
    this.send('entityAdded', data, socket.id)
    if (entity.isApp) this.dirtyApps.add(entity.data.id)
  }

  onEntityModified = async (socket, data) => {
    const entity = this.world.entities.get(data.id)
    if (!entity) return console.error('onEntityModified: no entity found', data)
    entity.modify(data)
    this.send('entityModified', data, socket.id)
    if (entity.isApp) {
      // mark for saving
      this.dirtyApps.add(entity.data.id)
    }
    if (entity.isPlayer) {
      // persist player name and avatar changes
      const changes = {}
      let changed
      if (data.hasOwnProperty('name')) {
        changes.name = data.name
        changed = true
      }
      if (data.hasOwnProperty('avatar')) {
        changes.avatar = data.avatar
        changed = true
      }
      if (changed) {
        await this.db('users').where('id', entity.data.userId).update(changes)

        // Sync changes back to Auth Gateway (if user has authToken)
        if (socket.authToken) {
          const syncData = {}
          if (changes.name) syncData.name = changes.name
          if (changes.avatar) syncData.avatar_url = changes.avatar
          syncUserToAuthGateway(socket.authToken, syncData)
        }
      }
    }
  }

  onEntityEvent = (socket, event) => {
    const [id, version, name, data] = event
    const entity = this.world.entities.get(id)
    entity?.onEvent(version, name, data, socket.id)
  }

  onEntityRemoved = (socket, id) => {
    if (!socket.player.isBuilder()) return console.error('player attempted to remove entity without builder permission')
    const entity = this.world.entities.get(id)
    this.world.entities.remove(id)
    this.send('entityRemoved', id, socket.id)
    if (entity.isApp) this.dirtyApps.add(id)
  }

  onSettingsModified = (socket, data) => {
    if (!socket.player.isBuilder())
      return console.error('player attempted to modify settings without builder permission')
    this.world.settings.set(data.key, data.value)
    this.send('settingsModified', data, socket.id)
  }

  onSpawnModified = async (socket, op) => {
    if (!socket.player.isBuilder()) {
      return console.error('player attempted to modify spawn without builder permission')
    }
    const player = socket.player
    if (op === 'set') {
      this.spawn = { position: player.data.position.slice(), quaternion: player.data.quaternion.slice() }
    } else if (op === 'clear') {
      this.spawn = { position: [0, 0, 0], quaternion: [0, 0, 0, 1] }
    } else {
      return
    }
    const data = JSON.stringify(this.spawn)
    await this.db('config')
      .insert({
        key: 'spawn',
        value: data,
      })
      .onConflict('key')
      .merge({
        value: data,
      })
    socket.send('chatAdded', {
      id: uuid(),
      from: null,
      fromId: null,
      body: op === 'set' ? 'Spawn updated' : 'Spawn cleared',
      createdAt: moment().toISOString(),
    })
  }

  onPlayerTeleport = (socket, data) => {
    this.sendTo(data.networkId, 'playerTeleport', data)
  }

  onPlayerPush = (socket, data) => {
    this.sendTo(data.networkId, 'playerPush', data)
  }

  onPlayerSessionAvatar = (socket, data) => {
    this.sendTo(data.networkId, 'playerSessionAvatar', data.avatar)
  }

  onAi = (socket, action) => {
    if (!socket.player.isBuilder()) {
      return console.error('player attempted to use ai but they are not a builder')
    }
    this.world.ai.onAction(action)
  }

  onPing = (socket, time) => {
    socket.send('pong', time)
  }

  onDisconnect = (socket, code) => {
    this.world.livekit.clearModifiers(socket.id)
    socket.player.destroy(true)
    this.sockets.delete(socket.id)
  }
}
