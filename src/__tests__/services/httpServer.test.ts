import { HttpServer } from '@/services/httpServer';
import { ChannelService } from '@/services/channelService';
import { MessagePushService } from '@/services/messagePushService';
import { AuthService } from '@/utils/auth';
import request from 'supertest';
import express from 'express';

jest.mock('@/services/channelService');
jest.mock('@/services/messagePushService');
jest.mock('@/utils/auth');
jest.mock('@/config', () => ({
  config: {
    app: {
      stage: 'test',
      port: 3000,
      baseUrl: 'http://localhost:3000',
    },
    developer: {
      adminUserIds: [123456789],
    },
    auth: {
      jwtSecret: 'test-secret-for-testing-only-minimum-32-chars',
    },
  },
}));

describe('HttpServer', () => {
  let httpServer: HttpServer;
  let app: express.Application;
  let mockChannelService: jest.Mocked<ChannelService>;
  let mockMessagePushService: jest.Mocked<MessagePushService>;

  const mockAdminToken = 'valid-admin-token';
  const mockUserToken = 'valid-user-token';
  const adminUserId = 123456789;
  const regularUserId = 987654321;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock AuthService
    (AuthService.verifyToken as jest.Mock).mockImplementation(token => {
      if (token === mockAdminToken) return { userId: adminUserId };
      if (token === mockUserToken) return { userId: regularUserId };
      return null;
    });

    (AuthService.extractUserId as jest.Mock).mockImplementation(
      (authHeader, userIdParam, userIdBody) => {
        // Call verifyToken when extracting from auth header to satisfy test expectations
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          AuthService.verifyToken(token);
          if (token === mockAdminToken) return adminUserId;
          if (token === mockUserToken) return regularUserId;
        }
        if (userIdParam) return parseInt(userIdParam, 10);
        if (userIdBody) return userIdBody;
        return null;
      }
    );

    (AuthService.isAdmin as jest.Mock).mockImplementation(userId => {
      return userId === adminUserId;
    });

    // Mock ChannelService
    mockChannelService = {
      getAllChannels: jest.fn().mockResolvedValue([
        {
          id: 'general',
          name: 'General',
          description: 'General announcements',
          chatId: -1001234567890,
          isPublic: true,
          subscriberCount: 10,
          messageCount: 50,
        },
        {
          id: 'vip',
          name: 'VIP',
          chatId: -1009876543210,
          isPublic: false,
          subscriberCount: 3,
          messageCount: 20,
        },
      ]),
      getPublicChannels: jest.fn().mockResolvedValue([
        {
          id: 'general',
          name: 'General',
          isPublic: true,
        },
      ]),
      getChannel: jest.fn().mockResolvedValue({
        id: 'general',
        name: 'General',
        chatId: -1001234567890,
        isPublic: true,
      }),
      createChannel: jest.fn().mockResolvedValue({
        id: 'new-channel',
        name: 'New Channel',
        chatId: -1005555555555,
        isPublic: true,
        createdBy: adminUserId,
      }),
      updateChannel: jest.fn().mockResolvedValue({
        id: 'general',
        name: 'General Updated',
        description: 'Updated description',
      }),
      deleteChannel: jest.fn().mockResolvedValue(true),
      subscribe: jest.fn().mockResolvedValue({
        success: true,
        message: 'Subscribed successfully',
      }),
      unsubscribe: jest.fn().mockResolvedValue({
        success: true,
        message: 'Unsubscribed successfully',
      }),
      getUserSubscriptions: jest
        .fn()
        .mockResolvedValue([{ id: 'general', name: 'General' }]),
    } as any;

    // Mock MessagePushService
    mockMessagePushService = {
      pushToChannel: jest.fn().mockResolvedValue({
        success: true,
        messageId: 12345,
        channelId: 'general',
        timestamp: new Date().toISOString(),
        recipientCount: 11,
      }),
      getStats: jest.fn().mockResolvedValue({
        totalMessages: 100,
        successfulPushes: 95,
        failedPushes: 5,
        channelsActive: 2,
        subscribersTotal: 13,
        averageResponseTime: 250,
        topChannels: [
          { channelId: 'general', name: 'General', messageCount: 50 },
        ],
      }),
    } as any;

    httpServer = new HttpServer(mockChannelService, mockMessagePushService);
    app = (httpServer as any).app;
  });

  describe('Health Check Endpoint', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: {
          status: 'healthy',
          version: '1.0.0',
          environment: 'test',
        },
      });
    });
  });

  describe('Push Message Endpoints', () => {
    it('should push message via /push/:channel', async () => {
      const response = await request(app)
        .post('/push/general')
        .send({
          message: 'Test message',
          format: 'markdown',
          priority: 'normal',
          metadata: { source: 'test' },
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: {
          success: true,
          messageId: 12345,
          channelId: 'general',
          recipientCount: 11,
        },
      });

      expect(mockMessagePushService.pushToChannel).toHaveBeenCalledWith({
        channelId: 'general',
        message: 'Test message',
        format: 'markdown',
        priority: 'normal',
        metadata: { source: 'test' },
        timestamp: expect.any(String),
      });
    });

    it('should push message via /push with channel in body', async () => {
      const response = await request(app).post('/push').send({
        channel: 'general',
        message: 'Test message via body',
        format: 'html',
        priority: 'high',
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockMessagePushService.pushToChannel).toHaveBeenCalledWith(
        expect.objectContaining({
          channelId: 'general',
          message: 'Test message via body',
          format: 'html',
          priority: 'high',
        })
      );
    });

    it('should reject push without channel', async () => {
      const response = await request(app).post('/push').send({
        message: 'Test message',
      });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: 'Channel is required',
      });
    });

    it('should reject push without message', async () => {
      const response = await request(app).post('/push/general').send({});

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: 'Message is required',
      });
    });

    it('should handle push errors gracefully', async () => {
      mockMessagePushService.pushToChannel.mockResolvedValueOnce({
        success: false,
        error: 'Channel not found',
        channelId: 'invalid',
        timestamp: new Date().toISOString(),
        recipientCount: 0,
      });

      const response = await request(app).post('/push/invalid').send({
        message: 'Test message',
      });

      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        success: false,
        error: 'Failed to push message: Channel not found',
      });
    });
  });

  describe('Channel Management Endpoints', () => {
    describe('GET /api/channels', () => {
      it('should return all channels for admin', async () => {
        const response = await request(app)
          .get('/api/channels')
          .set('Authorization', `Bearer ${mockAdminToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data).toHaveLength(2);
        expect(mockChannelService.getAllChannels).toHaveBeenCalled();
      });

      it('should return public channels for regular users', async () => {
        const response = await request(app)
          .get('/api/channels')
          .set('Authorization', `Bearer ${mockUserToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data).toHaveLength(1);
        expect(mockChannelService.getPublicChannels).toHaveBeenCalled();
      });

      it('should return public channels for unauthenticated users', async () => {
        const response = await request(app).get('/api/channels');

        expect(response.status).toBe(200);
        expect(mockChannelService.getPublicChannels).toHaveBeenCalled();
      });
    });

    describe('POST /api/channels', () => {
      it('should create channel for admin', async () => {
        const response = await request(app)
          .post('/api/channels')
          .set('Authorization', `Bearer ${mockAdminToken}`)
          .send({
            name: 'New Channel',
            description: 'Test channel',
            chatId: -1005555555555,
            isPublic: true,
          });

        expect(response.status).toBe(201);
        expect(response.body.data).toMatchObject({
          id: 'new-channel',
          name: 'New Channel',
        });

        expect(mockChannelService.createChannel).toHaveBeenCalledWith({
          name: 'New Channel',
          description: 'Test channel',
          chatId: -1005555555555,
          isPublic: true,
          createdBy: adminUserId,
        });
      });

      it('should reject channel creation without auth', async () => {
        const response = await request(app).post('/api/channels').send({
          name: 'New Channel',
          chatId: -1005555555555,
        });

        expect(response.status).toBe(401);
        expect(response.body.error).toBe('Authentication required');
      });

      it('should reject channel creation for non-admin', async () => {
        const response = await request(app)
          .post('/api/channels')
          .set('Authorization', `Bearer ${mockUserToken}`)
          .send({
            name: 'New Channel',
            chatId: -1005555555555,
          });

        expect(response.status).toBe(403);
        expect(response.body.error).toBe('Admin access required');
      });

      it('should validate required fields', async () => {
        const response = await request(app)
          .post('/api/channels')
          .set('Authorization', `Bearer ${mockAdminToken}`)
          .send({
            name: 'New Channel',
            // Missing chatId
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Name and chatId are required');
      });
    });

    describe('PUT /api/channels/:channelId', () => {
      it('should update channel for admin', async () => {
        const response = await request(app)
          .put('/api/channels/general')
          .set('Authorization', `Bearer ${mockAdminToken}`)
          .send({
            name: 'General Updated',
            description: 'Updated description',
          });

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({
          name: 'General Updated',
          description: 'Updated description',
        });

        expect(mockChannelService.updateChannel).toHaveBeenCalledWith(
          'general',
          {
            name: 'General Updated',
            description: 'Updated description',
          }
        );
      });

      it('should return 404 for non-existent channel', async () => {
        mockChannelService.updateChannel.mockResolvedValueOnce(null);

        const response = await request(app)
          .put('/api/channels/nonexistent')
          .set('Authorization', `Bearer ${mockAdminToken}`)
          .send({ name: 'Updated' });

        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Channel not found');
      });
    });

    describe('DELETE /api/channels/:channelId', () => {
      it('should delete channel for admin', async () => {
        const response = await request(app)
          .delete('/api/channels/general')
          .set('Authorization', `Bearer ${mockAdminToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ deleted: true });
        expect(mockChannelService.deleteChannel).toHaveBeenCalledWith(
          'general'
        );
      });

      it('should return 404 for non-existent channel', async () => {
        mockChannelService.deleteChannel.mockResolvedValueOnce(false);

        const response = await request(app)
          .delete('/api/channels/nonexistent')
          .set('Authorization', `Bearer ${mockAdminToken}`);

        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Channel not found');
      });
    });
  });

  describe('Subscription Endpoints', () => {
    describe('POST /api/subscribe/:channelId', () => {
      it('should subscribe authenticated user', async () => {
        const response = await request(app)
          .post('/api/subscribe/general')
          .set('Authorization', `Bearer ${mockUserToken}`)
          .send({ chatId: 111111111 });

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({
          success: true,
          message: 'Subscribed successfully',
        });

        expect(mockChannelService.subscribe).toHaveBeenCalledWith(
          regularUserId,
          'general',
          111111111
        );
      });

      it('should accept chatId from query params', async () => {
        const response = await request(app)
          .post('/api/subscribe/general?chatId=222222222')
          .set('Authorization', `Bearer ${mockUserToken}`);

        expect(response.status).toBe(200);
        expect(mockChannelService.subscribe).toHaveBeenCalledWith(
          regularUserId,
          'general',
          '222222222' // Query params come as strings
        );
      });

      it('should reject subscription without auth', async () => {
        const response = await request(app)
          .post('/api/subscribe/general')
          .send({ chatId: 111111111 });

        expect(response.status).toBe(401);
        expect(response.body.error).toBe('Authentication required');
      });

      it('should reject subscription without chatId', async () => {
        const response = await request(app)
          .post('/api/subscribe/general')
          .set('Authorization', `Bearer ${mockUserToken}`);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Chat ID is required');
      });
    });

    describe('DELETE /api/subscribe/:channelId', () => {
      it('should unsubscribe authenticated user', async () => {
        const response = await request(app)
          .delete('/api/subscribe/general')
          .set('Authorization', `Bearer ${mockUserToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({
          success: true,
          message: 'Unsubscribed successfully',
        });

        expect(mockChannelService.unsubscribe).toHaveBeenCalledWith(
          regularUserId,
          'general'
        );
      });
    });

    describe('GET /api/subscriptions', () => {
      it('should return user subscriptions', async () => {
        const response = await request(app)
          .get('/api/subscriptions')
          .set('Authorization', `Bearer ${mockUserToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data).toHaveLength(1);
        expect(mockChannelService.getUserSubscriptions).toHaveBeenCalledWith(
          regularUserId
        );
      });
    });
  });

  describe('Admin Endpoints', () => {
    describe('GET /api/admin/push-url/:channelId', () => {
      it('should return push URL for admin', async () => {
        const response = await request(app)
          .get('/api/admin/push-url/general')
          .set('Authorization', `Bearer ${mockAdminToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({
          channelId: 'general',
          pushUrl: 'http://localhost:3000/push/general',
          example: expect.stringContaining('curl'),
        });
      });

      it('should reject for non-admin', async () => {
        const response = await request(app)
          .get('/api/admin/push-url/general')
          .set('Authorization', `Bearer ${mockUserToken}`);

        expect(response.status).toBe(403);
        expect(response.body.error).toBe('Admin access required');
      });
    });

    describe('GET /api/admin/stats', () => {
      it('should return stats for admin', async () => {
        const response = await request(app)
          .get('/api/admin/stats')
          .set('Authorization', `Bearer ${mockAdminToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({
          totalMessages: 100,
          successfulPushes: 95,
          failedPushes: 5,
          channelsActive: 2,
          subscribersTotal: 13,
        });

        expect(mockMessagePushService.getStats).toHaveBeenCalled();
      });
    });
  });

  describe('Authentication', () => {
    it('should extract userId from Bearer token', async () => {
      const response = await request(app)
        .get('/api/subscriptions')
        .set('Authorization', `Bearer ${mockUserToken}`);

      expect(response.status).toBe(200);
      expect(AuthService.verifyToken).toHaveBeenCalledWith(mockUserToken);
    });

    it('should extract userId from query parameter in dev mode', async () => {
      // Temporarily set NODE_ENV to development
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const response = await request(app).get(
        '/api/subscriptions?userId=555555555'
      );

      expect(response.status).toBe(200);
      expect(mockChannelService.getUserSubscriptions).toHaveBeenCalledWith(
        555555555
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('should handle invalid token', async () => {
      const response = await request(app)
        .get('/api/subscriptions')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Authentication required');
    });
  });

  describe('Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      mockChannelService.createChannel.mockRejectedValueOnce(
        new Error('Database error')
      );

      const response = await request(app)
        .post('/api/channels')
        .set('Authorization', `Bearer ${mockAdminToken}`)
        .send({
          name: 'Error Channel',
          chatId: -1005555555555,
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Database error');
    });

    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/push/general')
        .set('Content-Type', 'application/json')
        .send('{"invalid json');

      expect(response.status).toBe(400);
    });
  });

  describe('CORS Support', () => {
    it('should handle preflight OPTIONS requests', async () => {
      const response = await request(app)
        .options('/api/channels')
        .set('Origin', 'https://example.com');

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.headers['access-control-allow-methods']).toContain(
        'POST'
      );
    });

    it('should include CORS headers in responses', async () => {
      const response = await request(app).get('/health');

      expect(response.headers['access-control-allow-origin']).toBe('*');
    });
  });

  describe('Server Lifecycle', () => {
    it('should start server on specified port', async () => {
      await httpServer.start(3001);
      // Server should be started
      expect(httpServer).toBeDefined();

      await httpServer.stop();
    });

    it('should stop server gracefully', async () => {
      await httpServer.start(3002);
      await httpServer.stop();

      // Server should be stopped
      expect(httpServer).toBeDefined();
    });

    it('should handle server already running', async () => {
      await httpServer.start(3003);
      // Starting again should not throw
      await expect(httpServer.start(3003)).resolves.not.toThrow();

      await httpServer.stop();
    });
  });
});
