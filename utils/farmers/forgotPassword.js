import Farmer from "../../models/farmerModel.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import twilio from "twilio";
import { mobileNumberSchema } from "../validationSchemas.js";
import dotenv from "dotenv";
dotenv.config();

// Initialise Twilio client
const accountSid = process.env.ACCOUNT_SID;
const authToken = process.env.AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
// Initialization of Twilio Client
const client = twilio(accountSid, authToken);

const sendLink = async ({ mobileNumber, userId }) => {
  try {
    // Generate JWT token with expiry
    const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    // Find user by mobile number
    const user = await Farmer.findOne({ mobileNumber });

    if (user) {
      // Update user document with token and expiry
      user.forgotPasswordToken = token;
      user.forgotPasswordTokenExpiry = Date.now() + 3600000; // 1 hour expiry
      await user.save(); // Save the updated user document

      // Create message body with reset password link
      const messageBody = ` Reset your password by clicking here:  ${process.env.DOMAIN}/reset-password?token=${token}`;

      const phoneNumber = `+91${mobileNumber}`;

      // Send message
      await client.messages.create({
        body: messageBody,
        from: twilioPhoneNumber,
        to: phoneNumber,
      });

      console.log(messageBody);
    } else {
      throw new Error("User not found");
    }
  } catch (err) {
    throw new Error(err.message);
  }
};

const forgotPasswordGetMobile = async (req, reply) => {
  try {
    mobileNumberSchema.parse(req.body);
    const { mobileNumber } = req.body;

    const farmer = await Farmer.findOne({ mobileNumber });

    if (farmer) {
      await sendLink({ mobileNumber, userId: farmer._id });

      reply.code(200).send({
        status: "Success",
        message: `Message has been sent to ${mobileNumber}`,
      });
    } else {
      reply.code(404).send({
        status: "Fail",
        message: "User not found. Please try signing up",
      });
    }
  } catch (err) {
    reply.code(500).send({
      status: "Fail",
      message: err.message,
    });
  }
};

const resetPasswordForm = async (req, reply) => {
  const { token } = req.query;
  try {
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    const { userId } = decodedToken;

    const farmer = await Farmer.findOne({ _id: userId });

    if (farmer) {
      return reply.view("../backend/views/reset.ejs");
    } else {
      return reply.status(404).send({
        error: "User not found",
      });
    }
  } catch (err) {
    return reply.code(500).send({
      status: "Fail",
      message: err.message,
    });
  }
};

const updatePassword = async (req, reply) => {
  try {
    const { token } = req.query;
    const { newPassword } = req.body;
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    const { userId } = decodedToken;

    const farmer = await Farmer.findOne({ _id: userId });
    if (farmer) {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      farmer.password = hashedPassword;
      farmer.forgotPasswordToken = undefined;
      farmer.forgotPasswordTokenExpiry = undefined;

      await farmer.save();
      reply.code(200).send({
        status: "Success",
        message: "Password updated",
      });
    } else {
      reply.status(404).send({
        error: "User not found",
      });
    }
  } catch (err) {
    console.error("Error finding the user by token:", err.message);
    reply.code(500).send({
      error: "Error finding the user by token",
    });
  }
};

const handleResetPasswordSuccess = (req, reply) => {
  reply.code(200);
  return reply.view("../backend/views/success.ejs");
};

export {
  forgotPasswordGetMobile,
  resetPasswordForm,
  updatePassword,
  handleResetPasswordSuccess,
};
