import mongoose from "mongoose";

const paymentHistorySchema = new mongoose.Schema({
  outgoingOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "OutgoingOrder",
    required: true,
  },
  totalAmount: {
    type: Number,
    required: true,
  },
  paymentEntries: [
    {
      amountPaid: {
        type: Number,
        required: true,
      },
      amountLeft: {
        type: Number,
        required: true,
      },
      date: {
        type: String,
      },
    },
  ],
});
const PaymentHistory = mongoose.model("PaymentModel", paymentHistorySchema);

export default PaymentHistory;
