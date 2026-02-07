/* eslint-disable @typescript-eslint/no-unused-vars */
import { FastifyRequest } from "fastify";
import { UnauthorizedError } from "./errors.js";
import { ForbiddenError } from "./errors.js";

/**
 * JWT Payload interface
 * coldStorageId may be a string (ObjectId) or populated object when token was signed with storeAdmin.coldStorageId
 */
export interface JWTPayload {
  id: string;
  mobileNumber: string;
  role?: string;
  coldStorageId: string | { _id: string };
  iat?: number;
  exp?: number;
}

/**
 * Extended FastifyRequest with user information
 */
export interface AuthenticatedRequest extends FastifyRequest {
  user: JWTPayload;
}

/**
 * Authentication middleware - verifies JWT token
 */
export async function authenticate(request: FastifyRequest): Promise<void> {
  try {
    // Check for token in Authorization header or cookie
    let token: string | undefined;

    // Try to get token from Authorization header
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }

    // If no token in header, try to get from cookie
    if (!token && request.cookies) {
      token = request.cookies.accessToken;
    }

    if (!token) {
      throw new UnauthorizedError(
        "Authentication token is required",
        "MISSING_TOKEN",
      );
    }

    // Verify token
    const decoded = await request.server.jwt.verify<JWTPayload>(token);

    // Attach user to request
    (request as AuthenticatedRequest).user = decoded;
  } catch (error) {
    // Handle JWT verification errors
    if (error instanceof UnauthorizedError) {
      throw error;
    }

    // Handle expired token
    if (error instanceof Error && error.message.includes("expired")) {
      throw new UnauthorizedError("Token has expired", "TOKEN_EXPIRED");
    }

    // Handle invalid token
    if (error instanceof Error && error.message.includes("invalid")) {
      throw new UnauthorizedError(
        "Invalid authentication token",
        "INVALID_TOKEN",
      );
    }

    // Generic error
    throw new UnauthorizedError(
      "Authentication failed",
      "AUTHENTICATION_FAILED",
    );
  }
}

/**
 * Middleware to check if user belongs to specific cold storage
 */
export function requireColdStorage(coldStorageId: string) {
  return async (request: FastifyRequest): Promise<void> => {
    const authenticatedRequest = request as AuthenticatedRequest;

    if (!authenticatedRequest.user) {
      throw new UnauthorizedError(
        "Authentication required",
        "AUTHENTICATION_REQUIRED",
      );
    }

    if (authenticatedRequest.user.coldStorageId !== coldStorageId) {
      throw new ForbiddenError(
        "You do not have access to this cold storage",
        "COLD_STORAGE_ACCESS_DENIED",
      );
    }
  };
}

/**
 * Authorization middleware factory - checks if authenticated user has one of the allowed roles
 */
export function authorize(...allowedRoles: string[]) {
  return async (request: FastifyRequest): Promise<void> => {
    const authenticatedRequest = request as AuthenticatedRequest;
    if (!authenticatedRequest.user) {
      throw new UnauthorizedError(
        "Authentication required",
        "AUTHENTICATION_REQUIRED",
      );
    }
    const role = authenticatedRequest.user.role;
    if (!role || !allowedRoles.includes(role)) {
      throw new ForbiddenError(
        "You do not have permission to perform this action",
        "FORBIDDEN",
      );
    }
  };
}

/**
 * Optional authentication - doesn't throw if no token, but attaches user if present
 */
export async function optionalAuthenticate(
  request: FastifyRequest,
): Promise<void> {
  try {
    let token: string | undefined;

    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }

    if (!token && request.cookies) {
      token = request.cookies.accessToken;
    }

    if (token) {
      const decoded = await request.server.jwt.verify<JWTPayload>(token);
      (request as AuthenticatedRequest).user = decoded;
    }
  } catch (error) {
    // Silently fail for optional authentication
    // User will be undefined if token is invalid
  }
}
