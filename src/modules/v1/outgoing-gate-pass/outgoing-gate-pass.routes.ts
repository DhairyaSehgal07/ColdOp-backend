import { FastifyInstance } from "fastify";
import { createOutgoingGatePassHandler } from "./outgoing-gate-pass.controller.js";
import { createOutgoingGatePassSchema } from "./outgoing-gate-pass.schema.js";
import { authenticate } from "../../../utils/auth.js";

/**
 * Register outgoing gate pass routes (nikasi-style flow).
 * @param fastify - Fastify instance
 */
export async function outgoingGatePassRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/",
    {
      schema: {
        ...createOutgoingGatePassSchema,
        description:
          "Create a new outgoing gate pass from incoming gate pass allocations",
        tags: ["Outgoing Gate Pass"],
        summary: "Create outgoing gate pass",
        response: {
          201: {
            description: "Outgoing gate pass created successfully",
            type: "object",
            properties: {
              status: { type: "string" },
              message: { type: "string" },
              data: { type: "object", additionalProperties: true },
            },
          },
          400: {
            description: "Bad request",
            type: "object",
            properties: {
              status: { type: "string" },
              statusCode: { type: "number" },
              errorCode: { type: "string" },
              message: { type: "string" },
            },
          },
          404: {
            description: "Incoming gate pass not found",
            type: "object",
            properties: {
              status: { type: "string" },
              statusCode: { type: "number" },
              errorCode: { type: "string" },
              message: { type: "string" },
            },
          },
          409: {
            description: "Conflict - gate pass number already exists",
            type: "object",
            properties: {
              status: { type: "string" },
              statusCode: { type: "number" },
              errorCode: { type: "string" },
              message: { type: "string" },
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
    createOutgoingGatePassHandler as never,
  );
}
