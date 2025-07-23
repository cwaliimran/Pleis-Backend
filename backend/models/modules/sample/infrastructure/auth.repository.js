// Auth DB operations
// infrastructure/auth.repository.js
const  User  = require("./models/user.model");

class AuthRepository {
  async findByEmailAndRole(email, userType) {
    return User.findOne({ email, "accountState.userType": userType });
  }

  async saveUser(userData) {
    const user = new User(userData);
    return user.save();
  }

  async getById(userId) {
    return User.findById(userId);
  }
}

module.exports = new AuthRepository();
