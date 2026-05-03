import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { verifyToken } from '../middleware/session.js'

/**
 * Internal API routes for server-to-server communication
 * These routes are NOT protected by session middleware
 * They validate JWT tokens directly from the request
 */
export async function internalRoutes(fastify: FastifyInstance) {
  const db = fastify.db

  // Get user profile by token (for Hyperfy server to fetch user data)
  fastify.get('/profile', async (request: FastifyRequest, reply: FastifyReply) => {
    // Get token from Authorization header or query param
    const authHeader = request.headers.authorization
    const queryToken = (request.query as { token?: string }).token
    const token = authHeader?.replace('Bearer ', '') || queryToken

    if (!token) {
      return reply.status(401).send({ message: 'Missing token' })
    }

    // Verify the JWT
    const payload = verifyToken(token)
    if (!payload || !payload.userId) {
      return reply.status(401).send({ message: 'Invalid token' })
    }

    // Get full user profile
    const user = db.getUserById(payload.userId)
    if (!user) {
      return reply.status(404).send({ message: 'User not found' })
    }

    // Get user's equipped avatar from inventory
    const avatarItems = db.getUserInventory(user.id, 'avatar')
    const equippedAvatar = avatarItems.find(item => {
      const data = JSON.parse(item.item_data || '{}')
      return data.equipped === true
    })

    // Return full profile for Hyperfy server
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar_url: user.avatar_url,
      rank: user.rank,
      roles: JSON.parse(user.roles || '[]'),
      settings: JSON.parse(user.settings || '{}'),
      equippedAvatar: equippedAvatar ? JSON.parse(equippedAvatar.item_data || '{}') : null
    }
  })

  // Sync user data from Hyperfy (update profile changes)
  fastify.post('/sync', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization
    const token = authHeader?.replace('Bearer ', '')

    if (!token) {
      return reply.status(401).send({ message: 'Missing token' })
    }

    const payload = verifyToken(token)
    if (!payload || !payload.userId) {
      return reply.status(401).send({ message: 'Invalid token' })
    }

    const body = request.body as {
      name?: string
      avatar_url?: string
      rank?: number
    }

    const updates: Record<string, unknown> = {}
    if (body.name !== undefined) updates.name = body.name
    if (body.avatar_url !== undefined) updates.avatar_url = body.avatar_url
    if (body.rank !== undefined) updates.rank = body.rank

    if (Object.keys(updates).length > 0) {
      db.updateUser(payload.userId, updates as any)
    }

    return { success: true }
  })

  // Get user inventory (avatars, items, etc.)
  fastify.get('/inventory', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization
    const queryToken = (request.query as { token?: string }).token
    const token = authHeader?.replace('Bearer ', '') || queryToken

    if (!token) {
      return reply.status(401).send({ message: 'Missing token' })
    }

    const payload = verifyToken(token)
    if (!payload || !payload.userId) {
      return reply.status(401).send({ message: 'Invalid token' })
    }

    const { type } = request.query as { type?: string }
    const items = db.getUserInventory(payload.userId, type || undefined)

    return items.map(item => ({
      id: item.id,
      type: item.item_type,
      itemId: item.item_id,
      data: JSON.parse(item.item_data || '{}'),
      acquiredAt: item.acquired_at
    }))
  })

  // Add item to inventory
  fastify.post('/inventory', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization
    const token = authHeader?.replace('Bearer ', '')

    if (!token) {
      return reply.status(401).send({ message: 'Missing token' })
    }

    const payload = verifyToken(token)
    if (!payload || !payload.userId) {
      return reply.status(401).send({ message: 'Invalid token' })
    }

    const body = request.body as {
      itemType: string
      itemId: string
      itemData?: Record<string, unknown>
    }

    if (!body.itemType || !body.itemId) {
      return reply.status(400).send({ message: 'itemType and itemId required' })
    }

    const item = db.addInventoryItem(
      payload.userId,
      body.itemType,
      body.itemId,
      body.itemData || {}
    )

    return {
      id: item.id,
      type: item.item_type,
      itemId: item.item_id,
      data: JSON.parse(item.item_data || '{}'),
      acquiredAt: item.acquired_at
    }
  })

  // Delete item from inventory
  fastify.post('/inventory/delete', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization
    const token = authHeader?.replace('Bearer ', '')

    if (!token) {
      return reply.status(401).send({ message: 'Missing token' })
    }

    const payload = verifyToken(token)
    if (!payload || !payload.userId) {
      return reply.status(401).send({ message: 'Invalid token' })
    }

    const body = request.body as {
      itemType: string
      itemId: string
    }

    if (!body.itemType || !body.itemId) {
      return reply.status(400).send({ message: 'itemType and itemId required' })
    }

    const removed = db.removeInventoryItem(
      payload.userId,
      body.itemType,
      body.itemId
    )

    if (!removed) {
      return reply.status(404).send({ message: 'Item not found' })
    }

    return { success: true }
  })
}
