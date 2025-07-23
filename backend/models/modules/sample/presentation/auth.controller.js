const AuthService = require('../application/auth.service');

const AuthController = {
  async register(req, res) {
    try {
      const user = await AuthService.register(req.body);
      res.status(201).json(user);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async login(req, res) {
    try {
      const { email, password, userType } = req.body;
      const data = await AuthService.login(email, password, userType);
      res.json(data);
    } catch (err) {
      res.status(401).json({ error: err.message });
    }
  },

  async getProfile(req, res) {
    try {
      const user = await AuthService.getProfile(req.user.id);
      res.json(user);
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  },
};

module.exports = AuthController;
