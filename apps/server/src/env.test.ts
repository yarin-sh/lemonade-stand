import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

describe("env validation", () => {
  it("defaults local development settings", () => {
    const env = parseEnv({});

    expect(env.HOST).toBe("127.0.0.1");
    expect(env.PORT).toBe(3001);
    expect(env.ROOM_TTL_MINUTES).toBe(120);
  });

  it("allows production without database or admin settings", () => {
    const env = parseEnv({
      NODE_ENV: "production",
      SAVE_ENCRYPTION_SECRET: "production-save-secret-at-least-32-characters"
    });

    expect(env.NODE_ENV).toBe("production");
  });

  it("requires a save encryption secret in production", () => {
    expect(() => parseEnv({ NODE_ENV: "production" })).toThrow();
  });
});
