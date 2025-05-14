const storeAdminSchema = mongoose.Schema(
  {
    name: {
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
    forgotPasswordToken: String,
    forgotPasswordTokenExpiry: Date,
    preferences: {
      bagSizes: {
        type: [String],
        default: ["ration", "seed", "number-12", "goli", "cut-tok"],
      },
      costPerBag: {
        type: Number,
        default: 0,
      },
    },
  },
  { timestamps: true }
);