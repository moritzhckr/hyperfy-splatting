import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import formbody from '@fastify/formbody'
import { config } from 'dotenv'
import { AuthDatabase } from './db/schema.js'
import { authRoutes } from './routes/auth.js'
import { userRoutes } from './routes/user.js'
import { internalRoutes } from './routes/internal.js'
import { sessionMiddleware } from './middleware/session.js'
import path from 'path'
import fs from 'fs'

// Load environment variables
config()

const PORT = parseInt(process.env.PORT || '3000')
const HOST = process.env.HOST || '0.0.0.0'
const HYPERFY_URL = process.env.HYPERFY_URL || 'http://localhost:3005'
const HYPERFY_PUBLIC_URL = process.env.HYPERFY_PUBLIC_URL || HYPERFY_URL
const DATABASE_URL = process.env.DATABASE_URL || './data/auth.db'

// Ensure data directory exists
const dbDir = path.dirname(DATABASE_URL)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

// Initialize database
const db = new AuthDatabase(DATABASE_URL)

// Create Fastify instance
const fastify = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'development' ? 'debug' : 'info'
  }
})

// Register plugins
await fastify.register(cors, {
  origin: process.env.CORS_ORIGIN?.split(',') || true,
  credentials: true
})

await fastify.register(cookie, {
  secret: process.env.JWT_SECRET || 'change-me-in-production',
  parseOptions: {}
})

await fastify.register(formbody)

// Add database to request
fastify.decorate('db', db)

// Declare module augmentation for TypeScript
declare module 'fastify' {
  interface FastifyInstance {
    db: AuthDatabase
  }
  interface FastifyRequest {
    user?: {
      id: string
      email: string | null
      name: string
      avatar_url: string | null
      rank: number
      roles: string[]
    }
    session?: {
      id: string
      userId: string
    }
  }
}

// Register internal API routes BEFORE session middleware (server-to-server, no session required)
await fastify.register(internalRoutes, { prefix: '/api/internal' })

// Session middleware for protected routes
fastify.addHook('onRequest', sessionMiddleware(db))

// Register auth routes (public)
await fastify.register(authRoutes, { prefix: '/auth' })

// Register user routes (protected)
await fastify.register(userRoutes, { prefix: '/api/user' })

// Health check endpoint
fastify.get('/health', async () => {
  return { status: 'ok', service: 'auth-gateway' }
})

// Login page (serve simple HTML for now)
fastify.get('/login', async (request, reply) => {
  const loginHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hyperfy Login</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
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
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(10px);
      border-radius: 16px;
      padding: 40px;
      width: 100%;
      max-width: 400px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    }
    h1 {
      text-align: center;
      margin-bottom: 8px;
      font-size: 28px;
    }
    .subtitle {
      text-align: center;
      color: #aaa;
      margin-bottom: 32px;
    }
    .divider {
      display: flex;
      align-items: center;
      margin: 24px 0;
      color: #666;
    }
    .divider::before, .divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: #333;
    }
    .divider span { padding: 0 16px; }
    form { display: flex; flex-direction: column; gap: 16px; }
    input {
      padding: 14px 16px;
      border: 1px solid #333;
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.3);
      color: #fff;
      font-size: 16px;
      transition: border-color 0.2s;
    }
    input:focus {
      outline: none;
      border-color: #4a9eff;
    }
    input::placeholder { color: #666; }
    button {
      padding: 14px 24px;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.1s, opacity 0.2s;
    }
    button:hover { opacity: 0.9; }
    button:active { transform: scale(0.98); }
    .btn-primary {
      background: linear-gradient(135deg, #4a9eff 0%, #6366f1 100%);
      color: #fff;
    }
    .btn-sso {
      background: #fff;
      color: #333;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
    }
    .btn-guest {
      background: transparent;
      border: 1px solid #444;
      color: #aaa;
    }
    .links {
      display: flex;
      justify-content: space-between;
      margin-top: 8px;
    }
    .links a {
      color: #4a9eff;
      text-decoration: none;
      font-size: 14px;
    }
    .links a:hover { text-decoration: underline; }
    .error {
      background: rgba(239, 68, 68, 0.2);
      border: 1px solid #ef4444;
      color: #ef4444;
      padding: 12px;
      border-radius: 8px;
      text-align: center;
      display: none;
    }
    .error.show { display: block; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Hyperfy</h1>
    <p class="subtitle">Sign in to continue</p>

    <div id="error" class="error"></div>

    ${process.env.SAML_ENABLED === 'true' ? `
    <a href="/auth/saml/login">
      <button type="button" class="btn-sso" style="width: 100%;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
        Company SSO Login
      </button>
    </a>
    <div class="divider"><span>or</span></div>
    ` : ''}

    <form id="loginForm">
      <input type="email" name="email" placeholder="Email" required />
      <input type="password" name="password" placeholder="Password" required />
      <button type="submit" class="btn-primary">Sign In</button>
      <div class="links">
        <a href="/register">Create account</a>
        <a href="/forgot-password">Forgot password?</a>
      </div>
    </form>

    <div class="divider"><span>or</span></div>

    <button type="button" class="btn-guest" onclick="continueAsGuest()" style="width: 100%;">
      Continue as Guest
    </button>
  </div>

  <script>
    const form = document.getElementById('loginForm')
    const errorEl = document.getElementById('error')

    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      errorEl.classList.remove('show')

      const formData = new FormData(form)
      const email = formData.get('email')
      const password = formData.get('password')

      try {
        const res = await fetch('/auth/email/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
          credentials: 'include'
        })

        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.message || 'Login failed')
        }

        // Redirect to Hyperfy directly with auth token and name
        const params = new URLSearchParams({
          authToken: data.token,
          name: data.user.name
        })
        window.location.href = '${HYPERFY_PUBLIC_URL}/?' + params.toString()
      } catch (err) {
        errorEl.textContent = err.message
        errorEl.classList.add('show')
      }
    })

    function continueAsGuest() {
      // Go directly to Hyperfy (bypass auth)
      window.location.href = '${HYPERFY_PUBLIC_URL}/'
    }

    // Check for error in URL
    const urlParams = new URLSearchParams(window.location.search)
    const urlError = urlParams.get('error')
    if (urlError) {
      errorEl.textContent = decodeURIComponent(urlError)
      errorEl.classList.add('show')
    }
  </script>
</body>
</html>
  `
  reply.type('text/html').send(loginHtml)
})

// Registration page
fastify.get('/register', async (request, reply) => {
  const registerHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Register - Hyperfy</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
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
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(10px);
      border-radius: 16px;
      padding: 40px;
      width: 100%;
      max-width: 400px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    }
    h1 { text-align: center; margin-bottom: 8px; font-size: 28px; }
    .subtitle { text-align: center; color: #aaa; margin-bottom: 32px; }
    form { display: flex; flex-direction: column; gap: 16px; }
    input {
      padding: 14px 16px;
      border: 1px solid #333;
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.3);
      color: #fff;
      font-size: 16px;
    }
    input:focus { outline: none; border-color: #4a9eff; }
    input::placeholder { color: #666; }
    button {
      padding: 14px 24px;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      background: linear-gradient(135deg, #4a9eff 0%, #6366f1 100%);
      color: #fff;
    }
    .links { text-align: center; margin-top: 16px; }
    .links a { color: #4a9eff; text-decoration: none; }
    .error {
      background: rgba(239, 68, 68, 0.2);
      border: 1px solid #ef4444;
      color: #ef4444;
      padding: 12px;
      border-radius: 8px;
      text-align: center;
      display: none;
    }
    .error.show { display: block; }
    .success {
      background: rgba(34, 197, 94, 0.2);
      border: 1px solid #22c55e;
      color: #22c55e;
      padding: 12px;
      border-radius: 8px;
      text-align: center;
      display: none;
    }
    .success.show { display: block; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Create Account</h1>
    <p class="subtitle">Join Hyperfy</p>

    <div id="error" class="error"></div>
    <div id="success" class="success"></div>

    <form id="registerForm">
      <input type="text" name="name" placeholder="Display Name" required />
      <input type="email" name="email" placeholder="Email" required />
      <input type="password" name="password" placeholder="Password (min 8 characters)" minlength="8" required />
      <input type="password" name="confirmPassword" placeholder="Confirm Password" required />
      <button type="submit">Create Account</button>
    </form>

    <div class="links">
      <a href="/login">Already have an account? Sign in</a>
    </div>
  </div>

  <script>
    const form = document.getElementById('registerForm')
    const errorEl = document.getElementById('error')
    const successEl = document.getElementById('success')

    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      errorEl.classList.remove('show')
      successEl.classList.remove('show')

      const formData = new FormData(form)
      const name = formData.get('name')
      const email = formData.get('email')
      const password = formData.get('password')
      const confirmPassword = formData.get('confirmPassword')

      if (password !== confirmPassword) {
        errorEl.textContent = 'Passwords do not match'
        errorEl.classList.add('show')
        return
      }

      try {
        const res = await fetch('/auth/email/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password }),
          credentials: 'include'
        })

        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.message || 'Registration failed')
        }

        successEl.textContent = 'Account created! Redirecting...'
        successEl.classList.add('show')

        // Redirect to Hyperfy directly with auth token and name
        setTimeout(() => {
          const params = new URLSearchParams({
            authToken: data.token,
            name: data.user.name
          })
          window.location.href = '${HYPERFY_PUBLIC_URL}/?' + params.toString()
        }, 1500)
      } catch (err) {
        errorEl.textContent = err.message
        errorEl.classList.add('show')
      }
    })
  </script>
</body>
</html>
  `
  reply.type('text/html').send(registerHtml)
})

// Redirect all other routes to Hyperfy directly
// Auth Gateway only handles /login, /register, /auth/*
fastify.setNotFoundHandler(async (request, reply) => {
  // If user is authenticated, redirect to Hyperfy
  // If not, redirect to login
  if (process.env.REQUIRE_AUTH === 'true' && !request.user) {
    return reply.redirect('/login')
  }

  // Redirect to Hyperfy directly
  return reply.redirect(HYPERFY_PUBLIC_URL + request.url)
})

// Start server
try {
  await fastify.listen({ port: PORT, host: HOST })
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                   Hyperfy Auth Gateway                       ║
╠══════════════════════════════════════════════════════════════╣
║  Server:     http://${HOST}:${PORT}                              ║
║  Hyperfy:    ${HYPERFY_URL.padEnd(35)}          ║
║  SAML:       ${process.env.SAML_ENABLED === 'true' ? 'Enabled' : 'Disabled'}                                        ║
║  Email Auth: ${process.env.EMAIL_ENABLED !== 'false' ? 'Enabled' : 'Disabled'}                                        ║
║  Require Auth: ${process.env.REQUIRE_AUTH === 'true' ? 'Yes' : 'No'}                                      ║
╚══════════════════════════════════════════════════════════════╝
  `)
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...')
  db.close()
  await fastify.close()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\nShutting down...')
  db.close()
  await fastify.close()
  process.exit(0)
})
