import { SAML } from '@node-saml/node-saml'
import type { AuthDatabase, User } from '../db/schema.js'

export interface SamlConfig {
  entryPoint: string
  issuer: string
  cert: string
  callbackUrl: string
  identifierFormat?: string
  wantAuthnResponseSigned?: boolean
  wantAssertionsSigned?: boolean
}

export interface SamlProfile {
  nameID: string
  nameIDFormat: string
  email?: string
  firstName?: string
  lastName?: string
  displayName?: string
  [key: string]: unknown
}

export interface SamlAuthResult {
  success: boolean
  user?: User
  error?: string
}

export class SamlAuthProvider {
  private saml: SAML
  private providerName: string

  constructor(
    private db: AuthDatabase,
    config: SamlConfig,
    providerName: string = 'default'
  ) {
    this.providerName = providerName

    this.saml = new SAML({
      entryPoint: config.entryPoint,
      issuer: config.issuer,
      cert: config.cert,
      callbackUrl: config.callbackUrl,
      identifierFormat: config.identifierFormat || 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
      wantAuthnResponseSigned: config.wantAuthnResponseSigned ?? true,
      wantAssertionsSigned: config.wantAssertionsSigned ?? false,
      // Disable signature validation for development if needed
      // signatureAlgorithm: 'sha256',
    })
  }

  async getLoginUrl(relayState?: string): Promise<string> {
    const url = await this.saml.getAuthorizeUrlAsync(
      relayState || '/',
      undefined,
      {}
    )
    return url
  }

  async getLogoutUrl(nameID: string, sessionIndex?: string): Promise<string> {
    const url = await this.saml.getLogoutUrlAsync(
      {
        nameID,
        nameIDFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
        sessionIndex,
      },
      '/'
    )
    return url
  }

  async validateResponse(samlResponse: string): Promise<{ profile: SamlProfile } | null> {
    try {
      const result = await this.saml.validatePostResponseAsync({
        SAMLResponse: samlResponse
      })

      if (!result.profile) {
        return null
      }

      return { profile: result.profile as SamlProfile }
    } catch (error) {
      console.error('SAML validation error:', error)
      return null
    }
  }

  async authenticateOrCreate(profile: SamlProfile): Promise<SamlAuthResult> {
    const subject = profile.nameID

    if (!subject) {
      return { success: false, error: 'No nameID in SAML response' }
    }

    // Try to find existing user by SAML subject
    let user = this.db.getUserBySaml(this.providerName, subject)

    if (!user) {
      // Try to find by email (link accounts)
      const email = profile.email || (profile.nameID.includes('@') ? profile.nameID : null)

      if (email) {
        user = this.db.getUserByEmail(email.toLowerCase())

        if (user) {
          // Link SAML identity to existing email user
          this.db.updateUser(user.id, {
            saml_provider: this.providerName,
            saml_subject: subject
          })
        }
      }

      if (!user) {
        // Create new user from SAML profile
        const displayName = this.extractDisplayName(profile)

        user = this.db.createUser({
          email: email?.toLowerCase() || null,
          email_verified: true, // SAML users are pre-verified
          saml_provider: this.providerName,
          saml_subject: subject,
          name: displayName
        })
      }
    }

    // Update last login
    this.db.updateLastLogin(user.id)

    return { success: true, user }
  }

  private extractDisplayName(profile: SamlProfile): string {
    if (profile.displayName) {
      return profile.displayName
    }

    if (profile.firstName && profile.lastName) {
      return `${profile.firstName} ${profile.lastName}`
    }

    if (profile.firstName) {
      return profile.firstName
    }

    // Common SAML attribute names
    const nameAttrs = [
      'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
      'http://schemas.microsoft.com/identity/claims/displayname',
      'urn:oid:2.16.840.1.113730.3.1.241', // displayName
      'givenName',
      'cn'
    ]

    for (const attr of nameAttrs) {
      if (profile[attr] && typeof profile[attr] === 'string') {
        return profile[attr] as string
      }
    }

    // Fall back to email prefix
    if (profile.email) {
      return profile.email.split('@')[0]
    }

    if (profile.nameID.includes('@')) {
      return profile.nameID.split('@')[0]
    }

    return 'User'
  }

  getMetadata(): string {
    return this.saml.generateServiceProviderMetadata(null, null)
  }
}

// Factory function to create SAML provider from environment variables
export function createSamlProviderFromEnv(db: AuthDatabase): SamlAuthProvider | null {
  if (process.env.SAML_ENABLED !== 'true') {
    return null
  }

  const entryPoint = process.env.SAML_ENTRY_POINT
  const issuer = process.env.SAML_ISSUER
  const cert = process.env.SAML_CERT
  const callbackUrl = process.env.SAML_CALLBACK_URL

  if (!entryPoint || !issuer || !cert || !callbackUrl) {
    console.warn('SAML is enabled but missing required configuration')
    return null
  }

  return new SamlAuthProvider(db, {
    entryPoint,
    issuer,
    cert: cert.replace(/\\n/g, '\n'),
    callbackUrl
  }, process.env.SAML_PROVIDER_NAME || 'default')
}
