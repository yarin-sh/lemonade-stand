# Lemonade Game Technical Specification

## 1. Purpose

Build a browser-based multiplayer Lemonade Game based on the supplied game design document. The game is a retro arcade economic strategy game where each in-game day is one turn. Players react to weather, produce lemonade, buy posters, set prices, and compete through economic decisions.

This spec is the implementation contract for an MVP that is playable end-to-end with light polish: lobby, singleplayer sandbox, multiplayer rooms, realtime turn flow, chat, code-configured economy defaults, trivia, historical events, and focused automated tests.

## 2. Product Goals

- Make the game easy to understand for casual players.
- Keep multiplayer fair through server-authoritative state, validation, and RNG.
- Preserve arcade simplicity while allowing strategic risk/reward.
- Support fast private games and browseable public rooms.
- Keep the economy centralized in code defaults for the first MVP, with database-backed tuning deferred to a later update.
- Keep the MVP shippable without auth or complex account systems.

## 3. Non-Goals for MVP

- User accounts, passwords, OAuth, or persistent player identity.
- Global leaderboards.
- Bots or AI opponents.
- Spectator mode.
- Sabotage mechanics.
- Matchmaking queues.
- Full production analytics.
- Heavy asset pipeline or hand-authored pixel art.

## 4. Chosen Stack

### Frontend

- React
- TypeScript
- Vite
- Socket.IO client
- CSS modules or vanilla CSS with a small design token layer
- Optional component test tooling through Vitest and React Testing Library

### Backend

- Node.js
- TypeScript
- Fastify
- Socket.IO
- Zod for shared validation schemas

### Persistence

- MVP uses in-memory server state only.
- Economy config uses versioned code defaults.
- Trivia questions use a local curated question bank in the repo.
- Database persistence is deferred to a future update.

### Repository Structure

Use a monorepo:

```text
apps/
  client/
  server/
packages/
  shared/
```

Default package manager: npm workspaces.

The repo should remain pnpm-compatible by avoiding npm-specific package assumptions where practical.

## 5. Deployment Model

The deployment must support both managed backend hosting and self-hosting.

### Recommended Production Setup

- Frontend: Vercel
- Backend: Railway, Render, Fly.io, or self-hosted Node service
- Database: none required for the first MVP.

### Self-Hosted Backend Support

The backend must be portable:

- Runs as a normal Node process.
- Has an optional Dockerfile.
- Uses environment variables for all runtime settings.
- Does not depend on platform-specific serverless APIs.

### Required Environment Variables

```text
NODE_ENV
HOST
PORT
CLIENT_ORIGIN
SERVER_PUBLIC_URL
SOCKET_CORS_ORIGINS
ROOM_TTL_MINUTES
```

The server must validate environment variables at startup and fail fast with clear messages.

## 6. High-Level Architecture

The backend is authoritative for:

- Room creation and membership
- Player identity within a room
- Host assignment
- Room settings
- RNG seeds and rolls
- Economy config snapshots
- Setup validation
- Daily simulation
- Trivia state and timing
- Chat filtering and rate limits
- Kicks and vote-kicks
- Game completion

The client is responsible for:

- Rendering the game UI
- Collecting user input
- Showing local setup totals before submission
- Playing SFX
- Rendering weather effects and arcade UI
- Reconnecting with a browser-stored room token

The shared package contains:

- TypeScript types
- Zod schemas
- Pure economy formula helpers
- Socket event contracts
- Error codes
- Config types

## 7. Identity Model

No auth is required for players.

Each player joins with:

- Nickname
- Browser-generated reconnect token
- Socket connection ID
- Server-generated player ID

Nickname rules:

- Nicknames must be unique within a room.
- Nicknames are filtered by the server-side safety filter.
- Nicknames have min/max length constraints.
- Duplicate nickname attempts receive a user-safe error code.

Reconnect rules:

- The browser stores a reconnect token per room.
- Reconnect with matching room ID, player ID, and token restores the player slot.
- Reconnect is allowed during lobby, setup, summary, trivia, and between-day phases.
- Reconnected clients receive a full room snapshot.

## 8. Room Model

Maximum players: 5.

Minimum multiplayer players: 2.

Room types:

- Private invite-code room
- Private password room
- Public listed room

Private password rooms can be joined without a link if the player knows the room name/code and password.

Public room browser shows:

- Room name
- Host nickname
- Player count
- Game mode
- Timeout setting
- Started/not started status

Late joins:

- Allowed only before Day 1 starts.
- No spectators in MVP.

Abandoned room cleanup:

- Empty active rooms are deleted immediately.
- Inactive rooms expire after a TTL.
- Completed game summaries and logs are retained for 30 days by default.

## 9. Host and Moderation

The first player in a room is host.

Host can:

- Change lobby settings before the game starts.
- Start the game.
- Kick players from the lobby.
- Kick disconnected players during a game after a grace period.

Host disconnect before game start:

- Host transfers to the earliest joined connected player.

Host disconnect during game:

- Game continues.
- Host role is only needed for lobby-level controls.
- If needed for moderation, host transfers to the earliest joined connected player.

Vote-kick:

- Available during active games.
- Cannot target self.
- Requires majority of currently connected non-target players.
- Has cooldowns to prevent spam.
- Successful vote removes the target player from the room.
- Removed players cannot rejoin the same room with the same reconnect token.

Chat:

- Compact room chat is available in lobby and between gameplay phases.
- Chat uses server-side blocked-word filtering.
- Chat messages are rate-limited per socket and per IP.
- Chat is included in snapshots only as a limited recent-message buffer.

## 10. Game Modes

### Singleplayer Sandbox

- Starting coins: 100.
- Endless day loop.
- Browser local storage keeps the latest singleplayer save so the player can close the browser and continue later on the same device/browser.
- Singleplayer local saves are stored as a server-encrypted token plus a display-only day/coins preview. Edited save data is rejected by the server.
- Valid encrypted saves from older economy versions remain loadable and are migrated after loading.
- If local save data exists, pressing Start Singleplayer shows a resume prompt with the saved day and coins plus Load and Start New choices.
- If no local save data exists, Start Singleplayer begins a new game immediately.
- Player can retire/save score.
- Trivia is enabled by default according to the normal 5% chance.
- No AI opponents in MVP.

### Multiplayer: First to X Coins

- Host chooses target coin amount.
- The first player to reach or exceed the target after a day summary wins.
- If multiple players reach the target tied for highest balance, sudden-death days continue among all remaining players until the tie breaks.

### Multiplayer: Most Coins After X Days

- Host chooses number of days.
- Highest balance after final day wins.
- If tied, sudden-death days continue until the tie breaks.

## 11. Lobby Settings

Host-configurable before game start:

- Room name
- Public/private
- Optional room password
- Game mode
- Target coins for First to X Coins
- Day count for Most Coins After X Days
- Starting coins
- Setup timeout
- Timeout duration
- Shared weather versus individual weather
- Trivia enabled
- Trivia targeting mode
- Historical events enabled

Defaults:

- Private room
- No room password unless set
- Setup timeout off for private rooms
- Setup timeout off for public rooms by default; the lobby may recommend enabling it for public games
- Shared weather on
- Trivia off in multiplayer
- Historical events on if the starter library is configured

## 12. Weather Fairness

Weather mode is owner-selected:

- Shared weather: all players experience the same weather and event modifiers.
- Individual weather: each player receives independently generated weather from the same room seed.

Default: shared weather.

The UI must label individual weather as a more chaotic, less competitive mode.

## 13. Core Turn Flow

Each day follows this sequence:

1. Weather generation
2. Weather reveal page
3. Optional special weather or historical event reveal page
4. Player setup
5. Setup confirmation
6. Server validation and ready lock
7. Day simulation
8. Daily summary page
9. Optional trivia page
10. Leaderboard update
11. Next day or game over

### Console Page Flow

The primary gameplay experience should feel like moving through screens on a retro console. Each phase is presented as its own full-screen page or panel, with large dialog text and explicit continue prompts.

#### Page 1: Weather Reveal

At the start of each day, the server generates the day's weather.

Every active game page includes a Back button. In singleplayer it returns to the main menu while keeping the local save. In multiplayer it leaves the room and returns to the main menu.

The page contains:

- Current day number.
- The generated base weather.
- A simple weather scene or console-style weather card.
- A prompt: "Press any key or tap anywhere to continue."

If no special weather or historical event exists, continuing moves directly to the setup page.
If the player cannot afford at least one lemonade cup, continuing moves to game over instead of setup.

#### Page 1B: Special Reveal

This page appears only when special weather or a historical event is generated.

The page contains:

- Dramatic reveal copy.
- The special weather or historical event name.
- A short description of what changed for the day.
- A prompt: "Press any key or tap anywhere to continue."

MVP note: special weather uses the modifiers defined in the weather model. Cup cost remains governed by the normal cup-cost formula unless a later spec explicitly adds cost-changing events.

#### Page 2: Daily Setup Dialog

The setup page is one dialog-style page with all three decisions visible at once.

The dialog copy should follow this structure:

```text
Hello! You have X coins.

Each lemonade cup costs X coins today. How many would you like to make?

How many posters would you like to make today?

What should the price of each lemonade cup be?
```

The page contains:

- Current coin balance.
- Current cup cost.
- Current poster cost.
- Input for cups to make.
- Input for posters to make.
- Input for lemonade price.
- Live total spend and affordability validation.
- A clear submit/confirm action.

Use "make posters" in player-facing copy.

If the player has fewer coins than the current cup cost, the setup page is skipped and the game shows a stand-closed/game-over page.

#### Page 3: Daily Summary

The summary page should be short and readable. It should avoid debug-style details and only show the stats a casual player needs.

The page contains:

- Visitors, buyers, and estimated buy chance, e.g. "You had 5 visitors. 2 bought, with about 30% buy chance."
- Cups sold and price per cup.
- Posters made and poster cost.
- Total profit for the day.
- Total coins after the day.
- A prompt or button to continue.

Do not surface potential visitors, potential buyers, missed-sales stats, or detailed internal calculation fields in MVP.

#### Page 4: Rare Trivia

After the daily summary, there is a 5% chance that a trivia page appears before the next day starts.

The page contains:

- A rare-event intro, e.g. "WOW! A rare occasion has occurred and the lemonade gods chose you!"
- Reward amount in coins.
- Number of questions required.
- One trivia question at a time.
- Four answer choices.
- Timer and pass/fail result.

A wrong answer loses the full trivia reward. If the player completes all required questions correctly, the reward is added to their balance.

## 14. Server Game State Machine

```text
LOBBY
  -> WEATHER_REVEAL
  -> SETUP
  -> SIMULATING
  -> SUMMARY
  -> TRIVIA
  -> BETWEEN_DAYS
  -> GAME_OVER
```

Notes:

- The explicit setup confirmation is client-visible, but the server only treats the setup as final once the player submits ready.
- Players may edit setup until they mark ready.
- No optimistic economy mutations are accepted client-side; the client waits for server acknowledgement.
- The server sends a full room snapshot after every meaningful transition.

## 15. Multiplayer Readiness

During setup:

- Players can edit cups, posters, and price.
- The client shows live affordability validation.
- Actual readiness is hidden only as "ready/not ready"; submitted values are hidden until simulation.
- The server starts simulation when all active players are ready.

Timeouts:

- Host decides whether a timeout is enabled.
- Timeout defaults to off.
- On timeout, unready players get an auto-submit setup of:
  - 0 cups
  - 0 posters
  - price 0
- Auto-submitted players remain in the game.

## 16. Economy Config

Economy config is stored as versioned code defaults for the first MVP.

Behavior:

- A room snapshots the active config when the game starts.
- Active games never change behavior due to later code/config edits.
- Economy values should remain centralized and validated by shared Zod schemas so database-backed tuning can be added later without rewriting the formulas.

Deferred admin/config tooling:

- CLI script to seed/update database-backed economy config.
- Web admin panel for viewing and editing config.
- Admin panel protected by `ADMIN_TOKEN`.
- Admin edits validated against Zod schemas before saving.

## 17. Default Economy Config

These defaults are the MVP source of truth. Database-backed tuning is a future update.

```ts
type EconomyConfig = {
  version: string;
  startingCoins: {
    singleplayer: 100;
    multiplayerDefault: number;
  };
  visitors: {
    base: number;
    perDayGrowth: number;
    randomVariationPct: number;
  };
  cups: {
    baseCost: number;
    dayScaleEveryNDays: number;
    dayScaleAmount: number;
  };
  posters: {
    costTiers: Array<{
      upToCount: number;
      cost: number;
    }>;
    maxCount: number;
    firstTierCount: number;
    visitorFirstTierBonusPct: number;
    visitorLaterTierBonusPct: number;
    maxVisitorBonusPct: number;
    purchaseFirstTierBonusPct: number;
    purchaseLaterTierBonusPct: number;
    maxPurchaseBonusPct: number;
  };
  pricing: {
    minPrice: number;
    maxPrice: number;
    comfortablePriceCostMultiplier: number;
    overpricedPenaltyExponent: number;
    maxPurchaseChance: number;
    minPurchaseChance: number;
  };
  trivia: {
    chancePct: number;
    secondsPerQuestion: number;
  };
};
```

Recommended initial values:

```text
visitors.base = 36
visitors.perDayGrowth = 2
visitors.randomVariationPct = 15
cups.baseCost = 5
cups.dayScaleEveryNDays = 10
cups.dayScaleAmount = 1
posters.costTiers = [{ upToCount: 3, cost: 10 }, { upToCount: 6, cost: 15 }, { upToCount: 10, cost: 25 }, { upToCount: 20, cost: 40 }]
posters.maxCount = 20
posters.firstTierCount = 6
posters.visitorFirstTierBonusPct = 7
posters.visitorLaterTierBonusPct = 1
posters.maxVisitorBonusPct = 56
posters.purchaseFirstTierBonusPct = 2.4
posters.purchaseLaterTierBonusPct = 0.7
posters.maxPurchaseBonusPct = 24
pricing.minPrice = 0
pricing.maxPrice = 1000
pricing.comfortablePriceCostMultiplier = 2
pricing.overpricedPenaltyExponent = 1.4
pricing.maxPurchaseChance = 0.98
pricing.minPurchaseChance = 0.005
trivia.chancePct = 5
trivia.secondsPerQuestion = 20
```

## 18. Weather Model

Base weather chances:

| Weather | Chance |
| --- | ---: |
| Cold | 25% |
| Warm | 25% |
| Bright | 25% |
| Hot | 25% |

Special weather:

| Base Weather | Special Variant | Chance |
| --- | --- | ---: |
| Cold | Thunder Storm | 10% |
| Hot | Extremely Hot & Dry | 10% |

Default modifiers:

| Weather | Visitor Modifier | Purchase Modifier | Price Tolerance Modifier |
| --- | ---: | ---: | ---: |
| Cold | 0.70 | 0.75 | 0.80 |
| Warm | 1.00 | 1.00 | 1.00 |
| Bright | 1.15 | 1.10 | 1.05 |
| Hot | 1.30 | 1.20 | 1.10 |
| Thunder Storm | 0.25 | 0.40 | 0.65 |
| Extremely Hot & Dry | 1.75 | 1.45 | 1.40 |

MVP rule:

- Cup cost scaling is deterministic by day and does not randomly change due to weather.
- Future configs may add visible event-based cost modifiers, but active MVP rules should remain stable and fair.

## 19. Historical Events

Historical events are predefined config records with:

- ID
- Name
- Flavor text
- Optional date label
- Visitor modifier
- Purchase modifier
- Price tolerance modifier

MVP rules:

- Historical events are room-wide.
- At most one modifier event can occur per day beyond base weather.
- Special weather and historical events share that single modifier slot.
- If special weather triggers, no historical event triggers that day.
- Events are revealed dramatically after the base weather reveal.

Starter event examples:

| Event | Effect |
| --- | --- |
| Town Parade | More visitors, slightly higher purchase chance |
| School Holiday | More visitors, normal price tolerance |
| Local Road Work | Fewer visitors |
| Lemon Festival | More visitors and higher price tolerance |
| Big Sports Final | Fewer visitors, higher purchase chance among visitors |

## 20. Cup Production

Cup cost formula:

```text
cupCost(day) = baseCost + floor((day - 1) / dayScaleEveryNDays) * dayScaleAmount
```

Rules:

- Cups cost money immediately when setup is submitted.
- Unsold cups are lost at the end of the day.
- Costs are not recovered from unsold inventory.
- Spending may never exceed the player's current balance.
- Negative balance is never allowed.
- A player may submit a zero-spend day with 0 cups and 0 posters.
- If cups or posters are in the cart, cup price must be at least 1 coin.
- If a singleplayer run reaches setup with fewer coins than the current cup cost, the player is kicked to a stand-closed/game-over page and the local save is cleared.

## 21. Posters

Poster cost formula:

```text
posterUnitCost(posterNumber):
1-3 posters = 10 coins each
4-6 posters = 15 coins each
7-10 posters = 25 coins each
11-20 posters = 40 coins each
posterSpend = sum(posterUnitCost(1)..posterUnitCost(postersBought))
maxPosters = 20
```

Poster bonus formula:

```text
visitorFirstTier = min(posters, 6) * 7%
visitorLaterTier = max(posters - 6, 0) * 1%
visitorBonus = min(visitorFirstTier + visitorLaterTier, 56%)
posterVisitorMultiplier = 1 + visitorBonus

purchaseFirstTier = min(posters, 6) * 2.4%
purchaseLaterTier = max(posters - 6, 0) * 0.7%
purchaseBonus = min(purchaseFirstTier + purchaseLaterTier, 24%)
posterPurchaseMultiplier = 1 + purchaseBonus
```

Posters affect:

- Visitor count
- Purchase chance, with a smaller bonus than visitor count

## 22. Pricing

Rules:

- Minimum price: 0 coins.
- Maximum price: 1000 coins.
- All money values are integer coins.
- Price may be 0 only when the setup cart has 0 cups and 0 posters.

Price tolerance:

```text
comfortablePrice = cupCost * comfortablePriceCostMultiplier * weather.priceToleranceModifier * event.priceToleranceModifier
```

Purchase chance multiplier:

- If `price <= comfortablePrice`, price multiplier rises slightly, capped at 1.25.
- If `price > comfortablePrice`, price multiplier falls by markup ratio: `(price / comfortablePrice) ^ -overpricedPenaltyExponent`.
- Final purchase chance is clamped between configured min and max.

Implementation helper:

```text
purchaseChance = clamp(
  basePurchaseChance
  * weather.purchaseModifier
  * event.purchaseModifier
  * posterPurchaseMultiplier
  * priceMultiplier,
  minPurchaseChance,
  maxPurchaseChance
)
```

The exact `priceMultiplier` function must be implemented as a pure shared helper and covered by golden tests.

## 23. Daily Simulation

Simulation is aggregate, not per-visitor.

Potential visitor count:

```text
baseVisitors = visitors.base + (day - 1) * visitors.perDayGrowth
weatherVisitors = baseVisitors * weather.visitorModifier
eventVisitors = weatherVisitors * event.visitorModifier
posterVisitors = eventVisitors * posterVisitorMultiplier
potentialVisitors = seededRound(posterVisitors * randomVariation)
```

Potential buyers:

```text
potentialBuyers = 0
soldCups = 0
for each potential visitor:
  if seededRandom() <= purchaseChance:
    potentialBuyers += 1
    if soldCups < cupsMade:
      soldCups += 1
```

Sales:

```text
revenue = soldCups * price
spend = cupsMade * cupCost + posterSpend
profit = revenue - spend
endingBalance = startingBalance - spend + revenue
```

Sell-out behavior:

- If cups sell out, the simulation stops from the player's perspective.
- The summary visitor count should represent observed visitors until sell-out, not all potential visitors.
- The backend may store potential visitors/potential buyers for debugging, but it should not surface missed-sales stats in MVP unless later requested.

Observed visitors estimate:

```text
if cups did not sell out:
  observedVisitors = potentialVisitors
else:
  observedVisitors = visitor number where the final cup sold
```

## 24. RNG and Replayability

The server owns all RNG.

Each game has:

- Room seed
- Game seed
- Per-day derived seeds
- Per-player derived seeds when individual weather is enabled

Store:

- Game seed
- Economy config snapshot version
- Each day's inputs
- Each day's generated weather/event
- Each player's day result

Do not store every random roll in MVP.

## 25. Trivia

Trivia source:

- Local curated question bank in the repo.
- No external trivia API in MVP.
- Database-backed trivia storage is deferred to a future update.
- Questions include four answer choices.
- Answer choices are shuffled with seeded RNG when trivia is generated, so the correct answer is not always in the same slot.

Trivia chance:

- 5% after daily summary.
- Singleplayer: enabled by default.
- Multiplayer: off by default, host can enable before game start.

Multiplayer targeting:

- Host chooses individual targeting or room-wide targeting.
- Individual targeting: each player rolls their own trivia chance.
- Room-wide targeting: the room rolls once and all eligible players receive trivia.

Reward:

- Server rolls reward percentage from 1% to 10% of current balance.
- Reward is integer coins, rounded up.

Question count:

| Reward Percentage | Questions Required |
| ---: | ---: |
| 1% | 1 |
| 2-8% | 2 |
| 9-10% | 3 |

Rules:

- All answers must be correct.
- A wrong answer ends the event with no reward.
- Timer defaults to 20 seconds per question.
- Timeout ends the event with no reward.
- If a player disconnects and reconnects while time remains, they may continue.
- If the timer expires while disconnected, no reward is granted.
- In multiplayer, players with trivia pause individually while others wait at the next-day ready screen.

## 26. Data Models

### Player

```ts
type Player = {
  id: string;
  nickname: string;
  reconnectTokenHash: string;
  socketIds: string[];
  isHost: boolean;
  isConnected: boolean;
  joinedAt: string;
  coins: number;
  currentDay: number;
  stats: PlayerStats;
  setupDraft?: SetupInput;
  readySetup?: SetupInput;
  lastSubmittedSetup?: SetupInput;
  disconnectedAt?: string;
};
```

### PlayerStats

```ts
type PlayerStats = {
  totalRevenue: number;
  totalProfit: number;
  totalCupsMade: number;
  totalCupsSold: number;
  totalPostersBought: number;
  totalTriviaWon: number;
  totalTriviaFailed: number;
  bestDayProfit: number;
};
```

### Room

```ts
type Room = {
  id: string;
  code: string;
  name: string;
  visibility: "public" | "private";
  passwordHash?: string;
  hostPlayerId: string;
  players: Player[];
  settings: RoomSettings;
  state: GameState;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
};
```

### RoomSettings

```ts
type RoomSettings = {
  mode: "first_to_coins" | "most_coins_after_days";
  targetCoins?: number;
  targetDays?: number;
  startingCoins: number;
  setupTimeoutEnabled: boolean;
  setupTimeoutSeconds?: number;
  weatherMode: "shared" | "individual";
  triviaEnabled: boolean;
  triviaTargeting: "individual" | "room_wide";
  historicalEventsEnabled: boolean;
};
```

### GameState

```ts
type GameState = {
  phase:
    | "LOBBY"
    | "WEATHER_REVEAL"
    | "SETUP"
    | "SIMULATING"
    | "SUMMARY"
    | "TRIVIA"
    | "BETWEEN_DAYS"
    | "GAME_OVER";
  day: number;
  seed: string;
  configSnapshot: EconomyConfig;
  currentDay?: DayState;
  history: DayResult[];
  winnerPlayerIds?: string[];
};
```

### SetupInput

```ts
type SetupInput = {
  cups: number;
  posters: number;
  price: number;
};
```

### DayResult

```ts
type DayResult = {
  day: number;
  weatherByPlayerId: Record<string, WeatherResult>;
  eventByPlayerId: Record<string, EventResult | null>;
  playerResults: Record<string, PlayerDayResult>;
};
```

### PlayerDayResult

```ts
type PlayerDayResult = {
  startingBalance: number;
  cupCost: number;
  posterCost: number;
  posterSpend: number;
  setup: SetupInput;
  observedVisitors: number;
  soldCups: number;
  revenue: number;
  spend: number;
  profit: number;
  endingBalance: number;
  purchaseChance: number;
  autoSubmitted: boolean;
};
```

## 27. Live State Storage

Live room state is kept in server memory for the first MVP.

Behavior:

- Room state is lost if the backend process restarts.
- Singleplayer progress is saved to browser local storage on the same device/browser.
- Singleplayer local saves store a server-encrypted token plus a display-only day/coins preview.
- Singleplayer local saves are restored by sending the encrypted token back to the server. The server decrypts and verifies the token before restoring seed, day, coins, phase, summary result data, and active trivia state.
- If the local save token or preview is edited, the load request fails and the player must start a new game.
- Older economy-version singleplayer saves remain loadable when the encrypted token is valid. After loading, the server emits a fresh save token using the current economy version.
- Active trivia is saved in the encrypted token so reloading during trivia resumes the same trivia question/progress.
- Production deployments must set `SAVE_ENCRYPTION_SECRET` so save tokens cannot be forged from client-side code.
- Starting a new singleplayer game clears the local singleplayer save and replaces it with the new game state.
- Empty active rooms are deleted immediately.
- Inactive rooms expire after the configured TTL.
- Completed game summaries are not persisted in the first MVP.
- Reconnected clients can restore their slot only while the same backend process is still running and the room has not expired.
- Reconnected clients always receive a full snapshot.

Database-backed persistence is a future update.

Future persistence points:

- Room created
- Player joined/left/kicked
- Settings changed
- Game started
- Day completed
- Game completed
- Room abandoned/expired

Future database collections:

- `economy_configs` for versioned, activatable economy configs.
- `rooms` for active room metadata and snapshots.
- `completed_games` for retained game summaries and day logs.
- `trivia_questions` for curated trivia storage outside code.

## 28. Socket Protocol

Use typed shared event contracts with Zod payload schemas.

Server sends a full `room:snapshot` after every accepted command that changes state.

### Client to Server

```text
room:list
room:create
room:join
room:reconnect
room:leave
room:updateSettings
room:start
room:kick
room:votekick:start
room:votekick:vote
setup:updateDraft
setup:submitReady
setup:unready
phase:continue
trivia:answer
chat:send
ping
```

### Server to Client

```text
room:listResult
room:snapshot
command:ack
command:error
chat:message
trivia:question
trivia:result
votekick:updated
disconnect:reason
pong
```

### Error Codes

All rejected commands return user-safe reason codes.

Examples:

```text
ROOM_NOT_FOUND
ROOM_FULL
ROOM_ALREADY_STARTED
PASSWORD_REQUIRED
PASSWORD_INCORRECT
NICKNAME_TAKEN
NICKNAME_BLOCKED
NOT_HOST
INVALID_SETTINGS
INVALID_PHASE
INVALID_SETUP
INSUFFICIENT_FUNDS
PRICE_REQUIRED
PRICE_TOO_HIGH
RATE_LIMITED
VOTEKICK_COOLDOWN
RECONNECT_FAILED
TRIVIA_EXPIRED
INTERNAL_ERROR
```

## 29. Validation

Use shared Zod schemas for:

- Room creation
- Room join
- Room settings
- Nicknames
- Chat messages
- Setup input
- Trivia answer
- Admin config

The server additionally validates:

- Current phase allows command.
- Player belongs to room.
- Host-only commands are from host.
- Room has capacity.
- Game start has at least 2 players.
- Setup spending does not exceed balance.
- Price does not exceed 6x cup cost.
- Negative balance is impossible.
- Trivia answer is within active timer.

## 30. Rate Limiting

Apply basic per-IP and per-socket limits for:

- Room creation
- Join attempts
- Password attempts
- Chat messages
- Setup submissions
- Vote-kick starts/votes

Rate-limited commands return `RATE_LIMITED`.

## 31. Frontend Screens

### Home

- Start singleplayer
- If singleplayer local save data exists, show:
  - "An existing game data has been found,"
  - "Day x, coins y."
  - Load button
  - Start New button
- Create multiplayer room
- Join by invite code
- Join private room with password
- Browse public rooms

### Lobby

- Player list
- Host controls
- Room visibility/password settings
- Game mode settings
- Timeout settings
- Weather fairness setting
- Trivia settings
- Historical event toggle
- Chat
- Start button for host

### Arcade Game Shell

- Retro console-style presentation.
- One primary gameplay page visible at a time.
- Chunky readable type, high-contrast dialog boxes, and simple console prompts.
- Main gameplay content framed like an arcade/console screen.
- Compact leaderboard drawer for multiplayer.
- Chat available in lobby and between phases.
- Mobile responsive layout.

### Weather Reveal

- Full-screen weather page at the start of each day.
- Pixel-art or CSS-generated weather scene.
- Large readable base weather result.
- Prompt to press any key or tap anywhere to continue.
- If special weather or a historical event exists, reveal it only after the first continue action on a separate special reveal page.
- Dramatic special/historical reveal page when present.

### Daily Setup

- Shows current coins.
- Shows cup cost and poster cost.
- Cups input with stepper/slider and numeric entry.
- Posters input with stepper/slider and numeric entry.
- Price input with stepper/slider and numeric entry.
- All three inputs appear on the same setup page.
- Player-facing copy says "make posters."
- Live spending and affordability validation.
- Explicit confirmation before ready.

### Summary

- Instant summary; no daily simulation animation in MVP.
- Visitors observed, buyers, and estimated buy chance.
- Cups sold and price per cup.
- Posters made and poster cost.
- Total profit for the day.
- Current balance.
- Ready for next day.
- Do not show potential visitors, potential buyers, missed-sales stats, or other debug values.

### Trivia

- Rare full-screen page with celebratory intro copy.
- Shows the generated reward and required number of questions before the first question.
- Question text.
- Four answers.
- Mouse/touch selection.
- Keyboard selection using 1-4 and A-D.
- Visible timer.
- Passed/failed result stamp.
- A wrong answer ends the event with no reward.

### Game Over

- Winner podium.
- Final stats table.
- Rematch button.
- Return to home.

## 32. UI and Accessibility

Visual style:

- Retro console and arcade-inspired.
- Pixel-art UI and environments.
- Dialog boxes should feel like old console game prompts.
- Use chunky borders, simple screen transitions, and press-any-key/tap-anywhere prompts.
- CSS/canvas-generated pixel style for MVP.
- Fixed lemonade theme.
- Bright weather effects.
- Large readable text.

Controls:

- Mouse/touch first.
- Keyboard shortcuts for arcade feel.
- Pressing any key advances continue-prompt pages.
- Tapping anywhere advances continue-prompt pages on mobile.

Accessibility:

- Responsive mobile support is required.
- Readable contrast.
- Reduced motion option.
- Keyboard navigation.
- ARIA labels for controls.
- Text must fit in controls on mobile and desktop.

Audio:

- SFX only for MVP.
- User-controlled mute.
- No music in MVP.

## 33. Security and Safety

Player safety:

- Server-side blocked-word filter for nicknames, room names, and chat.
- Chat rate limits.
- Vote-kick cooldowns.

Technical security:

- No committed secrets.
- `.env.example` included.
- Runtime env validation.
- Password rooms store password hashes only.
- Reconnect tokens are stored hashed server-side.
- CORS restricted to configured client origins.
- Future admin panel protected by `ADMIN_TOKEN` or equivalent secret.

## 34. Observability

Use structured logs including:

- Room ID
- Player ID
- Game day
- Phase
- Socket ID when relevant
- Error code
- Command name

Do not log:

- Room passwords
- Reconnect tokens
- Future admin/config tokens

No analytics in MVP.

Store completed game summaries for debugging and future leaderboard support, retained for 30 days by default.

## 35. Testing Strategy

### Shared Package Unit Tests

Required golden tests:

- Weather generation probabilities through deterministic seeded cases.
- Special weather triggering.
- Poster diminishing returns.
- Poster bonus cap.
- Cup cost scaling.
- Poster cost cap.
- Price min/max validation.
- Purchase chance boundaries.
- Bankruptcy prevention.
- Zero-spend days.
- Sell-out behavior.
- Sudden-death tie handling.
- Trivia reward question count mapping.

### Server Integration Tests

Cover:

- Create room.
- Join room.
- Duplicate nickname rejection.
- Password room join flow.
- Public room listing.
- Host setting update.
- Host transfer on disconnect.
- Start game validation.
- Setup submit.
- Timeout auto-submit.
- Full day simulation.
- Trivia timeout/reconnect behavior.
- Vote-kick.
- Chat filtering.
- Reconnect snapshot.
- Game completion.

### Client Tests

Component tests:

- Lobby settings form.
- Setup form validation.
- Confirmation flow.
- Leaderboard drawer.
- Trivia answer controls.

Playwright smoke tests:

- Singleplayer day loop.
- Create and join multiplayer room in two browser contexts.
- Submit setups for two players.
- Reach summary.
- Reconnect and resync.

## 36. Development Milestones

### Milestone 1: Project Foundation

- Monorepo setup.
- Shared types and Zod schemas.
- Vite client.
- Fastify + Socket.IO server.
- In-memory state mode and env validation.
- Basic CI/test commands.

### Milestone 2: Core Economy

- Economy config defaults.
- Pure formula helpers.
- Unit golden tests.
- Singleplayer sandbox day loop.

### Milestone 3: Rooms and Realtime

- Create/join/reconnect rooms.
- Public room browser.
- Password rooms.
- Host settings.
- Full snapshot sync.
- In-memory live room state with TTL cleanup.

### Milestone 4: Multiplayer Game Loop

- Shared/individual weather setting.
- Setup flow.
- Server validation.
- Aggregate simulation.
- Summary and leaderboard drawer.
- First to X Coins mode.
- Most Coins After X Days mode.
- Sudden-death ties.

### Milestone 5: Social and Moderation

- Chat.
- Safety filter.
- Host kick.
- Vote-kick.
- Rate limits.
- Host transfer.

### Milestone 6: Trivia and Events

- Curated trivia bank.
- Timed trivia UI.
- Reconnect-aware trivia timers.
- Multiplayer trivia targeting.
- Historical event library.
- Event reveal UI.

### Milestone 7: Polish and Deployment

- Arcade cabinet UI pass.
- Mobile responsive QA.
- Reduced motion and keyboard navigation.
- SFX.
- Dockerfile for backend.
- Vercel frontend deployment config.
- Managed/self-hosted backend deployment docs.

## 37. Future Updates

These features are intentionally deferred until after the first playable MVP:

- Database-backed room persistence and active-room restore after server restart.
- Database-backed economy config with seed/update CLI.
- Admin web panel for viewing, validating, editing, and activating economy configs.
- Database-backed curated trivia storage.
- Completed game summaries retained for debugging and future leaderboard support.
- Global leaderboard schema and UI.

## 38. Open Implementation Notes

- The exact purchase chance curve should be tuned after the first playable prototype, but it must remain a pure shared helper covered by golden tests.
- Historical event probabilities should be low enough that weather remains the primary daily driver.
- Public rooms should default to safer settings: timeout enabled only if the host chooses, chat filter on, shared weather recommended.
