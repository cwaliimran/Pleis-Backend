const UserEntity = require('../domain/user.entity');
const AuthRepository = require('../infrastructure/auth.repository');
const bcrypt = require('bcryptjs');
// const jwt = require('../infrastructure/jwt'); // If you have a JWT service

class AuthService {
  async register(userData) {
    // Check if user exists
    const existingUser = await AuthRepository.findByEmailAndRole(
      userData.email,
    );
    if (existingUser) throw new Error('User already exists');

    // Hash password
    userData.password = await bcrypt.hash(userData.password, 10);

    // Save user
    const newUser = await AuthRepository.saveUser(userData);

    let newUserEntity = new UserEntity(newUser);

    return newUserEntity.toPublicJSON();
  }

  async login(email, password, userType) {
    const user = await AuthRepository.findByEmailAndRole(email, userType);
    if (!user) throw new Error('Invalid credentials');

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) throw new Error('Invalid credentials');

    // Generate JWT
    const token = "1";
    return { user, token };
  }

  async getProfile(userId) {
    const user = await AuthRepository.getById(userId);
    if (!user) throw new Error('User not found');
    return user;
  }
}

module.exports = new AuthService();
