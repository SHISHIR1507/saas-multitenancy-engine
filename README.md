# SaaS Backend Layer

A production-ready, reusable backend infrastructure built on Cloudflare Workers and Neon Postgres that provides essential SaaS features out of the box. Stop rebuilding authentication, organizations, permissions, and billing logic for every project.

## 🎯 The Problem

Most early-stage SaaS founders waste 2-4 weeks building the same infrastructure:
- User authentication and session management
- Multi-tenant organization structure
- Role-based access control (RBAC)
- Subscription and billing logic
- Usage tracking and quota enforcement

This backend layer solves that problem by providing a **plug-and-play API** that handles all common SaaS infrastructure, letting founders focus on their unique product features.

## 🏗️ Architecture

### Tech Stack

- **Runtime**: [Cloudflare Workers](https://workers.cloudflare.com/) - Serverless edge functions with global deployment
- **Database**: [Neon Postgres](https://neon.tech) - Serverless PostgreSQL with connection pooling and branching
- **ORM**: [Drizzle ORM](https://orm.drizzle.team/) - Type-safe SQL query builder with zero runtime overhead
- **Framework**: [Hono](https://hono.dev/) - Ultrafast web framework optimized for edge runtimes
- **Email**: [Resend](https://resend.com) - Modern email API for transactional emails
- **Testing**: [Vitest](https://vitest.dev/) + [fast-check](https://fast-check.dev/) - Unit and property-based testing

### Multi-Tenancy Model

The system implements a **shared infrastructure, isolated data** pattern:

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Workers                        │
│                     (Single Deployment)                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Tenant A (Founder 1)          Tenant B (Founder 2)        │
│  ├─ API Key: sk_live_abc       ├─ API Key: sk_live_xyz     │
│  ├─ Users                      ├─ Users                     │
│  ├─ Organizations              ├─ Organizations             │
│  └─ Subscriptions              └─ Subscriptions             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  Neon Postgres   │
                    │  (Shared Database)│
                    └──────────────────┘
```

**Data Isolation**: All queries are automatically scoped by `tenant_id`, ensuring complete data separation between tenants at the application layer.

## ✨ Features

### 🔐 Authentication System
- Email/password registration with bcrypt hashing (work factor: 10-12)
- Secure session token management (cryptographically random, 7-day expiration)
- Login with credential verification
- Session invalidation (logout)
- Password reset flow (planned)

### 🏢 Organization Management
- Create organizations (teams/workspaces)
- Invite members via email (Resend integration)
- Accept/reject invitations
- Remove members (owner-only)
- Multi-organization membership support

### 🔑 API Key Authentication
- Tenant identification via API keys (`sk_live_*` format)
- SHA-256 hashed storage (never store plaintext)
- Automatic tenant context injection
- Last-used timestamp tracking

### 🛡️ Security Features
- **Rate Limiting**: Per-tenant request throttling (configurable, default: 1000 req/min)
- **Input Validation**: Email format, password strength, XSS prevention
- **Error Handling**: Consistent error responses with request IDs for debugging
- **Tenant Isolation**: All database queries filtered by `tenant_id`

### 📊 Planned Features
- Role-based permissions (RBAC) with wildcard support
- Subscription management with tier-based features
- Usage tracking and quota enforcement
- Webhook support for subscription events
- Monitoring and observability (metrics, logs, traces)

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- [Neon](https://neon.tech) account (free tier available)
- [Resend](https://resend.com) account (optional, for emails)
- [Cloudflare](https://cloudflare.com) account (for deployment)

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd saas-backend-layer
   npm install
   ```

2. **Set up Neon Postgres**
   ```bash
   # Initialize Neon project
   npx neonctl@latest init
   
   # Or create manually at https://console.neon.tech
   ```

3. **Configure environment variables**
   ```bash
   cp .dev.vars.example .dev.vars
   ```
   
   Edit `.dev.vars` with your credentials:
   ```env
   DATABASE_URL=postgresql://user:pass@host.neon.tech/db?sslmode=require
   JWT_SECRET=your-random-secret-key-here
   RESEND_API_KEY=re_your_resend_key_here
   ```

4. **Run database migrations**
   ```bash
   npm run db:push
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```
   
   Server runs at `http://localhost:8787`

### Database Management

```bash
# Generate new migration
npm run db:generate

# Push schema changes to database
npm run db:push

# Open Drizzle Studio (database GUI)
npm run db:studio
```

## 📡 API Overview

### Authentication Endpoints

```http
POST /auth/register
POST /auth/login
POST /auth/logout
POST /auth/password-reset/request
POST /auth/password-reset/complete
```

### Organization Endpoints

```http
POST   /organizations
GET    /organizations/:id
GET    /users/:userId/organizations
POST   /organizations/:id/invitations
POST   /invitations/:id/accept
DELETE /organizations/:id/members/:userId
```

### API Key Format

All requests require authentication via API key:

```http
Authorization: Bearer sk_live_abc123xyz...
```

API keys identify the tenant (founder's product) making the request.

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

### Property-Based Testing

The project uses property-based testing (PBT) with `fast-check` to verify correctness properties:

- **Property 1**: Valid registration creates user and session
- **Property 2**: Valid login returns session token
- **Property 3**: Invalid credentials are rejected
- **Property 8**: Passwords are hashed with bcrypt
- **Property 31-33**: API key generation, validation, and rejection

Each property runs 100+ iterations with randomly generated inputs to catch edge cases.

## 🗄️ Database Schema

### Core Tables

- **users**: User accounts with bcrypt password hashes
- **sessions**: Active session tokens with expiration
- **organizations**: Teams/workspaces with owner references
- **organization_members**: User-organization relationships with roles
- **invitations**: Pending organization invitations
- **api_keys**: Hashed API keys with tenant mapping
- **roles**: Custom role definitions per tenant
- **subscription_tiers**: Subscription plans with features/limits
- **subscriptions**: Active subscriptions per organization
- **usage_records**: Usage tracking for billing/quotas

### Indexes

Optimized indexes on:
- `tenant_id` (all tables) - Fast tenant-scoped queries
- `email + tenant_id` (users) - Unique constraint, fast lookups
- `organization_id + user_id` (members) - Prevent duplicate memberships
- `timestamp` (usage_records) - Efficient time-range queries

## 🚢 Deployment

### Deploy to Cloudflare Workers

1. **Set production secrets**
   ```bash
   wrangler secret put DATABASE_URL
   wrangler secret put JWT_SECRET
   wrangler secret put RESEND_API_KEY
   wrangler secret put BCRYPT_WORK_FACTOR
   wrangler secret put SESSION_EXPIRATION
   wrangler secret put RATE_LIMIT_PER_MINUTE
   wrangler secret put ENVIRONMENT
   ```

2. **Deploy**
   ```bash
   npm run deploy
   ```

3. **Verify deployment**
   ```bash
   curl https://your-worker.workers.dev/health
   ```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | Neon Postgres connection string | Required |
| `JWT_SECRET` | Secret for session token signing | Required |
| `RESEND_API_KEY` | Resend API key for emails | Optional |
| `BCRYPT_WORK_FACTOR` | Bcrypt hashing rounds | 10 (dev), 12 (prod) |
| `SESSION_EXPIRATION` | Session TTL in seconds | 604800 (7 days) |
| `RATE_LIMIT_PER_MINUTE` | Requests per tenant per minute | 1000 |
| `ENVIRONMENT` | Environment name | development |

## 🏛️ Project Structure

```
src/
├── index.ts                 # Hono app entry point
├── types.ts                 # TypeScript type definitions
├── db/
│   ├── index.ts            # Database connection factory
│   └── schema.ts           # Drizzle schema definitions
├── middleware/
│   ├── api-key-auth.ts     # API key authentication
│   ├── error-handler.ts    # Global error handling
│   ├── rate-limit.ts       # Rate limiting
│   ├── request-id.ts       # Request ID tracking
│   └── validation.ts       # Input validation utilities
└── services/
    ├── api-key.ts          # API key management
    ├── auth.ts             # Authentication logic
    ├── email.ts            # Email sending (Resend)
    └── organization.ts     # Organization management
```

## 🔒 Security Considerations

### Password Security
- Bcrypt hashing with configurable work factor
- Passwords never logged or returned in responses
- Minimum 8 characters with letters and numbers

### Session Security
- Cryptographically random tokens (128+ bits entropy)
- Secure token generation using `crypto.randomBytes()`
- Automatic expiration and cleanup
- Logout invalidates tokens immediately

### API Key Security
- SHA-256 hashed storage
- Never expose plaintext keys after generation
- Prefixed format (`sk_live_*`) for easy identification
- Last-used tracking for security audits

### Tenant Isolation
- All queries filtered by `tenant_id`
- No cross-tenant data leakage
- Validated at application layer



## Acknowledgments

Built with modern serverless technologies:
- Cloudflare Workers for global edge deployment
- Neon for serverless Postgres
- Drizzle ORM for type-safe database queries
- Hono for blazing-fast routing

---

** Stop rebuilding SaaS infrastructure and start building your product.
