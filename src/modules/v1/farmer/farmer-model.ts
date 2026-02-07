import mongoose, { Schema, Document, Model } from "mongoose";
import bcrypt from "bcryptjs";

export interface IFarmer extends Document {
  name: string;
  address: string;
  mobileNumber: string;
  imageUrl?: string;
  password: string;

  createdAt: Date;
  updatedAt: Date;
}

const farmerSchema = new Schema<IFarmer>(
  {
    name: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    address: {
      type: String,
      required: true,
    },

    mobileNumber: {
      type: String,
      required: true,
      unique: true,
    },

    imageUrl: {
      type: String,
      default: "",
    },

    password: {
      type: String,
      required: true,
      select: false,
    },
  },
  {
    timestamps: true,
  },
);

/* -------------------- PRE-SAVE HOOKS -------------------- */

farmerSchema.pre("save", async function (this: mongoose.Document & IFarmer) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified("password")) {
    return;
  }

  // Hash password with cost of 10
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

export const Farmer: Model<IFarmer> =
  mongoose.models.Farmer || mongoose.model<IFarmer>("Farmer", farmerSchema);
