import crypto from "node:crypto";
import {
  type SingleplayerSaveData,
  type SingleplayerSavedTrivia,
  type SingleplayerSavePayload
} from "@lemonade-game/shared";

const saveTokenVersion = "v1";
const saveTokenAlgorithm = "aes-256-gcm";
const saveTokenIvBytes = 12;

export function createSingleplayerSaveData(
  payload: SingleplayerSavePayload,
  saveSecret: string
): SingleplayerSaveData {
  return {
    version: 2,
    preview: {
      configVersion: payload.configVersion,
      day: payload.day,
      coins: payload.coins,
      savedAt: payload.savedAt
    },
    token: encryptSavePayload(payload, saveSecret)
  };
}

export function readSingleplayerSaveData(
  saveData: unknown,
  saveSecret: string
): SingleplayerSavePayload | null {
  if (!isSingleplayerSaveData(saveData)) {
    return null;
  }

  const payload = decryptSavePayload(saveData.token, saveSecret);

  if (!payload || !doesPreviewMatchPayload(saveData.preview, payload)) {
    return null;
  }

  return payload;
}

function encryptSavePayload(payload: SingleplayerSavePayload, saveSecret: string): string {
  const iv = crypto.randomBytes(saveTokenIvBytes);
  const cipher = crypto.createCipheriv(saveTokenAlgorithm, getSaveKey(saveSecret), iv);
  const plaintext = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    saveTokenVersion,
    iv.toString("base64url"),
    encrypted.toString("base64url"),
    authTag.toString("base64url")
  ].join(".");
}

function decryptSavePayload(token: string, saveSecret: string): SingleplayerSavePayload | null {
  const [version, ivText, encryptedText, authTagText] = token.split(".");

  if (
    version !== saveTokenVersion ||
    !ivText ||
    !encryptedText ||
    !authTagText
  ) {
    return null;
  }

  try {
    const decipher = crypto.createDecipheriv(
      saveTokenAlgorithm,
      getSaveKey(saveSecret),
      Buffer.from(ivText, "base64url")
    );

    decipher.setAuthTag(Buffer.from(authTagText, "base64url"));

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encryptedText, "base64url")),
      decipher.final()
    ]).toString("utf8");
    const parsed = JSON.parse(plaintext);

    return isSingleplayerSavePayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getSaveKey(saveSecret: string): Buffer {
  return crypto.createHash("sha256").update(saveSecret).digest();
}

function doesPreviewMatchPayload(
  preview: SingleplayerSaveData["preview"],
  payload: SingleplayerSavePayload
): boolean {
  return (
    preview.configVersion === payload.configVersion &&
    preview.day === payload.day &&
    preview.coins === payload.coins &&
    preview.savedAt === payload.savedAt
  );
}

function isSingleplayerSaveData(value: unknown): value is SingleplayerSaveData {
  if (!isRecord(value) || value.version !== 2 || typeof value.token !== "string" || value.token.length === 0) {
    return false;
  }

  return isRecord(value.preview) && isSingleplayerSavePreview(value.preview);
}

function isSingleplayerSavePreview(value: Record<string, unknown>): value is SingleplayerSaveData["preview"] {
  return (
    typeof value.configVersion === "string" &&
    value.configVersion.length > 0 &&
    typeof value.day === "number" &&
    Number.isInteger(value.day) &&
    value.day >= 1 &&
    typeof value.coins === "number" &&
    Number.isFinite(value.coins) &&
    value.coins >= 0 &&
    typeof value.savedAt === "number" &&
    Number.isInteger(value.savedAt) &&
    value.savedAt > 0
  );
}

function isSingleplayerSavePayload(value: unknown): value is SingleplayerSavePayload {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.version === 1 &&
    typeof value.configVersion === "string" &&
    value.configVersion.length > 0 &&
    typeof value.seed === "string" &&
    value.seed.length > 0 &&
    isSingleplayerSavePhase(value.phase) &&
    typeof value.day === "number" &&
    Number.isInteger(value.day) &&
    value.day >= 1 &&
    typeof value.coins === "number" &&
    Number.isFinite(value.coins) &&
    value.coins >= 0 &&
    typeof value.savedAt === "number" &&
    Number.isInteger(value.savedAt) &&
    value.savedAt > 0 &&
    (value.lastResult === undefined || isRecord(value.lastResult)) &&
    (
      value.phase === "TRIVIA"
        ? isSingleplayerSavedTrivia(value.trivia)
        : value.trivia === undefined
    )
  );
}

function isSingleplayerSavePhase(value: unknown): value is SingleplayerSavePayload["phase"] {
  return (
    value === "WEATHER_REVEAL" ||
    value === "SPECIAL_REVEAL" ||
    value === "SETUP" ||
    value === "SUMMARY" ||
    value === "TRIVIA"
  );
}

function isSingleplayerSavedTrivia(value: unknown): value is SingleplayerSavedTrivia {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.rewardPct === "number" &&
    Number.isInteger(value.rewardPct) &&
    value.rewardPct >= 1 &&
    value.rewardPct <= 10 &&
    typeof value.rewardCoins === "number" &&
    Number.isInteger(value.rewardCoins) &&
    value.rewardCoins >= 0 &&
    typeof value.requiredQuestions === "number" &&
    Number.isInteger(value.requiredQuestions) &&
    value.requiredQuestions >= 1 &&
    value.requiredQuestions <= 3 &&
    typeof value.currentQuestionIndex === "number" &&
    Number.isInteger(value.currentQuestionIndex) &&
    value.currentQuestionIndex >= 0 &&
    value.currentQuestionIndex <= value.requiredQuestions &&
    isTriviaStatus(value.status) &&
    Array.isArray(value.questions) &&
    value.questions.length === value.requiredQuestions &&
    value.questions.every(isSingleplayerSavedTriviaQuestion)
  );
}

function isSingleplayerSavedTriviaQuestion(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.question === "string" &&
    value.question.length > 0 &&
    Array.isArray(value.choices) &&
    value.choices.length === 4 &&
    value.choices.every((choice) => typeof choice === "string" && choice.length > 0) &&
    typeof value.correctAnswerIndex === "number" &&
    Number.isInteger(value.correctAnswerIndex) &&
    value.correctAnswerIndex >= 0 &&
    value.correctAnswerIndex < value.choices.length
  );
}

function isTriviaStatus(value: unknown): value is SingleplayerSavedTrivia["status"] {
  return (
    value === "active" ||
    value === "passed" ||
    value === "failed"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
