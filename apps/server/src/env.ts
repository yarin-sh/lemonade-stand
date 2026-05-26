import { z } from "zod";

const emptyStringToUndefined = (value: unknown) => (value === "" ? undefined : value);

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().min(1).default("127.0.0.1"),
    PORT: z.coerce.number().int().positive().default(3001),
    CLIENT_ORIGIN: z.string().url().default("http://127.0.0.1:5173"),
    SERVER_PUBLIC_URL: z.preprocess(
      emptyStringToUndefined,
      z.string().url().optional()
    ),
    SOCKET_CORS_ORIGINS: z.preprocess(
      emptyStringToUndefined,
      z.string().optional()
    ),
    ROOM_TTL_MINUTES: z.coerce.number().int().positive().default(120),
    SAVE_ENCRYPTION_SECRET: z.preprocess(
      emptyStringToUndefined,
      z.string().min(32).optional()
    )
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && !env.SAVE_ENCRYPTION_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SAVE_ENCRYPTION_SECRET is required in production.",
        path: ["SAVE_ENCRYPTION_SECRET"]
      });
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(input: NodeJS.ProcessEnv): AppEnv {
  return envSchema.parse(input);
}

export function getCorsOrigins(env: AppEnv): string[] {
  const configured = env.SOCKET_CORS_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configured?.length) {
    return configured;
  }

  if (env.NODE_ENV === "development" || env.NODE_ENV === "test") {
    return Array.from(new Set([env.CLIENT_ORIGIN, "http://localhost:5173"]));
  }

  return [env.CLIENT_ORIGIN];
}

export function getSaveEncryptionSecret(env: AppEnv): string {
  return env.SAVE_ENCRYPTION_SECRET ?? "dev-only-local-save-secret-change-before-production";
}
