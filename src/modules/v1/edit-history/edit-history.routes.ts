import type { FastifyInstance } from "fastify";
import { getEditHistoryByDocumentHandler, getEditHistoryByStorageHandler } from "./edit-history.controller.js";
import { authenticate } from "../../../utils/auth.js";

const editHistoryItemSchema = {
  type: "object",
  properties: {
    _id: { type: "string" },
    entityType: { type: "string" },
    documentId: { type: "string" },
    coldStorageId: { type: "string" },
    editedBy: {
      type: "object",
      properties: { _id: { type: "string" }, name: { type: "string" } },
    },
    editedAt: { type: "string", format: "date-time" },
    action: { type: "string" },
    changeSummary: { type: "string" },
  },
};

const listResponseSchema = {
  200: {
    description: "Edit history list",
    type: "object",
    properties: {
      success: { type: "boolean" },
      data: { type: "array", items: editHistoryItemSchema },
      message: { type: "string" },
    },
  },
};

const rateLimit = { max: 120, timeWindow: "1 minute" as const };

export async function editHistoryRoutes(fastify: FastifyInstance) {
  // Must be before /:entityType/:documentId so "storage" is not captured as entityType
  fastify.get(
    "/storage",
    {
      schema: {
        description: "Get all edit history for the current user's cold storage",
        tags: ["Edit History"],
        summary: "Get edit history by storage",
        response: listResponseSchema,
      },
      preHandler: [authenticate],
      config: { rateLimit },
    },
    getEditHistoryByStorageHandler as never,
  );

  fastify.get(
    "/:entityType/:documentId",
    {
      schema: {
        description: "Get edit history for one gate pass (who edited, when)",
        tags: ["Edit History"],
        summary: "Get edit history by document",
        params: {
          type: "object",
          required: ["entityType", "documentId"],
          properties: {
            entityType: {
              type: "string",
              enum: ["incoming_gate_pass", "outgoing_gate_pass"],
              description: "Type of gate pass",
            },
            documentId: { type: "string", description: "Gate pass document _id" },
          },
        },
        response: listResponseSchema,
      },
      preHandler: [authenticate],
      config: { rateLimit },
    },
    getEditHistoryByDocumentHandler as never,
  );
}
