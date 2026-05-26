import crypto from "node:crypto";
import type { Server, Socket } from "socket.io";
import {
  generateWeather,
  getCupCost,
  getMaxPrice,
  getMaxPosters,
  getPosterCost,
  roomCreateInputSchema,
  roomJoinInputSchema,
  setupInputSchema,
  simulateDay,
  socketEvents,
  validateSetupForBalance,
  type GamePhase,
  type PlayerDayResult,
  type PlayerSummary,
  type RoomListItem,
  type RoomSettings,
  type RoomSnapshot,
  type RoomVisibility,
  type SetupInput,
  type WeatherResult
} from "@lemonade-game/shared";

type RoomPlayer = PlayerSummary & {
  socketId: string;
  joinedAt: number;
};

type RoomState = {
  id: string;
  code: string;
  name: string;
  visibility: RoomVisibility;
  passwordHash?: string;
  hostPlayerId: string;
  players: RoomPlayer[];
  settings: RoomSettings;
  phase: GamePhase;
  day: number;
  seed: string;
  weather?: WeatherResult;
  readySetups: Map<string, SetupInput>;
  continuedPlayerIds: Set<string>;
  lastResults?: Record<string, PlayerDayResult>;
  createdAt: number;
  updatedAt: number;
};

const maxPlayers = 5;
const roomsByCode = new Map<string, RoomState>();
const socketToRoomCode = new Map<string, string>();

export function registerRoomHandlers(io: Server) {
  io.on("connection", (socket) => {
    socket.on(socketEvents.client.roomCreate, (payload) => {
      const parsed = roomCreateInputSchema.safeParse(payload);

      if (!parsed.success) {
        emitCommandError(socket, "INVALID_SETTINGS", "Room settings are invalid.");
        return;
      }

      leaveCurrentRoom(io, socket);
      const room = createRoom(parsed.data, socket.id);
      roomsByCode.set(room.code, room);
      socketToRoomCode.set(socket.id, room.code);
      socket.join(getRoomChannel(room));
      emitSnapshot(io, room);
      emitRoomListToAll(io);
    });

    socket.on(socketEvents.client.roomJoin, (payload) => {
      const parsed = roomJoinInputSchema.safeParse(payload);

      if (!parsed.success) {
        emitCommandError(socket, "INVALID_SETTINGS", "Join details are invalid.");
        return;
      }

      const code = normalizeCode(parsed.data.roomCode);
      const room = roomsByCode.get(code);

      if (!room) {
        emitCommandError(socket, "ROOM_NOT_FOUND", "Room was not found.");
        return;
      }

      if (room.players.length >= maxPlayers) {
        emitCommandError(socket, "ROOM_FULL", "Room is full.");
        return;
      }

      if (room.phase !== "LOBBY") {
        emitCommandError(socket, "ROOM_ALREADY_STARTED", "Room already started.");
        return;
      }

      if (room.passwordHash && hashSecret(parsed.data.password ?? "") !== room.passwordHash) {
        emitCommandError(socket, parsed.data.password ? "PASSWORD_INCORRECT" : "PASSWORD_REQUIRED", "Password is required.");
        return;
      }

      if (hasNickname(room, parsed.data.nickname)) {
        emitCommandError(socket, "NICKNAME_TAKEN", "Nickname is already taken in this room.");
        return;
      }

      leaveCurrentRoom(io, socket);
      room.players.push(createPlayer(parsed.data.nickname, socket.id, false, room.settings.startingCoins));
      room.updatedAt = Date.now();
      socketToRoomCode.set(socket.id, room.code);
      socket.join(getRoomChannel(room));
      emitSnapshot(io, room);
      emitRoomListToAll(io);
    });

    socket.on(socketEvents.client.roomList, () => {
      emitRoomListResult(socket);
    });

    socket.on(socketEvents.client.roomStart, () => {
      const room = getSocketRoom(socket);

      if (!room) {
        emitCommandError(socket, "ROOM_NOT_FOUND", "Room was not found.");
        return;
      }

      const player = getSocketPlayer(room, socket.id);

      if (!player?.isHost) {
        emitCommandError(socket, "NOT_HOST", "Only the host can start the game.");
        return;
      }

      if (room.phase !== "LOBBY") {
        emitCommandError(socket, "ROOM_ALREADY_STARTED", "Room already started.");
        return;
      }

      if (getConnectedPlayers(room).length < 2) {
        emitCommandError(socket, "INVALID_SETTINGS", "Multiplayer needs at least 2 players.");
        return;
      }

      startNextDay(room, 1);
      emitSnapshot(io, room);
      emitRoomListToAll(io);
    });

    socket.on(socketEvents.client.roomContinue, () => {
      const room = getSocketRoom(socket);

      if (!room) {
        emitCommandError(socket, "ROOM_NOT_FOUND", "Room was not found.");
        return;
      }

      const player = getSocketPlayer(room, socket.id);

      if (!player?.isConnected) {
        emitCommandError(socket, "ROOM_NOT_FOUND", "Player was not found.");
        return;
      }

      continueRoom(room, player.id);
      emitSnapshot(io, room);
      emitRoomListToAll(io);
    });

    socket.on(socketEvents.client.roomSubmitSetup, (payload) => {
      const room = getSocketRoom(socket);

      if (!room) {
        emitCommandError(socket, "ROOM_NOT_FOUND", "Room was not found.");
        return;
      }

      const player = getSocketPlayer(room, socket.id);

      if (!player?.isConnected) {
        emitCommandError(socket, "ROOM_NOT_FOUND", "Player was not found.");
        return;
      }

      if (room.phase !== "SETUP") {
        emitCommandError(socket, "INVALID_PHASE", "Setup can only be submitted during setup.");
        return;
      }

      const parsed = setupInputSchema.safeParse(payload);

      if (!parsed.success) {
        emitCommandError(socket, "INVALID_SETUP", "Setup values are invalid.");
        return;
      }

      const validation = validateSetupForBalance(room.day, player.coins, parsed.data);

      if (!validation.ok) {
        emitCommandError(
          socket,
          validation.reason,
          getSetupValidationMessage(validation.reason)
        );
        return;
      }

      room.readySetups.set(player.id, parsed.data);
      room.updatedAt = Date.now();

      if (allConnectedPlayersReady(room)) {
        simulateRoomDay(room);
      }

      emitSnapshot(io, room);
      emitRoomListToAll(io);
    });

    socket.on(socketEvents.client.roomLeave, () => {
      leaveCurrentRoom(io, socket);
    });

    socket.on("disconnect", () => {
      const code = socketToRoomCode.get(socket.id);

      if (!code) {
        return;
      }

      const room = roomsByCode.get(code);
      socketToRoomCode.delete(socket.id);

      if (!room) {
        return;
      }

      const player = room.players.find((candidate) => candidate.socketId === socket.id);

      if (player) {
        player.isConnected = false;
        room.updatedAt = Date.now();
      }

      transferHostIfNeeded(room);
      deleteRoomIfEmpty(room);

      if (roomsByCode.has(room.code)) {
        emitSnapshot(io, room);
      }

      emitRoomListToAll(io);
    });
  });
}

function createRoom(input: {
  roomName: string;
  nickname: string;
  visibility: RoomVisibility;
  password?: string | undefined;
  settings: RoomSettings;
}, socketId: string): RoomState {
  const hostPlayer = createPlayer(input.nickname, socketId, true, input.settings.startingCoins);
  const now = Date.now();
  const room: RoomState = {
    id: crypto.randomUUID(),
    code: createRoomCode(),
    name: input.roomName,
    visibility: input.visibility,
    hostPlayerId: hostPlayer.id,
    players: [hostPlayer],
    settings: input.settings,
    phase: "LOBBY",
    day: 0,
    seed: crypto.randomUUID(),
    readySetups: new Map(),
    continuedPlayerIds: new Set(),
    createdAt: now,
    updatedAt: now
  };

  if (input.password) {
    room.passwordHash = hashSecret(input.password);
  }

  return room;
}

function createPlayer(nickname: string, socketId: string, isHost: boolean, startingCoins: number): RoomPlayer {
  return {
    id: crypto.randomUUID(),
    nickname,
    socketId,
    isHost,
    isConnected: true,
    coins: startingCoins,
    joinedAt: Date.now()
  };
}

function createRoomCode(): string {
  let code = "";

  do {
    code = crypto.randomBytes(3).toString("hex").toUpperCase();
  } while (roomsByCode.has(code));

  return code;
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function getRoomChannel(room: RoomState): string {
  return `room:${room.id}`;
}

function createSnapshot(room: RoomState, currentPlayerId?: string): RoomSnapshot {
  const snapshot: RoomSnapshot = {
    id: room.id,
    code: room.code,
    name: room.name,
    visibility: room.visibility,
    hostPlayerId: room.hostPlayerId,
    players: room.players.map(({ socketId: _socketId, joinedAt: _joinedAt, ...player }) => player),
    settings: room.settings,
    phase: room.phase,
    day: room.day
  };

  if (currentPlayerId) {
    snapshot.currentPlayerId = currentPlayerId;
  }

  if (room.weather) {
    snapshot.weather = room.weather;
    snapshot.cupCost = getCupCost(room.day);
    snapshot.posterCost = getPosterCost(room.day);
    snapshot.maxPosters = getMaxPosters();
    snapshot.maxPrice = getMaxPrice(snapshot.cupCost);
  }

  if (room.readySetups.size > 0) {
    snapshot.readyPlayerIds = [...room.readySetups.keys()];
  }

  if (room.continuedPlayerIds.size > 0) {
    snapshot.continuedPlayerIds = [...room.continuedPlayerIds];
  }

  if (room.lastResults) {
    snapshot.lastResults = room.lastResults;
  }

  return snapshot;
}

function createRoomList(): RoomListItem[] {
  return [...roomsByCode.values()]
    .filter((room) => room.visibility === "public")
    .map((room) => {
      const host = room.players.find((player) => player.id === room.hostPlayerId);

      return {
        code: room.code,
        name: room.name,
        hostNickname: host?.nickname ?? "Host",
        playerCount: room.players.length,
        maxPlayers,
        visibility: room.visibility,
        phase: room.phase
      };
    });
}

function emitSnapshot(io: Server, room: RoomState) {
  for (const player of room.players) {
    if (player.isConnected) {
      io.to(player.socketId).emit(socketEvents.server.roomSnapshot, createSnapshot(room, player.id));
    }
  }
}

function emitRoomListResult(socket: Socket) {
  socket.emit(socketEvents.server.roomListResult, createRoomList());
}

function emitRoomListToAll(io: Server) {
  io.emit(socketEvents.server.roomListResult, createRoomList());
}

function emitCommandError(socket: Socket, code: string, message: string) {
  socket.emit(socketEvents.server.commandError, { code, message });
}

function getSetupValidationMessage(
  reason: "INSUFFICIENT_FUNDS" | "PRICE_REQUIRED" | "PRICE_TOO_HIGH" | "TOO_MANY_POSTERS"
): string {
  if (reason === "INSUFFICIENT_FUNDS") {
    return "You do not have enough coins.";
  }

  if (reason === "PRICE_REQUIRED") {
    return "Cup price must be at least 1 when your cart is not empty.";
  }

  if (reason === "TOO_MANY_POSTERS") {
    return "You already have the maximum useful posters for today.";
  }

  return "Cup price is too high.";
}

function getSocketRoom(socket: Socket): RoomState | undefined {
  const code = socketToRoomCode.get(socket.id);

  if (!code) {
    return undefined;
  }

  return roomsByCode.get(code);
}

function getSocketPlayer(room: RoomState, socketId: string): RoomPlayer | undefined {
  return room.players.find((player) => player.socketId === socketId);
}

function getConnectedPlayers(room: RoomState): RoomPlayer[] {
  return room.players.filter((player) => player.isConnected);
}

function startNextDay(room: RoomState, day: number) {
  room.day = day;
  room.phase = "WEATHER_REVEAL";
  room.weather = generateWeather(`${room.seed}:weather:${day}`);
  room.readySetups.clear();
  room.continuedPlayerIds.clear();
  delete room.lastResults;
  room.updatedAt = Date.now();
}

function continueRoom(room: RoomState, playerId: string) {
  if (room.phase === "WEATHER_REVEAL") {
    room.continuedPlayerIds.add(playerId);
    room.updatedAt = Date.now();

    if (allConnectedPlayersContinued(room)) {
      room.phase = room.weather?.isSpecial ? "SPECIAL_REVEAL" : "SETUP";
      room.continuedPlayerIds.clear();
    }

    return;
  }

  if (room.phase === "SPECIAL_REVEAL") {
    room.continuedPlayerIds.add(playerId);
    room.updatedAt = Date.now();

    if (allConnectedPlayersContinued(room)) {
      room.phase = "SETUP";
      room.continuedPlayerIds.clear();
    }

    return;
  }

  if (room.phase !== "SUMMARY") {
    return;
  }

  room.continuedPlayerIds.add(playerId);
  room.updatedAt = Date.now();

  if (allConnectedPlayersContinued(room)) {
    startNextDay(room, room.day + 1);
  }
}

function allConnectedPlayersReady(room: RoomState): boolean {
  return getConnectedPlayers(room).every((player) => room.readySetups.has(player.id));
}

function allConnectedPlayersContinued(room: RoomState): boolean {
  return getConnectedPlayers(room).every((player) => room.continuedPlayerIds.has(player.id));
}

function simulateRoomDay(room: RoomState) {
  const weather = room.weather;

  if (!weather) {
    return;
  }

  const results: Record<string, PlayerDayResult> = {};

  for (const player of getConnectedPlayers(room)) {
    const setup = room.readySetups.get(player.id);

    if (!setup) {
      continue;
    }

    const result = simulateDay({
      day: room.day,
      startingBalance: player.coins,
      setup,
      seed: `${room.seed}:day:${room.day}:player:${player.id}`,
      weather
    });

    player.coins = result.endingBalance;
    results[player.id] = result;
  }

  room.phase = "SUMMARY";
  room.lastResults = results;
  room.readySetups.clear();
  room.continuedPlayerIds.clear();
  room.updatedAt = Date.now();
}

function hasNickname(room: RoomState, nickname: string): boolean {
  return room.players.some((player) => player.nickname.toLowerCase() === nickname.toLowerCase());
}

function leaveCurrentRoom(io: Server, socket: Socket) {
  const code = socketToRoomCode.get(socket.id);

  if (!code) {
    return;
  }

  const room = roomsByCode.get(code);
  socketToRoomCode.delete(socket.id);

  if (!room) {
    return;
  }

  socket.leave(getRoomChannel(room));
  room.players = room.players.filter((player) => player.socketId !== socket.id);
  room.updatedAt = Date.now();
  transferHostIfNeeded(room);
  deleteRoomIfEmpty(room);

  if (roomsByCode.has(room.code)) {
    emitSnapshot(io, room);
  }

  emitRoomListToAll(io);
}

function transferHostIfNeeded(room: RoomState) {
  const currentHost = room.players.find((player) => player.id === room.hostPlayerId);

  if (currentHost?.isConnected) {
    return;
  }

  const nextHost = [...room.players]
    .filter((player) => player.isConnected)
    .sort((a, b) => a.joinedAt - b.joinedAt)[0];

  for (const player of room.players) {
    player.isHost = player.id === nextHost?.id;
  }

  if (nextHost) {
    room.hostPlayerId = nextHost.id;
  }
}

function deleteRoomIfEmpty(room: RoomState) {
  if (room.players.some((player) => player.isConnected)) {
    return;
  }

  roomsByCode.delete(room.code);
}

function hashSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}
