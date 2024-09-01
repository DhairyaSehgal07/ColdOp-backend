import mongoose from "mongoose";

const outgoingOrderSchema = new mongoose.Schema({
  storeAdminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "StoreAdmin",
    required: true,
  },
  farmerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Farmer",
    required: true,
  },
  orders: [
    {
      dateOfSubmission: {
        type: String,
        required: true,
      },
      variety: {
        type: String,
        required: true,
      },
      typeOfBag: {
        type: String,
        required: true,
      },
      lotNumber: {
        type: String,
        required: true,
        unique: true,
      },
      quantity: {
        type: String,
        required: true,
      },
      floor: {
        type: String,
        required: true,
      },
      row: {
        type: String,
        required: true,
      },
      chamber: {
        type: [String],
        required: true,
      },
    },
  ],
  totalAmount: {
    type: Number,
    required: true,
  },
  amountPaid: {
    type: Number,
    required: true,
  },
  date: {
    type: String,
  },
});

const OutgoingOrder = mongoose.model("OutgoingOrder", outgoingOrderSchema);

export default OutgoingOrder;
