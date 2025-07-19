# Mana Push Bot

A modern TypeScript Telegram bot running on AWS Lambda with comprehensive notification and messaging capabilities.

## Features

- 📨 **Message Logging**: Receive and log all incoming messages with metadata
- 🔧 **Developer Tools**: Built-in developer commands and bot information utilities
- 📢 **Channel Management**: Create and manage message channels with subscription system
- 🌐 **HTTP Push API**: REST API endpoint for sending messages to channels
- 🔗 **Webhook Support**: Direct webhook URLs for each channel
- 👥 **Subscription System**: Users can subscribe/unsubscribe to channels
- 💾 **Persistent Configuration**: All settings and channels saved to local storage
- 🚀 **Multiple Triggers**: Support for both HTTP webhook and SQS message queue
- ☁️ **Serverless**: Runs on AWS Lambda with auto-scaling
- 📊 **Monitoring**: Health checks, logging, and statistics
- 🔒 **Admin Controls**: Protected developer commands for authorized users

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Telegram      │    │   API Gateway   │    │   Lambda        │
│   Webhook       │────┤   /webhook      │────┤   webhook.ts    │
└─────────────────┘    └─────────────────┘    └─────────────────┘

┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   HTTP POST     │    │   API Gateway   │    │   Lambda        │
│   /notification │────┤   /notification │────┤   notification. │
└─────────────────┘    └─────────────────┘    └─────────────────┘

┌─────────────────┐    ┌─────────────────┐
│   SQS Queue     │    │   Lambda        │
│   Notifications │────┤   notification. │
└─────────────────┘    └─────────────────┘
```

## Setup

### Prerequisites

- Node.js 18.x or higher
- AWS CLI configured with appropriate permissions
- Telegram Bot Token (from @BotFather)

### Installation

1. **Clone and install dependencies:**

   ```bash
   npm install
   ```

2. **Configure environment variables:**

   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Build the project:**
   ```bash
   npm run build
   ```

### Configuration

Create a `.env` file with the following variables:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
WEBHOOK_URL=https://your-api-gateway-url.com/webhook
LOG_LEVEL=info
AWS_REGION=us-east-1

# Optional: Admin user IDs (comma-separated)
ADMIN_USER_IDS=123456789,987654321

# Optional: Developer chat ID for notifications
DEV_CHAT_ID=123456789
```

## Development

### Local Development

```bash
# Start in development mode with hot reload
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm test:watch

# Lint code
npm run lint

# Format code
npm run format
```

### Deployment

```bash
# Deploy to development
npm run deploy:dev

# Deploy to production
npm run deploy:prod

# View logs
npm run logs
```

## Usage

### Bot Commands

#### General Commands

- `/start` - Start the bot
- `/help` - Show help message
- `/status` - Show bot status

#### Developer Commands (Admin Only)

- `/dev` - Show developer menu
- `/stats` - Show bot statistics
- `/logs [level] [count]` - Show recent logs
- `/broadcast <message>` - Broadcast message to all users
- `/reload` - Reload bot configuration

#### Channel Management (Admin Only)

- `/channels` - List all message channels
- `/channel_create <name> <chatId> [description]` - Create a new channel
- `/channel_delete <channelId>` - Delete a channel
- `/push_url <channelId>` - Get push URL for a channel
- `/server_start [port]` - Start HTTP server
- `/server_stop` - Stop HTTP server

#### Subscription Commands

- `/subscribe <channelId>` - Subscribe to a channel
- `/unsubscribe <channelId>` - Unsubscribe from a channel
- `/my_channels` - List your subscribed channels

### Channel Message Pushing

#### Via HTTP API (New Feature!)

```bash
# Send a message to a specific channel
curl -X POST http://localhost:3000/push/my-channel \\
  -H "Content-Type: application/json" \\
  -d '{
    "message": "Hello from the push API!",
    "format": "markdown",
    "priority": "normal",
    "metadata": {
      "source": "monitoring-system",
      "alert_level": "info"
    }
  }'

# Alternative URL format
curl -X POST http://localhost:3000/push \\
  -H "Content-Type: application/json" \\
  -d '{
    "channel": "my-channel",
    "message": "**Important Update**: System maintenance completed successfully.",
    "format": "markdown",
    "priority": "high"
  }'
```

#### Message Formats

- **text** - Plain text message
- **markdown** - MarkdownV2 formatted message (default)
- **html** - HTML formatted message

#### Priority Levels

- **low** - 📋 Info messages with subtle formatting
- **normal** - Standard messages (default)
- **high** - 🚨 High priority messages with alert formatting

### Managing Channels

#### Creating Channels (Admin)

```bash
# Get push URL for a channel
curl "http://localhost:3000/api/admin/push-url/my-channel?userId=123456789"

# Create a new channel
curl -X POST http://localhost:3000/api/channels \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "alerts",
    "description": "System alerts and notifications",
    "chatId": -1001234567890,
    "isPublic": true,
    "userId": 123456789
  }'

# List all channels
curl "http://localhost:3000/api/channels?userId=123456789"
```

#### Subscription Management

```bash
# Subscribe to a channel
curl -X POST "http://localhost:3000/api/subscribe/alerts?userId=123456789"

# Unsubscribe from a channel
curl -X DELETE "http://localhost:3000/api/subscribe/alerts?userId=123456789"

# Get user's subscriptions
curl "http://localhost:3000/api/subscriptions?userId=123456789"
```

### Sending Notifications

#### Via HTTP API

```bash
# Send a simple text notification
curl -X POST https://your-api-gateway-url.com/notification \\
  -H "Content-Type: application/json" \\
  -d '{
    "id": "unique-notification-id",
    "type": "message",
    "target": {
      "chatId": 123456789
    },
    "content": {
      "text": "Hello from the bot!"
    },
    "created_at": "2025-07-19T10:00:00.000Z"
  }'

# Send with media
curl -X POST https://your-api-gateway-url.com/notification \\
  -H "Content-Type: application/json" \\
  -d '{
    "id": "notification-with-media",
    "type": "message",
    "target": {
      "chatId": 123456789
    },
    "content": {
      "media": {
        "type": "photo",
        "url": "https://example.com/image.jpg",
        "caption": "Check out this image!"
      }
    },
    "created_at": "2025-07-19T10:00:00.000Z"
  }'

# Queue notification for later processing
curl -X POST "https://your-api-gateway-url.com/notification?queue=true" \\
  -H "Content-Type: application/json" \\
  -d '{...}'
```

#### Via SQS

Send a JSON message to the SQS queue:

```json
{
  "id": "unique-notification-id",
  "type": "alert",
  "target": {
    "chatId": 123456789
  },
  "content": {
    "text": "🚨 System alert: High CPU usage detected!"
  },
  "metadata": {
    "priority": "high",
    "source": "monitoring-system"
  },
  "created_at": "2025-07-19T10:00:00.000Z"
}
```

### Notification Types

1. **message** - Regular message to specific target
2. **broadcast** - Message to multiple targets (TODO)
3. **alert** - High-priority alert with special formatting

### Content Types

- **text** - Plain text message
- **html** - HTML formatted message
- **markdown** - Markdown formatted message
- **media** - Photo, video, document, or audio

## API Reference

### Webhook Endpoint

**POST** `/webhook`

Receives Telegram updates and processes them.

### Notification Endpoint

**POST** `/notification`

Send notifications directly or queue them for processing.

**Query Parameters:**

- `queue=true` - Queue the notification instead of sending immediately

### Health Check

**GET** `/health`

Returns bot health status and system information.

## Monitoring

### Logs

The bot uses structured logging with Winston. Logs include:

- Message reception and processing
- Notification sending attempts
- Developer command usage
- Error tracking
- Performance metrics

### Health Checks

The `/health` endpoint provides:

- Service status
- Uptime information
- Memory usage
- Environment validation
- Response time metrics

### Statistics

Admin users can view bot statistics including:

- Total messages processed
- Active user count
- Error rates
- Message type distribution
- Top active users

## Security

- Admin commands are restricted to configured user IDs
- Input validation on all endpoints
- Error handling prevents information leakage
- Structured logging for audit trails

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Run linting and tests
6. Submit a pull request

## License

MIT License - see LICENSE file for details.
