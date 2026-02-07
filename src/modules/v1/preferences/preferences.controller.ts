import { FastifyReply, FastifyRequest } from "fastify";

/**
 * Stub: Get preferences for a cold storage by ID.
 * TODO: Implement when preferences service is ready.
 */
export async function getPreferencesHandler(
  _request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  return reply.code(501).send({
    success: false,
    error: {
      code: "NOT_IMPLEMENTED",
      message: "Preferences endpoint is not implemented yet",
    },
  });
}

/**
 * Stub: Update preferences for a cold storage.
 * TODO: Implement when preferences service is ready.
 */
export async function updatePreferencesHandler(
  _request: FastifyRequest<{
    Params: { id: string };
    Body: { bagSizes?: unknown; reportFormat?: string; custom?: unknown };
  }>,
  reply: FastifyReply,
) {
  return reply.code(501).send({
    success: false,
    error: {
      code: "NOT_IMPLEMENTED",
      message: "Preferences endpoint is not implemented yet",
    },
  });
}
