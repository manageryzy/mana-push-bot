#!/bin/bash

# Deployment script for Mana Push Bot
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
STAGE="${1:-dev}"
REGION="${2:-us-east-1}"

echo -e "${GREEN}🚀 Deploying Mana Push Bot to ${STAGE} environment${NC}"

# Check if required environment variables are set
if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
    echo -e "${RED}❌ TELEGRAM_BOT_TOKEN environment variable is required${NC}"
    exit 1
fi

# Install dependencies
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
npm ci

# Run tests
echo -e "${YELLOW}🧪 Running tests...${NC}"
npm test

# Build the project
echo -e "${YELLOW}🔨 Building project...${NC}"
npm run build

# Deploy with serverless
echo -e "${YELLOW}☁️ Deploying to AWS...${NC}"
npx serverless deploy --stage $STAGE --region $REGION

# Get the webhook URL from stack outputs
echo -e "${YELLOW}🔗 Setting up Telegram webhook...${NC}"
WEBHOOK_URL=$(npx serverless info --stage $STAGE --region $REGION | grep "WebhookUrl" | cut -d' ' -f2)

if [ ! -z "$WEBHOOK_URL" ]; then
    # Set webhook URL
    curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
        -H "Content-Type: application/json" \
        -d "{\"url\":\"$WEBHOOK_URL\"}" > /dev/null
    
    echo -e "${GREEN}✅ Webhook set to: $WEBHOOK_URL${NC}"
else
    echo -e "${RED}❌ Could not retrieve webhook URL${NC}"
fi

# Test health endpoint
if [ ! -z "$WEBHOOK_URL" ]; then
    HEALTH_URL="${WEBHOOK_URL/webhook/health}"
    echo -e "${YELLOW}🏥 Testing health endpoint...${NC}"
    
    if curl -s -f "$HEALTH_URL" > /dev/null; then
        echo -e "${GREEN}✅ Health check passed${NC}"
    else
        echo -e "${RED}❌ Health check failed${NC}"
    fi
fi

echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
echo -e "Stage: ${STAGE}"
echo -e "Region: ${REGION}"
echo -e "Webhook URL: ${WEBHOOK_URL}"
