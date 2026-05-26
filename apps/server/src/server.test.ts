import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";
import { buildServer } from "./server";

describe("server", () => {
  it("responds to the health check", async () => {
    const env = parseEnv({ NODE_ENV: "test" });
    const { app, io } = await buildServer({ env, logger: false });

    const response = await app.inject({ method: "GET", url: "/health" });

    io.close();
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      service: "lemonade-game-server",
      state: "memory"
    });
  });
});
