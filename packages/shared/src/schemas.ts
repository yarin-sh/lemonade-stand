import { z } from "zod";

export const gamePhaseSchema = z.enum([
  "LOBBY",
  "WEATHER_REVEAL",
  "SPECIAL_REVEAL",
  "SETUP",
  "SIMULATING",
  "SUMMARY",
  "TRIVIA",
  "BETWEEN_DAYS",
  "GAME_OVER"
]);

export const gameModeSchema = z.enum([
  "first_to_coins",
  "most_coins_after_days"
]);

export const roomVisibilitySchema = z.enum(["public", "private"]);
export const weatherModeSchema = z.enum(["shared", "individual"]);
export const triviaTargetingSchema = z.enum(["individual", "room_wide"]);
export const autoPlayerRiskProfileSchema = z.enum(["safe", "balanced", "risky", "wild"]);

export const nicknameSchema = z
  .string()
  .trim()
  .min(2)
  .max(18)
  .regex(/^[A-Za-z0-9 _-]+$/, "Use letters, numbers, spaces, underscores, or hyphens.");

export const setupInputSchema = z.object({
  cups: z.number().int().min(0),
  posters: z.number().int().min(0),
  price: z.number().int().min(0)
});

export const roomSettingsSchema = z
  .object({
    mode: gameModeSchema.default("first_to_coins"),
    targetCoins: z.number().int().positive().optional(),
    targetDays: z.number().int().positive().optional(),
    startingCoins: z.number().int().nonnegative().default(100),
    setupTimeoutEnabled: z.boolean().default(false),
    setupTimeoutSeconds: z.number().int().positive().optional(),
    weatherMode: weatherModeSchema.default("shared"),
    triviaEnabled: z.boolean().default(false),
    triviaTargeting: triviaTargetingSchema.default("individual"),
    historicalEventsEnabled: z.boolean().default(true)
  })
  .superRefine((settings, ctx) => {
    if (settings.mode === "first_to_coins" && settings.targetCoins === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "targetCoins is required for first_to_coins mode.",
        path: ["targetCoins"]
      });
    }

    if (settings.mode === "most_coins_after_days" && settings.targetDays === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "targetDays is required for most_coins_after_days mode.",
        path: ["targetDays"]
      });
    }

    if (settings.setupTimeoutEnabled && settings.setupTimeoutSeconds === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "setupTimeoutSeconds is required when setup timeout is enabled.",
        path: ["setupTimeoutSeconds"]
      });
    }
  });

export const defaultRoomSettings = {
  mode: "first_to_coins",
  targetCoins: 500,
  startingCoins: 100,
  setupTimeoutEnabled: false,
  weatherMode: "shared",
  triviaEnabled: false,
  triviaTargeting: "individual",
  historicalEventsEnabled: true
} satisfies z.input<typeof roomSettingsSchema>;

export const roomCreateInputSchema = z.object({
  roomName: z.string().trim().min(2).max(40),
  nickname: nicknameSchema,
  visibility: roomVisibilitySchema.default("private"),
  password: z.string().min(4).max(80).optional(),
  settings: roomSettingsSchema.default(defaultRoomSettings)
});

export const roomJoinInputSchema = z.object({
  roomCode: z.string().trim().min(3).max(12),
  nickname: nicknameSchema,
  password: z.string().min(4).max(80).optional()
});

export const chatMessageInputSchema = z.object({
  roomId: z.string().min(1),
  message: z.string().trim().min(1).max(280)
});

export const triviaAnswerInputSchema = z.object({
  answerIndex: z.number().int().min(0).max(3)
});

export const autoPlayerInputSchema = z.object({
  riskProfile: autoPlayerRiskProfileSchema,
  days: z.number().int().min(1).max(365),
  stopBalance: z.number().int().min(0)
});

export const economyConfigSchema = z.object({
  version: z.string().min(1),
  startingCoins: z.object({
    singleplayer: z.literal(100),
    multiplayerDefault: z.number().int().nonnegative()
  }),
  visitors: z.object({
    base: z.number().int().positive(),
    perDayGrowth: z.number().int().nonnegative(),
    randomVariationPct: z.number().min(0).max(100)
  }),
  cups: z.object({
    baseCost: z.number().int().positive(),
    dayScaleEveryNDays: z.number().int().positive(),
    dayScaleAmount: z.number().int().nonnegative()
  }),
  posters: z.object({
    costTiers: z.array(z.object({
      upToCount: z.number().int().positive(),
      cost: z.number().int().positive()
    })).min(1),
    maxCount: z.number().int().positive(),
    firstTierCount: z.number().int().nonnegative(),
    visitorFirstTierBonusPct: z.number().min(0),
    visitorLaterTierBonusPct: z.number().min(0),
    maxVisitorBonusPct: z.number().min(0).max(100),
    purchaseFirstTierBonusPct: z.number().min(0),
    purchaseLaterTierBonusPct: z.number().min(0),
    maxPurchaseBonusPct: z.number().min(0).max(100)
  }),
  pricing: z.object({
    minPrice: z.number().int().nonnegative(),
    maxPrice: z.number().int().positive(),
    comfortablePriceCostMultiplier: z.number().positive(),
    overpricedPenaltyExponent: z.number().positive(),
    maxPurchaseChance: z.number().min(0).max(1),
    minPurchaseChance: z.number().min(0).max(1)
  }),
  trivia: z.object({
    chancePct: z.number().min(0).max(100),
    secondsPerQuestion: z.number().int().positive()
  })
});
