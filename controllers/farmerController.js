import Farmer from "../models/farmerModel.js";
import StoreAdmin from "../models/storeAdminModel.js";
import bcrypt from "bcryptjs";
import {
  registerSchema,
  loginSchema,
  updateSchema,
  storeAdminIdSchema,
} from "../utils/validationSchemas.js";
import generateToken from "../utils/generateToken.js";
import generateUniqueAlphaNumeric from "../utils/farmers/generateUniqueAlphaNumeric.js";
import Request from "../models/requestModel.js";

// @desc register a farmer
// @route POST/api/farmers/register
// @access Public
const registerFarmer = async (req, reply) => {
  try {
    console.log("reqbody is: ", req.body);
    // Validate the request body
    registerSchema.parse(req.body);
    req.log.info("Request body validated successfully");

    // Extract data from the request body
    const { name, address, mobileNumber, password, imageUrl, isMobile } =
      req.body;

    // Check if a farmer with the given mobile number already exists
    req.log.info("Checking if a farmer with the mobile number exists", {
      mobileNumber,
    });
    const farmerExists = await Farmer.findOne({ mobileNumber });

    if (farmerExists) {
      req.log.warn("Farmer already exists with the provided mobile number", {
        mobileNumber,
      });
      return reply.code(400).send({
        status: "Fail",
        message: "Farmer already exists",
      });
    }

    let farmerId = (await Farmer.countDocuments()) + 1; // Start with length + 1
    req.log.info("Starting farmerId generation with length + 1", { farmerId });

    // Check if the generated farmerId is unique, increment until it's unique
    while (await Farmer.findOne({ farmerId })) {
      farmerId++;
      req.log.info("Incrementing farmerId to ensure uniqueness", { farmerId });
    }
    req.log.info("Unique farmerId generated", { farmerId });

    // Hash the password
    req.log.info("Hashing password");
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create the new farmer record
    req.log.info("Creating new farmer record");
    const farmer = await Farmer.create({
      name,
      address,
      mobileNumber,
      password: hashedPassword,
      imageUrl,
      farmerId, // Assign the generated farmerId
    });

    // If the farmer record is created successfully, generate a token and send the response
    if (farmer) {
      req.log.info("Farmer record created successfully", {
        farmerId: farmer._id,
      });

      // Generate token and send response
      const token = generateToken(reply, farmer._id, isMobile);

      reply.code(201).send({
        status: "Success",
        data: {
          name: farmer.name,
          address: farmer.address,
          mobileNumber: farmer.mobileNumber,
          isVerified: farmer.isVerified,
          imageUrl: farmer.imageUrl,
          role: farmer.role,
          token: token,
          farmerId: farmer.farmerId,
          _id: farmer._id,
        },
      });
    }
  } catch (err) {
    // Log and handle errors
    req.log.error("Error occurred while registering farmer", {
      errorMessage: err.message,
    });
    reply.code(500).send({
      status: "Fail",
      message: "Some error occurred while registering farmer",
      errorMessage: err.message,
    });
  }
};

// @desc login a farmer
// @route POST/api/farmers/login
// @access Public
const loginFarmer = async (req, reply) => {
  try {
    // Validate the request body
    loginSchema.parse(req.body);
    req.log.info("Request body validated successfully");

    const { mobileNumber, password, isMobile } = req.body;

    // Check if the farmer exists
    req.log.info("Searching for farmer with mobile number", { mobileNumber });
    const farmer = await Farmer.findOne({ mobileNumber });

    if (farmer) {
      req.log.info("Farmer found, checking password");

      // Compare the provided password with the stored hashed password
      const isPasswordMatch = await bcrypt.compare(password, farmer.password);

      if (isPasswordMatch) {
        req.log.info("Password match successful, generating token");
        const token = generateToken(reply, farmer._id, isMobile);

        return reply.code(200).send({
          status: "Success",
          data: {
            name: farmer.name,
            address: farmer.address,
            mobileNumber: farmer.mobileNumber,
            isVerified: farmer.isVerified,
            imageUrl: farmer.imageUrl,
            role: farmer.role,
            token: token,
            farmerId: farmer.farmerId,
            _id: farmer._id,
          },
        });
      } else {
        req.log.warn("Password mismatch for mobile number", { mobileNumber });
        return reply.code(400).send({
          status: "Fail",
          message: "Invalid password",
        });
      }
    } else {
      req.log.warn("Farmer with mobile number does not exist", {
        mobileNumber,
      });
      return reply.code(404).send({
        status: "Fail",
        message: "User does not exist, try signing up",
      });
    }
  } catch (err) {
    req.log.error("Error occurred during login", { errorMessage: err.message });
    reply.code(500).send({
      status: "Fail",
      message: "Some error occured during farmer login",
      errorMessage: err.message,
    });
  }
};

// @desc log out a farmer
// @route POST /api/farmers/logout
// @access Private
const logoutFarmer = async (req, reply) => {
  try {
    // Log the logout attempt
    req.log.info("Attempting to log out user");

    // Clear the JWT cookie
    reply.cookie("jwt", "", {
      httpOnly: true,
      expires: new Date(0),
    });

    req.log.info("JWT cookie cleared, user logged out successfully");

    reply.code(200).send({
      status: "Success",
      message: "User logged out successfully",
    });
  } catch (err) {
    req.log.error("Error occurred during logout", {
      errorMessage: err.message,
    });

    reply.code(500).send({
      status: "Fail",
      message: "Some error occured during farmer logout",
      errorMessage: err.message,
    });
  }
};

// @desc get farmer profile
// @route GET/api/farmers/profile
// @access Private
const getRegisteredStoreAdmins = async (req, reply) => {
  try {
    // Log the attempt to retrieve registered store admins
    req.log.info("Attempting to retrieve registered store admins");

    const { registeredStoreAdmins } = req.farmer;

    if (registeredStoreAdmins.length === 0) {
      req.log.info("No registered store admins found");
      return reply.code(200).send({
        status: "Success",
        registeredStoreAdmins: [],
      });
    }

    // Map over each ObjectId and populate it with the corresponding document
    const populatedAdmins = await Promise.all(
      registeredStoreAdmins.map(async (item) => {
        // Log the ID being processed
        req.log.info(`Fetching store admin with ID: ${item}`);

        // Use await to wait for the populate operation to finish
        return await StoreAdmin.findById(item)
          .select(
            "name mobileNumber coldStorageDetails.coldStorageName coldStorageDetails.coldStorageAddress coldStorageDetails.coldStorageContactNumber"
          )
          .exec();
      })
    );

    req.log.info("Successfully retrieved registered store admins");

    reply.code(200).send({
      status: "Success",
      registeredStoreAdmins: populatedAdmins, // Send the populated array
    });
  } catch (err) {
    req.log.error("Error occurred while retrieving registered store admins", {
      errorMessage: err.message,
    });

    reply.code(500).send({
      status: "Fail",
      message: "Some error occurred while getting registered store admins",
      errorMessage: err.message,
    });
  }
};

// @desc Update farmer profile
// @desc PUT/api/farmers/profile
// @access Private
const updateFarmerProfile = async (req, reply) => {
  try {
    // Log the attempt to update the farmer profile
    req.log.info("Attempting to update farmer profile");

    updateSchema.parse(req.body);
    const farmer = await Farmer.findById(req.farmer._id);

    if (farmer) {
      // Log the current profile details before updating
      req.log.info(`Current profile details for farmer ID ${farmer._id}:`, {
        name: farmer.name,
        address: farmer.address,
        mobileNumber: farmer.mobileNumber,
        imageUrl: farmer.imageUrl,
      });

      // Update farmer fields
      farmer.name = req.body.name || farmer.name;
      farmer.address = req.body.address || farmer.address;
      farmer.mobileNumber = req.body.mobileNumber || farmer.mobileNumber; // Fixed typo
      farmer.imageUrl = req.body.imageUrl || farmer.imageUrl;
      farmer.isVerified = true;

      // Log the updated fields
      req.log.info("Updated profile details:", {
        name: farmer.name,
        address: farmer.address,
        mobileNumber: farmer.mobileNumber,
        imageUrl: farmer.imageUrl,
      });

      // If the farmer updates the mobile number, verify the new mobile number again
      if (req.body.password) {
        const hashedPassword = await bcrypt.hash(req.body.password, 10);
        farmer.password = hashedPassword;
        req.log.info("Password updated for farmer ID:", farmer._id);
      }

      // Save the updated farmer profile
      const updatedFarmer = await farmer.save();

      // Log success message
      req.log.info(
        "Farmer profile updated successfully for ID:",
        updatedFarmer._id
      );

      // Respond with updated farmer data
      reply.code(200).send({
        status: "Success",
        data: {
          _id: updatedFarmer._id,
          name: updatedFarmer.name,
          address: updatedFarmer.address,
          mobileNumber: updatedFarmer.mobileNumber,
          imageUrl: updatedFarmer.imageUrl,
          isVerified: updatedFarmer.isVerified,
          farmerId: updatedFarmer.farmerId,
          role: updatedFarmer.role,
        },
      });
    } else {
      req.log.warn("Farmer not found for ID:", req.farmer._id);
      reply.code(404).send({
        status: "Fail",
        message: "Farmer not found",
      });
    }
  } catch (err) {
    // Log the error details
    req.log.error("Error occurred while updating farmer profile:", {
      errorMessage: err.message,
    });

    reply.code(500).send({
      status: "Fail",
      errorMessage: err.message,
      message: "Some error occured while updating farmer profile",
    });
  }
};

// Util function , get the store-admin details from the id
const getStoreAdminDetails = async (req, reply) => {
  try {
    // Log the attempt to get store admin details
    req.log.info("Attempting to get store admin details");

    // Validate request body
    storeAdminIdSchema.parse(req.body);

    // Extract storeAdminId from the request body
    const { storeAdminId } = req.body;
    req.log.info(`Fetching details for store admin ID: ${storeAdminId}`);

    // Find the store admin with the provided ID
    const storeAdmin = await StoreAdmin.findOne({ storeAdminId });

    // If storeAdmin is found, send it in the response
    if (storeAdmin) {
      req.log.info("Store admin found:", {
        name: storeAdmin.name,
        storeAdminId: storeAdmin.storeAdminId,
      });

      reply.code(200).send({
        status: "Success",
        data: {
          name: storeAdmin.name,
          address: storeAdmin.personalAddress,
          mobileNumber: storeAdmin.mobileNumber,
          coldStorageName: storeAdmin.coldStorageDetails.coldStorageName,
          coldStorageAddress: storeAdmin.coldStorageDetails.coldStorageAddress,
          coldStorageMobileNumber:
            storeAdmin.coldStorageDetails.coldStorageContactNumber,
          storeAdminId: storeAdmin.storeAdminId,
        },
      });
    } else {
      // If storeAdmin is not found, send a 404 response
      req.log.warn("Store admin not found for ID:", storeAdminId);
      reply.code(404).send({
        status: "Fail",
        message: "Store admin not found",
      });
    }
  } catch (err) {
    // Log the error details
    req.log.error("Error occurred while getting store admin details:", {
      errorMessage: err.message,
    });

    // Handle validation errors or other errors
    reply.code(500).send({
      status: "Fail",
      errorMessage: err.message,
      message: "Some error occured while getting store admin details",
    });
  }
};

// FARMER FEATURE ROUTES
//@desc Get all cold storages
//@route
const getAllColdStorages = async (req, reply) => {
  try {
    // Log the attempt to fetch all cold storages
    req.log.info("Attempting to get all cold storages");

    // Fetch all store admins (cold storages)
    const coldStorages = await StoreAdmin.find();

    // Log the number of cold storages fetched
    req.log.info(`Fetched ${coldStorages.length} cold storages`);

    // Send the response with fetched cold storages
    reply.code(200).send({
      status: "Success",
      data: coldStorages,
    });
  } catch (err) {
    // Log the error details
    req.log.error("Error occurred while getting cold storages:", {
      errorMessage: err.message,
    });

    // Handle errors
    reply.code(500).send({
      status: "Fail",
      errorMessage: err.message,
      message: "Error occured while getting cold storage list",
    });
  }
};

const getStoreAdminRequests = async (req, reply) => {
  try {
    const loggedInFarmerId = req.farmer._id;

    // Log the attempt to get store admin requests
    req.log.info(
      `Fetching store admin requests for farmer ID: ${loggedInFarmerId}`
    );

    const registerRequests = await Request.find({
      receiverId: loggedInFarmerId,
      status: "pending",
    });

    // Log the number of pending requests found
    req.log.info(`Found ${registerRequests.length} pending requests`);

    if (registerRequests.length > 0) {
      // Array to store sender information and request details
      const requestsWithSenderInfo = [];

      // Loop through each document in registerRequests
      await Promise.all(
        registerRequests.map(async (request) => {
          try {
            // Retrieve sender information from StoreAdmin model
            const sender = await StoreAdmin.findById(request.senderId);
            if (sender) {
              // Extract desired properties from the sender and request objects
              const { _id: requestId } = request;
              const { name, mobileNumber, coldStorageDetails } = sender;
              const {
                coldStorageName,
                coldStorageAddress,
                coldStorageContactNumber,
              } = coldStorageDetails;

              // Construct an object containing both request ID and sender's data
              const requestData = {
                requestId,
                sender: {
                  name,
                  mobileNumber,
                  coldStorageName,
                  coldStorageAddress,
                  coldStorageContactNumber,
                },
              };

              // Add the constructed object to the array
              requestsWithSenderInfo.push(requestData);
            }
          } catch (err) {
            // Log any error that occurs while fetching sender details
            req.log.error(
              `Error fetching sender details for request ID: ${request._id}`,
              {
                errorMessage: err.message,
              }
            );
          }
        })
      );

      reply.code(200).send({
        status: "Success",
        requests: requestsWithSenderInfo,
      });
    } else {
      reply.code(200).send({
        status: "Fail",
        message: "No friend requests",
      });
    }
  } catch (err) {
    // Log the error details if an exception occurs
    req.log.error("Error occurred while fetching store admin requests:", {
      errorMessage: err.message,
    });

    reply.code(500).send({
      status: "Fail",
      errorMessage: err.message,
      message: "Error occured while getting requests",
    });
  }
};

const acceptRequest = async (req, reply) => {
  try {
    const { requestId } = req.body;

    // Log the request body and validate the presence of requestId
    req.log.info("Accept request initiated", { requestId });

    // Ensure that the requestId is provided
    if (!requestId) {
      req.log.warn("Request ID is missing");
      return reply.status(400).send({
        status: "Fail",
        message: "Request ID is required",
      });
    }

    // Find the request by its ID
    const request = await Request.findById(requestId);

    // Check if the request exists
    if (!request) {
      req.log.warn("Request not found", { requestId });
      return reply.status(404).send({
        status: "Fail",
        message: "Request not found",
      });
    }

    // Format the current date and log the formatted date
    const currentDate = new Date();
    const formattedDate = formatDate(currentDate);
    req.log.info("Current date formatted", { formattedDate });

    // Update the status of the request to "accepted"
    request.status = "accepted";
    await request.save();
    req.log.info("Request accepted and saved", { requestId });

    // Find the farmer and store admin associated with the request
    const farmer = await Farmer.findById(request.receiverId);
    const storeAdmin = await StoreAdmin.findById(request.senderId);

    // Log when farmer or store admin is missing
    if (!farmer || !storeAdmin) {
      req.log.warn("Farmer or Store Admin not found", {
        farmerId: request.receiverId,
        storeAdminId: request.senderId,
      });
      return reply.status(404).send({
        status: "Fail",
        message: "Farmer or Store Admin not found",
      });
    }

    // Add the store admin to the farmer's registeredStoreAdmins array
    farmer.registeredStoreAdmins.push(storeAdmin._id);
    await farmer.save();
    req.log.info("Store Admin added to Farmer's registered list", {
      farmerId: farmer._id,
      storeAdminId: storeAdmin._id,
    });

    // Add the farmer to the store admin's registeredFarmers array (if not already included)
    if (!storeAdmin.registeredFarmers.includes(farmer._id)) {
      storeAdmin.registeredFarmers.push(farmer._id);
      await storeAdmin.save();
      req.log.info("Farmer added to Store Admin's registered list", {
        farmerId: farmer._id,
        storeAdminId: storeAdmin._id,
      });
    }

    // Send a success response with the updated farmer and store admin objects
    reply.code(200).send({
      status: "Success",
      message: "Request accepted",
      date: formattedDate, // Optionally send back the formatted date
    });

    // Log the successful operation
    req.log.info("Request successfully accepted", { requestId, formattedDate });
  } catch (err) {
    // Log error details in case of any failure
    req.log.error("Error accepting request", { errorMessage: err.message });
    return reply.status(500).send({
      status: "Fail",
      errorMessage: err.message,
      message: "Error occured while accepting request",
    });
  }
};

const rejectRequest = async (req, reply) => {
  try {
    const { requestId } = req.body;

    // Log the requestId received
    req.log.info("Reject request initiated", { requestId });

    // Find the request by ID
    const request = await Request.findById(requestId);

    if (request) {
      // Log that the request was found
      req.log.info("Request found", { requestId });

      // Update the status of the request to "rejected"
      request.status = "rejected";
      await request.save();

      // Log the status update
      req.log.info("Request status updated to 'rejected'", { requestId });

      // If the request status becomes "rejected", delete the request
      if (request.status === "rejected") {
        await Request.findByIdAndDelete(requestId);
        // Log the deletion of the request
        req.log.info("Request deleted successfully", { requestId });
      }

      // Send a success response
      return reply.status(200).send({
        status: "Success",
        message: "Request rejected and deleted successfully",
      });
    } else {
      // Log that the request was not found
      req.log.warn("Request not found", { requestId });

      // If request is not found, send a not found response
      return reply.status(404).send({
        status: "Fail",
        message: "Request not found",
      });
    }
  } catch (err) {
    // Log the error
    req.log.error("Error rejecting request", { errorMessage: err.message });

    // Handle any errors that occur during the process
    return reply.status(500).send({
      status: "Fail",
      errorMessage: err.message,
      message: "Error occured while accepting request",
    });
  }
};

// // ORDER CONTROLLER FUNCTIONS
// const getOrdersFromColdStorage = async (req, reply) => {
//   try {
//     const farmerId = req.farmer._id;

//     const { storeAdminId } = req.body;

//     // Perform the Mongoose query to find orders
//     const orders = await Order.find({
//       coldStorageId: storeAdminId,
//       farmerId,
//       orderStatus: "inStore",
//     });

//     // Check if any orders are found
//     if (orders.length === 0) {
//       return reply.code(200).send({
//         status: "Fail",
//         message: "No orders found",
//       });
//     }

//     // Sending a success response with the orders
//     reply.code(200).send({
//       status: "Success",
//       data: orders,
//     });
//   } catch (err) {
//     // Handling errors
//     console.error("Error getting farmer orders:", err);
//     reply.code(500).send({
//       status: "Fail",
//       message: "Some error occurred while getting farmer orders",
//     });
//   }
// };

// //OUTGOING ORDER CONTROLLER FUNCTIONS
// const getFarmerOutgoingOrders = async (req, reply) => {
//   try {
//     const farmerId = req.farmer._id;
//     const { storeAdminId } = req.body;

//     // Query the OutgoingOrder collection using Mongoose
//     const outgoingOrders = await OutgoingOrder.find({
//       storeAdminId: storeAdminId,
//       farmerId: farmerId,
//     }).exec();

//     // Check if any orders were found
//     if (outgoingOrders.length === 0) {
//       return reply.code(200).send({
//         status: "Fail",
//         message: "No outgoing orders found for the current farmer",
//       });
//     }

//     // Send the outgoing orders as a response
//     reply.code(200).send({
//       status: "Success",
//       outgoingOrders: outgoingOrders,
//     });
//   } catch (err) {
//     console.log(err.message);
//     reply.code(500).send({
//       status: "Fail",
//       message: "Error occurred while getting outgoing orders",
//     });
//   }
// };

// const getPaymentHistory = async (req, reply) => {
//   try {
//     const { orderId } = req.body;

//     // Validate input data
//     if (!orderId) {
//       return reply.code(400).send({
//         status: "Fail",
//         message: "Invalid input data",
//       });
//     }

//     // Find payment history based on orderId
//     const paymentHistory = await PaymentHistory.findOne({
//       outgoingOrderId: orderId,
//     });

//     // Check if payment history exists
//     if (!paymentHistory) {
//       return reply.code(404).send({
//         status: "Fail",
//         message: "Payment history not found",
//       });
//     }

//     // Send success response with payment history
//     reply.code(200).send({
//       status: "Success",
//       paymentHistory: paymentHistory,
//     });
//   } catch (err) {
//     console.log(err.message);
//     reply.code(500).send({
//       status: "Fail",
//       message: "Failed to fetch payment history",
//     });
//   }
// };

export {
  registerFarmer,
  loginFarmer,
  getRegisteredStoreAdmins,
  updateFarmerProfile,
  logoutFarmer,
  getStoreAdminDetails,
  getAllColdStorages,
  getStoreAdminRequests,
  acceptRequest,
  rejectRequest,
};
