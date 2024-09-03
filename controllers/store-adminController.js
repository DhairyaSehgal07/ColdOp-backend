import bcrypt from "bcryptjs";
import StoreAdmin from "../models/storeAdminModel.js";
import generateToken from "../utils/generateToken.js";
import {
  loginSchema,
  storeAdminRegisterSchema,
  storeAdminUpdateSchmea,
  quickRegisterSchema,
  farmerIdSchema,
  orderSchema,
} from "../utils/validationSchemas.js";
import Farmer from "../models/farmerModel.js";
import Request from "../models/requestModel.js";
import generateUniqueAlphaNumeric from "../utils/farmers/generateUniqueAlphaNumeric.js";
import Order from "../models/orderModel.js";
import OutgoingOrder from "../models/outgoingOrderModel.js";
import PaymentHistory from "../models/paymentHistoryModel.js";
// Auth controllers

// @desc register a store-admin
// @route POST/api/store-admin/register
// @access Public
const registerStoreAdmin = async (req, reply) => {
  try {
    req.log.info("Starting store admin registration process");

    // Assuming storeAdminRegisterSchema is a validation schema
    storeAdminRegisterSchema.parse(req.body);

    const {
      name,
      personalAddress,
      mobileNumber,
      password,
      coldStorageName,
      coldStorageAddress,
      coldStorageContactNumber,
      isVerified,
      imageUrl,
    } = req.body;

    req.log.info("Parsed request body", { mobileNumber, name });

    const storeAdminExists = await StoreAdmin.findOne({ mobileNumber });
    if (storeAdminExists) {
      req.log.warn("Attempt to register existing store admin", {
        mobileNumber,
      });
      return reply.code(400).send({
        success: false,
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
      },
      storeAdminId: storeAdminId,
    });

    if (storeAdmin) {
      req.log.info("Store admin registered successfully", {
        storeAdminId,
        name,
      });
      generateToken(reply, storeAdmin._id);
      return reply.code(201).send({
        success: true,
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
          imageUrl: req.body.imageUrl,
          _id: storeAdmin._id,
        },
      });
    }
  } catch (err) {
    req.log.error("Error during store admin registration", { err });
    return reply.code(500).send({
      success: false,
      message: err.message,
    });
  }
};

//@desc login store-admin
//@route POST/api/store-admin/login
//@access PUBLIC
const loginStoreAdmin = async (req, reply) => {
  try {
    loginSchema.parse(req.body);
    const { mobileNumber, password } = req.body;

    const storeAdmin = await StoreAdmin.findOne({ mobileNumber });

    if (storeAdmin) {
      const isPasswordMatch = await bcrypt.compare(
        password,
        storeAdmin.password
      );

      if (isPasswordMatch) {
        generateToken(reply, storeAdmin._id);
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
            storeAdminId: storeAdmin.storeAdminId,
            imageUrl: storeAdmin.imageUrl,
            _id: storeAdmin._id,
          },
        });
      } else {
        return reply.code(400).send({
          status: "Fail",
          message: "Invalid password",
        });
      }
    } else {
      return reply.code(500).send({
        status: "Fail",
        message: "User does not exist, try signing up",
      });
    }
  } catch (err) {
    reply.code(500).send({
      status: "Fail",
      message: err.message,
    });
  }
};

// @desc log out store-admin
// @route POST /api/store-admin/logout
// @access Private
const logoutStoreAdmin = async (req, reply) => {
  try {
    reply.cookie("jwt", "", {
      httpOnly: true,
      expires: new Date(0),
    });

    //req.session.delete();
    reply.code(200).send({
      status: "Success",
      message: "User logged out successfully",
    });
  } catch (err) {
    reply.code(500).send({
      status: "Fail",
      message: err.message,
    });
  }
};

//@desc get store-admin profile
//@route GET/api/store-admin/profile
//@access Private
const getStoreAdminProfile = async (req, reply) => {
  try {
    const storeAdmin = {
      _id: req.storeAdmin._id,
      name: req.storeAdmin.name,
      personalAddress: req.storeAdmin.personalAddress,
      mobileNumber: req.storeAdmin.mobileNumber,
      imageUrl: req.storeAdmin.imageUrl,
      //view account details or something you can do on the frontend
      isVerfied: req.storeAdmin.isVerified,
      isActive: req.storeAdmin.isActive,
      isPaid: req.storeAdmin.isPaid,
      coldStorageDetails: {
        coldStorageName: req.storeAdmin.coldStorageDetails.coldStorageName,
        coldStorageAddress:
          req.storeAdmin.coldStorageDetails.coldStorageAddress,
        coldStorageContactNumber:
          req.storeAdmin.coldStorageDetails.coldStorageContactNumber,
        coldStorageGSTNumber:
          req.storeAdmin.coldStorageDetails.coldStorageGSTNumber,
      },
    };
    reply.code(200).send({
      status: "Success",
      data: storeAdmin,
    });
  } catch (err) {
    reply.code(500).send({
      status: "Fail",
      message: err.message,
    });
  }
};
const updateStoreAdminProfile = async (req, reply) => {
  try {
    // Check if store admin session exists

    const storeAdmin = await StoreAdmin.findById(req.storeAdmin._id);

    if (!storeAdmin) {
      // If session doesn't exist, send unauthorized response
      return reply.code(401).send({
        status: "Fail",
        message: "Unauthorized",
      });
    }

    // If session exists, update store admin profile
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

    // Update password if provided in request body
    if (req.body.password) {
      const hashedPassword = await bcrypt.hash(req.body.password, 10);
      updatedFields.password = hashedPassword;
    }

    // Find and update store admin profile
    const updatedStoreAdmin = await StoreAdmin.findByIdAndUpdate(
      storeAdmin._id,
      { $set: updatedFields },
      { new: true }
    );

    if (!updatedStoreAdmin) {
      return reply.code(404).send({
        status: "Fail",
        message: "Store admin not found",
      });
    }

    // Send updated store admin profile in response
    reply.code(200).send({
      status: "Success",
      data: {
        _id: updatedStoreAdmin._id,
        name: updatedStoreAdmin.name,
        personalAddress: updatedStoreAdmin.address,
        mobileNumber: updatedStoreAdmin.mobileNumber,
        coldStorageDetails: {
          coldStorageName: updatedStoreAdmin.coldStorageDetails.coldStorageName,
          coldStorageAddress:
            updatedStoreAdmin.coldStorageDetails.coldStorageAddress,
          coldStorageContactNumber:
            updatedStoreAdmin.coldStorageDetails.coldStorageContactNumber,
          coldStorageGSTNumber:
            updatedStoreAdmin.coldStorageDetails.coldStorageGSTNumber,
        },
      },
    });
  } catch (err) {
    reply.code(500).send({
      status: "Fail",
      message: err.message,
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
    farmerIdSchema.parse(req.body);

    const senderId = req.storeAdmin._id;
    const { farmerId } = req.body;

    const receiver = await Farmer.findOne({ farmerId });
    if (!receiver) {
      reply.code(404).send({
        status: "Fail",
        message: "Farmer not found, please re-check the farmerId",
      });
      return;
    }

    const receiverId = receiver._id;

    // Check if the farmer is already registered with the cold storage
    const isRegistered = req.storeAdmin.registeredFarmers.includes(receiverId);
    if (isRegistered) {
      return reply.code(400).send({
        status: "Fail",
        message: "Farmer is already registered with this cold storage",
      });
    }

    // Get current date in the desired format
    const currentDate = new Date().toLocaleDateString("en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    // Check if a friend request already exists
    const existingRequest = await Request.findOne({ senderId, receiverId });

    if (existingRequest) {
      return reply.code(400).send({
        status: "Fail",
        message: "You have already sent the request",
      });
    }

    // Create a new friend request

    const newRequest = Request({ senderId, receiverId, date: currentDate });
    await newRequest.save();

    // Add the farmer to the list of registered farmers for the cold storage
    req.storeAdmin.registeredFarmers.push(receiverId);
    await req.storeAdmin.save();

    reply.code(201).send({
      status: "Success",
      message: "Request sent successfully",
    });
  } catch (err) {
    reply.code(500).send({
      status: "Fail",
      message: err.message,
    });
  }
};

// @desc    Get all farmers
// @route   GET /api/farmers
// @access  Private/store-admin
const getFarmers = async (req, reply) => {
  try {
    const { registeredFarmers } = req.storeAdmin;

    if (registeredFarmers.length == 0) {
      return reply.code(200).send({
        status: "Fail",
        message: "no registered farmers",
      });
    }

    const populatedFarmers = await Promise.all(
      registeredFarmers.map(async (item) => {
        return await Farmer.findById(item)
          .select("name mobileNumber _id address  createdAt")
          .exec();
      })
    );

    reply.code(200).send({
      status: "Success",
      populatedFarmers,
    });
  } catch (err) {
    reply.code(500).send({
      status: "Fail",
      message: err.message,
    });
  }
};

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private/store-admin
const updateUser = (req, res) => {
  res.send("update single user by id");
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/store-admin
const deleteUser = async (req, res) => {
  try {
    const { userId } = req.body;
    const storeAdmin = StoreAdmin.findById(req.storeAdmin);

    // Check if the StoreAdmin exists
    if (!storeAdmin) {
      return res.status(404).json({ message: "StoreAdmin not found" });
    }

    const index = storeAdmin.registeredFarmers.indexOf(userId);
    if (index !== -1) {
      storeAdmin.registeredFarmers.splice(index, 1);

      // Save the updated StoreAdmin document
      await storeAdmin.save();

      return res.status(200).json({ message: "User deleted successfully" });
    } else {
      // If the user ID does not exist in the array
      return res
        .status(404)
        .json({ message: "User not found in registeredFarmers array" });
    }
  } catch (err) {
    console.error("Error deleting user:", error);
    return res.code(500).send({
      message: "some error occured while deleting user",
    });
  }
};

//@desc Quick add farmer
//@route POST/api/store-admin/quick-register
//@access Private
const quickRegisterFarmer = async (req, reply) => {
  try {
    // Validate the request body
    quickRegisterSchema.parse(req.body);

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
      farmerId,
      imageUrl: "",
      isVerified: false,
    });

    // If the farmer record is created successfully, associate it with the store admin and send the response
    if (farmer) {
      // Find the store admin
      const storeAdmin = await StoreAdmin.findById(req.storeAdmin._id);

      // Check if store admin exists and registeredFarmers array is initialized
      if (storeAdmin && storeAdmin.registeredFarmers) {
        // Add the farmer to the store admin's registeredFarmers array
        storeAdmin.registeredFarmers.push(farmer._id);

        // Save the updated store admin
        await storeAdmin.save();

        await farmer.registeredStoreAdmins.push(req.storeAdmin._id);
        await farmer.save();

        // Send the response
        return reply.code(200).send({
          status: "Success",
          message: "Farmer registered",
        });
      } else {
        // If store admin or registeredFarmers array is not properly initialized
        return reply.code(500).send({
          status: "Fail",
          message:
            "Error: Store admin or registeredFarmers array is not properly initialized",
        });
      }
    }
  } catch (err) {
    // Handle errors
    reply.code(500).send({
      status: "Fail",
      message: err.message,
    });
  }
};

// ORDER ROUTES CONTROLLER FUCNTIONS

// GET LOT NUMBER
const getLotNumber = async (req, reply) => {
  try {
    const storeAdminId = req.storeAdmin._id;

    // Using aggregation pipeline to count documents
    const result = await Order.aggregate([
      {
        $match: { coldStorageId: storeAdminId },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
        },
      },
    ]);

    // Extracting count from result
    const lotNumber = result.length > 0 ? result[0].count : 0;

    // Sending response with lot number
    reply.code(200).send({
      status: "Success",
      lotNumber: lotNumber,
    });
  } catch (err) {
    console.log(err.message);
    reply.code(500).send({
      status: "Fail",
      message: "Error occurred while getting lot number",
    });
  }
};

const createNewOrder = async (req, reply) => {
  try {
    // Extracting data from the request
    const storeAdminId = req.storeAdmin._id; // Assuming you have a storeAdmin object in the request
    const { farmerId, cropDetails } = req.body;

    // Creating a new order
    const newOrder = new Order({
      coldStorageId: storeAdminId,
      farmerId,
      cropDetails,
    });

    // Saving the new order to the database
    await newOrder.save();

    // Sending a success response
    reply.code(201).send({
      status: "Success",
      newOrder,
    });
  } catch (err) {
    // Handling errors
    console.error("Error creating new order:", err);
    reply.code(500).send({
      status: "Fail",
      message: "Some error occurred while creating a new order",
    });
  }
};

const getFarmerOrders = async (req, reply) => {
  try {
    const storeAdminId = req.storeAdmin._id;
    const { farmerId } = req.body;

    // Perform the Mongoose query to find orders
    const orders = await Order.find({
      coldStorageId: storeAdminId,
      farmerId,
      orderStatus: "inStore",
    });

    if (!orders) {
      return reply.code(200).send({
        status: "Fail",
        message: "no order created",
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

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private/store-admin
const getFarmerById = async (req, reply) => {
  try {
    const { farmerId } = req.body;
    const farmer = await Farmer.findById(farmerId);

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
    if (farmer) {
      reply.code(200).send({
        status: "Success",
        farmerInfo,
      });
    }
  } catch (err) {
    reply.code(500).send({
      status: "Fail",
      message: "Some error occured while finding farmer",
    });
  }
};

// outgoing order controller functions
const createOutgoingOrder = async (req, reply) => {
  try {
    const storeAdminId = req.storeAdmin._id;
    const { farmerId, orders, totalAmount, amountPaid, date } = req.body;

    const newOrder = await OutgoingOrder.create({
      storeAdminId,
      farmerId,
      orders,
      totalAmount,
      amountPaid,
      date,
    });

    if (newOrder) {
      reply.code(201).send({
        status: "Success",
        newOrder,
      });
    }
  } catch (err) {
    console.log(err.message);
    reply.code(500).send({
      status: "Fail",
      message: "Some error occured while creating outgoing order",
    });
  }
};

// when new order has been created then delete the order from store
const updateOrdersAfterOutgoing = async (req, reply) => {
  try {
    const { orderIds } = req.body;

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return reply
        .code(400)
        .send({ status: "Fail", message: "Invalid order ids provided" });
    }

    // Update orders to set order status to "extracted"
    const updateResult = await Order.updateMany(
      { _id: { $in: orderIds } },
      { $set: { orderStatus: "extracted" } }
    );

    if (updateResult.nModified === 0) {
      return reply.code(404).send({
        status: "Fail",
        message: "No orders found with the provided IDs",
      });
    }

    reply.code(200).send({
      status: "Success",
      message: "Orders updated",
    });
  } catch (err) {
    console.log(err.message);
    reply.code(500).send({
      status: "Fail",
      message: "Some error occurred while updating orders",
    });
  }
};

// get outgoing orders for previous orders screen
const getFarmerOutgoingOrders = async (req, reply) => {
  try {
    const storeAdminId = req.storeAdmin._id;
    const { farmerId } = req.body;

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

const updateFarmerOutgoingOrder = async (req, reply) => {
  try {
    const { orderId, amountPaid, currentDate } = req.body;

    if (amountPaid <= 0) {
      reply.code(500).send({
        status: "Fail",
        message: "Please enter a valid amount",
      });
    }
    if (amountPaid == 1 / 0) {
      reply.code(500).send({
        status: "Fail",
        message: "Inavalid input",
      });
    }

    // Validate input data
    if (!orderId || !amountPaid || !currentDate) {
      return reply.code(400).send({
        status: "Fail",
        message: "Invalid input data",
      });
    }

    const foundOrder = await OutgoingOrder.findById(orderId);

    // Check if the order exists
    if (!foundOrder) {
      return reply.code(404).send({
        status: "Fail",
        message: "Order not found",
      });
    }

    // Update order details
    foundOrder.amountPaid = foundOrder.amountPaid + parseFloat(amountPaid);
    foundOrder.date = currentDate;

    // Save the updated order
    await foundOrder.save();

    // Find existing payment history or create new if not exists
    let paymentHistory = await PaymentHistory.findOne({
      outgoingOrderId: orderId,
    });

    if (!paymentHistory) {
      paymentHistory = new PaymentHistory({ outgoingOrderId: orderId });
      paymentHistory.totalAmount = foundOrder.totalAmount;
    }

    // Create payment entry
    const paymentEntry = {
      amountPaid: parseFloat(amountPaid),
      amountLeft: foundOrder.totalAmount - foundOrder.amountPaid, // Assuming totalAmount is available in foundOrder
      date: currentDate,
    };

    // Add payment entry to payment history
    paymentHistory.paymentEntries.push(paymentEntry);

    // Save the payment history
    await paymentHistory.save();

    // Send success response
    reply.code(200).send({
      status: "Success",
      updatedOrder: foundOrder,
      paymentHistory: paymentHistory,
    });
  } catch (err) {
    console.log(err.message);
    reply.code(500).send({
      status: "Fail",
      message: "Failed to update outgoing order",
    });
  }
};

const deleteFarmerOutgoingOrder = async (req, reply) => {
  try {
    const { orderId } = req.body;

    // Assuming you are using some ORM like Mongoose
    const deletedOrder = await OutgoingOrder.findByIdAndDelete(orderId);

    if (!deletedOrder) {
      return reply.status(404).send({
        status: "Fail",
        message: "Order not found",
      });
    }

    reply.send({
      status: "Success",
      message: "Order deleted successfully",
    });
  } catch (err) {
    console.log(err.message);
    reply.status(500).send({
      status: "Fail",
      message: "Some error occurred while deleting order",
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
  registerStoreAdmin,
  loginStoreAdmin,
  logoutStoreAdmin,
  getStoreAdminProfile,
  getNumberOfStoreAdmins,
  getFarmers,
  getFarmerById,
  updateUser,
  deleteUser,
  sendRequestToFarmer,
  quickRegisterFarmer,
  createNewOrder,
  getFarmerOrders,
  createOutgoingOrder,
  updateOrdersAfterOutgoing,
  getLotNumber,
  getFarmerOutgoingOrders,
  updateFarmerOutgoingOrder,
  deleteFarmerOutgoingOrder,
  getPaymentHistory,
};
