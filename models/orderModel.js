import mongoose from "mongoose";

const trolleyDetailsSchema = new mongoose.Schema({
  variety: {
    type: String,
    required: true,
  },
  bagSizes: [
    {
      size: {
        type: String,
        enum: ["Goli", "number-12", "seed", "ration", "cut"], // Added enum for bag sizes
        required: true,
      },
      quantity: {
        type: Number,
        required: true,
        default: 0, // Default quantity to 0 if not provided
      },
    },
  ],
  location: {
    floor: {
      type: String,
      required: true,
    },
    row: {
      type: String,
      required: true,
    },
    chamber: {
      type: String,
      required: true,
    },
  },
});

const orderSchema = new mongoose.Schema(
  {
    coldStorageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StoreAdmin",
      required: true,
    },
    farmerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Farmer",
      required: true,
    },
    trolleyNumber: {
      type: Number,
      required: true,
    },
    dateOfSubmission: {
      type: String,
      required: true,
    },
    orderDetails: [trolleyDetailsSchema],
    orderStatus: {
      type: String,
      enum: ["inStore", "extracted"],
      default: "inStore",
    },
  },
  { timestamps: true }
);

// Define the model
const Order = mongoose.model("Order", orderSchema);

export default Order;
