import { z } from "zod";
import { Plan } from "./cold-storage.model.js";
import mongoose from "mongoose";

const chamberSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Chamber name is required")
    .max(100, "Chamber name must not exceed 100 characters"),
  capacity: z.coerce
    .number()
    .positive("Chamber capacity must be greater than zero"),
});

export const chambersJsonSchema = {
  type: "array" as const,
  items: {
    type: "object" as const,
    required: ["name", "capacity"],
    properties: {
      name: { type: "string" as const, minLength: 1, maxLength: 100 },
      capacity: { type: "number" as const, exclusiveMinimum: 0 },
    },
  },
};

export const createColdStorageSchema = z.object({
  body: z.object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters long")
      .max(100, "Name must not exceed 100 characters"),

    address: z
      .string()
      .trim()
      .min(5, "Address must be at least 5 characters long")
      .max(255, "Address must not exceed 255 characters"),

    mobileNumber: z
      .string()
      .trim()
      .regex(
        /^[6-9]\d{9}$/,
        "Mobile number must be a valid 10-digit Indian mobile number",
      ),

    // Accepts string or number → coerced to number
    capacity: z.coerce.number().positive("Capacity must be greater than zero"),

    imageUrl: z.string().trim().url("Image URL must be a valid URL").optional(),

    chambers: z.array(chamberSchema).optional(),

    plan: z.nativeEnum(Plan).optional(),
  }),
});

export const getColdStoragesQuerySchema = z.object({
  querystring: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(10),
    sortBy: z.enum(["createdAt", "name", "capacity"]).default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
    isActive: z.coerce.boolean().optional(),
    plan: z.nativeEnum(Plan).optional(),
    search: z.string().trim().optional(),
  }),
});

export const getColdStorageByIdParamsSchema = z.object({
  params: z.object({
    id: z
      .string()
      .trim()
      .min(1, "ID is required")
      .refine(
        (val) => mongoose.Types.ObjectId.isValid(val),
        "Invalid ID format",
      ),
  }),
});

export const updateColdStorageBodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters long")
    .max(100, "Name must not exceed 100 characters")
    .optional(),

  address: z
    .string()
    .trim()
    .min(5, "Address must be at least 5 characters long")
    .max(255, "Address must not exceed 255 characters")
    .optional(),

  mobileNumber: z
    .string()
    .trim()
    .regex(
      /^[6-9]\d{9}$/,
      "Mobile number must be a valid 10-digit Indian mobile number",
    )
    .optional(),

  capacity: z.coerce
    .number()
    .positive("Capacity must be greater than zero")
    .optional(),

  imageUrl: z.string().trim().url("Image URL must be a valid URL").optional(),

  chambers: z.array(chamberSchema).optional(),

  plan: z.nativeEnum(Plan).optional(),
});

export type CreateColdStorageInput = z.infer<
  typeof createColdStorageSchema
>["body"];

export type GetColdStoragesQuery = z.infer<
  typeof getColdStoragesQuerySchema
>["querystring"];

export type GetColdStorageByIdParams = z.infer<
  typeof getColdStorageByIdParamsSchema
>["params"];

export type UpdateColdStorageInput = z.infer<
  typeof updateColdStorageBodySchema
>;
