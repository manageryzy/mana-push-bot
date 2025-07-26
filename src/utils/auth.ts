import jwt from 'jsonwebtoken';
import { config } from '@/config';

export interface TokenPayload {
  userId: number;
  iat: number;
  exp: number;
}

export class AuthService {
  private static readonly JWT_SECRET = config.auth.jwtSecret;
  private static readonly TOKEN_EXPIRY = '24h';

  /**
   * Generate a JWT token for a user
   */
  public static generateToken(userId: number): string {
    return jwt.sign({ userId }, this.JWT_SECRET, {
      expiresIn: this.TOKEN_EXPIRY,
    });
  }

  /**
   * Verify and decode a JWT token
   */
  public static verifyToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET) as TokenPayload;
      return decoded;
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract user ID from Bearer token with proper validation
   */
  public static extractUserIdFromToken(authHeader?: string): number | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    const payload = this.verifyToken(token);
    return payload?.userId || null;
  }

  /**
   * Check if a user ID is an admin
   */
  public static isAdmin(userId?: number): boolean {
    if (!userId) return false;
    return config.developer.adminUserIds.includes(userId);
  }

  /**
   * Extract user ID from various sources (auth header, query param, body)
   * with preference for secure token-based authentication
   */
  public static extractUserId(
    authHeader?: string,
    userIdParam?: string,
    userIdBody?: number
  ): number | null {
    // First try to extract from JWT token (most secure)
    const tokenUserId = this.extractUserIdFromToken(authHeader);
    if (tokenUserId) {
      return tokenUserId;
    }

    // Fallback to query param or body for development/testing
    // In production, you might want to disable this
    if (process.env.NODE_ENV !== 'production') {
      return parseInt(userIdParam || String(userIdBody || ''), 10) || null;
    }

    return null;
  }
}
