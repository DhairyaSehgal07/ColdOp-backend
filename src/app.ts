import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { config } from "dotenv";
import { coldStorageRoutes } from "./modules/v1/cold-storage/cold-storage.routes";
import { storeAdminRoutes } from "./modules/v1/store-admin/store-admin.routes";
config();

export const buildApp = async (): Promise<FastifyInstance> => {
  const fastify: FastifyInstance = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || "info",
      transport:
        process.env.NODE_ENV === "development"
          ? {
              target: "pino-pretty",
              options: {
                colorize: true,
                translateTime: "HH:MM:ss Z", // timestamp
                ignore: "pid,hostname",
              },
            }
          : undefined,
    },
  });

  // Register security headers (helmet)
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  // Register CORS
  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true, // ✅ allow cookies
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  // Register Cookie plugin
  await fastify.register(cookie);

  // Register JWT plugin
  await fastify.register(jwt, {
    secret: process.env.AUTH_SECRET || "your-secret-key-change-in-production",
  });

  // Register rate limiter plugin (global: false to apply only where configured)
  await fastify.register(rateLimit, {
    global: false,
  });

  // Register routes
  await fastify.register(coldStorageRoutes, {
    prefix: "/api/v1/cold-storage",
  });

  await fastify.register(storeAdminRoutes, {
    prefix: "/api/v1/store-admin",
  });

  // Health check endpoint
  fastify.get("/health", () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "Bhatti-backend",
  }));

  // Global error handler
  fastify.setErrorHandler((error: Error, _request, reply) => {
    fastify.log.error(error, "Unhandled error");
    void reply.code(500).send({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message:
          process.env.NODE_ENV === "development"
            ? error.message
            : "An unexpected error occurred",
      },
    });
  });

  return fastify;
};
