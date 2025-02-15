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
