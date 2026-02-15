# SaaS Backend Layer

A reusable backend infrastructure built on Cloudflare Workers and Neon Postgres that provides authentication, organization management, role-based permissions, subscription handling, and usage tracking.

## Architecture

- **Runtime**: Cloudflare Workers (edge functions)
- **Database**: Neon Postgres (serverless PostgreSQL)
- **ORM**: Drizzle ORM
- **Framework**: Hono (lightweight web framework)
- **Security**: Row-Level Security (RLS) policies for automatic data isolation

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up Neon Postgres database:
   - Create a Neon project at https://neon.tech
   - Copy your connection string

3. Set up environment variables:
```bash
cp .dev.vars.example .dev.vars
# Edit .dev.vars and add your DATABASE_URL
```

4. Generate and run database migrations:
```bash
npm run db:generate
npm run db:push
```

5. Apply RLS policies:
```bash
# Connect to your Neon database and run:
psql $DATABASE_URL < src/db/rls-policies.sql
```

6. Run locally:
```bash
npm run dev
```

7. Deploy:
```bash
npm run deploy
```

## Database Management

Generate migrations:
```bash
npm run db:generate
```

Push schema changes:
```bash
npm run db:push
```

Open Drizzle Studio (database GUI):
```bash
npm run db:studio
```

## Production Deployment

Set secrets in Cloudflare Workers:
```bash
wrangler secret put DATABASE_URL
wrangler secret put JWT_SECRET
wrangler secret put BCRYPT_WORK_FACTOR
wrangler secret put SESSION_EXPIRATION
wrangler secret put RATE_LIMIT_PER_MINUTE
wrangler secret put ENVIRONMENT
```

## Testing

Run tests:
```bash
npm test
```

Watch mode:
```bash
npm run test:watch
```

## Project Structure

```
src/
├── index.ts           # Main entry point
├── types.ts           # TypeScript type definitions
├── db/
│   ├── schema.ts      # Drizzle database schema
│   ├── index.ts       # Database connection
│   └── rls-policies.sql  # Row-Level Security policies
├── services/          # Business logic services
└── middleware/        # Request middleware
```

## Security

This backend uses Row-Level Security (RLS) at the database level to enforce:
- Tenant isolation (multi-tenancy)
- User access control
- Organization membership validation

RLS policies automatically filter queries, preventing data leaks even if application code has bugs.
