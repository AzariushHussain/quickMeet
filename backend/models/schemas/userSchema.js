const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    uid: {
        type: String,
        required: true,
    },
    displayName: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
    },
    photoURL: {
        type: String,
        required: false,
    }
}, {
    timestamps: true,
});

module.exports = userSchema;