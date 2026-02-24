import { z } from "zod";
import { Plan } from "./cold-storage.model.js";
import mongoose from "mongoose";

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

export type CreateColdStorageInput = z.infer<
  typeof createColdStorageSchema
>["body"];

export type GetColdStoragesQuery = z.infer<
  typeof getColdStoragesQuerySchema
>["querystring"];

export type GetColdStorageByIdParams = z.infer<
  typeof getColdStorageByIdParamsSchema
>["params"];

/** Params for delete cold storage data (reuses id from getColdStorageById) */
export const deleteColdStorageDataParamsSchema = getColdStorageByIdParamsSchema;

export type DeleteColdStorageDataParams = z.infer<
  typeof deleteColdStorageDataParamsSchema
>["params"];
