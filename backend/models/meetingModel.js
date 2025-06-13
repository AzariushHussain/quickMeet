const { MeetingModel } = require('../models/schemaLoader');

const createMeeting = async (meetingData) => {
    const meeting = new MeetingModel(meetingData);
    return await meeting.save();
};

const findMeetingById = async (id) => {
    return await MeetingModel.findOne({ meetingId: id });
};

const findAllMeetings = async (userId) => {
    console.log('Finding all meetings for user ID:', userId);
    try {
        // Create a query that finds meetings where the user is either:
        // 1. The host of the meeting
        // 2. One of the participants (using elemMatch to match nested document)
        // Note: We check both uid and email to be thorough
        const query = { 
            $or: [
                { 'host.uid': userId },
                { 'host.email': userId }, // Add email as fallback
                { 'participants': { $elemMatch: { uid: userId } } },
                { 'participants': { $elemMatch: { email: userId } } } // Add email matching too
            ]
        };
        console.log('Query:', JSON.stringify(query));
        
        const meetings = await MeetingModel.find(query).sort({ createdAt: -1 });
        console.log(`Found ${meetings.length} meetings`);
        return meetings;
    } catch (error) {
        console.error('Error in findAllMeetings:', error);
        throw error;
    }
};

const addTranscriptMessage = async (meetingId, messageData) => {
    const meeting = await findMeetingById(meetingId);
    if (!meeting) return null;
    
    meeting.transcript.push(messageData);
    return await meeting.save();
};

const addParticipantAction = async (meetingId, actionData) => {
    const meeting = await findMeetingById(meetingId);
    if (!meeting) return null;
    
    meeting.participantActions.push(actionData);
    return await meeting.save();
};

const updateMeetingSummary = async (meetingId, summary) => {
    return await MeetingModel.findOneAndUpdate(
        { meetingId },
        { summary },
        { new: true }
    );
};

const completeMeeting = async (meetingId, duration) => {
    return await MeetingModel.findOneAndUpdate(
        { meetingId },
        { 
            status: 'completed',
            duration
        },
        { new: true }
    );
};

module.exports = {
    createMeeting,
    findMeetingById,
    findAllMeetings,
    addTranscriptMessage,
    addParticipantAction,
    updateMeetingSummary,
    completeMeeting
};