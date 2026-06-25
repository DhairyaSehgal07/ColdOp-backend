import { FastifyInstance } from "fastify";
import {
  getMyPreferencesHandler,
  updateMyPreferencesHandler,
} from "./preferences.controller.js";
import { authenticate } from "../../../utils/auth.js";
import {
  preferencesDataProperties,
  updatePreferencesBodyProperties,
} from "./preferences.schema.js";

const preferencesErrorResponse = {
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
};

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
          "Get preferences for the authenticated store admin's cold storage (includes markaType, showViewFilters, default GatePass for markaType)",
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
                properties: preferencesDataProperties,
              },
            },
          },
          401: {
            description: "Unauthorized or cold storage not associated",
            ...preferencesErrorResponse,
          },
          404: {
            description: "Cold storage or preferences not found",
            ...preferencesErrorResponse,
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

  // Update preferences for the current logged-in store-admin's cold storage
  fastify.patch(
    "/me",
    {
      schema: {
        description:
          "Update preferences for the authenticated store admin's cold storage. Updatable fields include markaType (string, default GatePass) and showViewFilters (boolean, optional).",
        tags: ["Preferences"],
        summary: "Update my cold storage preferences",
        body: {
          type: "object",
          minProperties: 1,
          properties: updatePreferencesBodyProperties,
        },
        response: {
          200: {
            description: "Preferences updated successfully",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: preferencesDataProperties,
              },
              message: { type: "string" },
            },
          },
          400: {
            description: "Bad request – invalid or missing fields",
            ...preferencesErrorResponse,
          },
          401: {
            description: "Unauthorized or cold storage not associated",
            ...preferencesErrorResponse,
          },
          404: {
            description: "Cold storage or preferences not found",
            ...preferencesErrorResponse,
          },
        },
      },
      preHandler: [authenticate],
      config: {
        rateLimit: {
          max: 30,
          timeWindow: "1 minute",
        },
      },
    },
    updateMyPreferencesHandler as never,
  );
}
