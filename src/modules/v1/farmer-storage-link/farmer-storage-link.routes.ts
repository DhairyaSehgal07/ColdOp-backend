import { FastifyInstance } from "fastify";
import { authenticate } from "../../../utils/auth.js";
import {
  checkFarmerMobileHandler,
  getFarmerStorageLinksByColdStorageHandler,
  quickRegisterFarmerHandler,
  updateFarmerStorageLinkHandler,
  getFarmerStorageLinkGatePassesHandler,
} from "./farmer-storage-link.controller.js";
import {
  checkFarmerMobileSchema,
  quickRegisterFarmerSchema,
  updateFarmerStorageLinkSchema,
} from "./farmer-storage-link.schema.js";

/**
 * Register farmer-storage-link routes.
 * @param fastify - Fastify instance
 */
export async function farmerStorageLinkRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/check",
    {
      schema: {
        description:
          "Check if a farmer already exists with the given mobile number. Returns the farmer document if found, otherwise confirms the number is available.",
        tags: ["Farmer Storage Link"],
        summary: "Check farmer mobile number availability",
        body: {
          type: "object",
          required: ["mobileNumber"],
          properties: {
            mobileNumber: {
              type: "string",
              minLength: 10,
              maxLength: 10,
              pattern: "^[6-9]\\d{9}$",
              description: "10-digit Indian mobile number (6–9 start)",
            },
          },
        },
        response: {
          200: {
            description: "Check result",
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
              data: {
                type: "object",
                nullable: true,
                properties: {
                  farmer: {
                    type: "object",
                    properties: {
                      _id: { type: "string" },
                      name: { type: "string" },
                      address: { type: "string" },
                      mobileNumber: { type: "string" },
                      imageUrl: { type: "string", nullable: true },
                      createdAt: { type: "string", format: "date-time" },
                      updatedAt: { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            },
          },
          400: {
            description: "Validation error",
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
      config: {
        rateLimit: {
          max: 60,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const parsed = checkFarmerMobileSchema.safeParse({
        body: request.body,
      });
      if (!parsed.success) {
        return reply.code(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.flatten().formErrors?.[0] ?? "Invalid body",
          },
        });
      }
      return checkFarmerMobileHandler(
        { ...request, body: parsed.data.body } as Parameters<
          typeof checkFarmerMobileHandler
        >[0],
        reply,
      );
    },
  );

  fastify.get(
    "/",
    {
      preHandler: [authenticate],
      schema: {
        description:
          "Get all farmer-storage-links for the authenticated cold storage. Each link includes store-specific name, address, and mobileNumber.",
        tags: ["Farmer Storage Link"],
        summary: "List farmers for my cold storage",
        response: {
          200: {
            description:
              "List of farmer-storage-links with store-specific display fields",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    _id: { type: "string" },
                    accountNumber: { type: "number" },
                    name: { type: "string" },
                    address: { type: "string" },
                    mobileNumber: { type: "string" },
                    isActive: { type: "boolean" },
                    notes: { type: "string" },
                    costPerBag: { type: "number" },
                  },
                },
              },
            },
          },
        },
      },
      config: {
        rateLimit: {
          max: 200,
          timeWindow: "1 minute",
        },
      },
    },
    getFarmerStorageLinksByColdStorageHandler as never,
  );

  fastify.get(
    "/:id/gate-passes",
    {
      preHandler: [authenticate],
      schema: {
        description:
          "Get gate passes for a farmer-storage-link. Same response format as daybook: status, data (array), summaries (bag totals), pagination (single page). Each item's farmerStorageLinkId is a flat object with name, accountNumber, address, mobileNumber (no nested farmerId). Query: from, to (YYYY-MM-DD), type (all | incoming | outgoing), sortBy (latest | oldest) — type=all returns merged list sorted by createdAt; incoming/outgoing filtered lists sorted by createdAt. Summaries always reflect all incoming/outgoing passes in the date range (ignores type filter).",
        tags: ["Farmer Storage Link"],
        summary: "Get gate passes for a farmer-storage-link",
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: {
              type: "string",
              description: "Farmer-storage-link ID",
            },
          },
        },
        querystring: {
          type: "object",
          properties: {
            from: {
              type: "string",
              description: "Start date (YYYY-MM-DD) inclusive",
            },
            to: {
              type: "string",
              description: "End date (YYYY-MM-DD) inclusive",
            },
            type: {
              type: "string",
              enum: ["all", "incoming", "outgoing"],
              description:
                "all = merged list; incoming or outgoing = filter by type (default all)",
            },
            sortBy: {
              type: "string",
              description:
                "latest = newest createdAt first; otherwise = oldest createdAt first (default oldest, same as daybook)",
            },
          },
        },
        response: {
          200: {
            description:
              "status Success with data (full array of gate passes; farmerStorageLinkId is flat: name, accountNumber, address, mobileNumber), summaries (bag totals), and pagination (single page); or status Fail with message, summaries, and pagination when no orders",
            type: "object",
            properties: {
              status: { type: "string", enum: ["Success", "Fail"] },
              message: { type: "string" },
              data: {
                type: "array",
                items: { type: "object", additionalProperties: true },
              },
              summaries: {
                type: "object",
                properties: {
                  totalIncomingBags: { type: "number" },
                  totalOutgoingBags: { type: "number" },
                  totalInternallyTransferredIncomingBags: { type: "number" },
                  totalInternallyTransferredOutgoingBags: { type: "number" },
                },
              },
              pagination: {
                type: "object",
                properties: {
                  currentPage: { type: "number" },
                  totalPages: { type: "number" },
                  totalItems: { type: "number" },
                  itemsPerPage: { type: "number" },
                  hasNextPage: { type: "boolean" },
                  hasPreviousPage: { type: "boolean" },
                  nextPage: { type: ["number", "null"] },
                  previousPage: { type: ["number", "null"] },
                },
              },
            },
          },
          400: {
            description: "Invalid type or validation error",
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
              message: { type: "string" },
            },
          },
          401: {
            description: "Unauthorized or missing cold storage",
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
        },
      },
      config: {
        rateLimit: {
          max: 120,
          timeWindow: "1 minute",
        },
      },
    },
    getFarmerStorageLinkGatePassesHandler as never,
  );

  fastify.post(
    "/quick-register-farmer",
    {
      preHandler: [authenticate],
      schema: {
        ...quickRegisterFarmerSchema,
        description:
          "Quick register a new farmer and create a farmer-storage-link for the current cold storage",
        tags: ["Farmer Storage Link"],
        summary: "Quick register farmer",
        response: {
          201: {
            description: "Farmer registered successfully",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  farmer: { type: "object", additionalProperties: true },
                  farmerStorageLink: {
                    type: "object",
                    additionalProperties: true,
                  },
                },
              },
              message: { type: "string" },
            },
          },
          400: {
            description: "Validation error",
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
            description: "Cold storage or store admin not found",
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
      config: {
        rateLimit: {
          max: 60,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const parsed = quickRegisterFarmerSchema.safeParse({
        body: request.body,
      });
      if (!parsed.success) {
        return reply.code(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.flatten().formErrors?.[0] ?? "Invalid body",
          },
        });
      }
      return quickRegisterFarmerHandler(
        { ...request, body: parsed.data.body } as Parameters<
          typeof quickRegisterFarmerHandler
        >[0],
        reply,
      );
    },
  );

  fastify.put(
    "/:id",
    {
      preHandler: [authenticate],
      schema: {
        ...updateFarmerStorageLinkSchema,
        description:
          "Update a farmer-storage-link. Store-specific name, address, and mobileNumber update the link only; imageUrl updates the global farmer.",
        tags: ["Farmer Storage Link"],
        summary: "Update farmer-storage-link",
        response: {
          200: {
            description: "Farmer-storage-link updated successfully",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  farmer: { type: "object", additionalProperties: true },
                  farmerStorageLink: {
                    type: "object",
                    additionalProperties: true,
                  },
                },
              },
              message: { type: "string" },
            },
          },
          400: {
            description: "Validation error",
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
      config: {
        rateLimit: {
          max: 60,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const parsed = updateFarmerStorageLinkSchema.safeParse({
        params: request.params,
        body: request.body,
      });
      if (!parsed.success) {
        return reply.code(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              parsed.error.flatten().formErrors?.[0] ?? "Invalid request",
          },
        });
      }
      return updateFarmerStorageLinkHandler(
        {
          ...request,
          params: parsed.data.params,
          body: parsed.data.body,
        } as Parameters<typeof updateFarmerStorageLinkHandler>[0],
        reply,
      );
    },
  );
}
