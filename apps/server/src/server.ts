import cors from "@fastify/cors";
import Fastify from "fastify";
import { Server as SocketServer } from "socket.io";
import { socketEvents } from "@lemonade-game/shared";
import type { AppEnv } from "./env";
import { getCorsOrigins, getSaveEncryptionSecret } from "./env";
import { registerRoomHandlers } from "./rooms";
import { registerSingleplayerHandlers } from "./singleplayer";

type BuildServerOptions = {
  env: AppEnv;
  logger?: boolean;
};

export async function buildServer({ env, logger = true }: BuildServerOptions) {
  const app = Fastify({ logger });
  const corsOrigins = getCorsOrigins(env);

  await app.register(cors, {
    origin: corsOrigins,
    credentials: true
  });

  app.get("/health", async () => ({
    ok: true,
    service: "lemonade-game-server",
    state: "memory"
  }));

  const io = new SocketServer(app.server, {
    cors: {
      origin: corsOrigins,
      credentials: true
    }
  });

  io.on("connection", (socket) => {
    socket.emit(socketEvents.server.serverHello, {
      message: "Connected to Lemonade Game.",
      socketId: socket.id
    });

    socket.on(socketEvents.client.ping, () => {
      socket.emit(socketEvents.server.pong, { at: new Date().toISOString() });
    });
  });

  registerRoomHandlers(io);
  registerSingleplayerHandlers(io, { saveSecret: getSaveEncryptionSecret(env) });

  return { app, io };
}
