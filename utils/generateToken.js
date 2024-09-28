import jwt from "jsonwebtoken";

const generateToken = (reply, userId, isMobile) => {
  console.log("VALUE OF IS MOBILE IS : ", isMobile);
  // Generate the JWT token
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });

  // If the request is from a mobile client, return the token in the response
  if (isMobile === true) {
    return token;
  }

  // Otherwise, set the token as an HTTP-only cookie for web clients
  reply.setCookie("jwt", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV !== "development",
    sameSite: "none",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in milliseconds
  });

  return {}; // Optional return if you need the token to be available in the response
};

export default generateToken;
