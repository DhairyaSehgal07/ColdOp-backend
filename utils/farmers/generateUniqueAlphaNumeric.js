const generateUniqueAlphaNumeric = () => {
  const alphabets = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  // Generate random alphabets for the first two characters
  const firstChar = alphabets.charAt(
    Math.floor(Math.random() * alphabets.length)
  );
  const secondChar = alphabets.charAt(
    Math.floor(Math.random() * alphabets.length)
  );

  // Generate random numbers for the remaining four digits
  const randomNumber = Math.floor(Math.random() * 10000); // Random number between 0 and 9999
  const paddedNumber = randomNumber.toString().padStart(4, "0"); // Pad with leading zeros if necessary

  // Concatenate the characters and numbers to form the unique string
  const uniqueString = `${firstChar}${secondChar}${paddedNumber}`;

  return uniqueString;
};

export default generateUniqueAlphaNumeric;
