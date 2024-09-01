import mongoose from "mongoose";

const requestSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StoreAdmin",
      required: true,
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Farmer",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
    date: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

const Request = mongoose.model("Requests", requestSchema);

export default Request;
