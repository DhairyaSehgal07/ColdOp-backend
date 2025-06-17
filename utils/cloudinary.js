import cloudinary from "cloudinary";
import dotenv from "dotenv";
import fs from 'fs';
import { promisify } from 'util';

const unlinkAsync = promisify(fs.unlink);
dotenv.config();

// Configure Cloudinary
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadProfilePhoto = async (req, reply) => {
  try {
    if (!req.file) {
      return reply.code(400).send({
        status: "Error",
        message: "No file uploaded"
      });
    }

    // Validate file type
    if (!req.file.mimetype.startsWith('image/')) {
      // Clean up the uploaded file
      await unlinkAsync(req.file.path);
      return reply.code(400).send({
        status: "Error",
        message: "Please upload only image files"
      });
    }

    // Upload to cloudinary
    const result = await cloudinary.v2.uploader.upload(req.file.path, {
      folder: "profile_pictures",
      resource_type: "auto",
      transformation: [
        { width: 500, height: 500, crop: "limit" }, // Resize image to max dimensions
        { quality: "auto" }, // Automatic quality optimization
        { fetch_format: "auto" } // Automatic format optimization
      ]
    });

    // Clean up the uploaded file
    await unlinkAsync(req.file.path);

    // Send back the response with image details
    return reply.code(200).send({
      status: "Success",
      message: "Image uploaded successfully",
      data: {
        url: result.secure_url,
        public_id: result.public_id.replace('profile_pictures/', ''), // Remove the folder prefix
        width: result.width,
        height: result.height,
        format: result.format,
        size: result.bytes
      }
    });

  } catch (error) {
    // Clean up the uploaded file in case of error
    if (req.file) {
      await unlinkAsync(req.file.path).catch(console.error);
    }

    console.error('Upload error:', error);
    return reply.code(500).send({
      status: "Error",
      message: "An error occurred while uploading the image",
      error: error.message
    });
  }
};

const deleteProfilePhoto = async (req, reply) => {
  try {
    // Assuming the public ID of the image you want to delete is sent in the request body
    const { publicId } = req.body;

    if (!publicId) {
      return reply.code(400).send({
        status: "Error",
        message: "Public ID is required"
      });
    }

    // Add prefix "profile_pictures/" to the public ID
    const prefixedPublicId = `profile_pictures/${publicId}`;

    // Delete the image from Cloudinary using promises
    const result = await cloudinary.v2.api.delete_resources(
      [prefixedPublicId],
      { type: "upload", resource_type: "image" }
    );

    // Send the response back after successful deletion
    reply.code(200).send({
      status: "Success",
      message: "Image deleted successfully",
      result: result
    });
  } catch (error) {
    console.error('Delete error:', error);
    reply.code(500).send({
      status: "Error",
      message: "An error occurred while deleting the image",
      error: error.message
    });
  }
};

export { uploadProfilePhoto, deleteProfilePhoto };
