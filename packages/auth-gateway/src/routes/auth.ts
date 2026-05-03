import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { EmailAuthProvider } from '../providers/email.js'
import { createSamlProviderFromEnv } from '../providers/saml.js'
import { createAccessToken, createRefreshToken, hashToken, verifyToken } from '../middleware/session.js'

const emailLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
})

const emailRegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100).optional()
})

const passwordResetRequestSchema = z.object({
  email: z.string().email()
})

const passwordResetSchema = z.object({
  token: z.string(),
  password: z.string().min(8)
})

export async function authRoutes(fastify: FastifyInstance) {
  const db = fastify.db
  const emailProvider = new EmailAuthProvider(db)
  const samlProvider = createSamlProviderFromEnv(db)

  const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'hyperfy_session'
  const COOKIE_SECURE = process.env.SESSION_COOKIE_SECURE === 'true'
  const COOKIE_DOMAIN = process.env.SESSION_COOKIE_DOMAIN

  // Helper to set auth cookie and create session
  async function createSession(
    reply: FastifyReply,
    userId: string,
    request: FastifyRequest
  ) {
    const sessionId = crypto.randomUUID()
    const accessToken = createAccessToken(userId, sessionId)
    const refreshToken = createRefreshToken(userId, sessionId)

    // Store session in database
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7) // 7 days

    db.createSession({
      user_id: userId,
      token_hash: hashToken(accessToken),
      refresh_token_hash: hashToken(refreshToken),
      device_info: JSON.stringify({
        userAgent: request.headers['user-agent'] || 'unknown'
      }),
      ip_address: request.ip,
      expires_at: expiresAt.toISOString()
    })

    // Set cookie
    reply.setCookie(COOKIE_NAME, accessToken, {
      path: '/',
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: 'lax',
      domain: COOKIE_DOMAIN,
      maxAge: 7 * 24 * 60 * 60 // 7 days in seconds
    })

    return { accessToken, refreshToken }
  }

  // ============= Email Auth Routes =============

  // Login
  fastify.post('/email/login', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = emailLoginSchema.parse(request.body)
      const result = await emailProvider.login(body.email, body.password)

      if (!result.success || !result.user) {
        return reply.status(401).send({ message: result.error || 'Login failed' })
      }

      const { accessToken } = await createSession(reply, result.user.id, request)

      return {
        token: accessToken,
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          avatar_url: result.user.avatar_url
        }
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ message: 'Invalid input', errors: error.errors })
      }
      throw error
    }
  })

  // Register
  fastify.post('/email/register', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = emailRegisterSchema.parse(request.body)
      const result = await emailProvider.register(body.email, body.password, body.name || body.email.split('@')[0])

      if (!result.success || !result.user) {
        return reply.status(400).send({ message: result.error || 'Registration failed' })
      }

      const { accessToken } = await createSession(reply, result.user.id, request)

      return {
        token: accessToken,
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          avatar_url: result.user.avatar_url
        }
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ message: 'Invalid input', errors: error.errors })
      }
      throw error
    }
  })

  // Request password reset
  fastify.post('/email/forgot-password', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = passwordResetRequestSchema.parse(request.body)
      const result = await emailProvider.initiatePasswordReset(body.email)

      // Always return success to prevent email enumeration
      // In production, send email with reset link
      if (result) {
        console.log(`Password reset token for ${body.email}: ${result.token}`)
        // TODO: Send email with reset link
        // await sendPasswordResetEmail(body.email, result.token)
      }

      return { message: 'If an account exists with that email, a password reset link has been sent.' }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ message: 'Invalid input', errors: error.errors })
      }
      throw error
    }
  })

  // Reset password with token
  fastify.post('/email/reset-password', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = passwordResetSchema.parse(request.body)
      const result = await emailProvider.resetPassword(body.token, body.password)

      if (!result.success) {
        return reply.status(400).send({ message: result.error || 'Password reset failed' })
      }

      return { message: 'Password has been reset successfully. Please login with your new password.' }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ message: 'Invalid input', errors: error.errors })
      }
      throw error
    }
  })

  // Verify email
  fastify.get('/email/verify', async (request: FastifyRequest, reply: FastifyReply) => {
    const { token } = request.query as { token?: string }

    if (!token) {
      return reply.status(400).send({ message: 'Missing verification token' })
    }

    const result = await emailProvider.verifyEmail(token)

    if (!result.success) {
      return reply.redirect('/login?error=' + encodeURIComponent(result.error || 'Verification failed'))
    }

    return reply.redirect('/login?message=' + encodeURIComponent('Email verified! You can now login.'))
  })

  // ============= SAML Auth Routes =============

  if (samlProvider) {
    // Initiate SAML login
    fastify.get('/saml/login', async (request: FastifyRequest, reply: FastifyReply) => {
      const { returnTo } = request.query as { returnTo?: string }
      const loginUrl = await samlProvider.getLoginUrl(returnTo || '/')
      return reply.redirect(loginUrl)
    })

    // SAML callback (POST from IdP)
    fastify.post('/saml/callback', async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as { SAMLResponse?: string; RelayState?: string }

      if (!body.SAMLResponse) {
        return reply.redirect('/login?error=' + encodeURIComponent('Missing SAML response'))
      }

      const validation = await samlProvider.validateResponse(body.SAMLResponse)

      if (!validation) {
        return reply.redirect('/login?error=' + encodeURIComponent('Invalid SAML response'))
      }

      const result = await samlProvider.authenticateOrCreate(validation.profile)

      if (!result.success || !result.user) {
        return reply.redirect('/login?error=' + encodeURIComponent(result.error || 'SSO login failed'))
      }

      const { accessToken } = await createSession(reply, result.user.id, request)

      // Redirect to relay state or home with token
      const returnTo = body.RelayState || '/'
      const separator = returnTo.includes('?') ? '&' : '?'
      return reply.redirect(`${returnTo}${separator}authToken=${encodeURIComponent(accessToken)}`)
    })

    // SAML metadata endpoint
    fastify.get('/saml/metadata', async (request: FastifyRequest, reply: FastifyReply) => {
      const metadata = samlProvider.getMetadata()
      reply.type('application/xml').send(metadata)
    })

    // SAML logout
    fastify.get('/saml/logout', async (request: FastifyRequest, reply: FastifyReply) => {
      // Delete session from database
      if (request.session) {
        db.deleteSession(request.session.id)
      }

      // Clear cookie
      reply.clearCookie(COOKIE_NAME, { path: '/' })

      // If we have user info, try to do SAML logout
      // For now, just redirect to login
      return reply.redirect('/login')
    })
  }

  // ============= Common Routes =============

  // Logout
  fastify.post('/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    // Delete session from database
    if (request.session) {
      db.deleteSession(request.session.id)
    }

    // Clear cookie
    reply.clearCookie(COOKIE_NAME, { path: '/' })

    return { success: true }
  })

  // Get logout (for redirects) - shows a page that clears localStorage too
  fastify.get('/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.session) {
      db.deleteSession(request.session.id)
    }
    reply.clearCookie(COOKIE_NAME, { path: '/' })

    // Return HTML that clears localStorage and redirects
    const logoutHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Logging out...</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
    }
    .container {
      text-align: center;
      background: rgba(255, 255, 255, 0.05);
      padding: 40px;
      border-radius: 16px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h2>Logging out...</h2>
    <p>Please wait...</p>
  </div>
  <script>
    // Clear Hyperfy's localStorage
    localStorage.removeItem('authToken')
    localStorage.removeItem('avatar')
    localStorage.removeItem('name')

    // Redirect to login after a moment
    setTimeout(() => {
      window.location.href = '/login'
    }, 500)
  </script>
</body>
</html>
    `
    reply.type('text/html').send(logoutHtml)
  })

  // Refresh token
  fastify.post('/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    const { refreshToken } = request.body as { refreshToken?: string }

    if (!refreshToken) {
      return reply.status(400).send({ message: 'Missing refresh token' })
    }

    // Verify refresh token
    const payload = verifyToken(refreshToken)
    if (!payload) {
      return reply.status(401).send({ message: 'Invalid refresh token' })
    }

    // Find session by refresh token hash
    const session = db.getSessionByRefreshTokenHash(hashToken(refreshToken))
    if (!session) {
      return reply.status(401).send({ message: 'Session not found' })
    }

    // Get user
    const user = db.getUserById(session.user_id)
    if (!user) {
      return reply.status(401).send({ message: 'User not found' })
    }

    // Delete old session
    db.deleteSession(session.id)

    // Create new session
    const { accessToken, refreshToken: newRefreshToken } = await createSession(reply, user.id, request)

    return {
      token: accessToken,
      refreshToken: newRefreshToken
    }
  })

  // Session info
  fastify.get('/session', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({ message: 'Not authenticated' })
    }

    return {
      user: request.user,
      session: request.session
    }
  })
}
