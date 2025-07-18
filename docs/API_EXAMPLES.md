# API Examples

## Sending Notifications

### Simple Text Message

```bash
curl -X POST https://your-api-gateway-url.com/notification \
  -H "Content-Type: application/json" \
  -d '{
    "id": "msg-001",
    "type": "message",
    "target": {
      "chatId": 123456789
    },
    "content": {
      "text": "Hello from the bot! 👋"
    },
    "created_at": "2025-07-19T10:00:00.000Z"
  }'
```

### Message with HTML Formatting

```bash
curl -X POST https://your-api-gateway-url.com/notification \
  -H "Content-Type: application/json" \
  -d '{
    "id": "msg-002",
    "type": "message",
    "target": {
      "chatId": 123456789
    },
    "content": {
      "html": "<b>Important Update</b>\n\nThe system has been <i>successfully</i> updated!"
    },
    "created_at": "2025-07-19T10:00:00.000Z"
  }'
```

### High Priority Alert

```bash
curl -X POST https://your-api-gateway-url.com/notification \
  -H "Content-Type: application/json" \
  -d '{
    "id": "alert-001",
    "type": "alert",
    "target": {
      "chatId": 123456789
    },
    "content": {
      "text": "System CPU usage is above 90%!"
    },
    "metadata": {
      "priority": "high",
      "source": "monitoring-system"
    },
    "created_at": "2025-07-19T10:00:00.000Z"
  }'
```

### Photo with Caption

```bash
curl -X POST https://your-api-gateway-url.com/notification \
  -H "Content-Type: application/json" \
  -d '{
    "id": "photo-001",
    "type": "message",
    "target": {
      "chatId": 123456789
    },
    "content": {
      "media": {
        "type": "photo",
        "url": "https://example.com/chart.png",
        "caption": "📊 Weekly performance report"
      }
    },
    "created_at": "2025-07-19T10:00:00.000Z"
  }'
```

### Scheduled Notification (Queue)

```bash
curl -X POST "https://your-api-gateway-url.com/notification?queue=true" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "scheduled-001",
    "type": "message",
    "target": {
      "chatId": 123456789
    },
    "content": {
      "text": "⏰ Scheduled reminder: Team meeting in 15 minutes"
    },
    "metadata": {
      "scheduled": "2025-07-19T14:45:00.000Z"
    },
    "created_at": "2025-07-19T10:00:00.000Z"
  }'
```

### Channel Notification

```bash
curl -X POST https://your-api-gateway-url.com/notification \
  -H "Content-Type: application/json" \
  -d '{
    "id": "channel-001",
    "type": "message",
    "target": {
      "channelId": "@your_channel"
    },
    "content": {
      "markdown": "*Breaking News*\n\nNew feature released! Check it out."
    },
    "created_at": "2025-07-19T10:00:00.000Z"
  }'
```

## Health Check

```bash
curl https://your-api-gateway-url.com/health
```

Response:

```json
{
  "status": "healthy",
  "timestamp": "2025-07-19T10:00:00.000Z",
  "service": "mana-push-bot",
  "version": "1.0.0",
  "stage": "prod",
  "region": "us-east-1",
  "uptime": "2h 30m 15s",
  "memory": {
    "used": 45,
    "total": 128
  },
  "node": "v18.17.0",
  "responseTime": 12,
  "checks": {
    "environment": {
      "telegram_bot_token": true,
      "notification_queue_url": true
    }
  }
}
```

## Response Examples

### Success Response

```json
{
  "ok": true,
  "notificationId": "msg-001",
  "queued": false
}
```

### Error Response

```json
{
  "ok": false,
  "error": "Invalid notification payload"
}
```

## Python Example

```python
import requests
import json
from datetime import datetime

def send_notification(chat_id, message, notification_type="message"):
    url = "https://your-api-gateway-url.com/notification"

    payload = {
        "id": f"py-{datetime.now().timestamp()}",
        "type": notification_type,
        "target": {
            "chatId": chat_id
        },
        "content": {
            "text": message
        },
        "created_at": datetime.now().isoformat() + "Z"
    }

    response = requests.post(url, json=payload)
    return response.json()

# Usage
result = send_notification(123456789, "Hello from Python! 🐍")
print(result)
```

## Node.js Example

```javascript
const axios = require('axios');

async function sendNotification(chatId, message, type = 'message') {
  const url = 'https://your-api-gateway-url.com/notification';

  const payload = {
    id: `js-${Date.now()}`,
    type,
    target: {
      chatId,
    },
    content: {
      text: message,
    },
    created_at: new Date().toISOString(),
  };

  try {
    const response = await axios.post(url, payload);
    return response.data;
  } catch (error) {
    console.error(
      'Error sending notification:',
      error.response?.data || error.message
    );
    throw error;
  }
}

// Usage
sendNotification(123456789, 'Hello from Node.js! 🚀')
  .then(result => console.log('Success:', result))
  .catch(error => console.error('Error:', error));
```
