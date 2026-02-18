import { JWTPayload } from "../utils/auth.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: JWTPayload;
  }
}
