import bcrypt from 'bcrypt'
import { randomBytes, createHash } from 'crypto'
import type { AuthDatabase, User } from '../db/schema.js'

const SALT_ROUNDS = 12

export interface EmailAuthResult {
  success: boolean
  user?: User
  error?: string
}

export interface PasswordValidation {
  valid: boolean
  errors: string[]
}

export function validatePassword(password: string): PasswordValidation {
  const errors: string[] = []
  const minLength = parseInt(process.env.PASSWORD_MIN_LENGTH || '8')

  if (password.length < minLength) {
    errors.push(`Password must be at least ${minLength} characters`)
  }

  if (process.env.PASSWORD_REQUIRE_UPPERCASE === 'true' && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter')
  }

  if (process.env.PASSWORD_REQUIRE_NUMBER === 'true' && !/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number')
  }

  if (process.env.PASSWORD_REQUIRE_SPECIAL === 'true' && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function generateToken(): string {
  return randomBytes(32).toString('hex')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export class EmailAuthProvider {
  constructor(private db: AuthDatabase) {}

  async register(email: string, password: string, name: string): Promise<EmailAuthResult> {
    // Check if email already exists
    const existingUser = this.db.getUserByEmail(email.toLowerCase())
    if (existingUser) {
      return { success: false, error: 'Email already registered' }
    }

    // Validate password
    const validation = validatePassword(password)
    if (!validation.valid) {
      return { success: false, error: validation.errors.join('. ') }
    }

    // Hash password
    const passwordHash = await hashPassword(password)

    // Create user
    const user = this.db.createUser({
      email: email.toLowerCase(),
      email_verified: process.env.EMAIL_VERIFICATION_REQUIRED !== 'true',
      password_hash: passwordHash,
      name: name || email.split('@')[0]
    })

    return { success: true, user }
  }

  async login(email: string, password: string): Promise<EmailAuthResult> {
    // Find user by email
    const user = this.db.getUserByEmail(email.toLowerCase())
    if (!user) {
      return { success: false, error: 'Invalid email or password' }
    }

    // Check if user has password (might be SAML-only user)
    if (!user.password_hash) {
      return { success: false, error: 'Please use SSO to login' }
    }

    // Verify password
    const isValid = await verifyPassword(password, user.password_hash)
    if (!isValid) {
      return { success: false, error: 'Invalid email or password' }
    }

    // Check email verification
    if (process.env.EMAIL_VERIFICATION_REQUIRED === 'true' && !user.email_verified) {
      return { success: false, error: 'Please verify your email first' }
    }

    // Update last login
    this.db.updateLastLogin(user.id)

    return { success: true, user }
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<EmailAuthResult> {
    const user = this.db.getUserById(userId)
    if (!user) {
      return { success: false, error: 'User not found' }
    }

    if (!user.password_hash) {
      return { success: false, error: 'No password set for this account' }
    }

    // Verify current password
    const isValid = await verifyPassword(currentPassword, user.password_hash)
    if (!isValid) {
      return { success: false, error: 'Current password is incorrect' }
    }

    // Validate new password
    const validation = validatePassword(newPassword)
    if (!validation.valid) {
      return { success: false, error: validation.errors.join('. ') }
    }

    // Hash and update password
    const passwordHash = await hashPassword(newPassword)
    this.db.updateUser(userId, { password_hash: passwordHash })

    return { success: true, user }
  }

  async resetPassword(token: string, newPassword: string): Promise<EmailAuthResult> {
    // Find reset request by token hash
    const tokenHash = hashToken(token)
    const reset = this.db.getPasswordResetByTokenHash(tokenHash)

    if (!reset) {
      return { success: false, error: 'Invalid or expired reset link' }
    }

    // Get user
    const user = this.db.getUserById(reset.user_id)
    if (!user) {
      return { success: false, error: 'User not found' }
    }

    // Validate new password
    const validation = validatePassword(newPassword)
    if (!validation.valid) {
      return { success: false, error: validation.errors.join('. ') }
    }

    // Hash and update password
    const passwordHash = await hashPassword(newPassword)
    this.db.updateUser(user.id, { password_hash: passwordHash })

    // Mark reset as used
    this.db.markPasswordResetUsed(reset.id)

    // Invalidate all existing sessions
    this.db.deleteUserSessions(user.id)

    return { success: true, user }
  }

  async initiatePasswordReset(email: string): Promise<{ token: string } | null> {
    const user = this.db.getUserByEmail(email.toLowerCase())
    if (!user) {
      return null // Don't reveal if email exists
    }

    // Generate reset token
    const token = generateToken()
    const tokenHash = hashToken(token)

    // Create reset request (expires in 1 hour)
    this.db.createPasswordReset(user.id, tokenHash, 60 * 60 * 1000)

    return { token }
  }

  async verifyEmail(token: string): Promise<EmailAuthResult> {
    // Find verification by token hash
    const tokenHash = hashToken(token)
    const verification = this.db.getEmailVerificationByTokenHash(tokenHash)

    if (!verification) {
      return { success: false, error: 'Invalid or expired verification link' }
    }

    // Get user
    const user = this.db.getUserById(verification.user_id)
    if (!user) {
      return { success: false, error: 'User not found' }
    }

    // Mark email as verified
    this.db.updateUser(user.id, { email_verified: true })

    // Delete verification record
    this.db.deleteEmailVerification(verification.id)

    return { success: true, user: { ...user, email_verified: true } }
  }

  async initiateEmailVerification(userId: string): Promise<{ token: string } | null> {
    const user = this.db.getUserById(userId)
    if (!user || !user.email) {
      return null
    }

    // Generate verification token
    const token = generateToken()
    const tokenHash = hashToken(token)

    // Create verification (expires in 24 hours)
    this.db.createEmailVerification(user.id, tokenHash, 24 * 60 * 60 * 1000)

    return { token }
  }
}
