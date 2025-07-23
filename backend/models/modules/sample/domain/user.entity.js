class UserEntity {
  constructor(user) {
    this.id = user._id;
    this.name = user.name;
    this.email = user.email;
    this.userType = user.accountState?.userType;
    this.status = user.accountState?.status;
    this.createdAt = user.createdAt || new Date();
  }

  isActive() {
    return this.status === "active";
  }

  toPublicJSON() {
    return {
      id: this.id,
      name: this.name,
      email: this.email,
      role: this.userType,
      createdAt: this.createdAt,
    };
  }
}

module.exports = UserEntity;
