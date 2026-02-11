import { FastifyInstance } from "fastify";
import { getMyPreferencesHandler } from "./preferences.controller.js";
import { authenticate } from "../../../utils/auth.js";

/**
 * Register preferences routes.
 * @param fastify - Fastify instance
 */
export async function preferencesRoutes(fastify: FastifyInstance) {
  // Get preferences for the current logged-in store-admin's cold storage
  fastify.get(
    "/me",
    {
      schema: {
        description:
          "Get preferences for the authenticated store admin's cold storage",
        tags: ["Preferences"],
        summary: "Get my cold storage preferences",
        response: {
          200: {
            description: "Preferences for the current cold storage",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  _id: { type: "string" },
                  commodities: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        varieties: {
                          type: "array",
                          items: { type: "string" },
                        },
                        sizes: {
                          type: "array",
                          items: { type: "string" },
                        },
                      },
                    },
                  },
                  reportFormat: { type: "string" },
                  showFinances: { type: "boolean" },
                  customFields: {
                    type: "object",
                    additionalProperties: true,
                  },
                  createdAt: { type: "string", format: "date-time" },
                  updatedAt: { type: "string", format: "date-time" },
                },
              },
            },
          },
          401: {
            description: "Unauthorized or cold storage not associated",
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
            description: "Cold storage or preferences not found",
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
          max: 100,
          timeWindow: "1 minute",
        },
      },
    },
    getMyPreferencesHandler as never,
  );
}
