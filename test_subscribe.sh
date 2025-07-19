#!/bin/bash

echo "Testing subscribe command functionality..."

# Test the channel listing first to make sure it's available
echo "1. Testing channel listing (admin command):"
curl -s "http://localhost:3000/test/channels" | jq . || echo "No JSON response"

echo -e "\n2. Testing if alerts channel exists in config:"
curl -s "http://localhost:3000/push/alerts" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Test message for channel verification",
    "priority": "normal"
  }' | jq . || echo "No JSON response"

echo -e "\n3. The subscribe command can now be tested in Telegram:"
echo "   /subscribe alerts"
echo "   (This command should work for non-admin users)"

echo -e "\n4. Available commands in Telegram:"
echo "   /help - See all commands including /subscribe"
echo "   /channels - List channels (admin only)"
echo "   /subscribe <channelId> - Subscribe to a channel (all users)"
