import { FastifyRequest, FastifyReply } from 'fastify'
import jwt from 'jsonwebtoken'
import { createHash } from 'crypto'
import type { AuthDatabase } from '../db/schema.js'

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production'

export interface JwtPayload {
  userId: string
  sessionId: string
  iat: number
  exp: number
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function createAccessToken(userId: string, sessionId: string): string {
  return jwt.sign(
    { userId, sessionId },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  )
}

export function createRefreshToken(userId: string, sessionId: string): string {
  return jwt.sign(
    { userId, sessionId, refresh: true },
    JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  )
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload
  } catch {
    return null
  }
}

export function sessionMiddleware(db: AuthDatabase) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    // Skip for auth routes
    if (request.url.startsWith('/auth')) {
      return
    }

    // Try to get token from cookie, header, or query param
    let token: string | undefined

    // 1. Check cookie
    const cookieName = process.env.SESSION_COOKIE_NAME || 'hyperfy_session'
    if (request.cookies[cookieName]) {
      token = request.cookies[cookieName]
    }

    // 2. Check Authorization header
    if (!token && request.headers.authorization) {
      const auth = request.headers.authorization
      if (auth.startsWith('Bearer ')) {
        token = auth.slice(7)
      }
    }

    // 3. Check query param (for WebSocket connections)
    if (!token) {
      const url = new URL(request.url, `http://${request.headers.host}`)
      const queryToken = url.searchParams.get('authToken')
      if (queryToken) {
        token = queryToken
      }
    }

    if (!token) {
      return // No token, continue without user context
    }

    // Verify JWT
    const payload = verifyToken(token)
    if (!payload) {
      return // Invalid token, continue without user context
    }

    // Check session in database
    const tokenHash = hashToken(token)
    const session = db.getSessionByTokenHash(tokenHash)

    if (!session) {
      return // Session not found
    }

    // Check if session is expired
    if (new Date(session.expires_at) < new Date()) {
      db.deleteSession(session.id)
      return // Session expired
    }

    // Get user from database
    const user = db.getUserById(session.user_id)
    if (!user) {
      db.deleteSession(session.id)
      return // User not found
    }

    // Update session activity
    db.updateSessionActivity(session.id)

    // Attach user and session to request
    request.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar_url: user.avatar_url,
      rank: user.rank,
      roles: JSON.parse(user.roles || '[]')
    }

    request.session = {
      id: session.id,
      userId: user.id
    }
  }
}
