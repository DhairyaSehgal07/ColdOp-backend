import cloudinary from "cloudinary";
import dotenv from "dotenv";
dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const deleteProfilePhoto = async (req, reply) => {
  try {
    // Assuming the public ID of the image you want to delete is sent in the request body
    const { publicId } = req.body;

    // Add prefix "profile_pictures/" to the public ID
    const prefixedPublicId = `profile_pictures/${publicId}`;

    // Delete the image from Cloudinary using promises
    const result = await cloudinary.v2.api.delete_resources(
      [prefixedPublicId], // Use the prefixed public ID
      { type: "upload", resource_type: "image" }
    );

    // Send the response back after successful deletion
    reply.code(200).send({
      status: "Success",
      message: "Image deleted successfully",
    });
  } catch (error) {
    reply
      .code(500)
      .send({ error: "An error occurred while processing the request." });
  }
};

export { deleteProfilePhoto };
