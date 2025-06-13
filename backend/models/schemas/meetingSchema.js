const mongoose = require('mongoose');
const userSchema = require('./userSchema');

// Define transcript message schema
const transcriptMessageSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true
    },
    userName: {
        type: String,
        required: true
    },
    text: {
        type: String,
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

// Define participant action schema for tracking join/leave events
const participantActionSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true
    },
    displayName: { // Renamed from userName
        type: String,
        required: true
    },
    email: { // Added email field
        type: String,
        required: true
    },
    action: {
        type: String,
        enum: ['join', 'leave'],
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

const meeting = new mongoose.Schema({
    host:{
        type: userSchema,
        required: true
    },
    meetingId: {
        type: String,
        required: true
    },
    participants: [{
        type: userSchema
    }],
    transcript: [transcriptMessageSchema],
    participantActions: [participantActionSchema],
    summary: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['active', 'completed'],
        default: 'active'
    },
    duration: {
        type: Number,
        default: 0
    }
},
{
    timestamps: true
})

module.exports = meeting;