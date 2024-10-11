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
        type: Number,
        required: true,
      },
    },
  ],
});

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
    orderDetails: [orderDetailsSchema],

    // Add the new array of orderModel references
    relatedOrders: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
        required: true,
      },
    ],
  },
  { timestamps: true }
);

const OutgoingOrder = mongoose.model("OutgoingOrder", outgoingOrderSchema);

export default OutgoingOrder;
