import mongoose from "mongoose";

const storeAdminSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    personalAddress: {
      type: String,
      required: true,
    },
    mobileNumber: {
      type: String,
      required: true,
      unique: true,
    },
    imageUrl: {
      type: String,
      default: "",
    },

    password: {
      type: String,
      required: true,
    },

    coldStorageDetails: {
      coldStorageName: {
        type: String,
        required: true,
      },
      coldStorageAddress: {
        type: String,
        required: true,
      },
      coldStorageContactNumber: {
        type: String,
        required: true,
      },
      capacity: Number,
    },
    registeredFarmers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Farmers",
      },
    ],
    role: {
      type: String,
      default: "store-admin",
    },
    isVerified: {
      type: Boolean,
    },
    storeAdminId: {
      type: Number,
      unique: true,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    isPaid: {
      type: Boolean,
      default: false,
    },
    preferences: {
      bagSizes: {
        type: [String],
        default: ["Ration", "Seed", "Number-12", "Goli", "Cut-tok"],
      },
    },
    forgotPasswordToken: String,
    forgotPasswordTokenExpiry: Date,
  },
  { timestamps: true }
);

const StoreAdmin = mongoose.model("StoreAdmin", storeAdminSchema);

export default StoreAdmin;