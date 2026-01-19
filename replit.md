# WhatsApp Bot

## Overview
A WhatsApp bot built with the Baileys library that responds to commands in group chats. The bot includes features like group mentions and command menus.

## Project Structure
- `index.js` - Main bot application with Express server for health checks
- `auth_info/` - Session authentication data (auto-generated)
- `package.json` - Node.js dependencies

## Technology Stack
- Node.js 20
- Express.js for health check server
- @whiskeysockets/baileys for WhatsApp Web API
- Pino for logging

## Running the Bot
The bot runs on port 5000 and displays a health check page. On first run, it will display a pairing code in the console that needs to be entered in WhatsApp to link the bot.

## Bot Commands
- `.اوامر` / `.menu` - Show command list
- `.بنج` - Ping test
- `.منشن` / `.الكل` - Mention all group members (groups only)

## Configuration
Edit the settings object in `index.js` to customize:
- `phoneNumber` - Your WhatsApp number
- `ownerName` - Bot owner name
- `botName` - Bot display name

## Deployment
The Express server binds to 0.0.0.0:5000 for Replit compatibility.
