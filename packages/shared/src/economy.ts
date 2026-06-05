import type { AutoPlayerRiskProfile, EconomyConfig, SetupInput } from "./types";

export type WeatherId =
  | "cold"
  | "warm"
  | "bright"
  | "hot"
  | "thunder_storm"
  | "extremely_hot_dry";

export type WeatherResult = {
  id: WeatherId;
  label: string;
  baseId: "cold" | "warm" | "bright" | "hot";
  visitorModifier: number;
  purchaseModifier: number;
  priceToleranceModifier: number;
  isSpecial: boolean;
};

export type EventModifier = {
  visitorModifier: number;
  purchaseModifier: number;
  priceToleranceModifier: number;
};

export type PlayerDayResult = {
  startingBalance: number;
  cupCost: number;
  posterCost: number;
  posterSpend: number;
  setup: SetupInput;
  observedVisitors: number;
  potentialVisitors: number;
  potentialBuyers: number;
  soldCups: number;
  revenue: number;
  spend: number;
  profit: number;
  endingBalance: number;
  purchaseChance: number;
  autoSubmitted: boolean;
};

export type SingleplayerPhase =
  | "WEATHER_REVEAL"
  | "SPECIAL_REVEAL"
  | "SETUP"
  | "SUMMARY"
  | "TRIVIA"
  | "GAME_OVER";

export type TriviaQuestionView = {
  id: string;
  question: string;
  choices: string[];
};

export type SingleplayerTriviaSnapshot = {
  rewardPct: number;
  rewardCoins: number;
  requiredQuestions: number;
  currentQuestionNumber: number;
  status: "active" | "passed" | "failed";
  question?: TriviaQuestionView;
};

export type SingleplayerSavedTriviaQuestion = TriviaQuestionView & {
  correctAnswerIndex: number;
};

export type SingleplayerSavedTrivia = {
  rewardPct: number;
  rewardCoins: number;
  requiredQuestions: number;
  currentQuestionIndex: number;
  status: "active" | "passed" | "failed";
  questions: SingleplayerSavedTriviaQuestion[];
};

export type SingleplayerSavePayload = {
  version: 1;
  configVersion: string;
  seed: string;
  phase: Exclude<SingleplayerPhase, "GAME_OVER">;
  day: number;
  coins: number;
  savedAt: number;
  lastResult?: PlayerDayResult;
  trivia?: SingleplayerSavedTrivia;
};

export type SingleplayerSavePreview = {
  configVersion: string;
  day: number;
  coins: number;
  savedAt: number;
};

export type SingleplayerSaveData = {
  version: 2;
  preview: SingleplayerSavePreview;
  token: string;
};

export type SingleplayerAutoRunStopReason =
  | "requested_days"
  | "stop_balance"
  | "broke";

export type SingleplayerAutoRunDayLog = {
  day: number;
  weather: WeatherResult;
  setup: SetupInput;
  result: PlayerDayResult;
};

export type SingleplayerAutoRunResult = {
  riskProfile: AutoPlayerRiskProfile;
  requestedDays: number;
  completedDays: number;
  stopBalance: number;
  stopReason: SingleplayerAutoRunStopReason;
  startingDay: number;
  endingDay: number;
  startingCoins: number;
  endingCoins: number;
  totalProfit: number;
  totalRevenue: number;
  totalSpend: number;
  totalVisitors: number;
  totalSoldCups: number;
  averagePurchaseChance: number;
  logs: SingleplayerAutoRunDayLog[];
};

export type SingleplayerSnapshot = {
  phase: SingleplayerPhase;
  day: number;
  coins: number;
  weather: WeatherResult;
  cupCost: number;
  posterCost: number;
  maxPosters: number;
  maxPrice: number;
  configVersion: string;
  lastResult?: PlayerDayResult;
  saveData?: SingleplayerSaveData;
  trivia?: SingleplayerTriviaSnapshot;
  autoRunResult?: SingleplayerAutoRunResult;
};

export type SetupValidationResult =
  | { ok: true; spend: number; maxPrice: number }
  | {
      ok: false;
      reason: "INSUFFICIENT_FUNDS" | "PRICE_REQUIRED" | "PRICE_TOO_HIGH" | "TOO_MANY_POSTERS";
      spend: number;
      maxPrice: number;
    };

export const defaultEconomyConfig: EconomyConfig = {
  version: "default-2026-05-24-cup10-hot2-poster-tiers20-pricecurve",
  startingCoins: {
    singleplayer: 100,
    multiplayerDefault: 100
  },
  visitors: {
    base: 36,
    perDayGrowth: 2,
    randomVariationPct: 15
  },
  cups: {
    baseCost: 5,
    dayScaleEveryNDays: 10,
    dayScaleAmount: 1
  },
  posters: {
    costTiers: [
      { upToCount: 3, cost: 10 },
      { upToCount: 6, cost: 15 },
      { upToCount: 10, cost: 25 },
      { upToCount: 20, cost: 40 }
    ],
    maxCount: 20,
    firstTierCount: 6,
    visitorFirstTierBonusPct: 7,
    visitorLaterTierBonusPct: 1,
    maxVisitorBonusPct: 56,
    purchaseFirstTierBonusPct: 2.4,
    purchaseLaterTierBonusPct: 0.7,
    maxPurchaseBonusPct: 24
  },
  pricing: {
    minPrice: 0,
    maxPrice: 1000,
    comfortablePriceCostMultiplier: 2,
    overpricedPenaltyExponent: 1.4,
    maxPurchaseChance: 0.98,
    minPurchaseChance: 0.005
  },
  trivia: {
    chancePct: 5,
    secondsPerQuestion: 20
  }
};

export const weatherResults = {
  cold: {
    id: "cold",
    label: "Cold",
    baseId: "cold",
    visitorModifier: 0.7,
    purchaseModifier: 0.75,
    priceToleranceModifier: 0.8,
    isSpecial: false
  },
  warm: {
    id: "warm",
    label: "Warm",
    baseId: "warm",
    visitorModifier: 1,
    purchaseModifier: 1,
    priceToleranceModifier: 1,
    isSpecial: false
  },
  bright: {
    id: "bright",
    label: "Bright",
    baseId: "bright",
    visitorModifier: 1.15,
    purchaseModifier: 1.1,
    priceToleranceModifier: 1.05,
    isSpecial: false
  },
  hot: {
    id: "hot",
    label: "Hot",
    baseId: "hot",
    visitorModifier: 1.3,
    purchaseModifier: 1.2,
    priceToleranceModifier: 1.1,
    isSpecial: false
  },
  thunder_storm: {
    id: "thunder_storm",
    label: "Thunder Storm",
    baseId: "cold",
    visitorModifier: 0.25,
    purchaseModifier: 0.4,
    priceToleranceModifier: 0.65,
    isSpecial: true
  },
  extremely_hot_dry: {
    id: "extremely_hot_dry",
    label: "Extremely Hot & Dry",
    baseId: "hot",
    visitorModifier: 1.75,
    purchaseModifier: 1.45,
    priceToleranceModifier: 1.4,
    isSpecial: true
  }
} satisfies Record<WeatherId, WeatherResult>;

const baseWeatherIds = ["cold", "warm", "bright", "hot"] as const;

export function createSeededRandom(seed: string): () => number {
  let state = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededRound(value: number, random: () => number): number {
  const floored = Math.floor(value);
  const fraction = value - floored;
  return floored + (random() < fraction ? 1 : 0);
}

export function generateWeather(seed: string): WeatherResult {
  const random = createSeededRandom(seed);
  const baseId = baseWeatherIds[Math.floor(random() * baseWeatherIds.length)] ?? "warm";
  const specialRoll = random();

  if (baseId === "cold" && specialRoll < 0.1) {
    return weatherResults.thunder_storm;
  }

  if (baseId === "hot" && specialRoll < 0.1) {
    return weatherResults.extremely_hot_dry;
  }

  return weatherResults[baseId];
}

export function getCupCost(day: number, config: EconomyConfig = defaultEconomyConfig): number {
  return (
    config.cups.baseCost +
    Math.floor((day - 1) / config.cups.dayScaleEveryNDays) * config.cups.dayScaleAmount
  );
}

export function getMaxPosters(config: EconomyConfig = defaultEconomyConfig): number {
  return config.posters.maxCount;
}

export function getPosterUnitCost(posterNumber: number, config: EconomyConfig = defaultEconomyConfig): number {
  const normalizedPosterNumber = Math.max(1, Math.ceil(posterNumber));
  const tier = config.posters.costTiers.find(({ upToCount }) => normalizedPosterNumber <= upToCount);

  return tier?.cost ?? config.posters.costTiers[config.posters.costTiers.length - 1]?.cost ?? 0;
}

export function getPosterCost(_day: number, config: EconomyConfig = defaultEconomyConfig): number {
  return getPosterUnitCost(1, config);
}

export function getPosterSpend(posters: number, config: EconomyConfig = defaultEconomyConfig): number {
  const posterCount = Math.max(0, Math.floor(posters));
  let spend = 0;

  for (let posterNumber = 1; posterNumber <= posterCount; posterNumber += 1) {
    spend += getPosterUnitCost(posterNumber, config);
  }

  return spend;
}

function getTieredPosterBonusPct({
  posters,
  firstTierBonusPct,
  laterTierBonusPct,
  maxBonusPct,
  config
}: {
  posters: number;
  firstTierBonusPct: number;
  laterTierBonusPct: number;
  maxBonusPct: number;
  config: EconomyConfig;
}): number {
  const posterCount = Math.min(Math.max(0, posters), getMaxPosters(config));
  const firstTier = Math.min(posterCount, config.posters.firstTierCount) * firstTierBonusPct;
  const laterTier =
    Math.max(posterCount - config.posters.firstTierCount, 0) * laterTierBonusPct;

  return Math.min(firstTier + laterTier, maxBonusPct);
}

export function getPosterVisitorBonusPct(posters: number, config: EconomyConfig = defaultEconomyConfig): number {
  return getTieredPosterBonusPct({
    posters,
    firstTierBonusPct: config.posters.visitorFirstTierBonusPct,
    laterTierBonusPct: config.posters.visitorLaterTierBonusPct,
    maxBonusPct: config.posters.maxVisitorBonusPct,
    config
  });
}

export function getPosterPurchaseBonusPct(posters: number, config: EconomyConfig = defaultEconomyConfig): number {
  return getTieredPosterBonusPct({
    posters,
    firstTierBonusPct: config.posters.purchaseFirstTierBonusPct,
    laterTierBonusPct: config.posters.purchaseLaterTierBonusPct,
    maxBonusPct: config.posters.maxPurchaseBonusPct,
    config
  });
}

export function getPosterBonusPct(posters: number, config: EconomyConfig = defaultEconomyConfig): number {
  return getPosterVisitorBonusPct(posters, config);
}

export function getPosterVisitorMultiplier(posters: number, config: EconomyConfig = defaultEconomyConfig): number {
  return 1 + getPosterVisitorBonusPct(posters, config) / 100;
}

export function getPosterPurchaseMultiplier(posters: number, config: EconomyConfig = defaultEconomyConfig): number {
  return 1 + getPosterPurchaseBonusPct(posters, config) / 100;
}

export function getPosterMultiplier(posters: number, config: EconomyConfig = defaultEconomyConfig): number {
  return getPosterVisitorMultiplier(posters, config);
}

export function getMaxPrice(cupCost: number, config: EconomyConfig = defaultEconomyConfig): number {
  return config.pricing.maxPrice;
}

export function getSetupSpend(
  day: number,
  setup: SetupInput,
  config: EconomyConfig = defaultEconomyConfig
): number {
  return setup.cups * getCupCost(day, config) + getPosterSpend(setup.posters, config);
}

export function validateSetupForBalance(
  day: number,
  balance: number,
  setup: SetupInput,
  config: EconomyConfig = defaultEconomyConfig
): SetupValidationResult {
  const cupCost = getCupCost(day, config);
  const spend = getSetupSpend(day, setup, config);
  const maxPrice = getMaxPrice(cupCost, config);

  if (setup.posters > getMaxPosters(config)) {
    return { ok: false, reason: "TOO_MANY_POSTERS", spend, maxPrice };
  }

  if (spend > balance) {
    return { ok: false, reason: "INSUFFICIENT_FUNDS", spend, maxPrice };
  }

  if ((setup.cups > 0 || setup.posters > 0) && setup.price === 0) {
    return { ok: false, reason: "PRICE_REQUIRED", spend, maxPrice };
  }

  if (setup.price > maxPrice) {
    return { ok: false, reason: "PRICE_TOO_HIGH", spend, maxPrice };
  }

  return { ok: true, spend, maxPrice };
}

export function getPriceMultiplier(
  price: number,
  cupCost: number,
  priceToleranceModifier: number,
  config: EconomyConfig = defaultEconomyConfig
): number {
  const comfortablePrice =
    cupCost * config.pricing.comfortablePriceCostMultiplier * priceToleranceModifier;

  if (price <= comfortablePrice) {
    const discount = comfortablePrice === 0 ? 0 : (comfortablePrice - price) / comfortablePrice;
    return Math.min(1.25, 1 + discount * 0.25);
  }

  const markupRatio = price / Math.max(comfortablePrice, 1);

  return Math.pow(markupRatio, -config.pricing.overpricedPenaltyExponent);
}

export function getPurchaseChance({
  price,
  cupCost,
  posters,
  weather,
  event,
  config = defaultEconomyConfig,
  basePurchaseChance = 0.45
}: {
  price: number;
  cupCost: number;
  posters: number;
  weather: WeatherResult;
  event?: EventModifier | null;
  config?: EconomyConfig;
  basePurchaseChance?: number;
}): number {
  const eventModifier = event ?? {
    visitorModifier: 1,
    purchaseModifier: 1,
    priceToleranceModifier: 1
  };
  const priceMultiplier = getPriceMultiplier(
    price,
    cupCost,
    weather.priceToleranceModifier * eventModifier.priceToleranceModifier,
    config
  );
  const chance =
    basePurchaseChance *
    weather.purchaseModifier *
    eventModifier.purchaseModifier *
    getPosterPurchaseMultiplier(posters, config) *
    priceMultiplier;

  return clamp(chance, config.pricing.minPurchaseChance, config.pricing.maxPurchaseChance);
}

function simulateVisitorSales({
  cupsMade,
  potentialVisitors,
  purchaseChance,
  random
}: {
  cupsMade: number;
  potentialVisitors: number;
  purchaseChance: number;
  random: () => number;
}): {
  observedVisitors: number;
  potentialBuyers: number;
  soldCups: number;
} {
  let potentialBuyers = 0;
  let soldCups = 0;
  let sellOutVisitorCount: number | null = null;

  for (let visitorIndex = 0; visitorIndex < potentialVisitors; visitorIndex += 1) {
    if (random() > purchaseChance) {
      continue;
    }

    potentialBuyers += 1;

    if (soldCups < cupsMade) {
      soldCups += 1;

      if (soldCups === cupsMade) {
        sellOutVisitorCount = visitorIndex + 1;
      }
    }
  }

  return {
    observedVisitors: sellOutVisitorCount ?? potentialVisitors,
    potentialBuyers,
    soldCups
  };
}

export function simulateDay({
  day,
  startingBalance,
  setup,
  seed,
  weather,
  event = null,
  config = defaultEconomyConfig,
  autoSubmitted = false
}: {
  day: number;
  startingBalance: number;
  setup: SetupInput;
  seed: string;
  weather: WeatherResult;
  event?: EventModifier | null;
  config?: EconomyConfig;
  autoSubmitted?: boolean;
}): PlayerDayResult {
  const validation = validateSetupForBalance(day, startingBalance, setup, config);

  if (!validation.ok) {
    throw new Error(validation.reason);
  }

  const random = createSeededRandom(seed);
  const cupCost = getCupCost(day, config);
  const posterCost = getPosterCost(day, config);
  const posterSpend = getPosterSpend(setup.posters, config);
  const eventModifier = event ?? {
    visitorModifier: 1,
    purchaseModifier: 1,
    priceToleranceModifier: 1
  };
  const posterMultiplier = getPosterVisitorMultiplier(setup.posters, config);
  const baseVisitors = config.visitors.base + (day - 1) * config.visitors.perDayGrowth;
  const variationPct = config.visitors.randomVariationPct / 100;
  const randomVariation = 1 + (random() * 2 - 1) * variationPct;
  const potentialVisitors = seededRound(
    baseVisitors *
      weather.visitorModifier *
      eventModifier.visitorModifier *
      posterMultiplier *
      randomVariation,
    random
  );
  const purchaseChance = getPurchaseChance({
    price: setup.price,
    cupCost,
    posters: setup.posters,
    weather,
    event,
    config
  });
  const { observedVisitors, potentialBuyers, soldCups } = simulateVisitorSales({
    cupsMade: setup.cups,
    potentialVisitors,
    purchaseChance,
    random
  });
  const revenue = soldCups * setup.price;
  const spend = validation.spend;
  const profit = revenue - spend;

  return {
    startingBalance,
    cupCost,
    posterCost,
    posterSpend,
    setup,
    observedVisitors,
    potentialVisitors,
    potentialBuyers,
    soldCups,
    revenue,
    spend,
    profit,
    endingBalance: startingBalance - spend + revenue,
    purchaseChance,
    autoSubmitted
  };
}

export function getTriviaQuestionCount(rewardPct: number): number {
  if (rewardPct >= 9) {
    return 3;
  }

  if (rewardPct >= 2) {
    return 2;
  }

  return 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
