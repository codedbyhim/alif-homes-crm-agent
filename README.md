# Alif Homes CRM Agent

An intelligent AI-powered Telegram bot that integrates with Zoho CRM for property management at SkyWay Building, Kenya.

## Features

- **Natural Language Queries**: Ask questions about bookings, tenants, owners, rent payments in plain English
- **Smart Module Detection**: AI automatically detects which Zoho module to query
- **Photo Upload**: Take a photo of paper forms and the agent creates records automatically
- **Record Creation**: Create new bookings, guests, tenants, and more via chat
- **Multi-Module Support**: Works with 13 custom Zoho CRM modules

## Supported Modules

| Category | Modules |
|----------|---------|
| **Airbnb/Short-term** | Bookings, Guests Database, Property Units, Airbnb Services, Airbnb Water Bills |
| **Long-term Rentals** | Tenants, Monthly Rent, Rental Properties, Lease Management, Rental Services, Rental Water Bills, Rental Payments |
| **Owners** | Unit Owner Database |

## Technology Stack

- **n8n** - Workflow automation platform
- **Zoho CRM** - Customer relationship management (EU region)
- **OpenAI GPT-4o** - AI for natural language understanding
- **OpenAI GPT-4o Vision** - AI for reading paper forms
- **Telegram Bot API** - Chat interface

## Architecture

```
Telegram User
      │
      ▼
┌─────────────────┐
│ Telegram Trigger │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│  Check Photo?   │────▶│ Photo Processing │
└────────┬────────┘     │ (GPT-4o Vision)  │
         │ No           └────────┬─────────┘
         ▼                       │
┌─────────────────┐              │
│ Module Detection│              │
│   (GPT-4o-mini) │              │
└────────┬────────┘              │
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌──────────────────┐
│  Zoho CRM API   │     │  Create Record   │
└────────┬────────┘     └────────┬─────────┘
         │                       │
         ▼                       │
┌─────────────────┐              │
│ AI Response     │              │
│ (GPT-4o-mini)   │              │
└────────┬────────┘              │
         │                       │
         ▼                       ▼
┌─────────────────────────────────┐
│      Send Telegram Response     │
└─────────────────────────────────┘
```

## Setup

### Prerequisites

1. n8n instance (self-hosted or cloud)
2. Zoho CRM account with API access
3. OpenAI API key
4. Telegram Bot (create via @BotFather)

### Configuration

1. **Zoho OAuth2 Credentials**
   - Create app at https://api-console.zoho.eu/
   - Scopes: `ZohoCRM.modules.ALL`, `ZohoCRM.settings.ALL`

2. **OpenAI API Key**
   - Get from https://platform.openai.com/api-keys
   - Configure as HTTP Header Auth in n8n

3. **Telegram Bot**
   - Create bot via @BotFather
   - Add bot token to n8n credentials

### Workflow Import

Import the workflow JSON file into your n8n instance and configure the credentials.

## Usage Examples

### Text Queries
- "Show all bookings"
- "How many units does Mr. Daniel Chege own?"
- "List all tenants"
- "What is the total commission this month?"

### Create Records
- "Create booking for Ahmed in unit 701 for KES 50000"
- "Add new tenant John Smith"

### Photo Upload
Send a photo of any paper form (booking form, guest registration, etc.) and the agent will automatically extract the data and create a record.

## File Structure

```
├── README.md                    # This file
├── CLAUDE.md                    # AI assistant instructions
├── .gitignore                   # Git ignore rules
├── fix_greetings.js             # Greeting handling fix
├── fix_telegram_escaping.js     # Telegram formatting fix
├── fix_routing.js               # Route module fix
├── fix_units_interpretation.js  # Units counting fix
├── improve_ai_responses.js      # AI response improvements
├── fix_greeting_bypass.js       # Greeting bypass fix
├── add_photo_upload.js          # Photo upload feature
└── .mcp.json                    # n8n MCP config (not in repo)
```

## Currency

All monetary values are displayed in **Kenyan Shillings (KES)**.

## Author

**Alif Homes** - Property Management Company, Kenya

## License

Private - All rights reserved
