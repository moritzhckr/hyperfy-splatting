import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { EmailAuthProvider } from '../providers/email.js'

const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  avatar_url: z.string().url().nullable().optional(),
  bio: z.string().max(500).nullable().optional(),
  settings: z.record(z.unknown()).optional()
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8)
})

const addInventoryItemSchema = z.object({
  itemType: z.enum(['avatar', 'wearable', 'app', 'asset', 'world']),
  itemId: z.string().min(1),
  itemData: z.record(z.unknown()).optional()
})

const removeInventoryItemSchema = z.object({
  itemType: z.string(),
  itemId: z.string()
})

// Middleware to require authentication
function requireAuth(request: FastifyRequest, reply: FastifyReply, done: () => void) {
  if (!request.user) {
    reply.status(401).send({ message: 'Authentication required' })
    return
  }
  done()
}

export async function userRoutes(fastify: FastifyInstance) {
  const db = fastify.db
  const emailProvider = new EmailAuthProvider(db)

  // Add auth check to all routes in this scope
  fastify.addHook('onRequest', requireAuth)

  // ============= Profile Routes =============

  // Get current user profile
  fastify.get('/profile', async (request: FastifyRequest) => {
    const user = db.getUserById(request.user!.id)

    if (!user) {
      return { error: 'User not found' }
    }

    return {
      id: user.id,
      email: user.email,
      email_verified: user.email_verified,
      name: user.name,
      avatar_url: user.avatar_url,
      bio: user.bio,
      rank: user.rank,
      roles: JSON.parse(user.roles || '[]'),
      settings: JSON.parse(user.settings || '{}'),
      created_at: user.created_at,
      has_password: !!user.password_hash,
      has_sso: !!user.saml_provider
    }
  })

  // Update profile
  fastify.patch('/profile', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = updateProfileSchema.parse(request.body)
      const updates: Record<string, unknown> = {}

      if (body.name !== undefined) updates.name = body.name
      if (body.avatar_url !== undefined) updates.avatar_url = body.avatar_url
      if (body.bio !== undefined) updates.bio = body.bio
      if (body.settings !== undefined) updates.settings = JSON.stringify(body.settings)

      if (Object.keys(updates).length === 0) {
        return reply.status(400).send({ message: 'No fields to update' })
      }

      const user = db.updateUser(request.user!.id, updates as any)

      if (!user) {
        return reply.status(404).send({ message: 'User not found' })
      }

      return {
        id: user.id,
        name: user.name,
        avatar_url: user.avatar_url,
        bio: user.bio,
        settings: JSON.parse(user.settings || '{}')
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ message: 'Invalid input', errors: error.errors })
      }
      throw error
    }
  })

  // Change password
  fastify.post('/change-password', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = changePasswordSchema.parse(request.body)
      const result = await emailProvider.changePassword(
        request.user!.id,
        body.currentPassword,
        body.newPassword
      )

      if (!result.success) {
        return reply.status(400).send({ message: result.error })
      }

      return { message: 'Password changed successfully' }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ message: 'Invalid input', errors: error.errors })
      }
      throw error
    }
  })

  // ============= Inventory Routes =============

  // Get user's inventory
  fastify.get('/inventory', async (request: FastifyRequest) => {
    const { type } = request.query as { type?: string }
    const items = db.getUserInventory(request.user!.id, type || undefined)

    return items.map(item => ({
      id: item.id,
      type: item.item_type,
      itemId: item.item_id,
      data: JSON.parse(item.item_data || '{}'),
      acquiredAt: item.acquired_at
    }))
  })

  // Get inventory by type
  fastify.get('/inventory/:type', async (request: FastifyRequest) => {
    const { type } = request.params as { type: string }
    const items = db.getUserInventory(request.user!.id, type)

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
    try {
      const body = addInventoryItemSchema.parse(request.body)

      const item = db.addInventoryItem(
        request.user!.id,
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
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ message: 'Invalid input', errors: error.errors })
      }
      throw error
    }
  })

  // Remove item from inventory
  fastify.delete('/inventory', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = removeInventoryItemSchema.parse(request.body)

      const removed = db.removeInventoryItem(
        request.user!.id,
        body.itemType,
        body.itemId
      )

      if (!removed) {
        return reply.status(404).send({ message: 'Item not found in inventory' })
      }

      return { success: true }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ message: 'Invalid input', errors: error.errors })
      }
      throw error
    }
  })

  // ============= Sessions Management =============

  // Get all active sessions
  fastify.get('/sessions', async (request: FastifyRequest) => {
    // This would need a new method in the database
    // For now, just return current session info
    return {
      currentSession: request.session,
      // TODO: Add method to get all user sessions
    }
  })

  // Logout from all devices
  fastify.post('/logout-all', async (request: FastifyRequest, reply: FastifyReply) => {
    db.deleteUserSessions(request.user!.id)

    // Clear current cookie
    reply.clearCookie(process.env.SESSION_COOKIE_NAME || 'hyperfy_session', { path: '/' })

    return { message: 'Logged out from all devices' }
  })

  // ============= Avatar Management =============

  // Get saved avatars
  fastify.get('/avatars', async (request: FastifyRequest) => {
    const items = db.getUserInventory(request.user!.id, 'avatar')

    return items.map(item => ({
      id: item.item_id,
      ...JSON.parse(item.item_data || '{}'),
      acquiredAt: item.acquired_at
    }))
  })

  // Save avatar to collection
  fastify.post('/avatars', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      url: string
      name?: string
      thumbnail?: string
    }

    if (!body.url) {
      return reply.status(400).send({ message: 'Avatar URL is required' })
    }

    // Use URL as item ID (deduplicated)
    const itemId = Buffer.from(body.url).toString('base64url')

    const item = db.addInventoryItem(
      request.user!.id,
      'avatar',
      itemId,
      {
        url: body.url,
        name: body.name || 'Avatar',
        thumbnail: body.thumbnail
      }
    )

    return {
      id: item.item_id,
      ...JSON.parse(item.item_data || '{}'),
      acquiredAt: item.acquired_at
    }
  })

  // Remove avatar from collection
  fastify.delete('/avatars/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }

    const removed = db.removeInventoryItem(request.user!.id, 'avatar', id)

    if (!removed) {
      return reply.status(404).send({ message: 'Avatar not found' })
    }

    return { success: true }
  })
}
