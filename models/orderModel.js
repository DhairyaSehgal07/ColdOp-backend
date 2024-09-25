import mongoose from "mongoose";

const orderDetailsSchema = new mongoose.Schema({
  variety: {
    type: String,
    required: true,
  },
  // array of objects , each object with 2 properties size and qty
  bagSizes: [
    {
      size: {
        type: String,
        // enum: ["goli", "number-12", "seed", "ration", "cut"], // Added enum for bag sizes
        required: true,
      },
      quantity: {
        initialQuantity: {
          type: Number, // This will be used for creating markas
          required: true,
        },
        currentQuantity: {
          type: Number,
          required: true,
        },
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
    voucher: {
      type: {
        type: String,
        enum: ["RECEIPT", "DELIVERY", "RESTORE"],
        required: true,
      },
      voucherNumber: {
        type: Number,
        required: true,
      },
    },
    dateOfSubmission: {
      type: String,
      required: true,
    },
    fulfilled: {
      type: Boolean,
      default: false,
    },
    orderDetails: [orderDetailsSchema],
  },
  { timestamps: true }
);

// Define the model
const Order = mongoose.model("Order", orderSchema);

export default Order;
