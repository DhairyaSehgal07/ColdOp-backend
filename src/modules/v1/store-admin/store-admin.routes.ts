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
  getDaybookHandler,
  getVouchersByFarmerStorageLinkHandler,
  getNextVoucherNumberHandler,
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
  getVoucherNumberQuerySchema,
  getDaybookQuerySchema,
  getVouchersByFarmerStorageLinkParamsSchema,
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

  // Get vouchers (daybook) for a single farmer-storage-link
  fastify.get(
    "/farmer-storage-links/:farmerStorageLinkId/vouchers",
    {
      schema: {
        ...getVouchersByFarmerStorageLinkParamsSchema,
        description:
          "Get all vouchers (daybook-style) for a farmer-storage-link. Link must belong to authenticated store admin's cold storage.",
        tags: ["Store Admin"],
        summary: "Get vouchers by farmer-storage-link",
        response: {
          200: {
            description: "Daybook entries for the link",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  daybook: { type: "array", items: { type: "object" } },
                },
              },
            },
          },
        },
      },
      preHandler: [authenticate],
      config: {
        rateLimit: { max: 200, timeWindow: "1 minute" },
      },
    },
    getVouchersByFarmerStorageLinkHandler as never,
  );

  // Get daybook (all gate passes) for authenticated cold storage
  fastify.get(
    "/daybook",
    {
      schema: {
        ...getDaybookQuerySchema,
        description:
          "Get daybook (all gate passes) for the authenticated store admin's cold storage. Supports pagination and filtering by gate pass type.",
        tags: ["Store Admin"],
        summary: "Get daybook",
        response: {
          200: {
            description: "Daybook with pagination",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  daybook: { type: "array", items: { type: "object" } },
                  pagination: {
                    type: "object",
                    properties: {
                      page: { type: "number" },
                      limit: { type: "number" },
                      total: { type: "number" },
                      totalPages: { type: "number" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      preHandler: [authenticate],
      config: {
        rateLimit: { max: 200, timeWindow: "1 minute" },
      },
    },
    getDaybookHandler as never,
  );

  // Get next voucher number for a voucher type
  fastify.get(
    "/next-voucher-number",
    {
      schema: {
        ...getVoucherNumberQuerySchema,
        description:
          "Get the next voucher number for a given voucher type (authenticated cold storage).",
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
                  type: { type: "string" },
                  nextVoucherNumber: { type: "number" },
                },
              },
              message: { type: "string" },
            },
          },
        },
      },
      preHandler: [authenticate],
      config: {
        rateLimit: { max: 200, timeWindow: "1 minute" },
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
            description: "Login successful",
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  storeAdmin: { type: "object", additionalProperties: true },
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
