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
import Order from "../models/orderModel.js";
import OutgoingOrder from "../models/outgoingOrderModel.js";
import PaymentHistory from "../models/paymentHistoryModel.js";

// HANDLE ALL THE ERROR MESSAGES , REMOVE ALL THE ERR.MESSAGE AND ADD CUSTOM MESSAGES

// @desc register a farmer
// @route POST/api/farmers/register
// @access Public
const registerFarmer = async (req, reply) => {
  try {
    // Validate the request body
    registerSchema.parse(req.body);

    // Extract data from the request body
    const { name, address, mobileNumber, password, imageUrl } = req.body;

    // Check if a farmer with the given mobile number already exists
    const farmerExists = await Farmer.findOne({ mobileNumber });

    if (farmerExists) {
      return reply.code(400).send({
        status: "Fail",
        message: "Farmer already exists",
      });
    }

    let farmerId;
    let isIdTaken = true;

    // Keep generating a unique farmerId until it's not already taken
    while (isIdTaken) {
      farmerId = generateUniqueAlphaNumeric(); // Generate a unique alphanumeric code
      isIdTaken = await Farmer.findOne({ farmerId });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create the new farmer record
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
      // Generate token and send response
      generateToken(reply, farmer._id);

      reply.code(201).send({
        status: "Success",
        data: farmer,
      });
    }
  } catch (err) {
    // Handle errors
    reply.code(500).send({
      status: "Fail",
      message: err.message,
    });
  }
};

// @desc login a farmer
// @route POST/api/farmers/login
// @access Public
const loginFarmer = async (req, reply) => {
  try {
    loginSchema.parse(req.body);
    const { mobileNumber, password } = req.body;

    const farmer = await Farmer.findOne({ mobileNumber });
    if (farmer) {
      const isPasswordMatch = await bcrypt.compare(password, farmer.password);

      if (isPasswordMatch) {
        generateToken(reply, farmer._id);
        return reply.code(200).send({
          status: "Success",
          data: {
            name: farmer.name,
            address: farmer.address,
            mobileNumber: farmer.mobileNumber,
            isVerified: farmer.isVerified,
            imageUrl: farmer.imageUrl,
            role: farmer.role,
            farmerId: farmer.farmerId,
            _id: farmer._id,
          },
        });
      } else {
        return reply.code(400).send({
          status: "Fail",
          message: "invalid password",
        });
      }
    } else {
      return reply.code(500).send({
        status: "Fail",
        message: "User does not exist , try signing up",
      });
    }
  } catch (err) {
    reply.code(500).send({
      status: "Fail",
      message: err.message,
    });
  }
};

// @desc log out a farmer
// @route POST /api/farmers/logout
// @access Private
const logoutFarmer = async (req, reply) => {
  try {
    reply.cookie("jwt", "", {
      httpOnly: true,
      expires: new Date(0),
    });

    reply.code(200).send({
      status: "Success",
      message: "User logged out successfuly",
    });
  } catch (err) {
    reply.code(500).send({
      status: "Fail",
      message: err.message,
    });
  }
};

// @desc get farmer profile
// @route GET/api/farmers/profile
// @access Private

const getRegisteredStoreAdmins = async (req, reply) => {
  try {
    const { registeredStoreAdmins } = req.farmer;

    // Map over each ObjectId and populate it with the corresponding document
    const populatedAdmins = await Promise.all(
      registeredStoreAdmins.map(async (item) => {
        // Use await to wait for the populate operation to finish
        return await StoreAdmin.findById(item)
          .select(
            "name mobileNumber coldStorageDetails.coldStorageName coldStorageDetails.coldStorageAddress coldStorageDetails.coldStorageContactNumber"
          )
          .exec();
      })
    );

    reply.code(200).send({
      status: "Success",
      registeredStoreAdmins: populatedAdmins, // Send the populated array
    });
  } catch (err) {
    reply.code(500).send({
      status: "Fail",
      message: err.message,
    });
  }
};

// @desc Update farmer profile
// @desc PUT/api/farmers/profile
// @access Private
const updateFarmerProfile = async (req, reply) => {
  try {
    updateSchema.parse(req.body);
    const farmer = await Farmer.findById(req.farmer._id);

    if (farmer) {
      // Update farmer fields
      farmer.name = req.body.name || farmer.name;
      farmer.address = req.body.address || farmer.address;
      farmer.mobileNumber = req.body.mobileNumber || farmer.mobileNumer;
      farmer.imageUrl = req.body.imageUrl || farmer.imageUrl;
      farmer.isVerified = true;

      // If the farmer updates the mobile number, verify the new mobile number again
      if (req.body.password) {
        const hashedPassword = await bcrypt.hash(req.body.password, 10);
        farmer.password = hashedPassword;
      }

      // Save the updated farmer profile
      const updatedFarmer = await farmer.save();

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
    }
  } catch (err) {
    reply.code(500).send({
      status: "Fail",
      message: err.message,
    });
  }
};

// Util function , get the store-admin details from the id
const getStoreAdminDetails = async (req, reply) => {
  try {
    // Validate request body
    storeAdminIdSchema.parse(req.body);

    // Extract storeAdminId from the request body
    const { storeAdminId } = req.body;

    // Find the store admin with the provided ID
    const storeAdmin = await StoreAdmin.findOne({ storeAdminId });

    // If storeAdmin is found, send it in the response
    if (storeAdmin) {
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
      reply.code(404).send({
        status: "Fail",
        message: "Store admin not found",
      });
    }
  } catch (err) {
    // Handle validation errors or other errors
    reply.code(500).send({
      status: "Fail",
      message: err.message,
    });
  }
};

// FARMER FEATURE ROUTES
//@desc Get all cold storages
//@route
const getAllColdStorages = async (req, reply) => {
  try {
    const coldStorages = await StoreAdmin.find();

    reply.code(200).send({
      status: "Success",
      data: coldStorages,
    });
  } catch (err) {
    reply.code(500).send({
      status: "Fail",
      message: err.message,
    });
  }
};

const getStoreAdminRequests = async (req, reply) => {
  try {
    const loggedInFarmerId = req.farmer._id;

    const registerRequests = await Request.find({
      receiverId: loggedInFarmerId,
      status: "pending",
    });

    if (registerRequests.length > 0) {
      // Array to store sender information and request details
      const requestsWithSenderInfo = [];

      // Loop through each document in registerRequests
      await Promise.all(
        registerRequests.map(async (request) => {
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
    reply.code(500).send({
      status: "Fail",
      message: err.message,
    });
  }
};

const acceptRequest = async (req, reply) => {
  try {
    const { requestId } = req.body;

    // Ensure that the requestId is provided
    if (!requestId) {
      return reply.status(400).send({
        status: "Fail",
        message: "Request ID is required",
      });
    }

    // Find the request by its ID
    const request = await Request.findById(requestId);

    // Check if the request exists
    if (!request) {
      return reply.status(404).send({
        status: "Fail",
        message: "Request not found",
      });
    }

    // Format the current date and time in "9th April 2024" format
    const currentDate = new Date();
    const formattedDate = formatDate(currentDate);

    // Update the status of the request to "accepted"
    request.status = "accepted";
    await request.save();

    // Find the farmer and store admin associated with the request
    const farmer = await Farmer.findById(request.receiverId);
    const storeAdmin = await StoreAdmin.findById(request.senderId);

    // Check if both farmer and store admin exist
    if (!farmer || !storeAdmin) {
      return reply.status(404).send({
        status: "Fail",
        message: "Farmer or Store Admin not found",
      });
    }

    farmer.registeredStoreAdmins.push(storeAdmin._id);
    await farmer.save();

    if (!storeAdmin.registeredFarmers.includes(farmer._id)) {
      storeAdmin.registeredFarmers.push(farmer._id);
      await storeAdmin.save();
    }

    // Send a success response with the updated farmer and store admin objects and formatted date
    reply.code(200).send({
      status: "Success",
      message: "request accepted",
    });
  } catch (error) {
    // Handle any errors that occur during the process
    console.error("Error accepting request:", error);
    return reply.status(500).send({
      status: "Fail",
      message: "Internal Server Error",
    });
  }
};

// Function to format the date as "9th April 2024"
const formatDate = (date) => {
  const day = date.getDate();
  const monthIndex = date.getMonth();
  const year = date.getFullYear();

  // Array of month names
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  // Add the ordinal suffix to the day
  const dayWithOrdinal = addOrdinalSuffix(day);

  return `${dayWithOrdinal} ${monthNames[monthIndex]} ${year}`;
};

// Function to add ordinal suffix to the day
const addOrdinalSuffix = (day) => {
  if (day > 3 && day < 21) return day + "th";
  switch (day % 10) {
    case 1:
      return day + "st";
    case 2:
      return day + "nd";
    case 3:
      return day + "rd";
    default:
      return day + "th";
  }
};

const rejectRequest = async (req, reply) => {
  try {
    const { requestId } = req.body;

    // Find the request by ID
    const request = await Request.findById(requestId);

    if (request) {
      // Update the status of the request to "rejected"
      request.status = "rejected";
      await request.save();

      // If the request status becomes "rejected", delete the request
      if (request.status === "rejected") {
        await Request.findByIdAndDelete(requestId);
      }

      // Send a success response
      return reply.status(200).send({
        status: "Success",
        message: "Request rejected and deleted successfully",
      });
    } else {
      // If request is not found, send a not found response
      return reply.status(404).send({
        status: "Fail",
        message: "Request not found",
      });
    }
  } catch (error) {
    // Handle any errors that occur during the process
    console.error("Error rejecting request:", error);
    return reply.status(500).send({
      status: "Fail",
      message: "Internal Server Error",
    });
  }
};

// ORDER CONTROLLER FUNCTIONS
const getOrdersFromColdStorage = async (req, reply) => {
  try {
    const farmerId = req.farmer._id;

    const { storeAdminId } = req.body;

    // Perform the Mongoose query to find orders
    const orders = await Order.find({
      coldStorageId: storeAdminId,
      farmerId,
      orderStatus: "inStore",
    });

    // Check if any orders are found
    if (orders.length === 0) {
      return reply.code(200).send({
        status: "Fail",
        message: "No orders found",
      });
    }

    // Sending a success response with the orders
    reply.code(200).send({
      status: "Success",
      data: orders,
    });
  } catch (err) {
    // Handling errors
    console.error("Error getting farmer orders:", err);
    reply.code(500).send({
      status: "Fail",
      message: "Some error occurred while getting farmer orders",
    });
  }
};

//OUTGOING ORDER CONTROLLER FUNCTIONS
const getFarmerOutgoingOrders = async (req, reply) => {
  try {
    const farmerId = req.farmer._id;
    const { storeAdminId } = req.body;

    // Query the OutgoingOrder collection using Mongoose
    const outgoingOrders = await OutgoingOrder.find({
      storeAdminId: storeAdminId,
      farmerId: farmerId,
    }).exec();

    // Check if any orders were found
    if (outgoingOrders.length === 0) {
      return reply.code(200).send({
        status: "Fail",
        message: "No outgoing orders found for the current farmer",
      });
    }

    // Send the outgoing orders as a response
    reply.code(200).send({
      status: "Success",
      outgoingOrders: outgoingOrders,
    });
  } catch (err) {
    console.log(err.message);
    reply.code(500).send({
      status: "Fail",
      message: "Error occurred while getting outgoing orders",
    });
  }
};

const getPaymentHistory = async (req, reply) => {
  try {
    const { orderId } = req.body;

    // Validate input data
    if (!orderId) {
      return reply.code(400).send({
        status: "Fail",
        message: "Invalid input data",
      });
    }

    // Find payment history based on orderId
    const paymentHistory = await PaymentHistory.findOne({
      outgoingOrderId: orderId,
    });

    // Check if payment history exists
    if (!paymentHistory) {
      return reply.code(404).send({
        status: "Fail",
        message: "Payment history not found",
      });
    }

    // Send success response with payment history
    reply.code(200).send({
      status: "Success",
      paymentHistory: paymentHistory,
    });
  } catch (err) {
    console.log(err.message);
    reply.code(500).send({
      status: "Fail",
      message: "Failed to fetch payment history",
    });
  }
};

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
  getOrdersFromColdStorage,
  getFarmerOutgoingOrders,
  getPaymentHistory,
};
