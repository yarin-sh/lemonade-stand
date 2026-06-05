import { describe, expect, it } from "vitest";
import {
  getCupCost,
  getMaxPosters,
  getMaxPrice,
  getSetupSpend,
  simulateDay,
  weatherResults
} from "@lemonade-game/shared";
import {
  createAutoPlayerSetup,
  getAutoPlayerGainMultiplier,
  runAutoPlayer,
  type SingleplayerState
} from "./singleplayer";

function createState(overrides: Partial<SingleplayerState> = {}): SingleplayerState {
  return {
    seed: "auto-player-test-seed",
    phase: "SETUP",
    day: 1,
    coins: 100,
    weather: weatherResults.warm,
    ...overrides
  };
}

describe("singleplayer auto player", () => {
  it("makes larger and pricier setup choices as risk increases", () => {
    const safe = createAutoPlayerSetup({
      coins: 100,
      day: 1,
      riskProfile: "safe",
      weather: weatherResults.warm
    });
    const balanced = createAutoPlayerSetup({
      coins: 100,
      day: 1,
      riskProfile: "balanced",
      weather: weatherResults.warm
    });
    const risky = createAutoPlayerSetup({
      coins: 100,
      day: 1,
      riskProfile: "risky",
      weather: weatherResults.warm
    });
    const wild = createAutoPlayerSetup({
      coins: 100,
      day: 1,
      riskProfile: "wild",
      weather: weatherResults.warm
    });

    expect(safe).toEqual({ cups: 5, posters: 1, price: 11 });
    expect(balanced).toEqual({ cups: 9, posters: 1, price: 17 });
    expect(risky).toEqual({ cups: 11, posters: 2, price: 33 });
    expect(wild).toEqual({ cups: 13, posters: 3, price: 55 });
  });

  it("keeps setup choices inside normal player caps and budget", () => {
    for (const riskProfile of ["safe", "balanced", "risky", "wild"] as const) {
      const setup = createAutoPlayerSetup({
        coins: 250,
        day: 21,
        riskProfile,
        weather: weatherResults.extremely_hot_dry
      });

      expect(getSetupSpend(21, setup)).toBeLessThanOrEqual(250);
      expect(setup.cups).toBeGreaterThanOrEqual(1);
      expect(setup.posters).toBeLessThanOrEqual(getMaxPosters());
      expect(setup.price).toBeLessThanOrEqual(getMaxPrice(getCupCost(21)));
    }
  });

  it("applies gain debuffs by risk profile", () => {
    const gainMultipliers = {
      safe: 0.85,
      balanced: 0.8,
      risky: 0.75,
      wild: 0.7
    } as const;

    for (const riskProfile of ["safe", "balanced", "risky", "wild"] as const) {
      expect(getAutoPlayerGainMultiplier(riskProfile)).toBe(gainMultipliers[riskProfile]);

      const state = createState();
      const result = runAutoPlayer(state, {
        riskProfile,
        days: 1,
        stopBalance: 0
      });
      const log = result.logs[0];

      if (!log) {
        throw new Error(`Expected ${riskProfile} auto-run log.`);
      }

      const rawResult = simulateDay({
        day: log.day,
        startingBalance: log.result.startingBalance,
        setup: log.setup,
        seed: `${state.seed}:day:${log.day}`,
        weather: log.weather,
        autoSubmitted: true
      });

      expect(log.result.revenue).toBe(Math.floor(rawResult.revenue * gainMultipliers[riskProfile]));
      expect(log.result.profit).toBe(log.result.revenue - log.result.spend);
    }
  });

  it("simulates requested days and advances to the next weather reveal", () => {
    const state = createState();
    const result = runAutoPlayer(state, {
      riskProfile: "balanced",
      days: 3,
      stopBalance: 0
    });

    expect(result.completedDays).toBe(3);
    expect(result.logs).toHaveLength(3);
    expect(result.startingDay).toBe(1);
    expect(result.endingDay).toBe(4);
    expect(result.stopReason).toBe("requested_days");
    expect(result.totalProfit).toBe(result.endingCoins - result.startingCoins);
    expect(result.totalRevenue).toBe(result.logs.reduce((sum, log) => sum + log.result.revenue, 0));
    expect(result.logs.every((log) => log.result.autoSubmitted)).toBe(true);
    expect(state.phase).toBe("WEATHER_REVEAL");
    expect(state.day).toBe(4);
    expect(state.coins).toBe(result.endingCoins);
    expect(state.trivia).toBeUndefined();
  });

  it("stops early when the run reaches the configured stop balance", () => {
    const state = createState({
      weather: weatherResults.thunder_storm
    });
    const result = runAutoPlayer(state, {
      riskProfile: "wild",
      days: 5,
      stopBalance: 99
    });

    expect(result.completedDays).toBe(1);
    expect(result.stopReason).toBe("stop_balance");
    expect(result.endingCoins).toBeLessThanOrEqual(99);
    expect(state.phase).toBe("WEATHER_REVEAL");
  });

  it("ends immediately if the stand cannot afford one cup", () => {
    const state = createState({
      coins: getCupCost(1) - 1
    });
    const result = runAutoPlayer(state, {
      riskProfile: "safe",
      days: 3,
      stopBalance: 0
    });

    expect(result.completedDays).toBe(0);
    expect(result.logs).toEqual([]);
    expect(result.stopReason).toBe("broke");
    expect(state.phase).toBe("GAME_OVER");
    expect(state.day).toBe(1);
  });
});
