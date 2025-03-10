import mongoose from "mongoose";

const superAdminSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, // Simple email validation regex
    },
    password: {
      type: String,
      required: true,
      minlength: 6, // Ensuring a minimum password length
    },
  },
  { timestamps: true }
); // Adds createdAt & updatedAt fields

const SuperAdmin = mongoose.model("SuperAdmin", superAdminSchema);

export default SuperAdmin;
