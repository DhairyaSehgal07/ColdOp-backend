import mongoose from "mongoose";

const orderDetailsSchema = new mongoose.Schema({
  _id: false,
  variety: {
    type: String,
    required: true,
  },

  bagSizes: [
    {
      _id: false,
      size: {
        type: String,
        required: true,
      },
      quantity: {
        initialQuantity: {
          type: Number,
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
    type: String, // Changed from object to string
    required: true,
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
    remarks: {
      type: String, // Added the remarks field
    },
    orderDetails: [orderDetailsSchema],
  },
  { timestamps: true }
);

// Define the model
const Order = mongoose.model("Order", orderSchema);

export default Order;
