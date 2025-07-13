import bcrypt from "bcryptjs";
import generateToken from "../utils/generateToken.js";
import SuperAdmin from "../models/superAdminModel.js";
import StoreAdmin from "../models/storeAdminModel.js";
import Farmer from "../models/farmerModel.js";
import mongoose from "mongoose";
import Order from "../models/orderModel.js";
import OutgoingOrder from "../models/outgoingOrderModel.js";

const loginSuperAdmin = async (req, reply) => {
  try {
    const { email, password } = req.body;
    const superAdmin = await SuperAdmin.findOne({ email });

    if (!superAdmin) {
      return reply.code(404).send({
        status: "Fail",
        message: "Super admin not found",
      });
    }

    const isMatch = await bcrypt.compare(password, superAdmin.password);

    if (!isMatch) {
      // Explicitly handling wrong password case
      return reply.code(401).send({
        status: "Fail",
        message: "Invalid email or password",
      });
    }

    const token = await generateToken(reply, superAdmin._id, true);

    return reply.code(200).send({
      status: "Success",
      superAdmin,
      token,
    });
  } catch (err) {
    req.log.error("Error during super admin login", { err });
    return reply.code(500).send({
      status: "Fail",
      message: "Some error occurred while super admin login",
      errorMessage: err.message,
    });
  }
};

const logoutSuperAdmin = async (req, reply) => {
  try {
    // Clear the JWT cookie by setting an empty value and an expired date
    reply.cookie("jwt", "", {
      httpOnly: true,
      expires: new Date(0),
    });
    req.log.info("JWT cookie cleared successfully");

    // Send success response
    reply.code(200).send({
      status: "Success",
      message: "User logged out successfully",
    });

    req.log.info("Super admin logged out successfully");
  } catch (err) {
    req.log.error("Error during super admin logout", { err });

    // Handle any errors that occur during logout
    reply.code(500).send({
      status: "Fail",
      message: "Some error occured during super admin logout",
      errorMessage: err.message,
    });
  }
};

const getAllColdStorages = async (req, reply) => {
  try {
    const storeAdmins = await StoreAdmin.find();

    if (!storeAdmins || storeAdmins.length === 0) {
      return reply.code(404).send({
        status: "Fail",
        message: "No cold storages found",
      });
    }

    return reply.code(200).send({
      status: "Success",
      storeAdmins,
    });
  } catch (err) {
    req.log.error("Error fetching cold storages", { err });
    return reply.code(500).send({
      status: "Fail",
      message: "Some error occurred while fetching cold storages",
      errorMessage: err.message,
    });
  }
};

const coldStorageSummary = async (req, reply) => {
  try {
    const coldStorageId = req.params.id;

    if (!coldStorageId) {
      return reply.code(400).send({
        status: "Fail",
        message: "coldStorageId is required",
      });
    }

    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(coldStorageId)) {
      return reply.code(400).send({
        status: "Fail",
        message: "Invalid ID format",
        errorMessage: "Please provide a valid MongoDB ObjectId",
      });
    }

    // Aggregate incoming orders
    const incomingOrders = await Order.aggregate([
      {
        $match: {
          coldStorageId: new mongoose.Types.ObjectId(coldStorageId),
        },
      },
      { $unwind: "$orderDetails" },
      { $unwind: "$orderDetails.bagSizes" },
      {
        $group: {
          _id: {
            variety: "$orderDetails.variety",
            size: "$orderDetails.bagSizes.size",
          },
          initialQuantity: {
            $sum: "$orderDetails.bagSizes.quantity.initialQuantity",
          },
          currentQuantity: {
            $sum: "$orderDetails.bagSizes.quantity.currentQuantity",
          },
        },
      },
    ]);

    // Aggregate outgoing orders
    const outgoingOrders = await OutgoingOrder.aggregate([
      {
        $match: {
          coldStorageId: new mongoose.Types.ObjectId(coldStorageId),
        },
      },
      { $unwind: "$orderDetails" },
      { $unwind: "$orderDetails.bagSizes" },
      {
        $group: {
          _id: {
            variety: "$orderDetails.variety",
            size: "$orderDetails.bagSizes.size",
          },
          quantityRemoved: {
            $sum: "$orderDetails.bagSizes.quantityRemoved",
          },
        },
      },
    ]);

    // Transform incoming orders into a structured object
    const incomingSummary = incomingOrders.reduce((acc, order) => {
      const { variety, size } = order._id;
      if (!acc[variety]) acc[variety] = {};
      acc[variety][size] = {
        initialQuantity: order.initialQuantity,
        currentQuantity: order.currentQuantity,
      };
      return acc;
    }, {});

    // Add outgoing quantities to the structured object
    outgoingOrders.forEach((order) => {
      const { variety, size } = order._id;
      if (!incomingSummary[variety]) incomingSummary[variety] = {};
      if (!incomingSummary[variety][size]) {
        incomingSummary[variety][size] = {
          initialQuantity: 0,
          currentQuantity: 0,
        };
      }
      incomingSummary[variety][size].quantityRemoved = order.quantityRemoved;
    });

    // Convert the stock summary object into an array
    const stockSummaryArray = Object.entries(incomingSummary).map(
      ([variety, sizes]) => ({
        variety,
        sizes: Object.entries(sizes).map(([size, quantities]) => ({
          size,
          ...quantities,
        })),
      })
    );

    reply.code(200).send({
      status: "Success",
      stockSummary: stockSummaryArray,
    });
  } catch (err) {
    reply.code(500).send({
      status: "Fail",
      message: "Error occurred while calculating cold storage summary",
      errorMessage: err.message,
    });
  }
};

const getIncomingOrdersOfAColdStorage = async (req, reply) => {
  try {
    const { id } = req.params;

    if (!id) {
      return reply.code(400).send({
        status: "Fail",
        message: "Cold storage ID is required",
      });
    }

    // Find orders by coldStorageId
    const orders = await Order.find({ coldStorageId: id });

    if (!orders.length) {
      return reply.code(404).send({
        status: "Fail",
        message: "No orders found for this cold storage",
      });
    }

    reply.code(200).send({
      status: "Success",
      message: "Cold storage orders retrieved successfully",
      data: orders,
    });
  } catch (err) {
    reply.code(500).send({
      status: "Fail",
      message: "Error occurred while retrieving cold storage orders",
      errorMessage: err.message,
    });
  }
};

const editIncomingOrder = async (req, reply) => {
  try {
    const { orderId } = req.params;
    const updates = req.body;

    // Validate orderId
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return reply.code(400).send({
        status: "Fail",
        message: "Invalid order ID format",
      });
    }

    // Find the existing order
    const existingOrder = await Order.findById(orderId);
    if (!existingOrder) {
      return reply.code(404).send({
        status: "Fail",
        message: "Order not found",
      });
    }

    req.log.info("Processing order update", {
      orderId,
      updates,
      requestId: req.id,
    });

    // Store the original current quantity for later comparison
    const originalOrderStock = existingOrder.orderDetails.reduce(
      (totalStock, detail) =>
        totalStock +
        detail.bagSizes.reduce(
          (sum, bag) => sum + (bag.quantity.currentQuantity || 0),
          0
        ),
      0
    );

    // ✅ Step 1: Handle direct field updates
    const allowedDirectUpdates = ["remarks", "dateOfSubmission", "fulfilled"];
    allowedDirectUpdates.forEach((field) => {
      if (updates[field] !== undefined) {
        existingOrder[field] = updates[field];
      }
    });

    // ✅ Step 2: Handle orderDetails updates
    if (updates.orderDetails && Array.isArray(updates.orderDetails) && updates.orderDetails.length > 0) {
      // Since each order should have only one variety entry, we always use the first item in the array
      const updateDetail = updates.orderDetails[0];

      if (!updateDetail.variety) {
        throw new Error("Variety is required for order details");
      }

      if (
        !updateDetail.bagSizes ||
        !Array.isArray(updateDetail.bagSizes) ||
        updateDetail.bagSizes.length === 0
      ) {
        throw new Error(
          `At least one bag size is required for variety ${updateDetail.variety}`
        );
      }

      // Validate bag sizes
      updateDetail.bagSizes.forEach((bag) => {
        if (!bag.size) {
          throw new Error(
            `Size is required for bag sizes in variety ${updateDetail.variety}`
          );
        }
        if (
          !bag.quantity ||
          bag.quantity.initialQuantity === undefined ||
          bag.quantity.currentQuantity === undefined
        ) {
          throw new Error(
            `Both initialQuantity and currentQuantity are required for bag size ${bag.size} in variety ${updateDetail.variety}`
          );
        }
        if (bag.quantity.initialQuantity < 0 || bag.quantity.currentQuantity < 0) {
          throw new Error(
            `Negative quantities are not allowed for ${updateDetail.variety} - ${bag.size}`
          );
        }
      });

      // Update the location if provided
      if (updateDetail.location !== undefined) {
        // If the order already has an orderDetails array with at least one item
        if (existingOrder.orderDetails && existingOrder.orderDetails.length > 0) {
          // Update the location of the existing variety
          existingOrder.orderDetails[0].location = updateDetail.location;
        } else {
          // If there's no orderDetails array yet, create one with the location
          existingOrder.orderDetails = [{
            variety: updateDetail.variety,
            bagSizes: updateDetail.bagSizes,
            location: updateDetail.location
          }];
        }
      }

      // Always maintain a single variety entry
      if (existingOrder.orderDetails && existingOrder.orderDetails.length > 0) {
        // Update the variety name and bag sizes
        existingOrder.orderDetails[0].variety = updateDetail.variety;
        existingOrder.orderDetails[0].bagSizes = updateDetail.bagSizes;
      } else {
        // Create a new orderDetails array with single entry if it doesn't exist
        existingOrder.orderDetails = [updateDetail];
      }
    }

    // ✅ Step 3: Recalculate `currentStockAtThatTime`
    let newCurrentStock = 0;
    try {
      const coldStorageId = existingOrder.coldStorageId;
      const originalOrderId = existingOrder._id;

      const result = await Order.aggregate([
        {
          $match: {
            coldStorageId: new mongoose.Types.ObjectId(coldStorageId),
            _id: { $ne: new mongoose.Types.ObjectId(originalOrderId) },
          },
        },
        { $unwind: "$orderDetails" },
        { $unwind: "$orderDetails.bagSizes" },
        {
          $group: {
            _id: null,
            totalCurrentQuantity: {
              $sum: "$orderDetails.bagSizes.quantity.currentQuantity",
            },
          },
        },
      ]);

      const baseStock = result.length > 0 ? result[0].totalCurrentQuantity : 0;

      const orderStock = existingOrder.orderDetails.reduce(
        (totalStock, detail) =>
          totalStock +
          detail.bagSizes.reduce(
            (sum, bag) => sum + (bag.quantity.currentQuantity || 0),
            0
          ),
        0
      );

      newCurrentStock = baseStock + orderStock;

      req.log.info("Recalculated current stock", {
        baseStock,
        orderStock,
        newCurrentStock,
        orderId,
        requestId: req.id,
      });
    } catch (error) {
      req.log.error("Error recalculating stock", {
        error: error.message,
        stack: error.stack,
        orderId,
        requestId: req.id,
      });

      return reply.code(500).send({
        status: "Fail",
        message: "Error recalculating stock",
        errorMessage: error.message,
      });
    }

    existingOrder.currentStockAtThatTime = newCurrentStock;

    // ✅ Step 4: Save the updated order
    const updatedOrder = await existingOrder.save();

    // ✅ Step 5: Update all subsequent orders' currentStockAtThatTime
    try {
      // Calculate the stock difference after the update
      const newOrderStock = updatedOrder.orderDetails.reduce(
        (totalStock, detail) =>
          totalStock +
          detail.bagSizes.reduce(
            (sum, bag) => sum + (bag.quantity.currentQuantity || 0),
            0
          ),
        0
      );

      const stockDifference = newOrderStock - originalOrderStock;

      // If there's a change in stock, update all subsequent orders
      if (stockDifference !== 0) {
        req.log.info("Stock difference detected, updating subsequent orders", {
          originalOrderStock,
          newOrderStock,
          stockDifference,
          orderId,
          requestId: req.id,
        });

        // Find all subsequent orders from the same cold storage
        // Sort by voucher number to ensure we process them in chronological order
        const subsequentOrders = await Order.find({
          coldStorageId: updatedOrder.coldStorageId,
          "voucher.type": "RECEIPT",
          $or: [
            { "voucher.voucherNumber": { $gt: updatedOrder.voucher.voucherNumber } },
            {
              "voucher.voucherNumber": updatedOrder.voucher.voucherNumber,
              _id: { $gt: updatedOrder._id }
            }
          ]
        }).sort({ "voucher.voucherNumber": 1, _id: 1 });

        req.log.info(`Found ${subsequentOrders.length} subsequent orders to update`, {
          orderId,
          requestId: req.id,
        });

        // Update each subsequent order
        for (const order of subsequentOrders) {
          order.currentStockAtThatTime += stockDifference;
          await order.save();
        }

        req.log.info(`Successfully updated ${subsequentOrders.length} subsequent orders`, {
          orderId,
          stockDifference,
          requestId: req.id,
        });
      } else {
        req.log.info("No stock difference detected, no need to update subsequent orders", {
          orderId,
          requestId: req.id,
        });
      }
    } catch (error) {
      req.log.error("Error updating subsequent orders", {
        error: error.message,
        stack: error.stack,
        orderId,
        requestId: req.id,
      });

      // We don't fail the request if subsequent updates fail
      // The primary order update was successful
    }

    reply.code(200).send({
      status: "Success",
      message: "Order updated successfully",
      data: updatedOrder,
    });
  } catch (err) {
    req.log.error("Error updating order", {
      error: err.message,
      stack: err.stack,
      orderId: req.params?.orderId,
      requestId: req.id,
    });

    reply.code(400).send({
      status: "Fail",
      message: "Failed to update order",
      errorMessage: err.message,
    });
  }
};

const getFarmerInfo = async (req, reply) => {
  try {
    const { id } = req.params;
    if (!id) {
      return reply.code(400).send({
        status: "Fail",
        message: "Farmer ID is required",
      });
    }

    // Find farmer by id
    const farmer = await Farmer.findById(id);
    if (!farmer) {
      return reply.code(404).send({
        status: "Fail",
        message: "Farmer not found with the provided ID",
      });
    }

    reply.code(200).send({
      status: "Success",
      message: "Farmer information retrieved successfully",
      data: farmer,
    });
  } catch (err) {
    reply.code(500).send({
      status: "Fail",
      message: "Error occurred while retrieving farmer information",
      errorMessage: err.message,
    });
  }
};

const getFarmersOfAColdStorage = async (req, reply) => {
  try {
    const { id } = req.params;
    if (!id) {
      return reply.code(400).send({
        status: "Fail",
        message: "Cold storage ID is required",
      });
    }

    const storeAdmin = await StoreAdmin.findById(id)
      .populate({
        path: 'registeredFarmers',  // Change this to your actual field name that contains farmer references
        select: '-password -__v'    // Optional: exclude sensitive or unnecessary fields
      });

    if (!storeAdmin) {
      return reply.code(404).send({
        status: "Fail",
        message: "Cold storage not found",
      });
    }

    reply.code(200).send({
      status: "Success",
      message: "Cold storage orders retrieved successfully",
      data: storeAdmin.registeredFarmers
    });
  } catch (err) {
    reply.code(500).send({
      status: "Fail",
      message: "Error occurred while retrieving cold storage orders",
      errorMessage: err.message,
    });
  }
};

const deleteOrder = async (req, reply) => {
  try {
    const { id } = req.params;

    if (!id) {
      return reply.code(400).send({
        status: "Fail",
        message: "Order ID is required"
      });
    }

    // Validate if the ID is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return reply.code(400).send({
        status: "Fail",
        message: "Invalid order ID format"
      });
    }

    // Find and delete the order
    const deletedOrder = await Order.findByIdAndDelete(id);

    if (!deletedOrder) {
      return reply.code(404).send({
        status: "Fail",
        message: "Order not found"
      });
    }

    reply.code(200).send({
      status: "Success",
      message: "Order deleted successfully",
      data: deletedOrder
    });

  } catch (err) {
    reply.code(500).send({
      status: "Fail",
      message: "Error occurred while deleting the order",
      errorMessage: err.message
    });
  }
};

const getOutgoingOrdersOfAColdStorage = async (req, reply) => {
  try {
    const { id } = req.params;

    if (!id) {
      return reply.code(400).send({
        status: "Fail",
        message: "Cold storage ID is required",
      });
    }

    // Find orders by coldStorageId
    const orders = await OutgoingOrder.find({ coldStorageId: id });

    if (!orders.length) {
      return reply.code(200).send({
        status: "Fail",
        message: "No orders found for this cold storage",
      });
    }

    reply.code(200).send({
      status: "Success",
      message: "Cold storage orders retrieved successfully",
      data: orders,
    });
  } catch (err) {
    reply.code(500).send({
      status: "Fail",
      message: "Error occurred while retrieving cold storage orders",
      errorMessage: err.message,
    });
  }
};

const editFarmerInfo = async (req, reply) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!id) {
      return reply.code(400).send({
        status: "Fail",
        message: "Farmer ID is required",
      });
    }

    // Validate if the ID is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return reply.code(400).send({
        status: "Fail",
        message: "Invalid farmer ID format",
      });
    }

    // Define which fields can be updated
    const allowedUpdates = [
      "name",
      "address",
      "mobileNumber",
      "imageUrl",
      "isVerified"
    ];

    // Filter out any fields that are not allowed to be updated
    const filteredUpdates = Object.keys(updates)
      .filter(key => allowedUpdates.includes(key))
      .reduce((obj, key) => {
        obj[key] = updates[key];
        return obj;
      }, {});

    if (Object.keys(filteredUpdates).length === 0) {
      return reply.code(400).send({
        status: "Fail",
        message: "No valid fields to update",
      });
    }

    // Update the farmer with the filtered updates
    const updatedFarmer = await Farmer.findByIdAndUpdate(
      id,
      filteredUpdates,
      { new: true, runValidators: true }
    );

    if (!updatedFarmer) {
      return reply.code(404).send({
        status: "Fail",
        message: "Farmer not found",
      });
    }

    // Return the updated farmer
    reply.code(200).send({
      status: "Success",
      message: "Farmer information updated successfully",
      data: updatedFarmer,
    });
  } catch (err) {
    reply.code(500).send({
      status: "Fail",
      message: "Error occurred while updating farmer information",
      errorMessage: err.message,
    });
  }
};

const getSingleFarmerOrders = async (req, reply) => {
  try {
    const { coldStorageId, farmerId } = req.params;

    // Validate IDs
    if (
      !mongoose.Types.ObjectId.isValid(coldStorageId) ||
      !mongoose.Types.ObjectId.isValid(farmerId)
    ) {
      req.log.warn("Invalid farmerId or coldStorageId provided", {
        farmerId,
        coldStorageId,
      });
      return reply.code(400).send({
        status: "Fail",
        message: "Invalid ID format",
        errorMessage: "Please provide valid MongoDB ObjectIds",
      });
    }

    req.log.info("Starting to fetch farmer orders", {
      farmerId,
      coldStorageId,
    });

    const [incomingOrders, outgoingOrders] = await Promise.all([
      Order.find({ coldStorageId, farmerId })
        .sort({ dateOfSubmission: -1 })
        .populate({
          path: "farmerId",
          model: Farmer,
          select: "_id name",
        })
        .select(
          "_id coldStorageId farmerId remarks voucher dateOfSubmission orderDetails"
        ),
      OutgoingOrder.find({ coldStorageId, farmerId })
        .sort({ dateOfExtraction: -1 })
        .populate({
          path: "farmerId",
          model: Farmer,
          select: "_id name",
        })
        .select(
          "_id coldStorageId farmerId remarks voucher dateOfExtraction orderDetails"
        ),
    ]);

    req.log.info("Retrieved orders from database", {
      farmerId,
      incomingOrdersCount: incomingOrders.length,
      outgoingOrdersCount: outgoingOrders.length,
    });

    // Helper function to sort bag sizes within orders
    const sortOrderDetails = (orders) => {
      return orders.map((order) => {
        const orderObj = order.toObject();
        orderObj.orderDetails = orderObj.orderDetails.map((detail) => ({
          ...detail,
          bagSizes: detail.bagSizes.sort((a, b) =>
            a.size.localeCompare(b.size)
          ),
        }));
        return orderObj;
      });
    };

    // Sort bag sizes in both incoming and outgoing orders
    const sortedIncoming = sortOrderDetails(incomingOrders);
    const sortedOutgoing = sortOrderDetails(outgoingOrders);
    const allOrders = [...sortedIncoming, ...sortedOutgoing];

    if (allOrders.length === 0) {
      req.log.info("No orders found for farmer", {
        farmerId,
        coldStorageId,
      });
      return reply.code(200).send({
        status: "Success",
        message: "Farmer doesn't have any orders",
        data: [],
      });
    }

    req.log.info("Successfully retrieved all farmer orders", {
      farmerId,
      totalOrders: allOrders.length,
      incomingOrders: incomingOrders.length,
      outgoingOrders: outgoingOrders.length,
    });

    reply.code(200).send({
      status: "Success",
      message: "Orders retrieved successfully",
      data: allOrders,
    });
  } catch (err) {
    req.log.error("Error occurred while getting farmer orders", {
      farmerId: req.params.farmerId,
      coldStorageId: req.params.coldStorageId,
      errorMessage: err.message,
      stack: err.stack,
    });

    reply.code(500).send({
      status: "Fail",
      message: "Error occurred while getting farmer orders",
      errorMessage: err.message,
    });
  }
};

const getTopFarmers = async (req, reply) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return reply.code(400).send({
        status: "Fail",
        message: "Valid cold storage ID is required",
      });
    }
    const topFarmers = await Order.aggregate([
      // Match orders for the specific cold storage
      {
        $match: {
          coldStorageId: new mongoose.Types.ObjectId(id)
        }
      },
      // Unwind the arrays to get individual entries
      { $unwind: "$orderDetails" },
      { $unwind: "$orderDetails.bagSizes" },
      // Group by farmer and calculate totals
      {
        $group: {
          _id: "$farmerId",
          totalBags: {
            $sum: "$orderDetails.bagSizes.quantity.initialQuantity"
          },
          bagSizeDetails: {
            $push: {
              size: "$orderDetails.bagSizes.size",
              quantity: "$orderDetails.bagSizes.quantity.initialQuantity"
            }
          }
        }
      },
      // Properly group the bag sizes
      {
        $project: {
          _id: 1,
          totalBags: 1,
          bagSummary: {
            $arrayToObject: {
              $map: {
                input: {
                  $setUnion: "$bagSizeDetails.size"
                },
                as: "size",
                in: {
                  k: "$$size",
                  v: {
                    $sum: {
                      $map: {
                        input: {
                          $filter: {
                            input: "$bagSizeDetails",
                            as: "sizeDetail",
                            cond: { $eq: ["$$sizeDetail.size", "$$size"] }
                          }
                        },
                        as: "filteredSize",
                        in: "$$filteredSize.quantity"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      // Lookup farmer details - use the correct collection name "farmers"
      {
        $lookup: {
          from: "farmers", // Collection name is lowercase in MongoDB
          localField: "_id",
          foreignField: "_id",
          as: "farmerInfo"
        }
      },
      // Unwind the farmer info array
      {
        $unwind: {
          path: "$farmerInfo",
          preserveNullAndEmptyArrays: true
        }
      },
      // Project final format
      {
        $project: {
          farmerId: "$_id",
          farmerName: { $ifNull: ["$farmerInfo.name", "Unknown Farmer"] },
          totalBags: 1,
          bagSummary: 1
        }
      },
      // Sort by total bags in descending order
      {
        $sort: { totalBags: -1 }
      },
      // Limit to top 5 farmers
      {
        $limit: 5
      }
    ]);

    if (!topFarmers.length) {
      return reply.code(200).send({
        status: "Success",
        message: "No farmers found for this cold storage",
        data: []
      });
    }

    reply.code(200).send({
      status: "Success",
      message: "Top farmers retrieved successfully",
      data: topFarmers
    });
  } catch (err) {
    console.error("Error in getTopFarmers:", err);
    reply.code(500).send({
      status: "Fail",
      message: "Error occurred while retrieving top farmers",
      errorMessage: err.message
    });
  }
};

const getFarmerOrderFrequency = async (req, reply) => {
  try {
    const { coldStorageId, farmerId } = req.params;

    // Add today's date for comparison
    const currentDate = new Date();

    // Validate IDs
    if (
      !mongoose.Types.ObjectId.isValid(coldStorageId) ||
      !mongoose.Types.ObjectId.isValid(farmerId)
    ) {
      return reply.code(400).send({
        status: "Fail",
        message: "Invalid ID format",
        errorMessage: "Please provide valid MongoDB ObjectIds",
      });
    }

    // Get all orders for this farmer at this cold storage
    const orders = await Order.find({
      coldStorageId,
      farmerId,
    });

    // Parse dates and filter out future orders
    const parsedOrders = orders.filter(order => {
      try {
        // Parse date in format DD.MM.YY
        const [day, month, yearShort] = order.dateOfSubmission.split('.');
        const year = 2000 + parseInt(yearShort, 10); // Assuming 20xx for the year
        const orderDate = new Date(year, month - 1, day); // month is 0-indexed in JS Date

        // Only include orders up to current date
        return orderDate <= currentDate;
      } catch (err) {
        return false;
      }
    }).sort((a, b) => {
      // Sort by parsed dates
      const [dayA, monthA, yearShortA] = a.dateOfSubmission.split('.');
      const [dayB, monthB, yearShortB] = b.dateOfSubmission.split('.');

      const yearA = 2000 + parseInt(yearShortA, 10);
      const yearB = 2000 + parseInt(yearShortB, 10);

      const dateA = new Date(yearA, monthA - 1, dayA);
      const dateB = new Date(yearB, monthB - 1, dayB);

      return dateA - dateB;
    });

    if (!parsedOrders.length) {
      return reply.code(200).send({
        status: "Success",
        message: "No orders found for this farmer at this cold storage",
        data: {
          orderCount: 0,
          monthlyFrequency: [],
          quarterlyFrequency: [],
          avgOrderInterval: 0
        }
      });
    }

    // Prepare data structures for metrics
    const monthlyData = {};
    const quarterlyData = {};
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    // Process each order
    parsedOrders.forEach(order => {
      // Parse date again for calculations
      const [day, month, yearShort] = order.dateOfSubmission.split('.');
      const year = 2000 + parseInt(yearShort, 10);
      const orderDate = new Date(year, month - 1, day);

      const monthIndex = parseInt(month, 10) - 1; // Convert to 0-indexed
      const quarter = Math.floor(monthIndex / 3) + 1; // 1-4

      // Monthly frequency
      const monthKey = `${year}-${monthIndex+1}`;
      const monthLabel = `${monthNames[monthIndex]} ${year}`;
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          period: monthLabel,
          count: 0,
          totalQuantity: 0
        };
      }
      monthlyData[monthKey].count += 1;

      // Add quantities from order details
      let orderTotalQuantity = 0;
      if (order.orderDetails && order.orderDetails.length > 0) {
        order.orderDetails.forEach(detail => {
          detail.bagSizes.forEach(bag => {
            const quantity = bag.quantity.initialQuantity || 0;
            orderTotalQuantity += quantity;
            monthlyData[monthKey].totalQuantity += quantity;
          });
        });
      }

      // Quarterly frequency
      const quarterKey = `${year}-Q${quarter}`;
      const quarterLabel = `Q${quarter} ${year}`;
      if (!quarterlyData[quarterKey]) {
        quarterlyData[quarterKey] = {
          period: quarterLabel,
          count: 0,
          totalQuantity: 0
        };
      }
      quarterlyData[quarterKey].count += 1;

      // Add quantities to quarterly data too
      if (order.orderDetails && order.orderDetails.length > 0) {
        order.orderDetails.forEach(detail => {
          detail.bagSizes.forEach(bag => {
            const quantity = bag.quantity.initialQuantity || 0;
            quarterlyData[quarterKey].totalQuantity += quantity;
          });
        });
      }
    });

    // Convert data objects to arrays
    const monthlyFrequency = Object.values(monthlyData).sort((a, b) => {
      // Extract year and month for comparison
      const [aMonth, aYear] = a.period.split(' ');
      const [bMonth, bYear] = b.period.split(' ');

      // Compare by year first, then by month index
      if (aYear !== bYear) return parseInt(aYear) - parseInt(bYear);
      return monthNames.indexOf(aMonth) - monthNames.indexOf(bMonth);
    });

    const quarterlyFrequency = Object.values(quarterlyData).sort((a, b) => {
      // Sort by year and quarter
      const [aQuarter, aYear] = a.period.replace('Q', '').split(' ');
      const [bQuarter, bYear] = b.period.replace('Q', '').split(' ');

      if (aYear !== bYear) return parseInt(aYear) - parseInt(bYear);
      return parseInt(aQuarter) - parseInt(bQuarter);
    });

    // Calculate average order interval in days
    let totalIntervalDays = 0;
    for (let i = 1; i < parsedOrders.length; i++) {
      // Parse dates for interval calculation
      const [prevDay, prevMonth, prevYearShort] = parsedOrders[i-1].dateOfSubmission.split('.');
      const [currDay, currMonth, currYearShort] = parsedOrders[i].dateOfSubmission.split('.');

      const prevYear = 2000 + parseInt(prevYearShort, 10);
      const currYear = 2000 + parseInt(currYearShort, 10);

      const prevDate = new Date(prevYear, parseInt(prevMonth, 10) - 1, parseInt(prevDay, 10));
      const currDate = new Date(currYear, parseInt(currMonth, 10) - 1, parseInt(currDay, 10));

      const intervalDays = Math.floor((currDate - prevDate) / (1000 * 60 * 60 * 24));
      totalIntervalDays += intervalDays;
    }

    const avgOrderInterval = parsedOrders.length > 1
      ? Math.round(totalIntervalDays / (parsedOrders.length - 1))
      : 0;

    return reply.code(200).send({
      status: "Success",
      message: "Farmer order frequency metrics retrieved successfully",
      data: {
        orderCount: parsedOrders.length,
        monthlyFrequency,
        quarterlyFrequency,
        avgOrderInterval
      }
    });
  } catch (err) {
    reply.code(500).send({
      status: "Fail",
      message: "Error occurred while retrieving farmer order frequency metrics",
      errorMessage: err.message
    });
  }
};

const deleteOutgoingOrder = async (req, reply) => {
  try {
    const { id } = req.params;

    if (!id) {
      return reply.code(400).send({
        status: "Fail",
        message: "Outgoing order ID is required"
      });
    }

    // Validate if the ID is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return reply.code(400).send({
        status: "Fail",
        message: "Invalid outgoing order ID format"
      });
    }

    // Find and delete the outgoing order
    const deletedOutgoingOrder = await OutgoingOrder.findByIdAndDelete(id);

    if (!deletedOutgoingOrder) {
      return reply.code(404).send({
        status: "Fail",
        message: "Outgoing order not found"
      });
    }

    reply.code(200).send({
      status: "Success",
      message: "Outgoing order deleted successfully",
      data: deletedOutgoingOrder
    });

  } catch (err) {
    reply.code(500).send({
      status: "Fail",
      message: "Error occurred while deleting the outgoing order",
      errorMessage: err.message
    });
  }
};

const deleteFarmer = async (req, reply) => {
  try {
    const { id } = req.params;

    if (!id) {
      return reply.code(400).send({
        status: "Fail",
        message: "Farmer ID is required"
      });
    }

    // Validate if the ID is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return reply.code(400).send({
        status: "Fail",
        message: "Invalid farmer ID format"
      });
    }

    // Delete all incoming orders associated with the farmer
    const deletedIncomingOrders = await Order.deleteMany({ farmerId: id });
    req.log.info(`Deleted ${deletedIncomingOrders.deletedCount} incoming orders for farmer ${id}`);

    // Delete all outgoing orders associated with the farmer
    const deletedOutgoingOrders = await OutgoingOrder.deleteMany({ farmerId: id });
    req.log.info(`Deleted ${deletedOutgoingOrders.deletedCount} outgoing orders for farmer ${id}`);

    // Find and delete the farmer
    const deletedFarmer = await Farmer.findByIdAndDelete(id);

    if (!deletedFarmer) {
      return reply.code(404).send({
        status: "Fail",
        message: "Farmer not found"
      });
    }

    // Also remove this farmer's reference from any StoreAdmin's registeredFarmers array
    await StoreAdmin.updateMany(
      { registeredFarmers: id },
      { $pull: { registeredFarmers: id } }
    );

    reply.code(200).send({
      status: "Success",
      message: "Farmer and all associated orders deleted successfully",
      data: {
        farmer: deletedFarmer,
        deletedOrdersCount: {
          incomingOrders: deletedIncomingOrders.deletedCount,
          outgoingOrders: deletedOutgoingOrders.deletedCount
        }
      }
    });

  } catch (err) {
    req.log.error("Error occurred while deleting the farmer and associated orders", {
      error: err.message,
      stack: err.stack,
      farmerId: req.params?.id
    });

    reply.code(500).send({
      status: "Fail",
      message: "Error occurred while deleting the farmer and associated orders",
      errorMessage: err.message
    });
  }
};

export {
  loginSuperAdmin,
  getAllColdStorages,
  logoutSuperAdmin,
  coldStorageSummary,
  getIncomingOrdersOfAColdStorage,
  editIncomingOrder,
  getFarmersOfAColdStorage,
  getFarmerInfo,
  deleteOrder,
  getOutgoingOrdersOfAColdStorage,
  editFarmerInfo,
  getSingleFarmerOrders,
  getTopFarmers,
  getFarmerOrderFrequency,
  deleteOutgoingOrder,
  deleteFarmer,
};
