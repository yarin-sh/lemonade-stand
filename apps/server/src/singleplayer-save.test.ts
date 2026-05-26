import { describe, expect, it } from "vitest";
import {
  defaultEconomyConfig,
  type SingleplayerSavePayload
} from "@lemonade-game/shared";
import { createSingleplayerSaveData, readSingleplayerSaveData } from "./singleplayer-save";

const saveSecret = "test-save-secret-at-least-32-characters";

function createPayload(): SingleplayerSavePayload {
  return {
    version: 1,
    configVersion: defaultEconomyConfig.version,
    seed: "test-seed",
    phase: "WEATHER_REVEAL",
    day: 4,
    coins: 123,
    savedAt: 1779649000000
  };
}

describe("singleplayer save tokens", () => {
  it("round-trips encrypted save payloads", () => {
    const payload = createPayload();
    const saveData = createSingleplayerSaveData(payload, saveSecret);

    expect(saveData.preview).toEqual({
      configVersion: defaultEconomyConfig.version,
      day: 4,
      coins: 123,
      savedAt: 1779649000000
    });
    expect(saveData.token).not.toContain("test-seed");
    expect(readSingleplayerSaveData(saveData, saveSecret)).toEqual(payload);
  });

  it("round-trips active trivia state inside the encrypted token", () => {
    const payload: SingleplayerSavePayload = {
      ...createPayload(),
      phase: "TRIVIA",
      trivia: {
        rewardPct: 9,
        rewardCoins: 12,
        requiredQuestions: 1,
        currentQuestionIndex: 0,
        status: "active",
        questions: [
          {
            id: "lemons-origin",
            question: "Which fruit family do lemons belong to?",
            choices: ["Citrus", "Berry", "Melon", "Stone fruit"],
            correctAnswerIndex: 0
          }
        ]
      }
    };
    const saveData = createSingleplayerSaveData(payload, saveSecret);

    expect(saveData.token).not.toContain("correctAnswerIndex");
    expect(readSingleplayerSaveData(saveData, saveSecret)).toEqual(payload);
  });

  it("accepts older economy versions so saves can migrate after load", () => {
    const payload: SingleplayerSavePayload = {
      ...createPayload(),
      configVersion: "default-older-economy"
    };
    const saveData = createSingleplayerSaveData(payload, saveSecret);

    expect(readSingleplayerSaveData(saveData, saveSecret)).toEqual(payload);
  });

  it("rejects edited save tokens", () => {
    const saveData = createSingleplayerSaveData(createPayload(), saveSecret);
    const editedSaveData = {
      ...saveData,
      token: tamperTokenCiphertext(saveData.token)
    };

    expect(readSingleplayerSaveData(editedSaveData, saveSecret)).toBeNull();
  });

  it("rejects edited save previews", () => {
    const saveData = createSingleplayerSaveData(createPayload(), saveSecret);
    const editedSaveData = {
      ...saveData,
      preview: {
        ...saveData.preview,
        coins: 999999
      }
    };

    expect(readSingleplayerSaveData(editedSaveData, saveSecret)).toBeNull();
  });
});

function tamperTokenCiphertext(token: string): string {
  const parts = token.split(".");
  const ciphertext = parts[2] ?? "";
  const replacement = ciphertext[0] === "A" ? "B" : "A";

  parts[2] = `${replacement}${ciphertext.slice(1)}`;
  return parts.join(".");
}
