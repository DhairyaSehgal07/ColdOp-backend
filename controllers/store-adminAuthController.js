import bcrypt from "bcryptjs";
import StoreAdmin from "../models/storeAdminModel.js";
import generateToken from "../utils/generateToken.js";
import {
  loginSchema,
  storeAdminRegisterSchema,
  storeAdminUpdateSchmea,
  quickRegisterSchema,
  farmerIdSchema,
} from "../utils/validationSchemas.js";
import Farmer from "../models/farmerModel.js";
import Request from "../models/requestModel.js";
import generateUniqueAlphaNumeric from "../utils/farmers/generateUniqueAlphaNumeric.js";
import { formatFarmerName, formatName } from "../utils/helpers.js";

// @desc register a store-admin
// @route POST/api/store-admin/register
// @access Public
const registerStoreAdmin = async (req, reply) => {
  try {
    req.log.info("Starting store admin registration process");
    storeAdminRegisterSchema.parse(req.body);
    const {
      name,
      personalAddress,
      mobileNumber,
      password,
      coldStorageName,
      coldStorageAddress,
      coldStorageContactNumber,
      capacity,
      preferences,
      isVerified,
      isMobile,
      imageUrl,
    } = req.body;
    req.log.info("Parsed request body", { mobileNumber, name });
    const storeAdminExists = await StoreAdmin.findOne({ mobileNumber });
    if (storeAdminExists) {
      req.log.warn("Attempt to register existing store admin", {
        mobileNumber,
      });
      return reply.code(400).send({
        status: "Fail",
        message: "Store-admin already exists",
      });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const count = await StoreAdmin.countDocuments();
    // Increment the count to get the next available storeAdminId
    const storeAdminId = count + 1;
    const storeAdmin = await StoreAdmin.create({
      name,
      personalAddress,
      mobileNumber,
      password: hashedPassword,
      isVerified,
      imageUrl,
      coldStorageDetails: {
        coldStorageName,
        coldStorageAddress,
        coldStorageContactNumber,
        capacity,
      },
      preferences,
      storeAdminId: storeAdminId,
    });
    if (storeAdmin) {
      req.log.info("Store admin registered successfully", {
        storeAdminId,
        name,
      });
      const token = generateToken(reply, storeAdmin._id, isMobile);
      return reply.code(201).send({
        status: "Success",
        data: {
          name: storeAdmin.name,
          personalAddress: storeAdmin.personalAddress,
          mobileNumber: storeAdmin.mobileNumber,
          coldStorageDetails: storeAdmin.coldStorageDetails,
          isVerified: storeAdmin.isVerified,
          isActive: storeAdmin.isActive,
          isPaid: storeAdmin.isPaid,
          role: storeAdmin.role,
          storeAdminId: storeAdminId,
          token: token,
          imageUrl: req.body.imageUrl,
          preferences: storeAdmin.preferences,
          _id: storeAdmin._id,
        },
      });
    }
  } catch (err) {
    req.log.error("Error during store admin registration", { err });
    return reply.code(500).send({
      status: "Fail",
      message: "Some error occured while registering store-admin",
      errorMessage: err.message,
    });
  }
};

//@desc login store-admin
//@route POST/api/store-admin/login
//@access Public
const loginStoreAdmin = async (req, reply) => {
  try {
    req.log.info("Starting store admin login process");

    // Validate the request body
    loginSchema.parse(req.body);
    req.log.info("Parsed request body", {
      mobileNumber: req.body.mobileNumber,
    });

    const { mobileNumber, password, isMobile } = req.body;

    // Check if the store admin exists
    const storeAdmin = await StoreAdmin.findOne({ mobileNumber });

    if (storeAdmin) {
      req.log.info("Store admin found", { mobileNumber });

      // Compare the provided password with the stored hash
      const isPasswordMatch = await bcrypt.compare(
        password,
        storeAdmin.password
      );

      if (isPasswordMatch) {
        req.log.info("Password match successful", {
          storeAdminId: storeAdmin.storeAdminId,
        });

        // Generate token and send success response
        const token = generateToken(reply, storeAdmin._id, isMobile);

        req.log.info("Token generated for store admin", {
          storeAdminId: storeAdmin.storeAdminId,
        });

        return reply.code(200).send({
          status: "Success",
          data: {
            name: storeAdmin.name,
            personalAddress: storeAdmin.personalAddress,
            mobileNumber: storeAdmin.mobileNumber,
            coldStorageDetails: storeAdmin.coldStorageDetails,
            isVerified: storeAdmin.isVerified,
            isActive: storeAdmin.isActive,
            isPaid: storeAdmin.isPaid,
            role: storeAdmin.role,
            token: token,
            storeAdminId: storeAdmin.storeAdminId,
            imageUrl: storeAdmin.imageUrl,
            preferences: storeAdmin.preferences,
            _id: storeAdmin._id,
          },
        });
      } else {
        req.log.warn("Password mismatch", { mobileNumber });

        // Invalid password case
        return reply.code(400).send({
          status: "Fail",
          message: "Invalid password",
        });
      }
    } else {
      req.log.warn("Store admin not found", { mobileNumber });

      // Store admin doesn't exist
      return reply.code(400).send({
        status: "Fail",
        message: "User does not exist, try signing up",
      });
    }
  } catch (err) {
    req.log.error("Error during store admin login", { err });

    // Handle unexpected errors
    return reply.code(500).send({
      status: "Fail",
      message: "Some error occured during store admin login",
      errorMessage: err.message,
    });
  }
};

// @desc log out store-admin
// @route POST /api/store-admin/logout
// @access Private
const logoutStoreAdmin = async (req, reply) => {
  try {
    req.log.info("Starting store admin logout process");

    // Clear the JWT cookie by setting an empty value and an expired date
    reply.cookie("jwt", "", {
      httpOnly: true,
      expires: new Date(0),
    });
    req.log.info("JWT cookie cleared successfully");

    // If using session management, uncomment the session deletion
    // req.session.delete();

    // Send success response
    reply.code(200).send({
      status: "Success",
      message: "User logged out successfully",
    });

    req.log.info("Store admin logged out successfully");
  } catch (err) {
    req.log.error("Error during store admin logout", { err });

    // Handle any errors that occur during logout
    reply.code(500).send({
      status: "Fail",
      message: "Some error occured during store admin logout",
      errorMessage: err.message,
    });
  }
};

//@desc get store-admin profile
//@route GET/api/store-admin/profile
//@access Private
const getStoreAdminProfile = async (req, reply) => {
  try {
    req.log.info("Starting to fetch store admin profile", {
      storeAdminId: req.storeAdmin._id,
    });

    // Extract the store admin profile details from the request
    const storeAdmin = {
      _id: req.storeAdmin._id,
      name: req.storeAdmin.name,
      personalAddress: req.storeAdmin.personalAddress,
      mobileNumber: req.storeAdmin.mobileNumber,
      imageUrl: req.storeAdmin.imageUrl,
      isVerified: req.storeAdmin.isVerified,
      isActive: req.storeAdmin.isActive,
      isPaid: req.storeAdmin.isPaid,
      coldStorageDetails: {
        coldStorageName: req.storeAdmin.coldStorageDetails.coldStorageName,
        coldStorageAddress:
          req.storeAdmin.coldStorageDetails.coldStorageAddress,
        coldStorageContactNumber:
          req.storeAdmin.coldStorageDetails.coldStorageContactNumber,
      },
    };

    req.log.info("Store admin profile fetched successfully", {
      storeAdminId: storeAdmin._id,
    });

    // Send the profile data as a response
    reply.code(200).send({
      status: "Success",
      data: storeAdmin,
    });
  } catch (err) {
    req.log.error("Error fetching store admin profile", { err });

    // Handle any errors
    reply.code(500).send({
      status: "Fail",
      message: "Some error occured while fetching farmer profile",
      errorMessage: err.message,
    });
  }
};

//@desc update store-admin profile
//@route UPDATE/api/store-admin/profile
//@access Private
const updateStoreAdminProfile = async (req, reply) => {
  try {
    req.log.info("Starting store admin profile update", {
      storeAdminId: req.storeAdmin._id,
    });

    // Check if store admin session exists
    const storeAdmin = await StoreAdmin.findById(req.storeAdmin._id);
    if (!storeAdmin) {
      req.log.warn("Unauthorized access attempt - store admin not found", {
        storeAdminId: req.storeAdmin._id,
      });
      return reply.code(401).send({
        status: "Fail",
        message: "Unauthorized",
      });
    }

    req.log.info("Store admin found, proceeding with update", {
      storeAdminId: storeAdmin._id,
    });

    // Validate request body
    storeAdminUpdateSchmea.parse(req.body);

    const updatedFields = {};

    // Update store admin fields if provided in request body
    if (req.body.name) updatedFields.name = req.body.name;
    if (req.body.address) updatedFields.personalAddress = req.body.address;
    if (req.body.mobileNumber)
      updatedFields.mobileNumber = req.body.mobileNumber;
    if (req.body.coldStorageName)
      updatedFields.coldStorageDetails.coldStorageName =
        req.body.coldStorageName;
    if (req.body.coldStorageContactNumber)
      updatedFields.coldStorageDetails.coldStorageContactNumber =
        req.body.coldStorageContactNumber;
    if (req.body.coldStorageAddress)
      updatedFields.coldStorageDetails.coldStorageAddress =
        req.body.coldStorageAddress;
    if (req.body.coldStorageGSTNumber)
      updatedFields.coldStorageDetails.coldStorageGSTNumber =
        req.body.coldStorageGSTNumber;

    // Log which fields are being updated
    req.log.info("Updating store admin profile fields", { updatedFields });

    // Update password if provided in request body
    if (req.body.password) {
      const hashedPassword = await bcrypt.hash(req.body.password, 10);
      updatedFields.password = hashedPassword;
      req.log.info("Password updated for store admin", {
        storeAdminId: storeAdmin._id,
      });
    }

    // Find and update store admin profile
    const updatedStoreAdmin = await StoreAdmin.findByIdAndUpdate(
      storeAdmin._id,
      { $set: updatedFields },
      { new: true }
    );

    if (!updatedStoreAdmin) {
      req.log.warn("Store admin not found during update", {
        storeAdminId: storeAdmin._id,
      });
      return reply.code(404).send({
        status: "Fail",
        message: "Store admin not found",
      });
    }

    req.log.info("Store admin profile updated successfully", {
      storeAdminId: updatedStoreAdmin._id,
    });

    // Send updated store admin profile in response
    reply.code(200).send({
      status: "Success",
      data: {
        name: updatedStoreAdmin.name,
        personalAddress: updatedStoreAdmin.personalAddress,
        mobileNumber: updatedStoreAdmin.mobileNumber,
        coldStorageDetails: updatedStoreAdmin.coldStorageDetails,
        isVerified: updatedStoreAdmin.isVerified,
        isActive: updatedStoreAdmin.isActive,
        isPaid: updatedStoreAdmin.isPaid,
        role: updatedStoreAdmin.role,
        storeAdminId: updatedStoreAdmin.storeAdminId,
        imageUrl: updatedStoreAdmin.imageUrl,
        preferences: updatedStoreAdmin.preferences,
        _id: updatedStoreAdmin._id,
      },
    });
  } catch (err) {
    req.log.error("Error updating store admin profile", { err });
    reply.code(500).send({
      status: "Fail",
      message: "Some error occured while updating store admin profile",
      errorMessage: err.message,
    });
  }
};

//@desc gets the number of store-admins for store-admin id
// @route GET/api/store-admin/count
// @access Public
const getNumberOfStoreAdmins = async (req, reply) => {
  try {
    const count = await StoreAdmin.countDocuments();
    reply.code(200).send({
      status: "Success",
      data: {
        count: count,
      },
    });
  } catch (err) {
    reply.code(500).send({
      status: "Fail",
      message: err.message,
    });
  }
};

////////////////// Store-admin function routes //////////////////////

//@desc Send req to farmer
//@route POST /api/store-admin/send-request
//@access Private
const sendRequestToFarmer = async (req, reply) => {
  try {
    req.log.info("Starting send request to farmer process", {
      storeAdminId: req.storeAdmin._id,
    });

    // Validate the request body using the schema
    farmerIdSchema.parse(req.body);

    const senderId = req.storeAdmin._id;
    const { farmerId } = req.body;

    // Log the farmerId and senderId
    req.log.info("Parsed request body", { senderId, farmerId });

    // Find the farmer by farmerId
    const receiver = await Farmer.findOne({ farmerId });
    if (!receiver) {
      req.log.warn("Farmer not found", { farmerId });
      return reply.code(404).send({
        status: "Fail",
        message: "Farmer not found, please re-check the farmerId",
      });
    }

    const receiverId = receiver._id;
    req.log.info("Farmer found", { receiverId });

    // Check if the farmer is already registered with the cold storage
    const isRegistered = req.storeAdmin.registeredFarmers.includes(receiverId);
    if (isRegistered) {
      req.log.warn("Farmer is already registered", { receiverId });
      return reply.code(400).send({
        status: "Fail",
        message: "Farmer is already registered with this cold storage",
      });
    }

    // Log the current date
    const currentDate = new Date().toLocaleDateString("en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    req.log.info("Current date for the request", { currentDate });

    // Check if a request already exists
    const existingRequest = await Request.findOne({ senderId, receiverId });
    if (existingRequest) {
      req.log.warn("Duplicate request detected", { senderId, receiverId });
      return reply.code(400).send({
        status: "Fail",
        message: "You have already sent the request",
      });
    }

    // Create a new friend request
    const newRequest = new Request({ senderId, receiverId, date: currentDate });
    await newRequest.save();
    req.log.info("New request created", {
      senderId,
      receiverId,
      date: currentDate,
    });

    // Add the farmer to the list of registered farmers for the cold storage
    req.storeAdmin.registeredFarmers.push(receiverId);
    await req.storeAdmin.save();
    req.log.info("Farmer registered to cold storage", {
      storeAdminId: req.storeAdmin._id,
      receiverId,
    });

    reply.code(201).send({
      status: "Success",
      message: "Request sent successfully",
    });
  } catch (err) {
    req.log.error("Error in sending request to farmer", { error: err.message });
    reply.code(500).send({
      status: "Fail",
      message: "Some error occured while sending request to farmer",
      errorMessage: err.message,
    });
  }
};

// @desc    Get all farmers
// @route   GET /api/store-admin/farmers
// @access  Private/store-admin
const getFarmers = async (req, reply) => {
  try {
    req.log.info("Starting getFarmers process", {
      storeAdminId: req.storeAdmin._id,
    });

    const { registeredFarmers } = req.storeAdmin;

    // Log the number of registered farmers
    req.log.info("Number of registered farmers", {
      count: registeredFarmers.length,
    });

    if (registeredFarmers.length === 0) {
      req.log.warn("No registered farmers found");
      return reply.code(200).send({
        status: "Fail",
        message: "No registered farmers",
      });
    }

    // Fetch all registered farmers and log the process
    const populatedFarmers = await Promise.all(
      registeredFarmers.map(async (item) => {
        req.log.info("Fetching farmer details", { farmerId: item });
        const farmer = await Farmer.findById(item)
          .select("name mobileNumber _id address createdAt")
          .exec();

        if (!farmer) {
          req.log.warn("Farmer not found", { farmerId: item });
        } else {
          req.log.info("Farmer details fetched successfully", {
            farmerId: item,
          });
        }

        return farmer;
      })
    );

    req.log.info("Farmers successfully fetched", {
      storeAdminId: req.storeAdmin._id,
      farmerCount: populatedFarmers.length,
    });

    reply.code(200).send({
      status: "Success",
      populatedFarmers,
    });
  } catch (err) {
    req.log.error("Error in getFarmers process", { error: err.message });
    reply.code(500).send({
      status: "Fail",
      errorMessage: err.message,
      message: "Some error occured while getting farmers",
    });
  }
};

// @desc    Get farmer by ID
// @route   GET /api/store-admin/farmers/:id
// @access  Private/store-admin
const getFarmerById = async (req, reply) => {
  try {
    const { id } = req.params;

    // Log the ID of the farmer being fetched
    req.log.info("Fetching farmer", { farmerId: id });

    // Find farmer by ID
    const farmer = await Farmer.findById(id);

    if (farmer) {
      const farmerInfo = {
        name: farmer.name,
        address: farmer.address,
        mobileNumber: farmer.mobileNumber,
        isVerified: farmer.isVerified,
        imageUrl: farmer.imageUrl,
        role: farmer.role,
        farmerId: farmer.farmerId,
        _id: farmer._id,
      };

      // Log successful farmer retrieval
      req.log.info("Farmer found", { farmerName: farmer.name, farmerId: id });
      reply.code(200).send({
        status: "Success",
        farmerInfo,
      });
    } else {
      // Log when farmer is not found
      req.log.warn("Farmer not found", { farmerId: id });
      reply.code(404).send({
        status: "Fail",
        message: "Farmer not found",
      });
    }
  } catch (err) {
    // Log detailed error message
    req.log.error("Error fetching farmer", {
      farmerId: id,
      error: err.message,
    });
    reply.code(500).send({
      status: "Fail",
      message: "Some error occurred while finding farmer",
      errorMessage: err.message,
    });
  }
};

// @desc    Update farmer
// @route   PUT /api/farmers/:id
// @access  Private/store-admin
const updateFarmer = (req, res) => {
  res.send("update single farmer by id");
};

// @desc    Delete farmer
// @route   DELETE /api/farmer/:id
// @access  Private/store-admin
const deleteFarmer = async (req, res) => {
  try {
    req.log.info("Starting deleteUser process", {
      storeAdminId: req.storeAdmin._id,
    });

    const { userId } = req.body;
    const storeAdmin = await StoreAdmin.findById(req.storeAdmin);

    // Check if the StoreAdmin exists
    if (!storeAdmin) {
      req.log.warn("StoreAdmin not found", {
        storeAdminId: req.storeAdmin._id,
      });
      return res
        .status(404)
        .json({ status: "Fail", message: "StoreAdmin not found" });
    }

    // Log if the farmer is found in registeredFarmers
    req.log.info("Checking if farmer is registered", { userId });

    const index = storeAdmin.registeredFarmers.indexOf(userId);
    if (index !== -1) {
      storeAdmin.registeredFarmers.splice(index, 1);

      // Save the updated StoreAdmin document
      await storeAdmin.save();

      req.log.info("Farmer deleted successfully", {
        userId,
        storeAdminId: storeAdmin._id,
      });
      return res
        .status(200)
        .json({ status: "Success", message: "User deleted successfully" });
    } else {
      // Log when the user is not found in registeredFarmers array
      req.log.warn("User not found in registeredFarmers array", { userId });
      return res.status(404).json({
        status: "Fail",
        message: "User not found in registeredFarmers array",
      });
    }
  } catch (err) {
    req.log.error("Error deleting user", { error: err.message });
    return res.code(500).send({
      status: "Fail",
      message: "Some error occurred while deleting user",
      errorMessage: err.message,
    });
  }
};

//@desc Quick add farmer
//@route POST/api/store-admin/quick-register
//@access Private
const quickRegisterFarmer = async (req, reply) => {
  try {
    // Validate the request body
    const storeAdminId = req.storeAdmin._id;
    quickRegisterSchema.parse(req.body);

    // Check if farmerId is present
    if (!req.body.farmerId) {
      req.log.warn("FarmerId is missing in the request body");
      return reply.code(400).send({
        status: "Fail",
        message: "FarmerId is required",
      });
    }

    // Extract data from the request body
    const { name, address, mobileNumber, password, imageUrl, farmerId } = req.body;
    const formattedName = formatFarmerName(name);

    // Log farmer existence check
    req.log.info("Checking if farmer already exists", { mobileNumber });

    // Check if a farmer with the given mobile number already exists
    const farmerExists = await Farmer.findOne({ mobileNumber });
    if (farmerExists) {
      req.log.warn("Farmer already exists with this mobile number", { mobileNumber });
      return reply.code(400).send({
        status: "Fail",
        message: "Farmer already exists with this mobile number",
      });
    }

    // Check for unique combination of farmerId and first registeredStoreAdmin
    const existingFarmer = await Farmer.findOne({
      farmerId: farmerId,
      registeredStoreAdmins: { $elemMatch: { $eq: storeAdminId } }
    });

    if (existingFarmer) {
      req.log.warn("Farmer ID already registered with this cold storage", {
        farmerId,
        storeAdminId
      });
      return reply.code(400).send({
        status: "Fail",
        message: "This Farmer ID is already registered under this cold storage. Please either change the Farmer ID or register with a different cold storage."
      });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    req.log.info("Password hashed successfully");

    // Create the new farmer record
    req.log.info("Creating new farmer record", {
      name,
      mobileNumber,
      farmerId,
      storeAdminId
    });

    const farmer = await Farmer.create({
      name: formattedName,
      address,
      mobileNumber,
      password: hashedPassword,
      imageUrl,
      farmerId,
      isVerified: false,
      registeredStoreAdmins: [storeAdminId]
    });

    if (farmer) {
      // Update store admin's registeredFarmers array
      await StoreAdmin.findByIdAndUpdate(
        storeAdminId,
        { $addToSet: { registeredFarmers: farmer._id } },
        { new: true }
      );

      req.log.info("Farmer registered successfully", {
        farmerId: farmer.farmerId,
        storeAdminId
      });

      return reply.code(201).send({
        status: "Success",
        message: "Farmer registered successfully",
        data: {
          farmerId: farmer.farmerId,
          name: farmer.name,
          mobileNumber: farmer.mobileNumber
        }
      });
    }
  } catch (err) {
    req.log.error("Error occurred during farmer registration", {
      error: err.message,
    });
    reply.code(500).send({
      status: "Fail",
      message: "Some error occurred while adding farmer",
      errorMessage: err.message,
    });
  }
};

const getFarmersIdsForCheck = async (req, reply) => {
  try {
    // Get the store admin document with populated registeredFarmers
    const storeAdmin = await StoreAdmin.findById(req.storeAdmin._id);

    // Filter out any non-existent farmers and get their IDs
    const validFarmerIds = [];
    const invalidFarmerIds = [];

    for (const farmerId of storeAdmin.registeredFarmers) {
      const farmerExists = await Farmer.findById(farmerId);
      if (farmerExists) {
        validFarmerIds.push(farmerExists.farmerId);
      } else {
        invalidFarmerIds.push(farmerId);
      }
    }

    // If there were any invalid IDs, remove them from the store admin's registeredFarmers
    if (invalidFarmerIds.length > 0) {
      await StoreAdmin.findByIdAndUpdate(
        req.storeAdmin._id,
        {
          $pull: { registeredFarmers: { $in: invalidFarmerIds } }
        }
      );
    }

    reply.code(200).send({
      status: "Success",
      data: {
        registeredFarmers: validFarmerIds,
      },
    });
  } catch (err) {
    reply.code(500).send({
      status: "Fail",
      message: err.message,
    });
  }
};

export {
  registerStoreAdmin,
  loginStoreAdmin,
  logoutStoreAdmin,
  getStoreAdminProfile,
  updateStoreAdminProfile,
  getNumberOfStoreAdmins,
  sendRequestToFarmer,
  getFarmers,
  getFarmerById,
  updateFarmer,
  deleteFarmer,
  quickRegisterFarmer,
  getFarmersIdsForCheck,
};
