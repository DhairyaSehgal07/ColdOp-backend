import { FastifyInstance } from "fastify";
import {
  createStoreAdminHandler,
  getStoreAdminProfileHandler,
  updateStoreAdminProfileHandler,
  deleteStoreAdminHandler,
  checkMobileNumberHandler,
  loginStoreAdminHandler,
  logoutStoreAdminHandler,
  getNextVoucherNumberHandler,
  getDaybookHandler,
  searchOrderByReceiptNumberHandler,
} from "./store-admin.controller.js";
import {
  createStoreAdminSchema,
  updateStoreAdminProfileSchema,
  deleteStoreAdminParamsSchema,
  checkMobileNumberQuerySchema,
  loginStoreAdminSchema,
  nextVoucherNumberQuerySchema,
  getDaybookQuerySchema,
} from "./store-admin.schema.js";
import { authenticate, authorize } from "../../../utils/auth.js";
import { Role } from "./store-admin.model.js";
import { preferencesDataProperties } from "../preferences/preferences.schema.js";

const populatedPreferencesProperty = {
  type: "object",
  description: "Cold storage preferences (populated preferencesId)",
  properties: preferencesDataProperties,
};

/**
 * Register store admin routes
 * @param fastify - Fastify instance
 */
export async function storeAdminRoutes(fastify: FastifyInstance) {
  // Create store admin endpoint
  fastify.post(
    "/",
    {
      schema: {
        ...createStoreAdminSchema,
        description: "Create a new store admin",
        tags: ["Store Admin"],
        summary: "Create store admin",
        response: {
          201: {
            description: "Store admin created successfully",
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
            description: "Cold storage not found",
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
      // No authentication required – register/create store admin is an open route
      config: {
        rateLimit: {
          max: 30, // 30 requests per minute
          timeWindow: "1 minute",
        },
      },
    },
    createStoreAdminHandler as never,
  );

  // Get daybook: list of incoming and/or outgoing gate passes with farmer populated, pagination, sort
  fastify.get(
    "/daybook",
    {
      schema: {
        ...getDaybookQuerySchema,
        description:
          "Get daybook: list of incoming and/or outgoing gate passes. type=all returns merged list sorted by createdAt; type=incoming or type=outgoing filters. sortBy=latest (newest first) or oldest. Pagination: page, limit. Each item's farmerStorageLinkId is a flat object with name, accountNumber, address, mobileNumber (no nested farmerId). Outgoing items include isNull when nulled (dwarf pass).",
        tags: ["Store Admin"],
        summary: "Get daybook",
        querystring: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["all", "incoming", "outgoing"],
              description:
                "all = merged incoming + outgoing; incoming or outgoing = filter by type (default all)",
            },
            sortBy: {
              type: "string",
              description:
                "latest = newest first (-1), anything else = oldest first (default latest)",
            },
            limit: {
              type: "number",
              description: "Items per page (default 10, max 100)",
            },
            page: { type: "number", description: "Page number (default 1)" },
          },
        },
        response: {
          200: {
            description:
              "Daybook: status Success with data (array of incoming/outgoing gate passes; farmerStorageLinkId is flat: name, accountNumber, address, mobileNumber; outgoing items include isNull; bagSizes/orderDetails sorted) and pagination; or status Fail with message and pagination when no orders",
            type: "object",
            properties: {
              status: { type: "string", enum: ["Success", "Fail"] },
              message: { type: "string" },
              data: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    farmerStorageLinkId: {
                      type: "object",
                      description:
                        "Flat farmer display: name, accountNumber, address, mobileNumber",
                      properties: {
                        name: { type: "string" },
                        accountNumber: { type: "number" },
                        address: { type: "string" },
                        mobileNumber: { type: "string" },
                      },
                    },
                    truckNumber: {
                      type: "string",
                      description:
                        "Truck number (incoming orders and outgoing orders)",
                    },
                    manualParchiNumber: {
                      type: ["string", "number"],
                      description:
                        "Manual parchi/voucher number (incoming: string, outgoing: number)",
                    },
                    stockFilter: {
                      type: "string",
                      description: "Stock filter (incoming orders only)",
                    },
                    customMarka: {
                      type: "string",
                      description: "Custom marka (incoming orders only)",
                    },
                  },
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
            description: "Invalid type parameter",
            type: "object",
            properties: {
              message: { type: "string" },
            },
          },
          401: {
            description: "Unauthorized or missing cold storage context",
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
          500: {
            description: "Server error while getting daybook orders",
            type: "object",
            properties: {
              status: { type: "string" },
              message: { type: "string" },
              errorMessage: { type: "string" },
            },
          },
        },
      },
      preHandler: [authenticate],
      config: {
        rateLimit: {
          max: 200,
          timeWindow: "1 minute",
        },
      },
    },
    getDaybookHandler as never,
  );

  // Search incoming and outgoing gate passes by receipt number (gate pass / voucher number)
  fastify.post(
    "/search",
    {
      schema: {
        description:
          "Search for orders (incoming and outgoing gate passes). searchBy: gatePassNumber (default); manualParchiNumber; marka (gatePassNo/totalBags and/or customMarka on incoming); customMarka (incoming only, legacy); remarks = case-insensitive substring on remarks (incoming + outgoing; regex metacharacters treated literally).",
        tags: ["Store Admin"],
        summary: "Search order by receipt number",
        body: {
          type: "object",
          required: ["receiptNumber"],
          properties: {
            receiptNumber: {
              type: "string",
              description:
                "Value to match per searchBy (gate pass no, manual parchi, marka, customMarka, or remarks search phrase). For marka: use gatePassNo/totalBags (e.g. 42/300) and/or a customMarka value.",
            },
            searchBy: {
              type: "string",
              enum: [
                "gatePassNumber",
                "manualParchiNumber",
                "marka",
                "customMarka",
                "remarks",
              ],
              default: "gatePassNumber",
              description:
                "gatePassNumber | manualParchiNumber | marka (gatePassNo/totalBags + customMarka) | customMarka | remarks (substring).",
            },
          },
        },
        response: {
          200: {
            description: "Orders found",
            type: "object",
            properties: {
              status: { type: "string", enum: ["Success"] },
              data: {
                type: "object",
                properties: {
                  incoming: {
                    type: "array",
                    items: { type: "object", additionalProperties: true },
                  },
                  outgoing: {
                    type: "array",
                    items: { type: "object", additionalProperties: true },
                  },
                },
              },
            },
          },
          400: {
            description: "Receipt number not provided",
            type: "object",
            properties: {
              status: { type: "string", enum: ["Fail"] },
              message: { type: "string" },
            },
          },
          401: {
            description: "Unauthorized or missing cold storage in token",
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
            description: "No orders found with this receipt number",
            type: "object",
            properties: {
              status: { type: "string", enum: ["Fail"] },
              message: { type: "string" },
            },
          },
          500: {
            description: "Error while searching for orders",
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
          max: 200,
          timeWindow: "1 minute",
        },
      },
    },
    searchOrderByReceiptNumberHandler as never,
  );

  // Get next voucher number for a voucher type (incoming or outgoing only)
  fastify.get(
    "/gate-pass-number",
    {
      schema: {
        ...nextVoucherNumberQuerySchema,
        description:
          "Get the next voucher (gate pass) number for incoming or outgoing gate pass",
        tags: ["Store Admin"],
        summary: "Get next voucher number",
        response: {
          200: {
            description: "Next voucher number",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  nextNumber: { type: "number" },
                },
              },
            },
          },
          400: {
            description: "Bad request - invalid or missing type",
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
            description: "Unauthorized or missing cold storage in token",
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
          max: 200,
          timeWindow: "1 minute",
        },
      },
    },
    getNextVoucherNumberHandler as never,
  );
  // Get authenticated store admin profile with cold storage
  fastify.get(
    "/profile",
    {
      schema: {
        description:
          "Get the authenticated store admin profile with linked cold storage details",
        tags: ["Store Admin"],
        summary: "Get store admin profile",
        response: {
          200: {
            description: "Store admin profile with cold storage",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  storeAdmin: { type: "object", additionalProperties: true },
                  coldStorage: {
                    type: "object",
                    additionalProperties: true,
                    properties: {
                      preferencesId: populatedPreferencesProperty,
                    },
                  },
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
            description: "Store admin or cold storage not found",
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
          max: 200,
          timeWindow: "1 minute",
        },
      },
    },
    getStoreAdminProfileHandler as never,
  );

  // Update authenticated store admin profile and cold storage
  fastify.put(
    "/profile",
    {
      schema: {
        ...updateStoreAdminProfileSchema,
        description:
          "Update the authenticated store admin profile and optionally linked cold storage details",
        tags: ["Store Admin"],
        summary: "Update store admin profile",
        response: {
          200: {
            description: "Profile updated successfully",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  storeAdmin: { type: "object", additionalProperties: true },
                  coldStorage: {
                    type: "object",
                    additionalProperties: true,
                    properties: {
                      preferencesId: populatedPreferencesProperty,
                    },
                  },
                },
              },
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
            description: "Store admin or cold storage not found",
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
    updateStoreAdminProfileHandler as never,
  );

  // Delete store admin
  fastify.delete(
    "/:id",
    {
      schema: {
        ...deleteStoreAdminParamsSchema,
        description: "Delete a store admin",
        tags: ["Store Admin"],
        summary: "Delete store admin",
        response: {
          200: {
            description: "Store admin deleted successfully",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: { type: "object" },
              message: { type: "string" },
            },
          },
          400: {
            description: "Bad request - invalid ID format",
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
            description: "Store admin not found",
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
      preHandler: [authenticate, authorize(Role.Admin)], // Only Admin can delete store admins
      config: {
        rateLimit: {
          max: 30, // 30 requests per minute
          timeWindow: "1 minute",
        },
      },
    },
    deleteStoreAdminHandler as never,
  );

  // Check mobile number availability
  fastify.get(
    "/check-mobile",
    {
      schema: {
        ...checkMobileNumberQuerySchema,
        description: "Check if mobile number is available for a cold storage",
        tags: ["Store Admin"],
        summary: "Check mobile number availability",
        response: {
          200: {
            description: "Mobile number is available",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  available: { type: "boolean" },
                },
              },
              message: { type: "string" },
            },
          },
          409: {
            description: "Mobile number already exists",
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
          max: 60, // 60 requests per minute for checking availability
          timeWindow: "1 minute",
        },
      },
    },
    checkMobileNumberHandler,
  );

  // Login store admin
  fastify.post(
    "/login",
    {
      schema: {
        ...loginStoreAdminSchema,
        description: "Login store admin with mobile number and password",
        tags: ["Store Admin"],
        summary: "Login store admin",
        response: {
          200: {
            description:
              "Login successful; storeAdmin includes coldStorageId and preferences (coldStorageId.preferencesId) populated",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  storeAdmin: {
                    type: "object",
                    additionalProperties: true,
                    description:
                      "Store admin with coldStorageId and coldStorageId.preferencesId populated",
                    properties: {
                      coldStorageId: {
                        type: "object",
                        additionalProperties: true,
                        properties: {
                          preferencesId: populatedPreferencesProperty,
                        },
                      },
                    },
                  },
                  token: { type: "string" },
                },
              },
              message: { type: "string" },
            },
          },
          400: {
            description:
              "Bad request - missing or invalid body (mobileNumber, password)",
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
            description: "Unauthorized - invalid credentials or account locked",
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
          429: {
            description: "Too many login attempts - try again later",
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
          500: {
            description: "Internal server error",
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
          max: 100, // 100 requests per minute for login
          timeWindow: "1 minute",
        },
      },
    },
    loginStoreAdminHandler,
  );

  // Logout store admin
  fastify.post(
    "/logout",
    {
      schema: {
        description: "Logout store admin",
        tags: ["Store Admin"],
        summary: "Logout store admin",
        response: {
          200: {
            description: "Logout successful",
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
            },
          },
        },
      },
      preHandler: [authenticate], // Require authentication to logout
      config: {
        rateLimit: {
          max: 60, // 60 requests per minute
          timeWindow: "1 minute",
        },
      },
    },
    logoutStoreAdminHandler as never,
  );
}
