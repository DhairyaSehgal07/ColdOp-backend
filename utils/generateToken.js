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

  reply.setCookie("jwt", token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in milliseconds
  });

  return {};
};

export default generateToken;
