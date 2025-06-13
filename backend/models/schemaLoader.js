const mongoose = require('mongoose');
const userSchema = require('./schemas/userSchema');
const meetingSchema = require('./schemas/meetingSchema');

const UserModel = mongoose.model('User', userSchema);
const MeetingModel = mongoose.model('Meeting', meetingSchema);

module.exports = {
    UserModel,
    MeetingModel
};