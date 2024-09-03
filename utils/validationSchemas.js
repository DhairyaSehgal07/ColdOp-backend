import { z } from "zod";

const registerSchema = z.object({
  name: z.string().min(2).max(50),
  address: z.string().min(2).max(100),
  mobileNumber: z.string().length(10),
  password: z.string().min(6),
  imageUrl: z.string(),
});

const loginSchema = z.object({
  mobileNumber: z.string().length(10),
  password: z.string().min(6),
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
  coldStorageId: z.string().nonempty(),
  farmerId: z.string().nonempty(),
  cropDetails: z.object({
    dateOfSubmission: z.string().nonempty(),
    variety: z.string().nonempty(),
    typeOfBag: z.string().nonempty(),
    lotNumber: z.string().nonempty(),
    quantity: z.string().nonempty(),
    floor: z.string().nonempty(),
    row: z.string().nonempty(),
    chamber: z.string().nonempty(),
  }),
  orderStatus: z.enum(["inStore", "extracted"]).default("inStore"),
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
