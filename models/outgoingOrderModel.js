import mongoose from "mongoose";

// Updated bagSizeSchema with 'quantityRemoved' field
const bagSizeSchema = new mongoose.Schema({
  _id: false,
  size: {
    type: String,
    required: true,
  },
  quantityRemoved: {
    // Updated field name from 'quantityToBeRemoved' to 'quantityRemoved'
    type: Number,
    required: true,
  },
});

const orderDetailsSchema = new mongoose.Schema({
  _id: false,
  incomingOrder: {
    // Store orderId for each order detail
    type: mongoose.Schema.Types.ObjectId,
    ref: "Order",
    required: true,
  },
  variety: {
    type: String,
    required: true,
  },
  bagSizes: [bagSizeSchema], // Use bagSizeSchema to hold multiple bag sizes for each order
});

// Updated outgoing order schema
const outgoingOrderSchema = new mongoose.Schema(
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
        default: "DELIVERY",
        required: true,
      },
      voucherNumber: {
        type: Number,
        required: true,
      },
    },
    dateOfExtraction: {
      type: String,
      required: true,
    },
    orderDetails: [orderDetailsSchema], // Store the order details with orderId, variety, and bag sizes as requested
    incomingOrderDetails: [],
  },
  { timestamps: true }
);

const OutgoingOrder = mongoose.model("OutgoingOrder", outgoingOrderSchema);

export default OutgoingOrder;
