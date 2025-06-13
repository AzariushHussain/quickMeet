const mongoose = require('mongoose');

async function connect() {
    return mongoose.connect(process.env.MONGODB_URI)
}

module.exports = { connect }