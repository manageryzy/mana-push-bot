# Security Guidelines

## Overview

This document outlines the security measures implemented in the Mana Push Bot and provides guidelines for secure deployment and operation.

## Authentication & Authorization

### JWT Token Authentication

The bot now uses JSON Web Tokens (JWT) for secure API authentication:

- **Token Generation**: Use `AuthService.generateToken(userId)` to create tokens
- **Token Validation**: All API endpoints validate JWT tokens automatically
- **Token Expiry**: Tokens expire after 24 hours by default

### Environment Variables

**Required for Production:**

```bash
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather

# JWT Security
JWT_SECRET=your_very_secure_random_secret_key_min_32_chars

# Admin Users (comma-separated user IDs)
ADMIN_USER_IDS=123456789,987654321

# Optional
DEV_CHAT_ID=your_dev_chat_id
LOG_LEVEL=info
NODE_ENV=production
```

### Admin Access

- Admin users are defined by their Telegram user IDs in `ADMIN_USER_IDS`
- Admin commands require both valid authentication AND admin privileges
- Non-admin users cannot access sensitive operations

## Security Features Implemented

### ✅ Fixed Issues

1. **Removed Sensitive Data from Git**
   - `config/bot-config.json` moved to `.gitignore`
   - Created `config/bot-config.example.json` as template

2. **Proper JWT Authentication**
   - Replaced weak integer-based tokens with cryptographic JWT
   - Token validation with expiry checking
   - Secure token extraction and verification

3. **Input Validation**
   - All `parseInt()` calls now include radix parameter
   - Proper JSON parsing with error handling
   - Request validation for all endpoints

4. **AWS Security**
   - Upgraded to AWS SDK v3 for better security
   - Dead Letter Queue (DLQ) properly configured
   - IAM permissions follow least-privilege principle

5. **Dependency Security**
   - Downgraded Express from alpha v5 to stable v4
   - Updated to latest secure versions of dependencies

## Deployment Security

### Production Environment

1. **Generate Strong JWT Secret**

   ```bash
   # Generate a strong random secret (minimum 32 characters)
   openssl rand -base64 32
   ```

2. **Set Environment Variables**

   ```bash
   export JWT_SECRET="your_generated_secret_here"
   export NODE_ENV="production"
   export TELEGRAM_BOT_TOKEN="your_bot_token"
   export ADMIN_USER_IDS="your_user_id"
   ```

3. **AWS Deployment**
   ```bash
   # Deploy with environment variables
   serverless deploy --stage prod
   ```

### Development Environment

1. **Create `.env` file** (never commit this):

   ```bash
   TELEGRAM_BOT_TOKEN=your_dev_bot_token
   JWT_SECRET=dev_secret_min_32_chars
   ADMIN_USER_IDS=your_user_id
   NODE_ENV=development
   PORT=3001
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Run tests**:
   ```bash
   npm test
   ```

## API Security Usage

### Generating Tokens

```typescript
import { AuthService } from '@/utils/auth';

// Generate token for a user
const token = AuthService.generateToken(userId);
```

### Making Authenticated Requests

```bash
# Using curl with JWT token
curl -H "Authorization: Bearer your_jwt_token_here" \
     -H "Content-Type: application/json" \
     -d '{"channel": "alerts", "message": "Test message"}' \
     https://api.yourdomain.com/push
```

### Development Fallback

In development mode (`NODE_ENV !== 'production'`), the system falls back to query parameters or body fields for user identification. **This is disabled in production** for security.

## Security Best Practices

### For Administrators

1. **Never share JWT secrets** or bot tokens
2. **Rotate JWT secrets** periodically
3. **Monitor admin user list** - remove inactive admins
4. **Use HTTPS only** in production
5. **Enable logging** for security events

### For Developers

1. **Never commit** `.env` files or sensitive data
2. **Use strong secrets** (minimum 32 characters)
3. **Validate all inputs** before processing
4. **Handle errors securely** (don't leak sensitive info)
5. **Keep dependencies updated**

## Incident Response

If security is compromised:

1. **Immediately rotate JWT secret**
2. **Revoke Telegram bot token** and create new one
3. **Review admin user list**
4. **Check logs** for suspicious activity
5. **Update all environment variables**

## Testing Security

Run the security-focused tests:

```bash
# Run authentication tests
npm test auth.test.ts

# Run all handler tests
npm test handlers/

# Run with coverage
npm run test:coverage
```

## Monitoring

Enable monitoring for:

- Failed authentication attempts
- Admin command usage
- Unusual API access patterns
- Error rates and response times

## Contact

For security concerns or to report vulnerabilities, please contact the development team immediately.
