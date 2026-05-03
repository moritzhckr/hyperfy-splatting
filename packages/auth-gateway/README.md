# Hyperfy Auth Gateway

Ein modulares Authentication Gateway für Hyperfy mit Unterstützung für:
- **SAML 2.0** - Enterprise SSO Integration
- **Email/Password** - Klassische Registrierung und Login
- **Session Management** - JWT-basierte Sessions mit Refresh Tokens

## Architektur

```
                     Internet
                        │
                        ▼
┌────────────────────────────────────────┐
│         Auth Gateway (Port 3000)       │
│  ┌──────────┐  ┌──────────┐           │
│  │ SAML 2.0 │  │  Email   │           │
│  │ Provider │  │ Provider │           │
│  └──────────┘  └──────────┘           │
│                    │                   │
│            ┌───────┴───────┐          │
│            │   Auth DB     │          │
│            │  (SQLite)     │          │
│            └───────────────┘          │
└────────────────────┬───────────────────┘
                     │ (Proxy + Headers)
                     ▼
┌────────────────────────────────────────┐
│        Hyperfy Backend (Port 3001)     │
└────────────────────────────────────────┘
```

## Schnellstart

### 1. Installation

```bash
cd packages/auth-gateway
npm install
```

### 2. Konfiguration

```bash
cp .env.example .env
# Bearbeite .env mit deinen Einstellungen
```

**Wichtige Einstellungen:**

```env
# JWT Secret (ÄNDERN!)
JWT_SECRET=your-super-secret-key-change-me

# Hyperfy Backend URL
HYPERFY_URL=http://localhost:3001

# Auth erzwingen?
REQUIRE_AUTH=true

# SAML aktivieren
SAML_ENABLED=true
SAML_ENTRY_POINT=https://your-idp.example.com/saml/sso
SAML_ISSUER=hyperfy-auth
SAML_CERT=-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----
SAML_CALLBACK_URL=http://localhost:3000/auth/saml/callback
```

### 3. Starten

```bash
# Development
npm run dev

# Production
npm run build
npm run start
```

## API Endpoints

### Auth Routes (`/auth/*`)

| Endpoint | Method | Beschreibung |
|----------|--------|--------------|
| `/auth/email/login` | POST | Email/Password Login |
| `/auth/email/register` | POST | Neuen Account erstellen |
| `/auth/email/forgot-password` | POST | Passwort-Reset anfordern |
| `/auth/email/reset-password` | POST | Passwort zurücksetzen |
| `/auth/email/verify` | GET | Email verifizieren |
| `/auth/saml/login` | GET | SAML SSO Login starten |
| `/auth/saml/callback` | POST | SAML Callback vom IdP |
| `/auth/saml/metadata` | GET | SP Metadata für IdP |
| `/auth/logout` | POST/GET | Ausloggen |
| `/auth/refresh` | POST | Token erneuern |
| `/auth/session` | GET | Session-Info abrufen |

### User Routes (`/api/user/*`)

| Endpoint | Method | Beschreibung |
|----------|--------|--------------|
| `/api/user/profile` | GET | Profil abrufen |
| `/api/user/profile` | PATCH | Profil aktualisieren |
| `/api/user/change-password` | POST | Passwort ändern |
| `/api/user/inventory` | GET | Inventory abrufen |
| `/api/user/inventory` | POST | Item hinzufügen |
| `/api/user/inventory` | DELETE | Item entfernen |
| `/api/user/avatars` | GET | Gespeicherte Avatare |
| `/api/user/avatars` | POST | Avatar speichern |
| `/api/user/avatars/:id` | DELETE | Avatar löschen |
| `/api/user/logout-all` | POST | Alle Sessions beenden |

## SAML 2.0 Setup

### 1. IdP Konfiguration

Dein Identity Provider benötigt folgende Informationen:

- **SP Entity ID**: Der Wert von `SAML_ISSUER` (z.B. `hyperfy-auth`)
- **ACS URL**: `https://your-domain.com/auth/saml/callback`
- **NameID Format**: `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress`

### 2. SP Metadata

Hole dir die SP Metadata von:
```
GET /auth/saml/metadata
```

### 3. IdP Certificate

Das IdP-Zertifikat muss in der `.env` Datei als einzeilige Zeichenkette mit `\n` für Zeilenumbrüche angegeben werden:

```env
SAML_CERT=-----BEGIN CERTIFICATE-----\nMIIC...base64...\n-----END CERTIFICATE-----
```

## Datenbank Schema

```sql
users (
  id, email, email_verified, password_hash,
  saml_provider, saml_subject,
  name, avatar_url, bio, rank, roles, settings,
  created_at, updated_at, last_login
)

sessions (
  id, user_id, token_hash, refresh_token_hash,
  device_info, ip_address,
  created_at, expires_at, last_active
)

inventory_items (
  id, user_id, item_type, item_id, item_data, acquired_at
)
```

## Docker Deployment

```bash
# Im Root-Verzeichnis
docker-compose -f docker-compose.auth.yml up -d
```

## Entwicklung

```bash
# TypeScript Watch Mode
npm run dev

# Build
npm run build

# Database Reset
rm -rf data/auth.db
npm run dev
```

## Security Hinweise

1. **JWT_SECRET** - Muss in Production ein starker, zufälliger Schlüssel sein
2. **HTTPS** - In Production MUSS HTTPS verwendet werden
3. **SESSION_COOKIE_SECURE** - Auf `true` setzen in Production
4. **SAML_CERT** - Zertifikat vom IdP regelmäßig aktualisieren

## Lizenz

MIT
