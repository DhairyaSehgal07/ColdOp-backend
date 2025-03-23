import mongoose from "mongoose";

const farmerOrderSchema = mongoose.Schema({
  storeAdminId: { type: String, required: true },
  dateOfSubmission: { type: Date, default: Date.now },
  variety: { type: String, required: true },
  typeOfBag: { type: String, required: true },
  lotNumber: { type: String, required: true },
  quantity: { type: Number, required: true },
  floor: { type: String, required: true },
  row: { type: String, required: true },
  chamber: { type: String, required: true },
  isPaid: { type: Boolean, required: true, default: false },
});

const farmerSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    address: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      required: true,
    },
    mobileNumber: {
      type: String,
      required: true,
      unique: true,
    },

    role: {
      type: String,
      enum: ["superadmin", "admin", "user"],
      default: "user",
    },
    imageUrl: {
      type: String,
      default: "",
    },
    registeredStoreAdmins: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "StoreAdmin",
      },
    ],
    farmerId: {
      type: String,
      required: true,
    },
    farmerOrders: [farmerOrderSchema],
    isVerified: {
      type: Boolean,
      default: true,
    },
    forgotPasswordToken: String,
    forgotPasswordTokenExpiry: Date,
  },
  { timestamps: true }
);

farmerSchema.index({ 
  farmerId: 1, 
  "registeredStoreAdmins.0": 1 
}, { unique: true });

const Farmer = mongoose.model("Farmers", farmerSchema);

export default Farmer;
