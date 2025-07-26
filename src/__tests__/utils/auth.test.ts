import { AuthService } from '@/utils/auth';
import jwt from 'jsonwebtoken';

// Mock config
jest.mock('@/config', () => ({
  config: {
    developer: {
      adminUserIds: [123, 456],
    },
    auth: {
      jwtSecret: 'test-secret',
    },
  },
}));

describe('AuthService', () => {
  const testUserId = 123;
  const testSecret = 'test-secret';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      const token = AuthService.generateToken(testUserId);
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');

      // Verify the token can be decoded
      const decoded = jwt.verify(token, testSecret) as any;
      expect(decoded.userId).toBe(testUserId);
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const token = jwt.sign({ userId: testUserId }, testSecret, {
        expiresIn: '1h',
      });
      const result = AuthService.verifyToken(token);

      expect(result).toBeTruthy();
      expect(result?.userId).toBe(testUserId);
    });

    it('should return null for invalid token', () => {
      const invalidToken = 'invalid.token.here';
      const result = AuthService.verifyToken(invalidToken);

      expect(result).toBeNull();
    });

    it('should return null for expired token', () => {
      const expiredToken = jwt.sign({ userId: testUserId }, testSecret, {
        expiresIn: '-1h',
      });
      const result = AuthService.verifyToken(expiredToken);

      expect(result).toBeNull();
    });
  });

  describe('extractUserIdFromToken', () => {
    it('should extract user ID from valid Bearer token', () => {
      const token = jwt.sign({ userId: testUserId }, testSecret, {
        expiresIn: '1h',
      });
      const authHeader = `Bearer ${token}`;

      const result = AuthService.extractUserIdFromToken(authHeader);
      expect(result).toBe(testUserId);
    });

    it('should return null for invalid auth header format', () => {
      const result = AuthService.extractUserIdFromToken('Invalid header');
      expect(result).toBeNull();
    });

    it('should return null for missing auth header', () => {
      const result = AuthService.extractUserIdFromToken(undefined);
      expect(result).toBeNull();
    });
  });

  describe('isAdmin', () => {
    it('should return true for admin user', () => {
      expect(AuthService.isAdmin(123)).toBe(true);
      expect(AuthService.isAdmin(456)).toBe(true);
    });

    it('should return false for non-admin user', () => {
      expect(AuthService.isAdmin(789)).toBe(false);
    });

    it('should return false for undefined user', () => {
      expect(AuthService.isAdmin(undefined)).toBe(false);
    });
  });

  describe('extractUserId', () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('should prioritize JWT token in production', () => {
      process.env.NODE_ENV = 'production';
      const token = jwt.sign({ userId: testUserId }, testSecret, {
        expiresIn: '1h',
      });
      const authHeader = `Bearer ${token}`;

      const result = AuthService.extractUserId(authHeader, '999', 888);
      expect(result).toBe(testUserId);
    });

    it('should fall back to query param in development', () => {
      process.env.NODE_ENV = 'development';

      const result = AuthService.extractUserId(undefined, '999', undefined);
      expect(result).toBe(999);
    });

    it('should fall back to body param in development', () => {
      process.env.NODE_ENV = 'development';

      const result = AuthService.extractUserId(undefined, undefined, 888);
      expect(result).toBe(888);
    });

    it('should return null in production without valid token', () => {
      process.env.NODE_ENV = 'production';

      const result = AuthService.extractUserId(undefined, '999', 888);
      expect(result).toBeNull();
    });
  });
});
