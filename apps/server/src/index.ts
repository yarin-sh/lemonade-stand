import "dotenv/config";
import { parseEnv } from "./env";
import { buildServer } from "./server";

const env = parseEnv(process.env);
const { app, io } = await buildServer({ env });

const close = async () => {
  io.close();
  await app.close();
};

process.on("SIGINT", () => {
  close()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
});

process.on("SIGTERM", () => {
  close()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
});

await app.listen({ host: env.HOST, port: env.PORT });
