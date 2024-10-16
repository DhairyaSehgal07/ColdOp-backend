import { z } from "zod";

const registerSchema = z.object({
  name: z.string().min(2).max(50),
  address: z.string().min(2).max(100),
  mobileNumber: z.string().length(10),
  password: z.string().min(6),
  imageUrl: z.string(),
  isMobile: z.boolean(),
});

const loginSchema = z.object({
  mobileNumber: z.string().length(10),
  password: z.string().min(6),
  isMobile: z.boolean(),
});

const updateSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  address: z.string().min(2).max(100).optional(),
  mobileNumber: z.string().length(10).optional(),
  password: z.string().min(6).optional(),
  imageUrl: z.string().optional(),
});

const mobileNumberSchema = z.object({
  mobileNumber: z.string().length(10),
});

const updatePasswordSchema = z.object({
  password: z.string().min(6),
});

const storeAdminRegisterSchema = z.object({
  name: z.string().min(2).max(50),
  personalAddress: z.string().min(2).max(100),
  mobileNumber: z.string().length(10),
  password: z.string().min(6),
  coldStorageName: z.string().min(2),
  coldStorageAddress: z.string(),
  isMobile: z.boolean(),
  coldStorageContactNumber: z.union([
    z.string().length(8), // Landline number with 8 digits
    z.string().length(10), // Mobile number with 10 digits
    z.string().length(11),
    z.string().length(12),
  ]),
});

const storeAdminUpdateSchmea = z.object({
  name: z.string().min(2).max(50).optional(),
  personalAddress: z.string().min(2).max(100).optional(),
  isMobile: z.boolean(), // Boolean field for 'isMobile'
  mobileNumber: z.string().length(10).optional(),
  password: z.string().min(6).optional(),
  coldStorageName: z.string().min(2).optional(),
  coldStorageAddress: z.string().optional(),
  coldStorageContactNumber: z
    .union([
      z.string().length(8), // Landline number with 8 digits
      z.string().length(10), // Mobile number with 10 digits
      z.string().length(11),
      z.string().length(12),
    ])
    .optional(),
  coldStorageGSTNumber: z.string().length(15),
});

const editOtpMobileNumberSchema = z.object({
  previousMobileNumber: z.string().length(10),
  newMobileNumber: z.string().length(10),
});

const storeAdminIdSchema = z.object({
  storeAdminId: z.string(),
});

const farmerIdSchema = z.object({
  farmerId: z.string().length(6),
});

const quickRegisterSchema = z.object({
  name: z.string().min(2).max(50),
  address: z.string().min(2).max(100),
  mobileNumber: z.string().length(10),
  password: z.string().min(6),
});

const orderSchema = z.object({
  coldStorageId: z.string().regex(/^[a-fA-F0-9]{24}$/, "Invalid ObjectId"),
  farmerId: z.string().regex(/^[a-fA-F0-9]{24}$/, "Invalid ObjectId"),
  dateOfSubmission: z.string().min(1),
  orderDetails: z.array(
    z.object({
      variety: z.string().min(1),
      bagSizes: z.array(
        z.object({
          size: z.string(),
          quantity: z.object({
            initialQuantity: z.number(),
            currentQuantity: z.number(),
          }),
        })
      ),
      location: z.object({
        floor: z.string().min(1),
        row: z.string().min(1),
        chamber: z.string().min(1),
      }),
    })
  ),
});

export {
  registerSchema,
  loginSchema,
  updateSchema,
  mobileNumberSchema,
  updatePasswordSchema,
  storeAdminRegisterSchema,
  storeAdminUpdateSchmea,
  editOtpMobileNumberSchema,
  storeAdminIdSchema,
  farmerIdSchema,
  orderSchema,
  quickRegisterSchema,
};
