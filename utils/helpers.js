import Order from "../models/orderModel.js";
import OutgoingOrder from "../models/outgoingOrderModel.js";
// export const formatDate = (date) => {
//   const day = date.getDate();
//   const monthIndex = date.getMonth();
//   const year = date.getFullYear();

//   // Array of month names
//   const monthNames = [
//     "January",
//     "February",
//     "March",
//     "April",
//     "May",
//     "June",
//     "July",
//     "August",
//     "September",
//     "October",
//     "November",
//     "December",
//   ];

//   // Add the ordinal suffix to the day
//   const dayWithOrdinal = addOrdinalSuffix(day);

//   return `${dayWithOrdinal} ${monthNames[monthIndex]} ${year}`;
// };

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

export const getReceiptNumberHelper = async (storeAdminId) => {
  try {
    const result = await Order.aggregate([
      {
        $match: {
          coldStorageId: storeAdminId, // Match orders belonging to the specific store admin
          "voucher.type": "RECEIPT", // Match orders where voucher type is "RECEIPT"
        },
      },
      {
        $group: {
          _id: null, // We don't care about grouping by any field, just counting
          count: { $sum: 1 }, // Sum the number of documents that match
        },
      },
    ]);

    // If no matching documents are found, result will be an empty array, so handle that case
    const ReceiptVoucherNumber = result.length > 0 ? result[0].count : 0;
    return ReceiptVoucherNumber + 1;
  } catch (err) {
    throw new Error("Some error occurred while getting receipt Number");
  }
};

export const getDeliveryVoucherNumberHelper = async (storeAdminId) => {
  try {
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

    return deliveryVoucherNumber + 1;
  } catch (err) {
    throw new Error("Some error occurred while getting deliver voucher Number");
  }
};

export const formatVarietyName = (name) => {
  return name
    .split(" ") // Split the string by spaces
    .map(
      (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() // Capitalize each word
    )
    .join("-"); // Join the words with hyphens
};

export const formatDate = (date) => {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0"); // Months are 0-indexed
  const year = String(date.getFullYear()).slice(-2); // Take last two digits of year
  return `${day}.${month}.${year}`;
};
