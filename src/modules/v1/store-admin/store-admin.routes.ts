import { FastifyInstance } from "fastify";
import {
  createStoreAdminHandler,
  getStoreAdminByIdHandler,
  updateStoreAdminHandler,
  deleteStoreAdminHandler,
  checkMobileNumberHandler,
  loginStoreAdminHandler,
  logoutStoreAdminHandler,
  quickRegisterFarmerHandler,
  updateFarmerStorageLinkHandler,
  getFarmerStorageLinksByColdStorageHandler,
  getGatePassesByFarmerStorageLinkHandler,
  getNextVoucherNumberHandler,
  getDaybookHandler,
  searchOrderByReceiptNumberHandler,
} from "./store-admin.controller.js";
import {
  createStoreAdminSchema,
  getStoreAdminByIdParamsSchema,
  updateStoreAdminSchema,
  deleteStoreAdminParamsSchema,
  checkMobileNumberQuerySchema,
  loginStoreAdminSchema,
  quickRegisterFarmerSchema,
  updateFarmerStorageLinkSchema,
  nextVoucherNumberQuerySchema,
  getDaybookQuerySchema,
} from "./store-admin.schema.js";
import { authenticate, authorize } from "../../../utils/auth.js";
import { Role } from "./store-admin.model.js";

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

  // Get farmer-storage-links for authenticated user's cold storage (farmerId populated with name, address, mobileNumber)
  fastify.get(
    "/farmer-storage-links",
    {
      schema: {
        description:
          "Get all farmer-storage-links for the authenticated store admin's cold storage with farmer details (name, address, mobileNumber) populated",
        tags: ["Store Admin"],
        summary: "Get farmer-storage-links for my cold storage",
        response: {
          200: {
            description: "List of farmer-storage-links with populated farmer",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    _id: { type: "string" },
                    farmerId: {
                      type: "object",
                      properties: {
                        _id: { type: "string" },
                        name: { type: "string" },
                        address: { type: "string" },
                        mobileNumber: { type: "string" },
                      },
                    },
                    coldStorageId: { type: "string" },
                    accountNumber: { type: "number" },
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
      preHandler: [authenticate],
      config: {
        rateLimit: {
          max: 200,
          timeWindow: "1 minute",
        },
      },
    },
    getFarmerStorageLinksByColdStorageHandler as never,
  );

  // Get all incoming and outgoing gate passes for a single farmer-storage-link (same response format as daybook)
  fastify.get(
    "/farmer-storage-links/:farmerStorageLinkId/gate-passes",
    {
      schema: {
        description:
          "Get gate passes for a farmer-storage-link. Same response format as daybook: status, data (array), pagination (single page). Query: from, to (YYYY-MM-DD), type (all | incoming | outgoing), sortBy (latest | oldest) — sorts by gatePassNo (desc for latest, asc for oldest).",
        tags: ["Store Admin"],
        summary: "Get gate passes by farmer-storage-link",
        params: {
          type: "object",
          required: ["farmerStorageLinkId"],
          properties: {
            farmerStorageLinkId: {
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
                "latest = highest gatePassNo first; otherwise = lowest gatePassNo first (default latest)",
            },
          },
        },
        response: {
          200: {
            description:
              "status Success with data (full array of gate passes, farmer populated) and pagination (single page); or status Fail with message and pagination when no orders",
            type: "object",
            properties: {
              status: { type: "string", enum: ["Success", "Fail"] },
              message: { type: "string" },
              data: {
                type: "array",
                items: { type: "object", additionalProperties: true },
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
      preHandler: [authenticate],
    },
    getGatePassesByFarmerStorageLinkHandler as never,
  );

  // Get daybook: list of incoming and/or outgoing gate passes with farmer populated, pagination, sort
  fastify.get(
    "/daybook",
    {
      schema: {
        ...getDaybookQuerySchema,
        description:
          "Get daybook: list of incoming and/or outgoing gate passes. type=all returns merged list sorted by createdAt; type=incoming or type=outgoing filters. sortBy=latest (newest first) or oldest. Pagination: page, limit.",
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
              "Daybook: status Success with data (array of incoming/outgoing gate passes, farmer populated, bagSizes/orderDetails sorted) and pagination; or status Fail with message and pagination when no orders",
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
    "/search-order-by-receipt",
    {
      schema: {
        description:
          "Search for orders (incoming and outgoing gate passes). searchBy: gatePassNumber (default); manualParchiNumber; marka; customMarka (incoming only); remarks = case-insensitive substring on remarks (incoming + outgoing; regex metacharacters treated literally).",
        tags: ["Store Admin"],
        summary: "Search order by receipt number",
        body: {
          type: "object",
          required: ["receiptNumber"],
          properties: {
            receiptNumber: {
              type: "string",
              description:
                "Value to match per searchBy (gate pass no, manual parchi, marka, customMarka, or remarks search phrase)",
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
                "gatePassNumber | manualParchiNumber | marka | customMarka | remarks (substring).",
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
    "/voucher-number",
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
  // Get store admin by ID
  fastify.get(
    "/:id",
    {
      schema: {
        ...getStoreAdminByIdParamsSchema,
        description: "Get a store admin by ID",
        tags: ["Store Admin"],
        summary: "Get store admin by ID",
        response: {
          200: {
            description: "Store admin details",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: { type: "object" },
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
      preHandler: [authenticate], // Require authentication
      config: {
        rateLimit: {
          max: 200, // 200 requests per minute
          timeWindow: "1 minute",
        },
      },
    },
    getStoreAdminByIdHandler as never,
  );

  // Update store admin
  fastify.put(
    "/:id",
    {
      schema: {
        ...updateStoreAdminSchema,
        description: "Update a store admin",
        tags: ["Store Admin"],
        summary: "Update store admin",
        response: {
          200: {
            description: "Store admin updated successfully",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: { type: "object" },
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
      preHandler: [authenticate], // Require authentication
      config: {
        rateLimit: {
          max: 60, // 60 requests per minute
          timeWindow: "1 minute",
        },
      },
    },
    updateStoreAdminHandler as never,
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

  // Quick register farmer
  fastify.post(
    "/quick-register-farmer",
    {
      schema: {
        ...quickRegisterFarmerSchema,
        description: "Quick register a farmer and create farmer-storage-link",
        tags: ["Store Admin"],
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
      preHandler: [authenticate], // Require authentication
      config: {
        rateLimit: {
          max: 60, // 60 requests per minute
          timeWindow: "1 minute",
        },
      },
    },
    quickRegisterFarmerHandler as never,
  );

  // Update farmer-storage-link
  fastify.put(
    "/farmer-storage-link/:id",
    {
      schema: {
        ...updateFarmerStorageLinkSchema,
        description: "Update a farmer-storage-link and associated farmer",
        tags: ["Store Admin"],
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
      preHandler: [authenticate], // Require authentication
      config: {
        rateLimit: {
          max: 60, // 60 requests per minute
          timeWindow: "1 minute",
        },
      },
    },
    updateFarmerStorageLinkHandler as never,
  );
}
