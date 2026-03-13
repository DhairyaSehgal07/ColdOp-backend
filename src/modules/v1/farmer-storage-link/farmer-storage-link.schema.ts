import { z } from "zod";

/** Body for POST /check – check if a farmer exists by mobile number */
export const checkFarmerMobileSchema = z.object({
  body: z.object({
    mobileNumber: z
      .string()
      .trim()
      .length(10, "Mobile number must be exactly 10 digits")
      .regex(
        /^[6-9]\d{9}$/,
        "Mobile number must be a valid 10-digit Indian mobile number starting with 6-9",
      ),
  }),
});

export type CheckFarmerMobileBody = z.infer<
  typeof checkFarmerMobileSchema
>["body"];

const objectIdString = z
  .string()
  .trim()
  .min(1, "farmerId is required")
  .refine(
    (val) =>
      z
        .string()
        .regex(/^[a-fA-F0-9]{24}$/)
        .safeParse(val).success,
    "farmerId must be a valid 24-character hex ObjectId",
  );

/** Body for POST /link-farmer-to-store – link existing farmer to current cold storage */
export const linkFarmerToStoreSchema = z.object({
  body: z.object({
    farmerId: objectIdString,
    accountNumber: z.coerce
      .number()
      .int()
      .positive("accountNumber must be a positive integer"),
    costPerBag: z.coerce.number().min(0, "costPerBag must be non-negative"),
    openingBalance: z.coerce.number().default(0),
  }),
});

export type LinkFarmerToStoreBody = z.infer<
  typeof linkFarmerToStoreSchema
>["body"];
