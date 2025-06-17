import { pipeline } from 'stream';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const pump = promisify(pipeline);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const uploadMiddleware = async (req, reply) => {
  try {
    const data = await req.file();

    if (!data.mimetype.startsWith('image/')) {
      throw new Error('Not an image! Please upload only images.');
    }

    const filename = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(data.filename)}`;
    const uploadPath = path.join(__dirname, '..', 'uploads', filename);

    await pump(data.file, fs.createWriteStream(uploadPath));

    // Add the file info to the request object
    req.file = {
      path: uploadPath,
      filename: filename,
      mimetype: data.mimetype
    };

    return;
  } catch (error) {
    reply.code(400).send({
      status: "Error",
      message: error.message || "Error processing file upload"
    });
  }
};

export { uploadMiddleware };