import StoreAdmin from "../../models/storeAdminModel.js";
import UserVerification from "../../models/userVerificationModel.js";
import { mobileNumberSchema } from "../validationSchemas.js";
import twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

// Initialize Twilio client with account SID and auth token
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

function generateOtp() {
  return Math.floor(1000 + Math.random() * 9000);
}

// Send OTP function
async function sendOtp(mobileNumber, otp) {
  const messageBody = `Your mobile verification otp is ${otp}`;
  const phoneNumber = `+91${mobileNumber}`;

  try {
    await twilioClient.messages.create({
      body: messageBody,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber,
    });
    console.log(messageBody);
  } catch (err) {
    console.error("Failed to send OTP:", err);
    throw new Error("Failed to send OTP");
  }
}

const mobileOtpHandler = async (req, reply) => {
  try {
    mobileNumberSchema.parse(req.body);

    const { mobileNumber } = req.body;

    const otp = generateOtp();

    // Generate otp and store it in the user verification model in db
    const userMobileVerification = await UserVerification.create({
      mobileNumber,
      mobileOtp: otp,
    });

    if (userMobileVerification) {
      // Send otp via twilio
      await sendOtp(mobileNumber, otp); // Pass mobileNumber and otp directly
      reply.code(200).send({
        status: "Success",
        message: `Added credentials in user verification, and OTP sent to +91 ${mobileNumber}`,
      });
    }
  } catch (err) {
    console.log(err); // Log the error for debugging
    if (err.code === 11000) {
      reply.code(400).send({
        status: "Fail",
        message: "Mobile number already in use",
      });
    } else {
      reply.code(500).send({
        status: "Fail",
        message: err.message,
      });
    }
  }
};

const resendOtpHandler = async (req, reply) => {
  mobileNumberSchema.parse(req.body);
  try {
    const { mobileNumber } = req.body;
    const user = await UserVerification.findOne({ mobileNumber });

    const deleteCurrentUserVerification = await user.deleteOne();

    if (deleteCurrentUserVerification) {
      reply.code(200).send({
        status: "Success",
        message: `A new otp has been sent to ${mobileNumber}`,
      });
      await mobileOtpHandler(req, reply);
    }
  } catch (err) {
    console.log(err.message);
    reply.code(500).send({
      status: "Fail",
      message: "Some error occured while resending otp ",
    });
  }
};

const verifyStoreAdminMobile = async (req, reply) => {
  try {
    const { mobileNumber, enteredOtp } = req.body;
    const verifyUser = await UserVerification.findOne({ mobileNumber });

    if (!verifyUser) {
      return reply.code(404).send({
        status: "Fail",
        message: "User verification record not found",
      });
    }

    if (verifyUser.mobileOtp === enteredOtp) {
      // Update user verification status  but store-admin toh register hi nahi hua !! toh ye vala code use karo update profile vale case me !

      // const storeAdmin = await StoreAdmin.findOne({ mobileNumber });
      // if (!storeAdmin) {
      //   return reply.code(404).send({
      //     status: "Fail",
      //     message: "User not found",
      //   });
      // }
      // storeAdmin.isVerified = true;
      // await storeAdmin.save();

      // Delete document from UserVerification collection
      await verifyUser.deleteOne();

      return reply.code(200).send({
        status: "Success",
        message: "Mobile verified successfully",
      });
    } else {
      return reply.code(400).send({
        status: "Fail",
        message: "Incorrect OTP",
      });
    }
  } catch (err) {
    console.error(err); // Log the error for debugging
    return reply.code(500).send({
      status: "Fail",
      message: "Some error occurred while verifying OTP",
    });
  }
};

export { mobileOtpHandler, verifyStoreAdminMobile, resendOtpHandler };
