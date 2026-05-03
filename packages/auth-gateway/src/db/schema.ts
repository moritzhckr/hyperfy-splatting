import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

export interface User {
  id: string
  email: string | null
  email_verified: boolean
  password_hash: string | null
  saml_provider: string | null
  saml_subject: string | null
  name: string
  avatar_url: string | null
  bio: string | null
  rank: number
  roles: string
  settings: string
  created_at: string
  updated_at: string
  last_login: string | null
}

export interface Session {
  id: string
  user_id: string
  token_hash: string
  refresh_token_hash: string | null
  device_info: string
  ip_address: string | null
  created_at: string
  expires_at: string
  last_active: string
}

export interface InventoryItem {
  id: string
  user_id: string
  item_type: string
  item_id: string
  item_data: string
  acquired_at: string
}

export interface EmailVerification {
  id: string
  user_id: string
  token_hash: string
  expires_at: string
  created_at: string
}

export interface PasswordReset {
  id: string
  user_id: string
  token_hash: string
  expires_at: string
  created_at: string
  used_at: string | null
}

const SCHEMA = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  email_verified INTEGER DEFAULT 0,
  password_hash TEXT,
  saml_provider TEXT,
  saml_subject TEXT,
  name TEXT NOT NULL DEFAULT 'Anonymous',
  avatar_url TEXT,
  bio TEXT,
  rank INTEGER DEFAULT 0,
  roles TEXT DEFAULT '[]',
  settings TEXT DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login TEXT,
  UNIQUE(saml_provider, saml_subject)
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  refresh_token_hash TEXT UNIQUE,
  device_info TEXT DEFAULT '{}',
  ip_address TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_active TEXT NOT NULL
);

-- Inventory items
CREATE TABLE IF NOT EXISTS inventory_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_data TEXT DEFAULT '{}',
  acquired_at TEXT NOT NULL,
  UNIQUE(user_id, item_type, item_id)
);

-- Email verification tokens
CREATE TABLE IF NOT EXISTS email_verifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  used_at TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_inventory_user_id ON inventory_items(user_id);
CREATE INDEX IF NOT EXISTS idx_inventory_type ON inventory_items(item_type);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_saml ON users(saml_provider, saml_subject);
`

export class AuthDatabase {
  private db: Database.Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.init()
  }

  private init() {
    this.db.exec(SCHEMA)
    console.log('[AuthDB] Database initialized')
  }

  // User operations
  createUser(data: Partial<User>): User {
    const now = new Date().toISOString()
    const user: User = {
      id: data.id || randomUUID(),
      email: data.email || null,
      email_verified: data.email_verified || false,
      password_hash: data.password_hash || null,
      saml_provider: data.saml_provider || null,
      saml_subject: data.saml_subject || null,
      name: data.name || 'Anonymous',
      avatar_url: data.avatar_url || null,
      bio: data.bio || null,
      rank: data.rank || 0,
      roles: data.roles || '[]',
      settings: data.settings || '{}',
      created_at: now,
      updated_at: now,
      last_login: null
    }

    const stmt = this.db.prepare(`
      INSERT INTO users (id, email, email_verified, password_hash, saml_provider, saml_subject,
        name, avatar_url, bio, rank, roles, settings, created_at, updated_at, last_login)
      VALUES (@id, @email, @email_verified, @password_hash, @saml_provider, @saml_subject,
        @name, @avatar_url, @bio, @rank, @roles, @settings, @created_at, @updated_at, @last_login)
    `)

    stmt.run({
      ...user,
      email_verified: user.email_verified ? 1 : 0
    })

    return user
  }

  getUserById(id: string): User | undefined {
    const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?')
    const row = stmt.get(id) as any
    if (!row) return undefined
    return { ...row, email_verified: !!row.email_verified }
  }

  getUserByEmail(email: string): User | undefined {
    const stmt = this.db.prepare('SELECT * FROM users WHERE email = ?')
    const row = stmt.get(email) as any
    if (!row) return undefined
    return { ...row, email_verified: !!row.email_verified }
  }

  getUserBySaml(provider: string, subject: string): User | undefined {
    const stmt = this.db.prepare('SELECT * FROM users WHERE saml_provider = ? AND saml_subject = ?')
    const row = stmt.get(provider, subject) as any
    if (!row) return undefined
    return { ...row, email_verified: !!row.email_verified }
  }

  updateUser(id: string, data: Partial<User>): User | undefined {
    const user = this.getUserById(id)
    if (!user) return undefined

    const updated = {
      ...user,
      ...data,
      updated_at: new Date().toISOString()
    }

    const stmt = this.db.prepare(`
      UPDATE users SET
        email = @email, email_verified = @email_verified, password_hash = @password_hash,
        saml_provider = @saml_provider, saml_subject = @saml_subject, name = @name,
        avatar_url = @avatar_url, bio = @bio, rank = @rank, roles = @roles,
        settings = @settings, updated_at = @updated_at, last_login = @last_login
      WHERE id = @id
    `)

    stmt.run({
      ...updated,
      email_verified: updated.email_verified ? 1 : 0
    })

    return updated
  }

  updateLastLogin(userId: string): void {
    const stmt = this.db.prepare('UPDATE users SET last_login = ? WHERE id = ?')
    stmt.run(new Date().toISOString(), userId)
  }

  // Session operations
  createSession(data: Omit<Session, 'id' | 'created_at' | 'last_active'>): Session {
    const now = new Date().toISOString()
    const session: Session = {
      id: randomUUID(),
      ...data,
      created_at: now,
      last_active: now
    }

    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, user_id, token_hash, refresh_token_hash, device_info, ip_address, created_at, expires_at, last_active)
      VALUES (@id, @user_id, @token_hash, @refresh_token_hash, @device_info, @ip_address, @created_at, @expires_at, @last_active)
    `)

    stmt.run(session)
    return session
  }

  getSessionByTokenHash(tokenHash: string): Session | undefined {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE token_hash = ?')
    return stmt.get(tokenHash) as Session | undefined
  }

  getSessionByRefreshTokenHash(refreshTokenHash: string): Session | undefined {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE refresh_token_hash = ?')
    return stmt.get(refreshTokenHash) as Session | undefined
  }

  updateSessionActivity(sessionId: string): void {
    const stmt = this.db.prepare('UPDATE sessions SET last_active = ? WHERE id = ?')
    stmt.run(new Date().toISOString(), sessionId)
  }

  deleteSession(sessionId: string): void {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE id = ?')
    stmt.run(sessionId)
  }

  deleteUserSessions(userId: string): void {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE user_id = ?')
    stmt.run(userId)
  }

  cleanExpiredSessions(): number {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE expires_at < ?')
    const result = stmt.run(new Date().toISOString())
    return result.changes
  }

  // Inventory operations
  addInventoryItem(userId: string, itemType: string, itemId: string, itemData: object = {}): InventoryItem {
    const item: InventoryItem = {
      id: randomUUID(),
      user_id: userId,
      item_type: itemType,
      item_id: itemId,
      item_data: JSON.stringify(itemData),
      acquired_at: new Date().toISOString()
    }

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO inventory_items (id, user_id, item_type, item_id, item_data, acquired_at)
      VALUES (@id, @user_id, @item_type, @item_id, @item_data, @acquired_at)
    `)

    stmt.run(item)
    return item
  }

  getUserInventory(userId: string, itemType?: string): InventoryItem[] {
    if (itemType) {
      const stmt = this.db.prepare('SELECT * FROM inventory_items WHERE user_id = ? AND item_type = ?')
      return stmt.all(userId, itemType) as InventoryItem[]
    }
    const stmt = this.db.prepare('SELECT * FROM inventory_items WHERE user_id = ?')
    return stmt.all(userId) as InventoryItem[]
  }

  removeInventoryItem(userId: string, itemType: string, itemId: string): boolean {
    const stmt = this.db.prepare('DELETE FROM inventory_items WHERE user_id = ? AND item_type = ? AND item_id = ?')
    const result = stmt.run(userId, itemType, itemId)
    return result.changes > 0
  }

  // Email verification
  createEmailVerification(userId: string, tokenHash: string, expiresIn: number = 24 * 60 * 60 * 1000): EmailVerification {
    const verification: EmailVerification = {
      id: randomUUID(),
      user_id: userId,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + expiresIn).toISOString(),
      created_at: new Date().toISOString()
    }

    // Delete any existing verifications for this user
    this.db.prepare('DELETE FROM email_verifications WHERE user_id = ?').run(userId)

    const stmt = this.db.prepare(`
      INSERT INTO email_verifications (id, user_id, token_hash, expires_at, created_at)
      VALUES (@id, @user_id, @token_hash, @expires_at, @created_at)
    `)

    stmt.run(verification)
    return verification
  }

  getEmailVerificationByTokenHash(tokenHash: string): EmailVerification | undefined {
    const stmt = this.db.prepare('SELECT * FROM email_verifications WHERE token_hash = ? AND expires_at > ?')
    return stmt.get(tokenHash, new Date().toISOString()) as EmailVerification | undefined
  }

  deleteEmailVerification(id: string): void {
    const stmt = this.db.prepare('DELETE FROM email_verifications WHERE id = ?')
    stmt.run(id)
  }

  // Password reset
  createPasswordReset(userId: string, tokenHash: string, expiresIn: number = 60 * 60 * 1000): PasswordReset {
    const reset: PasswordReset = {
      id: randomUUID(),
      user_id: userId,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + expiresIn).toISOString(),
      created_at: new Date().toISOString(),
      used_at: null
    }

    // Delete any existing resets for this user
    this.db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(userId)

    const stmt = this.db.prepare(`
      INSERT INTO password_resets (id, user_id, token_hash, expires_at, created_at, used_at)
      VALUES (@id, @user_id, @token_hash, @expires_at, @created_at, @used_at)
    `)

    stmt.run(reset)
    return reset
  }

  getPasswordResetByTokenHash(tokenHash: string): PasswordReset | undefined {
    const stmt = this.db.prepare('SELECT * FROM password_resets WHERE token_hash = ? AND expires_at > ? AND used_at IS NULL')
    return stmt.get(tokenHash, new Date().toISOString()) as PasswordReset | undefined
  }

  markPasswordResetUsed(id: string): void {
    const stmt = this.db.prepare('UPDATE password_resets SET used_at = ? WHERE id = ?')
    stmt.run(new Date().toISOString(), id)
  }

  close(): void {
    this.db.close()
  }
}
