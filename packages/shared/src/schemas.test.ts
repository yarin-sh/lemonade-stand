import { describe, expect, it } from "vitest";
import {
  defaultRoomSettings,
  nicknameSchema,
  roomSettingsSchema,
  setupInputSchema
} from "./schemas";

describe("shared schemas", () => {
  it("parses default room settings", () => {
    expect(roomSettingsSchema.parse(defaultRoomSettings)).toMatchObject({
      mode: "first_to_coins",
      targetCoins: 500,
      weatherMode: "shared"
    });
  });

  it("rejects negative setup values", () => {
    expect(() => setupInputSchema.parse({ cups: -1, posters: 0, price: 0 })).toThrow();
  });

  it("trims and validates nicknames", () => {
    expect(nicknameSchema.parse("  Alon  ")).toBe("Alon");
    expect(() => nicknameSchema.parse("!")).toThrow();
  });
});
