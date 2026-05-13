import { createHash, randomBytes } from 'node:crypto';

interface UserRecord {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  salt: string;
  createdAt: number;
  updatedAt: number;
  avatar?: string;
  role: 'user' | 'admin';
}

interface RegisterInput {
  username: string;
  email: string;
  password: string;
}

interface LoginInput {
  username: string;
  password: string;
}

interface AuthResult {
  success: boolean;
  user?: Omit<UserRecord, 'passwordHash' | 'salt'>;
  token?: string;
  error?: string;
}

const users = new Map<string, UserRecord>();
const usernameIndex = new Map<string, string>();
const emailIndex = new Map<string, string>();

function hashPassword(password: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${password}`).digest('hex');
}

function generateId(): string {
  return randomBytes(16).toString('hex');
}

function generateSalt(): string {
  return randomBytes(32).toString('hex');
}

function sanitizeUser(user: UserRecord): Omit<UserRecord, 'passwordHash' | 'salt'> {
  const { passwordHash, salt, ...rest } = user;
  return rest;
}

export class AuthService {
  register(input: RegisterInput): AuthResult {
    if (!input.username || input.username.length < 3) {
      return { success: false, error: 'Username must be at least 3 characters' };
    }
    if (!input.email || !input.email.includes('@')) {
      return { success: false, error: 'Invalid email address' };
    }
    if (!input.password || input.password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters' };
    }
    if (usernameIndex.has(input.username)) {
      return { success: false, error: 'Username already exists' };
    }
    if (emailIndex.has(input.email)) {
      return { success: false, error: 'Email already registered' };
    }

    const salt = generateSalt();
    const passwordHash = hashPassword(input.password, salt);
    const id = generateId();
    const now = Date.now();

    const user: UserRecord = {
      id,
      username: input.username,
      email: input.email,
      passwordHash,
      salt,
      createdAt: now,
      updatedAt: now,
      role: 'user',
    };

    users.set(id, user);
    usernameIndex.set(input.username, id);
    emailIndex.set(input.email, id);

    const token = this.generateToken(id);

    return {
      success: true,
      user: sanitizeUser(user),
      token,
    };
  }

  login(input: LoginInput): AuthResult {
    const userId = usernameIndex.get(input.username);
    if (!userId) {
      return { success: false, error: 'Invalid username or password' };
    }

    const user = users.get(userId);
    if (!user) {
      return { success: false, error: 'Invalid username or password' };
    }

    const passwordHash = hashPassword(input.password, user.salt);
    if (passwordHash !== user.passwordHash) {
      return { success: false, error: 'Invalid username or password' };
    }

    const token = this.generateToken(user.id);

    return {
      success: true,
      user: sanitizeUser(user),
      token,
    };
  }

  getUser(userId: string): Omit<UserRecord, 'passwordHash' | 'salt'> | null {
    const user = users.get(userId);
    return user ? sanitizeUser(user) : null;
  }

  getUserByUsername(username: string): Omit<UserRecord, 'passwordHash' | 'salt'> | null {
    const userId = usernameIndex.get(username);
    if (!userId) return null;
    const user = users.get(userId);
    return user ? sanitizeUser(user) : null;
  }

  updateUser(userId: string, updates: Partial<Pick<UserRecord, 'username' | 'email' | 'avatar'>>): AuthResult {
    const user = users.get(userId);
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    if (updates.username && updates.username !== user.username) {
      if (usernameIndex.has(updates.username)) {
        return { success: false, error: 'Username already taken' };
      }
      usernameIndex.delete(user.username);
      user.username = updates.username;
      usernameIndex.set(updates.username, userId);
    }

    if (updates.email && updates.email !== user.email) {
      if (emailIndex.has(updates.email)) {
        return { success: false, error: 'Email already registered' };
      }
      emailIndex.delete(user.email);
      user.email = updates.email;
      emailIndex.set(updates.email, userId);
    }

    if (updates.avatar) {
      user.avatar = updates.avatar;
    }

    user.updatedAt = Date.now();

    return {
      success: true,
      user: sanitizeUser(user),
    };
  }

  deleteUser(userId: string): boolean {
    const user = users.get(userId);
    if (!user) return false;
    usernameIndex.delete(user.username);
    emailIndex.delete(user.email);
    users.delete(userId);
    return true;
  }

  private generateToken(userId: string): string {
    const payload = JSON.stringify({ userId, iat: Date.now(), rnd: randomBytes(8).toString('hex') });
    return Buffer.from(payload).toString('base64url');
  }

  verifyToken(token: string): string | null {
    try {
      const payload = JSON.parse(Buffer.from(token, 'base64url').toString());
      if (!payload.userId) return null;
      if (!users.has(payload.userId)) return null;
      return payload.userId;
    } catch {
      return null;
    }
  }

  createAdmin(input: RegisterInput): AuthResult {
    const result = this.register(input);
    if (result.success && result.user) {
      const user = users.get(result.user.id);
      if (user) {
        user.role = 'admin';
        result.user.role = 'admin';
      }
    }
    return result;
  }
}
