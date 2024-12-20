import Order from "../models/orderModel.js";
import OutgoingOrder from "../models/outgoingOrderModel.js";
import Farmer from "../models/farmerModel.js";
import mongoose from "mongoose";

const dayBookOrders = async (req, reply) => {
  try {
    const { type } = req.query;
    const { sortBy } = req.query;
    const { page } = req.query || 1;
    const { limit } = req.query || 1;
    const sortOrder = sortBy === "latest" ? 1 : -1;

    const skip = (page - 1) * limit;

    switch (type) {
      case "all": {
        const [incomingOrders, outgoingOrders] = await Promise.all([
          Order.find({})
            .skip(skip)
            .limit(limit)
            .sort({ sortOrder })
            .populate({
              path: "farmerId",
              model: Farmer,
              select: "_id name", // Select only the _id and name
            })
            .select(
              "_id coldStorageId farmerId voucher dateOfSubmission orderDetails"
            ),
          OutgoingOrder.find({})
            .skip(skip)
            .limit(limit)
            .sort({ sortOrder })
            .populate({
              path: "farmerId",
              model: Farmer,
              select: "_id name", // Select only the _id and name
            })
            .select(
              "_id coldStorageId  farmerId voucher dateOfExtraction orderDetails"
            ),
        ]);

        const allOrders = [...incomingOrders, ...outgoingOrders];

        if (!allOrders || allOrders.length === 0) {
          console.log("No orders found for the given farmer.");
          return reply.code(200).send({
            status: "Fail",
            message: "Farmer doesn't have any orders",
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
        const incomingOrders = await Order.find({})
          .skip(skip)
          .limit(limit)
          .sort({ sortOrder })
          .populate({
            path: "farmerId",
            model: Farmer,
            select: "_id name", // Select only the _id and name
          })
          .select(
            "_id coldStorageId farmerId voucher dateOfSubmission orderDetails"
          );
        if (!incomingOrders || incomingOrders.length === 0) {
          return reply.code(200).send({
            status: "Fail",
            message: "No incoming orders found.",
          });
        }
        reply.code(200).send({
          status: "Success",
          data: incomingOrders,
        });
        break;
      }
      case "outgoing": {
        const outgoingOrders = await OutgoingOrder.find({})
          .skip(skip)
          .limit(limit)
          .sort({ sortOrder })
          .populate({
            path: "farmerId",
            model: Farmer,
            select: "_id name", // Select only the _id and name
          })
          .select(
            "_id coldStorageId  farmerId voucher dateOfExtraction orderDetails"
          );
        if (!outgoingOrders || outgoingOrders.length === 0) {
          return reply.code(200).send({
            status: "Fail",
            message: "No outgoing orders found.",
          });
        }
        reply.code(200).send({
          status: "Success",
          data: outgoingOrders,
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

export { dayBookOrders, dayBookOrderController, testController };
