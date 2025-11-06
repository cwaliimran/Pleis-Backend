//UserInterests.js
const mongoose = require('mongoose');

const UserInterestsSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Users',
        required: true,
    },
    categories: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Categories',
        default: [],
    }],
    venueTypes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'VenueTypes',
        default: [],
    }],
    tags: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tags',
        default: [],
    }],

}, {
    timestamps: true,
});

const UserInterests = mongoose.model('UserInterests', UserInterestsSchema);

module.exports = { UserInterests };
