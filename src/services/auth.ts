import { eq, and } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { Database } from '../db';
import { schema } from '../db';
import { User, Session } from '../types';
import { AppError } from '../middleware/error-handler';
import { isValidEmail, isValidPassword } from '../middleware/validation';
import * as crypto from 'crypto';

// Generate a cryptographically random session token
function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

// Calculate session expiration date
function getSessionExpiration(expirationSeconds: number): Date {
  return new Date(Date.now() + expirationSeconds * 1000);
}

// Register a new user
export async function register(
  db: Database,
  email: string,
  password: string,
  tenantId: string,
  bcryptWorkFactor: number,
  sessionExpiration: number
): Promise<{ user: User; token: string }> {
  // Validate input
  if (!isValidEmail(email)) {
    throw new AppError('INVALID_EMAIL', 'Invalid email format', 400);
  }

  if (!isValidPassword(password)) {
    throw new AppError(
      'WEAK_PASSWORD',
      'Password must be at least 8 characters with letters and numbers',
      400
    );
  }

  // Check if user already exists
  const [existingUser] = await db
    .select()
    .from(schema.users)
    .where(
      and(
        eq(schema.users.email, email),
        eq(schema.users.tenantId, tenantId)
      )
    )
    .limit(1);

  if (existingUser) {
    throw new AppError('DUPLICATE_EMAIL', 'Email already exists', 400);
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, bcryptWorkFactor);

  // Create user
  const [user] = await db
    .insert(schema.users)
    .values({
      tenantId,
      email,
      passwordHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  // Create session
  const token = generateSessionToken();
  const expiresAt = getSessionExpiration(sessionExpiration);

  await db.insert(schema.sessions).values({
    token,
    userId: user.id,
    tenantId,
    createdAt: new Date(),
    expiresAt,
  });

  return {
    user: {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      passwordHash: user.passwordHash,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    token,
  };
}

// Login user
export async function login(
  db: Database,
  email: string,
  password: string,
  tenantId: string,
  sessionExpiration: number
): Promise<{ user: User; token: string }> {
  // Find user
  const [user] = await db
    .select()
    .from(schema.users)
    .where(
      and(
        eq(schema.users.email, email),
        eq(schema.users.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!user) {
    throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
  }

  // Verify password
  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
  }

  // Create session
  const token = generateSessionToken();
  const expiresAt = getSessionExpiration(sessionExpiration);

  await db.insert(schema.sessions).values({
    token,
    userId: user.id,
    tenantId,
    createdAt: new Date(),
    expiresAt,
  });

  return {
    user: {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      passwordHash: user.passwordHash,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    token,
  };
}

// Validate session token
export async function validateSession(
  db: Database,
  token: string
): Promise<{ userId: string; tenantId: string; email: string } | null> {
  const [session] = await db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.token, token))
    .limit(1);

  if (!session) {
    return null;
  }

  // Check if expired
  if (new Date() > session.expiresAt) {
    // Delete expired session
    await db.delete(schema.sessions).where(eq(schema.sessions.token, token));
    return null;
  }

  // Get user info
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, session.userId))
    .limit(1);

  if (!user) {
    return null;
  }

  return {
    userId: user.id,
    tenantId: user.tenantId,
    email: user.email,
  };
}

// Logout (invalidate session)
export async function logout(db: Database, token: string): Promise<void> {
  await db.delete(schema.sessions).where(eq(schema.sessions.token, token));
}
