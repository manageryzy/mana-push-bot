import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { logger } from '@/utils/logger';
import { config } from '@/config';
import { formatUptime } from '@/utils/helpers';

export const handler = async (
  _event: APIGatewayProxyEvent,
  _context: Context
): Promise<APIGatewayProxyResult> => {
  try {
    const startTime = Date.now();

    // Basic health check information
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'mana-push-bot',
      version: '1.0.0',
      stage: config.app.stage,
      region: config.aws.region,
      uptime: formatUptime(process.uptime()),
      memory: {
        used: Math.round(process.memoryUsage().rss / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      },
      node: process.version,
      responseTime: 0, // Will be calculated below
    };

    // Check environment variables
    const envCheck = {
      telegram_bot_token: !!config.telegram.botToken,
      notification_queue_url: !!config.aws.notificationQueueUrl,
    };

    // Calculate response time
    healthStatus.responseTime = Date.now() - startTime;

    // Determine overall health status
    const isHealthy = Object.values(envCheck).every(Boolean);

    if (!isHealthy) {
      healthStatus.status = 'degraded';
    }

    logger.info('Health check performed', {
      status: healthStatus.status,
      responseTime: healthStatus.responseTime,
      envCheck,
    });

    return {
      statusCode: isHealthy ? 200 : 503,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify({
        ...healthStatus,
        checks: {
          environment: envCheck,
        },
      }),
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error('Health check error', {
      error: errorMessage,
      stack: errorStack,
    });

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check failed',
      }),
    };
  }
};
