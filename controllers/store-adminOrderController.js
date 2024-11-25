import Order from "../models/orderModel.js";
import OutgoingOrder from "../models/outgoingOrderModel.js";
import Farmer from "../models/farmerModel.js";
import { orderSchema } from "../utils/validationSchemas.js";
import {
  getDeliveryVoucherNumberHelper,
  getReceiptNumberHelper,
  formatDate,
} from "../utils/helpers.js";
import mongoose from "mongoose";

// ORDER ROUTES CONTROLLER FUCNTIONS

//@desc  Get receipt number
//@route GET/api/store-admin/receipt-number
//@access Private
const getReceiptNumber = async (req, reply) => {
  try {
    const storeAdminId = req.storeAdmin._id;

    // Log the store admin ID
    req.log.info("Fetching receipt number for store admin", { storeAdminId });

    // Using aggregation pipeline to count orders where voucher.type is "RECEIT"
    req.log.info("Running aggregation pipeline to count RECEIT type orders");
    const result = await Order.aggregate([
      {
        $match: {
          coldStorageId: storeAdminId, // Match orders belonging to the specific store admin
          "voucher.type": "RECEIPT", // Match orders where voucher type is "RECEIT"
        },
      },
      {
        $group: {
          _id: null, // We don't care about grouping by any field, just counting
          count: { $sum: 1 }, // Sum the number of documents that match
        },
      },
    ]);

    // Extracting count from result
    const receiptNumber = result.length > 0 ? result[0].count : 0;

    // Log the receipt number result
    req.log.info("Receipt number calculation complete", { receiptNumber });

    // Sending response with receipt number
    reply.code(200).send({
      status: "Success",
      receiptNumber: receiptNumber + 1,
    });
  } catch (err) {
    // Log error
    req.log.error("Error occurred while getting receipt number", {
      errorMessage: err.message,
    });
    reply.code(500).send({
      status: "Fail",
      message: "Error occurred while getting receipt number",
      errorMessage: err.message,
    });
  }
};

const getDeliveryVoucherNumber = async (req, reply) => {
  try {
    const storeAdminId = req.storeAdminId._id;

    req.log.info("Fetching Delivery voucher number for store admin", {
      storeAdminId,
    });

    req.log.info(
      "Running aggregation pipeline to count DELIVERY voucher number"
    );

    const result = await OutgoingOrder.aggregate([
      {
        $match: {
          coldStorageId: storeAdminId,
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 }, // sum of the number of documents
        },
      },
    ]);

    const deliveryVoucherNumber = result.length > 0 ? result[0].count : 0;

    req.log.info("Deliver voucher count: ", { deliveryVoucherNumber });

    reply.code(200).send({
      status: "Success",
      deliveryVoucherNumber: deliveryVoucherNumber + 1,
    });
  } catch (err) {
    req.log.error("Error occurred while getting receipt number", {
      errorMessage: err.message,
    });

    reply.code(500).send({
      status: "Fail",
      message: "Error occured while getting delivery voucher number",
      errorMessage: err.message,
    });
  }
};

// @desc Create new Incoming Order
//@route POST/api/store-admin/orders
//@access Private
const searchFarmers = async (req, reply) => {
  try {
    // Accessing searchQuery directly from req.query
    console.log("REQUEST QUERY IS: ", req.query.query);
    const searchQuery = req.query.query;
    const { id } = req.params;

    // MongoDB aggregation pipeline
    const result = await Farmer.aggregate([
      {
        $search: {
          index: "farmer-name",
          autocomplete: {
            query: searchQuery,
            path: "name",
            fuzzy: {
              maxEdits: 2,
              prefixLength: 1,
            },
          },
        },
      },
      {
        $match: {
          registeredStoreAdmins: new mongoose.Types.ObjectId(`${id}`),
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          mobileNumber: 1,
        },
      },
    ]);

    reply.code(200).send(result);
  } catch (err) {
    // Improved error handling
    reply.code(500).send({
      status: "Fail",
      message: "Error occurred while searching farmers",
      errorMessage: err.message || "An unexpected error occurred.",
    });
  }
};

// @desc Create new Incoming Order
//@route POST/api/store-admin/orders
//@access Private

const createNewIncomingOrder = async (req, reply) => {
  try {
    orderSchema.parse(req.body);

    const { coldStorageId, farmerId, dateOfSubmission, orderDetails } =
      req.body;

    // Format variety and bagSizes for each orderDetail item
    const formattedOrderDetails = orderDetails.map((order) => {
      // Format variety
      const formattedVariety = order.variety
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/^./, (char) => char.toUpperCase());

      // Format size in each bagSize
      const formattedBagSizes = order.bagSizes.map((bag) => {
        const formattedSize = bag.size
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/^./, (char) => char.toUpperCase()); // Capitalize first letter

        return { ...bag, size: formattedSize };
      });

      // Return modified order object with formatted variety and bagSizes
      return {
        ...order,
        variety: formattedVariety,
        bagSizes: formattedBagSizes,
      };
    });

    const receiptNumber = await getReceiptNumberHelper(req.storeAdmin._id);

    if (!receiptNumber) {
      return reply.code(500).send({
        status: "Fail",
        message: "Failed to get RECEIPT number",
      });
    }

    const newOrder = new Order({
      coldStorageId,
      farmerId,
      voucher: {
        type: "RECEIPT",
        voucherNumber: receiptNumber,
      },
      fulfilled: false,
      dateOfSubmission,
      orderDetails: formattedOrderDetails, // Use the formatted orderDetails
    });

    // Save the new order
    await newOrder.save();

    reply.code(201).send({
      status: "Success",
      message: "Incoming order created successfully",
      data: newOrder,
    });
  } catch (err) {
    // Handling errors
    console.error("Error creating new order:", err);
    reply.code(500).send({
      status: "Fail",
      message: "Some error occurred while creating a new order",
      errorMessage: err.message,
    });
  }
};

const getFarmerIncomingOrders = async (req, reply) => {
  try {
    const storeAdminId = req.storeAdmin._id;
    const { id } = req.params;

    // Log the start of the request
    console.log(
      `Fetching orders for Farmer ID: ${id} by Store Admin ID: ${storeAdminId}`
    );

    // Perform the Mongoose query to find orders
    const orders = await Order.find({
      coldStorageId: storeAdminId,
      farmerId: id,
    });

    // Log the query result
    console.log(`Query executed. Orders found: ${orders.length}`);

    if (!orders || orders.length === 0) {
      // Log when no orders are found
      console.log("No orders found for the given farmer.");

      return reply.code(200).send({
        status: "Fail",
        message: "Farmer doesn't have any orders",
      });
    }

    // Log the successful response
    console.log("Orders retrieved successfully.");

    // Sending a success response with the orders
    reply.code(200).send({
      status: "Success",
      data: orders,
    });
  } catch (err) {
    // Log the error
    console.error("Error getting farmer orders:", err);

    // Sending error response
    reply.code(500).send({
      status: "Fail",
      message: "Some error occurred while getting farmer orders",
      errorMessage: err.message,
    });
  }
};

const getAllFarmerOrders = async (req, reply) => {
  try {
    const storeAdminId = req.storeAdmin._id;
    const { id } = req.params;

    // Log the start of the request
    console.log(
      `Fetching all orders for Farmer ID: ${id} by Store Admin ID: ${storeAdminId}`
    );

    // Fetch both incoming orders and outgoing orders concurrently
    const [incomingOrders, outgoingOrders] = await Promise.all([
      Order.find({ coldStorageId: storeAdminId, farmerId: id }), // Incoming orders
      OutgoingOrder.find({ coldStorageId: storeAdminId, farmerId: id }), // Outgoing orders
    ]);

    // Log the result of both queries
    console.log(
      `Incoming Orders: ${incomingOrders.length}, Outgoing Orders: ${outgoingOrders.length}`
    );

    // Combine the results from both models
    const allOrders = [...incomingOrders, ...outgoingOrders];

    if (!allOrders || allOrders.length === 0) {
      // Log when no orders are found
      console.log("No orders found for the given farmer.");

      return reply.code(200).send({
        status: "Fail",
        message: "Farmer doesn't have any orders",
      });
    }

    // Log the successful response
    console.log("All orders retrieved successfully.");

    // Sending a success response with the combined orders
    reply.code(200).send({
      status: "Success",
      data: allOrders,
    });
  } catch (err) {
    // Log the error
    console.error("Error getting farmer orders:", err);

    // Sending error response
    reply.code(500).send({
      status: "Fail",
      message: "Some error occurred while getting farmer orders",
      errorMessage: err.message,
    });
  }
};

const filterOrdersByVariety = async (req, reply) => {
  try {
    const { varietyName, farmerId, coldStorageId } = req.body;

    const filteredOrders = await Order.aggregate([
      {
        $match: {
          farmerId: new mongoose.Types.ObjectId(farmerId),
          coldStorageId: new mongoose.Types.ObjectId(coldStorageId),
          orderDetails: {
            $elemMatch: {
              variety: varietyName,
            },
          },
        },
      },
    ]);

    if (!filteredOrders || filteredOrders.length === 0) {
      return reply.code(404).send({
        status: "Fail",
        message: "No orders found with the specified variety",
      });
    }

    reply.code(200).send({
      status: "Success",
      message: "Orders filtered successfully",
      data: filteredOrders,
    });
  } catch (err) {
    console.error("Error occurred while filtering orders:", err);
    reply.code(500).send({
      status: "Fail",
      message: "Some error occurred while filtering orders",
      errorMessage: err.message,
    });
  }
};

const getVarietyAvailableForFarmer = async (req, reply) => {
  try {
    const coldStorageId = req.storeAdmin._id;
    const farmerId = req.params.id;

    if (!farmerId || !coldStorageId) {
      return reply.code(400).send({
        status: "Fail",
        message: "farmerId and coldStorageId are required",
      });
    }

    const varieties = await Order.aggregate([
      {
        $match: {
          farmerId: new mongoose.Types.ObjectId("66eab27610eb613c2efca3bc"),
          coldStorageId: new mongoose.Types.ObjectId(
            "66e1f22d782bbd67d3446805"
          ),
        },
      },
      {
        $unwind: "$orderDetails",
      },
      {
        $group: {
          _id: "$orderDetails.variety",
        },
      },
      {
        $project: {
          _id: 0,
          variety: "$_id",
        },
      },
    ]);

    reply.code(200).send({
      status: "Success",
      varieties: varieties.map((v) => v.variety),
    });
  } catch (err) {
    req.log.error("Some error occurred while getting varieties", err);
    reply.code(500).send({
      status: "Fail",
      message: "Some error occurred while getting available varieties",
      errorMessage: err.message,
    });
  }
};

const createOutgoingOrder = async (req, reply) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    req.log.info("Starting createOutgoingOrder process", {
      storeAdminId: req.storeAdmin._id,
      farmerId: req.params.id,
    });

    const orders = req.body;
    const { id } = req.params;

    req.log.info("Orders received", { ordersCount: orders.length });

    // Fetch incomingOrders
    const incomingOrders = await Promise.all(
      orders.map(async (order) => {
        const { orderId, variety, bagUpdates } = order;

        // Fetch the order details from the database
        const fetchedOrder = await Order.findById(orderId).lean();

        if (!fetchedOrder) {
          throw new Error(`Order with ID ${orderId} not found`);
        }

        // Find the specific detail matching the variety
        const matchingDetail = fetchedOrder.orderDetails.find(
          (detail) => detail.variety === variety
        );

        if (!matchingDetail) {
          throw new Error(
            `Variety ${variety} not found in Order ID ${orderId}`
          );
        }

        // Filter bagSizes based on provided sizes in req.body
        const filteredBagSizes = matchingDetail.bagSizes.filter((bag) =>
          bagUpdates.some((update) => update.size === bag.size)
        );

        return {
          _id: fetchedOrder._id,
          location: matchingDetail.location, // Extract location from the matched variety
          voucher: fetchedOrder.voucher,
          orderDetails: [
            {
              ...matchingDetail,
              incomingBagSizes: filteredBagSizes.map((bag) => ({
                size: bag.size,
                currentQuantity: bag.quantity.currentQuantity,
                initialQuantity: bag.quantity.initialQuantity,
              })),
            },
          ],
        };
      })
    );

    // Create a map for quick lookup
    const incomingOrderMap = incomingOrders.reduce((acc, order) => {
      acc[order._id] = order;
      return acc;
    }, {});

    // Initialize bulk operations array
    const bulkOps = [];
    let variety = ""; // Common variety for outgoing order

    // Prepare outgoing order details in the new format
    const outgoingOrderDetails = orders.map(
      ({ orderId, variety: currentVariety, bagUpdates }) => {
        variety = currentVariety;

        req.log.info("Processing order", { variety });

        // Process bag updates for bulk operations and outgoing order details
        const bagDetails = bagUpdates.map((update) => {
          const { size, quantityToRemove } = update;
          req.log.info("Bag update", { size, quantityToRemove });

          // Prepare bulk operation for updating quantities in the source order
          bulkOps.push({
            updateOne: {
              filter: {
                "orderDetails.variety": variety,
                "orderDetails.bagSizes.size": size,
              },
              update: {
                $inc: {
                  "orderDetails.$[i].bagSizes.$[j].quantity.currentQuantity":
                    -quantityToRemove,
                },
              },
              arrayFilters: [{ "i.variety": variety }, { "j.size": size }],
            },
          });

          return {
            size,
            quantityRemoved: quantityToRemove,
          };
        });

        // Add incomingOrder details from the map
        const incomingOrder = incomingOrderMap[orderId];

        // Fix: Ensure `currentQuantity` and `initialQuantity` are being mapped correctly
        const incomingBagSizes = incomingOrder.orderDetails.flatMap((detail) =>
          detail.incomingBagSizes.map((bag) => ({
            size: bag.size,
            currentQuantity: bag.currentQuantity, // Ensure this is mapped correctly
            initialQuantity: bag.initialQuantity, // Ensure this is mapped correctly
          }))
        );

        return {
          variety,
          bagSizes: bagDetails,
          incomingOrder: {
            _id: incomingOrder._id,
            location: incomingOrder.location,
            voucher: incomingOrder.voucher,
            incomingBagSizes, // Make sure you're using the correct field names
          },
        };
      }
    );

    // Execute bulk write for inventory updates
    const result = await Order.bulkWrite(bulkOps, { session });

    const deliveryVoucherNumber = await getDeliveryVoucherNumberHelper(
      req.storeAdmin._id
    );

    // Create the outgoing order document with the new format
    const outgoingOrder = new OutgoingOrder({
      coldStorageId: req.storeAdmin._id,
      farmerId: id,
      voucher: {
        type: "DELIVERY",
        voucherNumber: deliveryVoucherNumber,
      },
      dateOfExtraction: formatDate(new Date()),
      orderDetails: outgoingOrderDetails,
    });

    await outgoingOrder.save();
    req.log.info("Outgoing order saved", {
      outgoingOrderId: outgoingOrder._id,
    });

    await session.commitTransaction();
    session.endSession();

    req.log.info("Transaction committed successfully");

    return reply.code(200).send({
      message: "Outgoing order processed successfully.",
      outgoingOrder,
    });
  } catch (err) {
    req.log.error("Error processing outgoing order", {
      errorMessage: err.message,
    });

    await session.abortTransaction();
    session.endSession();

    return reply.code(500).send({
      status: "Fail",
      message:
        "Error occurred while updating bag quantities and creating outgoing order",
      errorMessage: err.message,
    });
  }
};

export {
  searchFarmers,
  createNewIncomingOrder,
  filterOrdersByVariety,
  getFarmerIncomingOrders,
  getAllFarmerOrders,
  createOutgoingOrder,
  getReceiptNumber,
  getVarietyAvailableForFarmer,
};
