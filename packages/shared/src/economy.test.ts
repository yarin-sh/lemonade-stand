import { describe, expect, it } from "vitest";
import {
  defaultEconomyConfig,
  generateWeather,
  getCupCost,
  getMaxPosters,
  getMaxPrice,
  getPosterBonusPct,
  getPosterCost,
  getPosterPurchaseBonusPct,
  getPosterSpend,
  getPosterUnitCost,
  getPosterVisitorBonusPct,
  getPurchaseChance,
  getTriviaQuestionCount,
  simulateDay,
  validateSetupForBalance,
  weatherResults
} from "./economy";

describe("economy helpers", () => {
  it("scales cup cost by day", () => {
    expect(getCupCost(1)).toBe(5);
    expect(getCupCost(10)).toBe(5);
    expect(getCupCost(11)).toBe(6);
    expect(getCupCost(21)).toBe(7);
  });

  it("prices posters by cart tier", () => {
    expect(getPosterCost(1)).toBe(10);
    expect(getPosterUnitCost(3)).toBe(10);
    expect(getPosterUnitCost(4)).toBe(15);
    expect(getPosterUnitCost(7)).toBe(25);
    expect(getPosterUnitCost(11)).toBe(40);
    expect(getPosterSpend(0)).toBe(0);
    expect(getPosterSpend(3)).toBe(30);
    expect(getPosterSpend(6)).toBe(75);
    expect(getPosterSpend(10)).toBe(175);
    expect(getPosterSpend(20)).toBe(575);
    expect(getMaxPosters()).toBe(20);
  });

  it("applies smaller poster returns and caps visitor and purchase bonuses", () => {
    expect(getPosterBonusPct(0)).toBe(0);
    expect(getPosterVisitorBonusPct(6)).toBe(42);
    expect(getPosterVisitorBonusPct(7)).toBe(43);
    expect(getPosterVisitorBonusPct(20)).toBe(56);
    expect(getPosterPurchaseBonusPct(6)).toBeCloseTo(14.4, 5);
    expect(getPosterPurchaseBonusPct(7)).toBeCloseTo(15.1, 5);
    expect(getPosterPurchaseBonusPct(20)).toBe(24);
  });

  it("validates spending and max price", () => {
    expect(getMaxPrice(5)).toBe(1000);
    expect(validateSetupForBalance(1, 100, { cups: 10, posters: 0, price: 1000 })).toMatchObject({
      ok: true,
      spend: 50,
      maxPrice: 1000
    });
    expect(validateSetupForBalance(1, 10, { cups: 10, posters: 0, price: 5 })).toMatchObject({
      ok: false,
      reason: "INSUFFICIENT_FUNDS"
    });
    expect(validateSetupForBalance(1, 100, { cups: 1, posters: 0, price: 1001 })).toMatchObject({
      ok: false,
      reason: "PRICE_TOO_HIGH"
    });
    expect(validateSetupForBalance(1, 100, { cups: 1, posters: 0, price: 0 })).toMatchObject({
      ok: false,
      reason: "PRICE_REQUIRED"
    });
    expect(validateSetupForBalance(1, 100, { cups: 0, posters: 1, price: 0 })).toMatchObject({
      ok: false,
      reason: "PRICE_REQUIRED"
    });
    expect(validateSetupForBalance(1, 10000, { cups: 1, posters: 21, price: 5 })).toMatchObject({
      ok: false,
      reason: "TOO_MANY_POSTERS"
    });
  });

  it("clamps purchase chance boundaries", () => {
    const highChance = getPurchaseChance({
      price: 0,
      cupCost: 5,
      posters: 30,
      weather: weatherResults.extremely_hot_dry,
      basePurchaseChance: 1
    });
    const lowChance = getPurchaseChance({
      price: 1000,
      cupCost: 5,
      posters: 0,
      weather: weatherResults.thunder_storm,
      basePurchaseChance: 0.01
    });

    expect(highChance).toBe(defaultEconomyConfig.pricing.maxPurchaseChance);
    expect(lowChance).toBe(defaultEconomyConfig.pricing.minPurchaseChance);
  });

  it("punishes extreme prices by markup over comfortable price", () => {
    expect(getPurchaseChance({
      price: 20,
      cupCost: 5,
      posters: 2,
      weather: weatherResults.hot
    })).toBeCloseTo(0.245, 3);
    expect(getPurchaseChance({
      price: 200,
      cupCost: 5,
      posters: 2,
      weather: weatherResults.hot
    })).toBeCloseTo(0.01, 3);
    expect(getPurchaseChance({
      price: 1000,
      cupCost: 5,
      posters: 2,
      weather: weatherResults.hot
    })).toBe(defaultEconomyConfig.pricing.minPurchaseChance);
  });

  it("rolls sales per visitor instead of using an exact average", () => {
    const result = simulateDay({
      day: 1,
      startingBalance: 10000,
      setup: { cups: 200, posters: 0, price: 50 },
      seed: "rng-c",
      weather: weatherResults.warm
    });

    expect(result.potentialBuyers).toBe(4);
    expect(result.potentialBuyers).not.toBe(Math.round(result.potentialVisitors * result.purchaseChance));
  });

  it("supports zero-spend days without negative balances", () => {
    const result = simulateDay({
      day: 1,
      startingBalance: 100,
      setup: { cups: 0, posters: 0, price: 0 },
      seed: "zero-spend",
      weather: weatherResults.warm
    });

    expect(result.spend).toBe(0);
    expect(result.soldCups).toBe(0);
    expect(result.endingBalance).toBe(100);
  });

  it("uses observed visitors when cups sell out", () => {
    const result = simulateDay({
      day: 1,
      startingBalance: 100,
      setup: { cups: 1, posters: 0, price: 1 },
      seed: "sell-out",
      weather: weatherResults.hot
    });

    expect(result.soldCups).toBe(1);
    expect(result.observedVisitors).toBeLessThanOrEqual(result.potentialVisitors);
  });

  it("generates deterministic special weather from seeds", () => {
    const thunderSeed = findSeedForWeather("thunder_storm");
    const drySeed = findSeedForWeather("extremely_hot_dry");

    expect(generateWeather(thunderSeed).id).toBe("thunder_storm");
    expect(generateWeather(drySeed).id).toBe("extremely_hot_dry");
  });

  it("maps trivia reward percentage to question count", () => {
    expect(getTriviaQuestionCount(1)).toBe(1);
    expect(getTriviaQuestionCount(2)).toBe(2);
    expect(getTriviaQuestionCount(8)).toBe(2);
    expect(getTriviaQuestionCount(9)).toBe(3);
    expect(getTriviaQuestionCount(10)).toBe(3);
  });
});

function findSeedForWeather(weatherId: string): string {
  for (let index = 0; index < 10_000; index += 1) {
    const seed = `weather-${weatherId}-${index}`;

    if (generateWeather(seed).id === weatherId) {
      return seed;
    }
  }

  throw new Error(`No deterministic seed found for ${weatherId}`);
}
