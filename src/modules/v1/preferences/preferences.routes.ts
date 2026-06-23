import { FastifyInstance } from "fastify";
import {
  getMyPreferencesHandler,
  updateMyPreferencesHandler,
} from "./preferences.controller.js";
import { authenticate } from "../../../utils/auth.js";

const markaTypeProperty = {
  type: "string" as const,
  description: 'Marka display type (default: "GatePass")',
  default: "GatePass",
};

const preferencesDataProperties = {
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
  labourCost: { type: "number" },
  stockFilter: {
    type: "object",
    properties: {
      enabled: { type: "boolean" },
      options: {
        type: "array",
        items: { type: "string" },
      },
    },
  },
  customMarka: { type: "boolean" },
  markaType: markaTypeProperty,
  customFields: {
    type: "object",
    additionalProperties: true,
  },
  createdAt: { type: "string", format: "date-time" },
  updatedAt: { type: "string", format: "date-time" },
};

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
          "Get preferences for the authenticated store admin's cold storage (includes markaType, default GatePass)",
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
          "Update preferences for the authenticated store admin's cold storage. Updatable fields include markaType (string, default GatePass).",
        tags: ["Preferences"],
        summary: "Update my cold storage preferences",
        body: {
          type: "object",
          minProperties: 1,
          properties: {
            commodities: {
              type: "array",
              items: {
                type: "object",
                required: ["name"],
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
            labourCost: { type: "number", minimum: 0 },
            stockFilter: {
              type: "object",
              required: ["enabled"],
              properties: {
                enabled: { type: "boolean" },
                options: {
                  type: "array",
                  items: { type: "string" },
                },
              },
            },
            customMarka: { type: "boolean" },
            markaType: {
              ...markaTypeProperty,
              minLength: 1,
            },
            customFields: {
              type: "object",
              additionalProperties: true,
            },
          },
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
