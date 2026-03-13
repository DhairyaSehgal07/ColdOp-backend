import { FastifyInstance } from "fastify";
import { authenticate } from "../../../utils/auth.js";
import {
  checkFarmerMobileHandler,
  linkFarmerToStoreHandler,
} from "./farmer-storage-link.controller.js";
import {
  checkFarmerMobileSchema,
  linkFarmerToStoreSchema,
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

  fastify.post(
    "/link-farmer-to-store",
    {
      preHandler: [authenticate],
      schema: {
        description:
          "Link an existing farmer to the current logged-in cold storage. Creates the farmer-storage link and optionally a debtor ledger when showFinances is enabled.",
        tags: ["Farmer Storage Link"],
        summary: "Link farmer to store",
        body: {
          type: "object",
          required: ["farmerId", "accountNumber", "costPerBag"],
          properties: {
            farmerId: {
              type: "string",
              pattern: "^[a-fA-F0-9]{24}$",
              description: "MongoDB ObjectId of the farmer",
            },
            accountNumber: {
              type: "integer",
              minimum: 1,
              description:
                "Account number for this farmer at this cold storage",
            },
            costPerBag: {
              type: "number",
              minimum: 0,
              description: "Cost per bag",
            },
            openingBalance: {
              type: "number",
              default: 0,
              description:
                "Opening balance for debtor ledger (when showFinances is enabled)",
            },
          },
        },
        response: {
          200: {
            description: "Farmer linked successfully",
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
              data: {
                type: "object",
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
                  farmerStorageLink: {
                    type: "object",
                    properties: {
                      _id: { type: "string" },
                      farmerId: { type: "string" },
                      coldStorageId: { type: "string" },
                      accountNumber: { type: "number" },
                      isActive: { type: "boolean" },
                      costPerBag: { type: "number", nullable: true },
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
          401: {
            description: "Unauthorized",
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
            description: "Farmer, cold storage or store admin not found",
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
            description:
              "Conflict (e.g. link or account number already exists)",
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
      const parsed = linkFarmerToStoreSchema.safeParse({
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
      return linkFarmerToStoreHandler(
        { ...request, body: parsed.data.body } as Parameters<
          typeof linkFarmerToStoreHandler
        >[0],
        reply,
      );
    },
  );
}
