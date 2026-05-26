# Lemonade Stand

A retro browser lemonade-stand game with single-player progression, local encrypted saves, trivia events, and real-time multiplayer rooms.

## Features

- Single-player day loop with weather, setup, daily summary, rare trivia rewards, and local save/resume.
- Multiplayer rooms with host/join flow, public/private rooms, and live Socket.IO updates.
- Lemonade economy with scaling cup costs, poster pricing tiers, visitor simulation, and price tolerance.
- Retro console-style UI tuned for desktop and mobile screens.
- No database required right now; saves are stored in the browser and signed/encrypted by the server.

## Requirements

- Node.js 20.16.0 or newer
- npm 10 or newer

## Quick Setup

After cloning the repo, run:

```bash
./setup.sh
```

The setup script checks your Node/npm versions, creates `.env` from `.env.example` if needed, installs dependencies, and prints the run commands.

## Manual Install

```bash
npm install
```

## Environment

Create a `.env` file in the project root. These are the current development values from `.env.example`:

```env
NODE_ENV=development
HOST=127.0.0.1
PORT=3001
CLIENT_ORIGIN=http://127.0.0.1:5173
SERVER_PUBLIC_URL=http://127.0.0.1:3001
SOCKET_CORS_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
ROOM_TTL_MINUTES=120
SAVE_ENCRYPTION_SECRET=replace-this-with-at-least-32-random-characters
```

For local development, the placeholder save secret is fine. For any shared or public deployment, use a real random value with at least 32 characters.

The setup script creates this file automatically when `.env` does not already exist.

## Run Locally

Start the server:

```bash
npm run dev:server
```

Start the client in another terminal:

```bash
sudo npm run dev:client
```

The client is currently configured to use port `80`, so macOS may require elevated permissions. Open:

```text
http://127.0.0.1/
```

## Mobile Testing On Your Network

Use your computer's LAN IP address, then start the server with matching CORS values. Example:

```bash
HOST=0.0.0.0 \
CLIENT_ORIGIN=http://YOUR_LAN_IP \
SOCKET_CORS_ORIGINS=http://YOUR_LAN_IP,http://127.0.0.1,http://localhost \
npm run dev:server
```

Then run the client:

```bash
sudo npm run dev:client
```

On your phone, open:

```text
http://YOUR_LAN_IP/
```

Your phone and computer must be on the same Wi-Fi network.

## Scripts

```bash
npm run dev:server   # Start the Fastify + Socket.IO server
npm run dev:client   # Start the Vite client
npm run typecheck    # Type-check all workspaces
npm test             # Run tests
npm run build        # Build/type-check all workspaces
```

## Project Structure

```text
apps/client/       React + Vite browser app
apps/server/       Fastify + Socket.IO backend
packages/shared/   Shared economy logic, schemas, and types
SPEC.md            Game spec and planned features
PLAN.md            Build plan / BI breakdown
```
