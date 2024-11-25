import mongoose from "mongoose";

// Updated bagSizeSchema with 'quantityRemoved' field
const bagSizeSchema = new mongoose.Schema({
  _id: false,
  size: {
    type: String,
    required: true,
  },
  quantityRemoved: {
    type: Number,
    required: true,
  },
});

const orderDetailsSchema = new mongoose.Schema({
  _id: false,

  variety: {
    type: String,
    required: true,
  },

  incomingOrder: {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
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
    voucher: {
      type: {
        type: String,
        required: true,
      },
      voucherNumber: {
        type: Number,
        required: true,
      },
    },
    incomingBagSizes: [
      {
        size: {
          type: String,
          required: true,
        },
        currentQuantity: {
          type: Number,
          required: true,
        },
        initialQuantity: {
          type: Number,
          required: true,
        },
      },
    ],
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
    orderDetails: [orderDetailsSchema],
  },
  { timestamps: true }
);

const OutgoingOrder = mongoose.model("OutgoingOrder", outgoingOrderSchema);

export default OutgoingOrder;
