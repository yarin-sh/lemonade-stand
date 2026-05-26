import type { z } from "zod";
import type {
  chatMessageInputSchema,
  economyConfigSchema,
  gameModeSchema,
  gamePhaseSchema,
  nicknameSchema,
  roomCreateInputSchema,
  roomJoinInputSchema,
  roomSettingsSchema,
  triviaAnswerInputSchema,
  roomVisibilitySchema,
  setupInputSchema,
  triviaTargetingSchema,
  weatherModeSchema
} from "./schemas";
import type { PlayerDayResult, WeatherResult } from "./economy";

export type GamePhase = z.infer<typeof gamePhaseSchema>;
export type GameMode = z.infer<typeof gameModeSchema>;
export type RoomVisibility = z.infer<typeof roomVisibilitySchema>;
export type WeatherMode = z.infer<typeof weatherModeSchema>;
export type TriviaTargeting = z.infer<typeof triviaTargetingSchema>;
export type Nickname = z.infer<typeof nicknameSchema>;
export type SetupInput = z.infer<typeof setupInputSchema>;
export type RoomSettings = z.infer<typeof roomSettingsSchema>;
export type RoomCreateInput = z.infer<typeof roomCreateInputSchema>;
export type RoomJoinInput = z.infer<typeof roomJoinInputSchema>;
export type ChatMessageInput = z.infer<typeof chatMessageInputSchema>;
export type TriviaAnswerInput = z.infer<typeof triviaAnswerInputSchema>;
export type EconomyConfig = z.infer<typeof economyConfigSchema>;

export type PlayerSummary = {
  id: string;
  nickname: string;
  isHost: boolean;
  isConnected: boolean;
  coins: number;
};

export type RoomSnapshot = {
  id: string;
  code: string;
  name: string;
  visibility: RoomVisibility;
  hostPlayerId: string;
  players: PlayerSummary[];
  settings: RoomSettings;
  phase: GamePhase;
  day: number;
  currentPlayerId?: string;
  weather?: WeatherResult;
  cupCost?: number;
  posterCost?: number;
  maxPosters?: number;
  maxPrice?: number;
  readyPlayerIds?: string[];
  continuedPlayerIds?: string[];
  lastResults?: Record<string, PlayerDayResult>;
};

export type RoomListItem = {
  code: string;
  name: string;
  hostNickname: string;
  playerCount: number;
  maxPlayers: number;
  visibility: RoomVisibility;
  phase: GamePhase;
};

export const socketEvents = {
  client: {
    singleplayerNextDay: "singleplayer:nextDay",
    singleplayerContinue: "singleplayer:continue",
    singleplayerAnswerTrivia: "singleplayer:answerTrivia",
    singleplayerLoad: "singleplayer:load",
    singleplayerStart: "singleplayer:start",
    singleplayerSubmitSetup: "singleplayer:submitSetup",
    roomCreate: "room:create",
    roomJoin: "room:join",
    roomLeave: "room:leave",
    roomList: "room:list",
    roomStart: "room:start",
    roomContinue: "room:continue",
    roomSubmitSetup: "room:submitSetup",
    ping: "ping"
  },
  server: {
    commandAck: "command:ack",
    commandError: "command:error",
    pong: "pong",
    roomListResult: "room:listResult",
    roomSnapshot: "room:snapshot",
    singleplayerSnapshot: "singleplayer:snapshot",
    serverHello: "server:hello"
  }
} as const;

export const errorCodes = [
  "ROOM_NOT_FOUND",
  "ROOM_FULL",
  "ROOM_ALREADY_STARTED",
  "PASSWORD_REQUIRED",
  "PASSWORD_INCORRECT",
  "NICKNAME_TAKEN",
  "NICKNAME_BLOCKED",
  "NOT_HOST",
  "INVALID_SETTINGS",
  "INVALID_PHASE",
  "INVALID_SETUP",
  "INSUFFICIENT_FUNDS",
  "PRICE_REQUIRED",
  "PRICE_TOO_HIGH",
  "TOO_MANY_POSTERS",
  "RATE_LIMITED",
  "VOTEKICK_COOLDOWN",
  "RECONNECT_FAILED",
  "TRIVIA_EXPIRED",
  "INTERNAL_ERROR"
] as const;

export type ErrorCode = (typeof errorCodes)[number];
