# Lemonade Game Build Plan

This plan splits the spec into build increments that each leave the app in a working, testable state.

## Confirmed Decisions

- Product name: Lemonade Game.
- Database and admin UI are not required for the first MVP path.
- Local development and the first MVP use in-memory server state and code-based economy defaults.

## Success Criteria

- The game is playable end-to-end in singleplayer.
- The game is playable end-to-end in a two-player multiplayer room.
- Economy behavior is server-authoritative and covered by golden tests.
- Reconnect is supported only while the same backend process is running; database persistence is deferred.
- The final MVP includes chat/moderation, trivia, historical events, deployment docs, and smoke tests.

## Current Status

- BI 1 is complete: the monorepo, shared package, client shell, server shell, env validation, health check, and initial tests are in place.
- BI 2 is in progress: core economy helpers, golden unit tests, and a server-authoritative singleplayer day loop are working. A formal Playwright test file is still pending.
- BI 3 is in progress: in-memory multiplayer room creation, join-by-code, public room listing, lobby snapshots, host start controls, and the separate multiplayer page are working. Host-editable settings are still pending.
- BI 4 is in progress: the first shared multiplayer day loop is working through weather reveal, setup submission, simulation, summary, leaderboard, and next-day continue. Win conditions, timeouts, and formal smoke tests are still pending.

## BI 1: Project Foundation

Goal: Create a bootable monorepo with a working client, server, and shared package.

Scope:

- Set up npm workspaces.
- Create `apps/client`, `apps/server`, and `packages/shared`.
- Add TypeScript, lint/typecheck scripts, and test scripts.
- Add a Vite React client shell.
- Add a Fastify + Socket.IO server shell.
- Add shared Zod schemas and TypeScript types for the first room/game contracts.
- Add server environment validation for required runtime settings.
- Add `.env.example`.

Verification:

- `npm install` succeeds.
- `npm run typecheck` succeeds.
- `npm test` succeeds.
- Client dev server renders the home shell.
- Server starts and exposes a health check.

## BI 2: Core Economy and Singleplayer

Goal: Make the Lemonade Game playable for one local player through repeated days.

Scope:

- Add versioned default economy config in shared code.
- Add seeded RNG helpers.
- Add pure helpers for cup cost, poster cost, poster bonus, price validation, purchase chance, and day simulation.
- Add weather generation and special weather generation.
- Build singleplayer state flow: weather reveal, setup, summary, next day.
- Build daily setup UI with live affordability validation.
- Build summary UI with visitors, cups sold, spend, revenue, profit, and balance.
- Keep singleplayer server-authoritative through the same shared simulation helpers planned for multiplayer.

Verification:

- Golden tests cover cup scaling, poster cost cap, poster bonus cap, price boundaries, purchase chance boundaries, zero-spend days, bankruptcy prevention, and sell-out behavior.
- Playwright smoke test completes at least one singleplayer day loop.

## BI 3: Rooms and Lobby

Goal: Let players create, browse, and join multiplayer rooms before any active game starts.

Scope:

- Add in-memory room store.
- Add room creation, room listing, room join, room leave, and room snapshot events.
- Add private rooms, public rooms, and password-protected rooms.
- Add nickname validation and duplicate nickname handling.
- Add host assignment.
- Add host-editable lobby settings.
- Build home screen actions: start singleplayer, create room, join by code, browse public rooms.
- Build lobby screen with player list, host controls, settings, and start button.

Verification:

- Integration tests cover create room, join room, duplicate nickname rejection, password room join flow, public room listing, and host settings updates.
- Manual two-browser test shows both players in the same lobby with synchronized snapshots.

## BI 4: Multiplayer Game Loop

Goal: Complete a two-player multiplayer match.

Scope:

- Implement server game phases: `LOBBY`, `WEATHER_REVEAL`, `SETUP`, `SIMULATING`, `SUMMARY`, `BETWEEN_DAYS`, and `GAME_OVER`.
- Add start game validation.
- Snapshot the economy config at game start.
- Add shared and individual weather modes.
- Add setup draft, submit ready, unready, and hidden setup values until simulation.
- Add setup timeout and auto-submit behavior.
- Run aggregate day simulation for all active players.
- Add leaderboard drawer.
- Add First to X Coins mode.
- Add Most Coins After X Days mode.
- Add sudden-death tie handling.

Verification:

- Integration tests cover start game validation, setup submit, timeout auto-submit, full day simulation, both win modes, and sudden-death ties.
- Playwright smoke test creates a room in one browser context, joins from another, submits setups for both players, and reaches summary or game over.

## BI 5: Reconnect and Room Cleanup

Goal: Make in-memory multiplayer rooms stable enough for the first MVP without adding a database.

Scope:

- Add reconnect token generation, hashing, and room-scoped browser storage.
- Add reconnect event and full snapshot restore.
- Add in-memory room TTL cleanup.
- Add abandoned room cleanup.
- Keep economy config as versioned code defaults.
- Keep trivia questions in a local curated question bank.

Verification:

- Integration tests cover reconnect snapshot and restored player slot.
- Manual test reconnects a player while the same backend process is running.
- Manual test confirms active rooms are lost after server restart, as expected for the first MVP.

## BI 6: Social, Moderation, and Safety

Goal: Make multiplayer rooms safer and more manageable.

Scope:

- Add compact room chat for lobby and between-day phases.
- Add blocked-word filtering for nicknames, room names, and chat.
- Add per-socket and per-IP rate limits for room creation, joins, password attempts, chat, setup submissions, and vote-kicks.
- Add host transfer on disconnect.
- Add host kick in lobby.
- Add disconnected-player kick during active games after a grace period.
- Add vote-kick during active games.
- Add structured logs with room ID, player ID, phase, command name, and error code where relevant.

Verification:

- Integration tests cover chat filtering, chat rate limits, host transfer, host kick, vote-kick, and rate-limited commands.
- Logs do not include passwords or reconnect tokens.

## BI 7: Trivia and Historical Events

Goal: Add the optional gameplay events from the spec.

Scope:

- Add local curated trivia question bank.
- Add trivia chance rolls after daily summary.
- Add reward percentage roll and required question count mapping.
- Add timed trivia state on the server.
- Add trivia answer validation.
- Add reconnect-aware trivia timers.
- Add individual and room-wide multiplayer targeting.
- Add historical event config records.
- Add historical event rolls that share the single modifier slot with special weather.
- Add event reveal UI.
- Add trivia UI with four answers, timer, keyboard selection, and result stamp.

Verification:

- Unit tests cover trivia reward question count mapping and event modifier behavior.
- Integration tests cover trivia success, wrong answer failure, timeout failure, and reconnect while trivia is active.
- Component tests cover trivia answer controls.

## BI 8: Release Polish and Deployment

Goal: Bring the MVP to a shippable state.

Scope:

- Apply the retro arcade visual pass.
- Add responsive mobile layout QA fixes.
- Add keyboard navigation and ARIA labels.
- Add reduced motion support.
- Add SFX and mute control.
- Add Dockerfile for the backend.
- Add frontend deployment config for Vercel.
- Add backend deployment notes for Railway, Render, Fly.io, and self-hosted Node.
- Add final README instructions for local development and deployment.

Verification:

- `npm run typecheck` succeeds.
- `npm test` succeeds.
- Playwright smoke suite succeeds.
- Manual mobile viewport QA passes for home, lobby, setup, summary, trivia, and game over.

## Deferred Beyond MVP

- User accounts and OAuth.
- Global leaderboards.
- Bots or AI opponents.
- Spectator mode.
- Sabotage mechanics.
- Matchmaking queues.
- Full production analytics.
- Full admin web panel.
- Database-backed persistence.
- Database-backed economy config and seed/update CLI.
- Database-backed trivia storage.
- Heavy pixel-art asset pipeline.
