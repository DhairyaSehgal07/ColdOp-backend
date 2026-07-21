import { FastifyInstance } from "fastify";
import {
  createColdStorageHandler,
  getColdStoragesHandler,
} from "./cold-storage.controller.js";
import {
  getPreferencesHandler,
  updatePreferencesHandler,
} from "../preferences/preferences.controller.js";
import { Plan } from "./cold-storage.model.js";
import {
  chambersJsonSchema,
  createColdStorageSchema,
  getColdStoragesQuerySchema,
  storageLayoutJsonSchema,
} from "./cold-storage.schema.js";

/** Reusable error response schema for OpenAPI */
const errorResponse = {
  type: "object" as const,
  properties: {
    success: { type: "boolean" as const, const: false },
    error: {
      type: "object" as const,
      properties: {
        code: { type: "string" },
        message: { type: "string" },
      },
      required: ["code", "message"],
    },
  },
  required: ["success", "error"],
};

/**
 * Register cold storage routes
 * @param fastify - Fastify instance
 */
export async function coldStorageRoutes(fastify: FastifyInstance) {
  // Create cold storage endpoint
  fastify.post(
    "/",
    {
      schema: {
        ...createColdStorageSchema,
        body: {
          type: "object",
          required: ["name", "address", "mobileNumber", "capacity"],
          properties: {
            name: { type: "string", minLength: 2, maxLength: 100 },
            address: { type: "string", minLength: 5, maxLength: 255 },
            mobileNumber: {
              type: "string",
              pattern: "^[6-9]\\d{9}$",
            },
            capacity: { type: "number", exclusiveMinimum: 0 },
            imageUrl: { type: "string", format: "uri" },
            chambers: chambersJsonSchema,
            storageLayout: storageLayoutJsonSchema,
            plan: { type: "string", enum: Object.values(Plan) },
          },
        },
        description: "Create a new cold storage",
        tags: ["Cold Storage"],
        summary: "Create cold storage",
        response: {
          201: {
            description: "Cold storage created successfully",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                additionalProperties: true,
              },
              message: { type: "string" },
            },
          },
          400: {
            description: "Bad request – invalid or missing fields",
            ...errorResponse,
          },
          409: {
            description:
              "Conflict – a cold storage with this mobile number already exists",
            ...errorResponse,
          },
          500: {
            description: "Server error – something went wrong on our side",
            ...errorResponse,
          },
        },
      },
      config: {
        rateLimit: {
          max: 10, // 10 requests
          timeWindow: "1 minute", // per minute
        },
      },
    },
    createColdStorageHandler,
  );

  // Get all cold storages with pagination
  fastify.get(
    "/",
    {
      schema: {
        ...getColdStoragesQuerySchema,
        description: "Get a paginated list of cold storages",
        tags: ["Cold Storage"],
        summary: "Get cold storages list",
        response: {
          200: {
            description: "List of cold storages",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    storageLayout: storageLayoutJsonSchema,
                  },
                  additionalProperties: true,
                },
              },
              pagination: {
                type: "object",
                properties: {
                  page: { type: "number" },
                  limit: { type: "number" },
                  total: { type: "number" },
                  totalPages: { type: "number" },
                  hasNextPage: { type: "boolean" },
                  hasPreviousPage: { type: "boolean" },
                },
              },
            },
          },
          500: {
            description: "Server error – something went wrong on our side",
            ...errorResponse,
          },
        },
      },
      config: {
        rateLimit: {
          max: 100, // 100 requests
          timeWindow: "1 minute", // per minute
        },
      },
    },
    getColdStoragesHandler,
  );

  // Get preferences for a cold storage (by cold storage ID)
  fastify.get<{
    Params: { id: string };
  }>(
    "/:id/preferences",
    {
      schema: {
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        response: {
          200: {
            description: "Preferences",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  bagSizes: { type: "array", items: {} },
                  reportFormat: { type: "string" },
                  custom: { type: "object", additionalProperties: true },
                },
              },
            },
          },
          404: {
            description: "Cold storage or preferences not found",
            ...errorResponse,
          },
          500: {
            description: "Server error – something went wrong on our side",
            ...errorResponse,
          },
        },
      },
      config: {
        rateLimit: {
          max: 100,
          timeWindow: "1 minute",
        },
      },
    },
    getPreferencesHandler,
  );

  // Update preferences for a cold storage
  fastify.patch<{
    Params: { id: string };
    Body: {
      bagSizes?: (number | string)[];
      reportFormat?: string;
      custom?: Record<string, unknown>;
    };
  }>(
    "/:id/preferences",
    {
      schema: {
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        body: {
          type: "object",
          properties: {
            bagSizes: { type: "array", items: {} },
            reportFormat: { type: "string" },
            custom: { type: "object", additionalProperties: true },
          },
        },
        response: {
          200: {
            description: "Preferences updated",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: { type: "object", additionalProperties: true },
              message: { type: "string" },
            },
          },
          400: {
            description: "Bad request – invalid or missing fields",
            ...errorResponse,
          },
          404: {
            description: "Cold storage or preferences not found",
            ...errorResponse,
          },
          500: {
            description: "Server error – something went wrong on our side",
            ...errorResponse,
          },
        },
      },
      config: {
        rateLimit: {
          max: 30,
          timeWindow: "1 minute",
        },
      },
    },
    updatePreferencesHandler,
  );

  // Optional local-only reset route (file is gitignored; may be absent)
  try {
    const resetRouteSpec = "./cold-storage-reset.routes.js";
    const resetRouteModule = (await import(resetRouteSpec)) as {
      registerColdStorageResetRoute: (instance: FastifyInstance) => Promise<void>;
    };
    await resetRouteModule.registerColdStorageResetRoute(fastify);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== "ERR_MODULE_NOT_FOUND") {
      throw err;
    }
  }
}
