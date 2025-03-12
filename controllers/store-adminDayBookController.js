import Order from "../models/orderModel.js";
import OutgoingOrder from "../models/outgoingOrderModel.js";
import Farmer from "../models/farmerModel.js";
import { varieties } from "../utils/helpers.js";
const dayBookOrders = async (req, reply) => {
  try {
    const coldStorageId = req.storeAdmin._id;
    const { type } = req.query;
    const { sortBy } = req.query;
    const { page } = req.query || 1;
    const { limit } = req.query || 1;
    const sortOrder = sortBy === "latest" ? -1 : 1;

    const skip = (page - 1) * limit;

    // Helper function to sort bag sizes
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

    console.log("sort order is: ", sortOrder);

    switch (type) {
      case "all": {
        const [incomingOrders, outgoingOrders] = await Promise.all([
          Order.find({ coldStorageId })
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: sortOrder })
            .populate({
              path: "farmerId",
              model: Farmer,
              select: "_id name", // Select only the _id and name
            })
            .select(
              "_id coldStorageId currentStockAtThatTime remarks farmerId voucher dateOfSubmission orderDetails"
            ),
          OutgoingOrder.find({ coldStorageId })
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: sortOrder })
            .populate({
              path: "farmerId",
              model: Farmer,
              select: "_id name", // Select only the _id and name
            })
            .select(
              "_id coldStorageId remarks  farmerId voucher dateOfExtraction orderDetails"
            ),
        ]);

        // Sort bag sizes in both incoming and outgoing orders
        const sortedIncoming = sortOrderDetails(incomingOrders);
        const sortedOutgoing = sortOrderDetails(outgoingOrders);
        const allOrders = [...sortedIncoming, ...sortedOutgoing];

        if (!allOrders || allOrders.length === 0) {
          console.log("No orders found for the given cold storage.");
          return reply.code(200).send({
            status: "Fail",
            message: "Cold storage doesn't have any orders",
          });
        }

        // Log success and send response
        console.log("All orders retrieved successfully.");
        reply.code(200).send({
          status: "Success",
          data: allOrders,
        });
        break;
      }
      case "incoming": {
        const incomingOrders = await Order.find({ coldStorageId })
          .skip(skip)
          .limit(limit)
          .sort({ createdAt: sortOrder })
          .populate({
            path: "farmerId",
            model: Farmer,
            select: "_id name", // Select only the _id and name
          })
          .select(
            "_id coldStorageId remarks  currentStockAtThatTime farmerId voucher dateOfSubmission orderDetails"
          );

        const sortedOrders = sortOrderDetails(incomingOrders);

        if (!sortedOrders || sortedOrders.length === 0) {
          return reply.code(200).send({
            status: "Fail",
            message: "No incoming orders found.",
          });
        }
        reply.code(200).send({
          status: "Success",
          data: sortedOrders,
        });
        break;
      }
      case "outgoing": {
        const outgoingOrders = await OutgoingOrder.find({ coldStorageId })
          .skip(skip)
          .limit(limit)
          .sort({ createdAt: sortOrder })
          .populate({
            path: "farmerId",
            model: Farmer,
            select: "_id name", // Select only the _id and name
          })
          .select(
            "_id coldStorageId remarks   farmerId voucher dateOfExtraction orderDetails"
          );

        const sortedOrders = sortOrderDetails(outgoingOrders);

        if (!sortedOrders || sortedOrders.length === 0) {
          return reply.code(200).send({
            status: "Fail",
            message: "No outgoing orders found.",
          });
        }
        reply.code(200).send({
          status: "Success",
          data: sortedOrders,
        });
        break;
      }
      default: {
        reply.code(400).send({
          message: "Invalid type parameter",
        });
        break;
      }
    }
  } catch (err) {
    console.error("Error getting daybook orders:", err);

    reply.code(500).send({
      status: "Fail",
      message: "Some error occurred while getting daybook orders",
      errorMessage: err.message,
    });
  }
};

const dayBookOrderController = async (req, reply) => {};

const testController = async (req, reply) => {
  try {
    reply.code(200).send({
      message: "test controller",
    });
  } catch (err) {
    console.error(err.message);
  }
};

const getVarieties = async (req, reply) => {
  try {
    reply.code(200).send({
      status: "Success",
      varieties,
    });
  } catch (err) {
    console.error("Error getting varieties:", err);

    reply.code(500).send({
      status: "Fail",
      message: "Some error occurred while getting varieties",
      errorMessage: err.message,
    });
  }
};

export { dayBookOrders, dayBookOrderController, testController, getVarieties };
