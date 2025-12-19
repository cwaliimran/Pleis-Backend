const calculateAge = (dob) => {
  if (!dob) return null; // Skip if dob is invalid or missing
  const birthDate = new Date(dob); // Convert dob to Date
  if (isNaN(birthDate)) return null; // Skip if dob is invalid
  const today = new Date(); // Current date
  let age = today.getFullYear() - birthDate.getFullYear(); // Calculate age by subtracting birth year from current year
  
  const monthDifference = today.getMonth() - birthDate.getMonth();
  const dayDifference = today.getDate() - birthDate.getDate();

  // If the current month is earlier than the birth month, or if it's the same month but the day is before the birthday
  if (monthDifference < 0 || (monthDifference === 0 && dayDifference < 0)) {
    age--; // Decrease age if the birthday hasn't occurred yet this year
  }

  return age;
};

module.exports = { calculateAge };