import { FastifyInstance } from "fastify";
import { createIncomingGatePassHandler } from "./incoming-gate-pass.controller.js";
import { createIncomingGatePassSchema } from "./incoming-gate-pass.schema.js";
import { authenticate } from "../../../utils/auth.js";

/**
 * Register incoming gate pass routes
 * @param fastify - Fastify instance
 */
export async function incomingGatePassRoutes(fastify: FastifyInstance) {
  // Create incoming gate pass
  fastify.post(
    "/",
    {
      schema: {
        ...createIncomingGatePassSchema,
        description: "Create a new incoming gate pass",
        tags: ["Incoming Gate Pass"],
        summary: "Create incoming gate pass",
        response: {
          201: {
            description: "Incoming gate pass created successfully",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: { type: "object", additionalProperties: true },
              message: { type: "string" },
            },
          },
          400: {
            description: "Bad request",
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          404: {
            description: "Farmer-storage-link not found",
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          409: {
            description: "Conflict - resource already exists",
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
      preHandler: [authenticate],
      config: {
        rateLimit: {
          max: 60,
          timeWindow: "1 minute",
        },
      },
    },
    createIncomingGatePassHandler as never,
  );
}
