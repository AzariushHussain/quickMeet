const express = require('express');
const { v4: uuidv4} = require('uuid');
const { responseMessages, constants } = require('../utils/constants');
const { successResponse, errorResponse } = require('../utils/response');
const formatMessage = require('../utils/messageFormatter');
const { 
    createMeeting, 
    findMeetingById, 
    findAllMeetings, 
    addTranscriptMessage, 
    addParticipantAction,
    updateMeetingSummary,
    completeMeeting
} = require('../models/meetingModel');
const { add } = require('../models/schemas/userSchema');

const getMeetingLink = async (req, res) => {
    try{
        const meetingId = uuidv4();
        const message = formatMessage(responseMessages.success.Created, {'operation': 'Meeting Link'});
        const meeting = {
            meetingId: meetingId,
            host: req.user,
            participants: []
        }
        await createMeeting(meeting);
        return successResponse(res  , message, meeting);
    }catch(err){
        console.log('Error in getMeetingLink:', err);
        const message = formatMessage(responseMessages.error.internalServerError);
        return errorResponse(res, message);
    }
}

const addParticipant = async (req, res) => {
    try{
        const meetingId = req.params.id;
        const meeting = await findMeetingById(meetingId);
        
        if(!meeting){
            const message = formatMessage(responseMessages.error.NotFound, {'operation': 'Meeting'});
            return errorResponse(res, message);
        }
        
        console.log('Adding participant to meeting:', {
            meetingId,
            user: req.user
        });

        // Ensure the user object has all required fields from userSchema
        // Create a validated user object with default values for missing required fields
        const validatedUser = {
            uid: req.user.uid || `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, // Generate a temp uid if missing
            displayName: req.user.displayName || req.user.email || 'Anonymous User',
            email: req.user.email || 'anonymous@example.com',
            photoURL: req.user.photoURL || null,
            // Add any additional fields from req.body if provided
            ...req.body
        };
        
        console.log('Validated user object:', validatedUser);
          
        // More thorough check if participant already exists using uid, email, and all fields
        const participantExists = meeting.participants.some(
            p => {
                // Check by email (primary identifier)
                const sameEmail = p.email === validatedUser.email;
                
                // Check by UID if available (more reliable but might not always be present)
                const sameUid = validatedUser.uid && p.uid === validatedUser.uid;
                
                // Check by producer ID if available (for WebRTC connections)
                const sameProducerId = validatedUser.producerId && p.producerId === validatedUser.producerId;
                
                return sameEmail || sameUid || sameProducerId;
            }
        );          // Only add if they're not already in the list
        if (!participantExists) {
            console.log(`Adding new participant ${validatedUser.email} to meeting ${meetingId}`);
            
            // Add to participants list with validated user object
            meeting.participants.push(validatedUser);
            
            // Also record this join action in the participant timeline
            const participantAction = {
                userId: validatedUser.uid || validatedUser.email, // Use UID if available, otherwise email
                displayName: validatedUser.displayName || validatedUser.email, // Use displayName or fallback to email
                email: validatedUser.email, // Always include email
                action: 'join',
                timestamp: new Date()
            };
            
            // Initialize participantActions array if it doesn't exist
            if (!meeting.participantActions) {
                meeting.participantActions = [];
            }
            
            // Add the action to the array
            meeting.participantActions.push(participantAction);
        } else {
            console.log(`Participant ${validatedUser.email} already exists in meeting ${meetingId} - not adding duplicate`);
        }
        
        // Save the meeting with updates
        await meeting.save();
        
        const message = formatMessage(responseMessages.success.Updated, {'operation': 'Meeting'});
        return successResponse(res, message, meeting);
    } catch(err) {
        console.error('Error in addParticipant:', err);
        console.error('User details:', req.user);
        console.error('Request body:', req.body);
        console.error('Meeting ID:', req.params.id);        console.error('Error message:', err.message);
        console.error('Stack trace:', err.stack);
        // Ensure we always pass a valid message template
        const errorMessage = responseMessages.error.internalServerError || "An internal server error occurred";
        const message = formatMessage(errorMessage);
        return errorResponse(res, message);
    }
}


const getMeeting = async (req, res) => {
    try{
        const meetingId = req.params.id;
        console.log('Fetching meeting with ID:', meetingId);
        console.log('User requesting meeting:', req.user);
        
        const meeting = await findMeetingById(meetingId);
        if(!meeting){
            console.log(`Meeting with ID ${meetingId} not found`);
            const message = formatMessage(responseMessages.error.NotFound, {'operation': 'Meeting'});
            return errorResponse(res, message, 404);
        }
        
        console.log('Meeting found:', {
            id: meeting.meetingId,
            host: meeting.host.email,
            participants: meeting.participants.length,
            transcriptCount: meeting.transcript ? meeting.transcript.length : 0,
            actionsCount: meeting.participantActions ? meeting.participantActions.length : 0,
            status: meeting.status
        });
        
        // Check if the transcript array is properly populated
        if (!meeting.transcript) {
            meeting.transcript = [];
            console.log('Warning: transcript array was undefined, initialized to empty array');
        }
        
        // Check if participant actions array is properly populated
        if (!meeting.participantActions) {
            meeting.participantActions = [];
            console.log('Warning: participantActions array was undefined, initialized to empty array');
        }
        
        const message = formatMessage(responseMessages.success.Fetched, {'operation': 'Meeting'});
        return successResponse(res, message, meeting);
    }catch(err){
        console.error('Error in getMeeting:', err);
        const message = formatMessage(responseMessages.error.internalServerError);
        return errorResponse(res, message);
    }
}

// Get all meetings for a user (meeting history)
const getMeetingHistory = async (req, res) => {
    try {
        console.log('Getting meeting history for user:', req.user);
        if (!req.user || !req.user.uid) {
            console.error('User or user ID is missing in the request');
            const message = formatMessage(responseMessages.error.ValidationError, {'operation': 'User not properly authenticated'});
            return errorResponse(res, message, 400);
        }
        
        const userId = req.user.uid;
        console.log('Fetching meetings for user ID:', userId);
        const meetings = await findAllMeetings(userId);
        console.log(`Found ${meetings.length} meetings for user ${userId}`);
        
        const message = formatMessage(responseMessages.success.Fetched, {'operation': 'Meeting History'});
        return successResponse(res, message, meetings);
    } catch (err) {
        console.error('Error in getMeetingHistory:', err);
        const message = formatMessage(responseMessages.error.internalServerError);
        return errorResponse(res, message);
    }
}

// Add a transcript message to the meeting
const saveTranscriptMessage = async (req, res) => {
    try {
        const { meetingId } = req.params;
        const { text } = req.body;
        
        if (!text) {
            const message = formatMessage(responseMessages.error.ValidationError, {'operation': 'Transcript Message'});
            return errorResponse(res, message, 400);
        }
        
        const messageData = {
            userId: req.user.uid,
            userName: req.user.displayName || req.user.email,
            text,
            timestamp: new Date()
        };
        
        const result = await addTranscriptMessage(meetingId, messageData);
        
        if (!result) {
            const message = formatMessage(responseMessages.error.NotFound, {'operation': 'Meeting'});
            return errorResponse(res, message, 404);
        }
        
        const message = formatMessage(responseMessages.success.Created, {'operation': 'Transcript Message'});
        return successResponse(res, message, messageData);
    } catch (err) {
        console.log('Error in saveTranscriptMessage:', err);
        const message = formatMessage(responseMessages.error.internalServerError);
        return errorResponse(res, message);
    }
}

// Save meeting summary
const saveMeetingSummary = async (req, res) => {
    try {
        const { meetingId } = req.params;
        const { summary } = req.body;
        
        if (!summary) {
            const message = formatMessage(responseMessages.error.ValidationError, {'operation': 'Meeting Summary'});
            return errorResponse(res, message, 400);
        }
        
        const result = await updateMeetingSummary(meetingId, summary);
        
        if (!result) {
            const message = formatMessage(responseMessages.error.NotFound, {'operation': 'Meeting'});
            return errorResponse(res, message, 404);
        }
        
        const message = formatMessage(responseMessages.success.Updated, {'operation': 'Meeting Summary'});
        return successResponse(res, message, result);
    } catch (err) {
        console.log('Error in saveMeetingSummary:', err);
        const message = formatMessage(responseMessages.error.internalServerError);
        return errorResponse(res, message);
    }
}

// End meeting and record duration
const endMeeting = async (req, res) => {
    try {
        const { meetingId } = req.params;
        const { duration } = req.body; // Duration in seconds
        
        const result = await completeMeeting(meetingId, duration);
        
        if (!result) {
            const message = formatMessage(responseMessages.error.NotFound, {'operation': 'Meeting'});
            return errorResponse(res, message, 404);
        }
        
        const message = formatMessage(responseMessages.success.Updated, {'operation': 'Meeting Completed'});
        return successResponse(res, message, result);
    } catch (err) {
        console.log('Error in endMeeting:', err);
        const message = formatMessage(responseMessages.error.internalServerError);
        return errorResponse(res, message);
    }
}

module.exports = { 
    getMeetingLink, 
    addParticipant, 
    getMeeting, 
    getMeetingHistory, 
    saveTranscriptMessage, 
    saveMeetingSummary, 
    endMeeting 
};