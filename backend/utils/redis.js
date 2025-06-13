const { Server } = require('socket.io');
const redis = require('redis');

const publisher = redis.createClient({
    url: process.env.REDIS_URL, // Use the hosted Redis URL without password
});

const subscriber = redis.createClient({
    url: process.env.REDIS_URL, // Use the hosted Redis URL without password
});

// Declare the Socket.IO instance variables here
let io;
let socket;

// Function to add a participant
async function addParticipant(payload) {
    const key = `meeting:${payload.meetingId}:participants`;
    
    // Retrieve the current list of participants
    let participants = await publisher.hGet(key, 'participant');
    participants = participants ? JSON.parse(participants) : [];
    console.log('type of participants:', typeof participants);
    console.log('participants:', participants);    // Add the new participant to the list
    const participantData = {
        meetingId: payload.meetingId,
        producerId: payload.producerId,
        email: payload.email,
        uid: payload.uid || payload.email, // Ensure UID is included for consistent tracking
        displayName: payload.displayName || payload.email
    };
    if(!participants.some(participant => participant.email === participantData.email)){
        participants.push(participantData);
    }
    // Save the updated list back to Redis
    await publisher.hSet(key, 'participant', JSON.stringify(participants));
}

// Function to get all participants
async function getParticipants(meetingId) {
    const key = `meeting:${meetingId}:participants`;
    const participants = await publisher.hGetAll(key, 'participant');
    console.log('participants in getparticipants:', participants);
    if (Object.keys(participants).length === 0) {
        return [];
    }
    return participants? JSON.parse(participants.participant) : [];
}

// Function to remove a participant
async function removeParticipant(meetingId, email) {
    const key = `meeting:${meetingId}:participants`;
    console.log('email in removeParticipant:', email);
    
    // Get the current list of participants
    let participants = await publisher.hGet(key, 'participant');
    
    if (participants) {
        participants = JSON.parse(participants);
        
        // Filter out the participant with the matching email
        const updatedParticipants = participants.filter(
            participant => participant.email !== email
        );
        
        console.log(`Removed participant with email ${email}. Participants count: ${participants.length} -> ${updatedParticipants.length}`);
        
        // Update the Redis store with the filtered list
        if (updatedParticipants.length > 0) {
            await publisher.hSet(key, 'participant', JSON.stringify(updatedParticipants));
        } else {
            // If no participants left, clean up the hash
            await publisher.del(key);
        }
    }
}

// Function to store chat messages
async function addChatMessage(meetingId, messageData) {
    const key = `meeting:${meetingId}:chats`;
    await publisher.lPush(key, JSON.stringify(messageData));
}

// Function to get chat messages
async function getChatMessages(meetingId) {
    const key = `meeting:${meetingId}:chats`;
    const messages = await publisher.lRange(key, 0, -1);
    return messages.map(msg => JSON.parse(msg));
}

async function setMeetingMetadata(meetingId, metadata) {
    const key = `meeting:${meetingId}:metadata`;
    await publisher.hSet(key, metadata);
}

async function getMeetingMetadata(meetingId) {
    const key = `meeting:${meetingId}:metadata`;
    return await publisher.hGetAll(key);
}

// Function to store transcript messages
async function addTranscriptMessage(meetingId, messageData) {
    const key = `meeting:${meetingId}:transcript`;
    await publisher.lPush(key, JSON.stringify(messageData));
}

// Function to get transcript messages
async function getTranscriptMessages(meetingId) {
    const key = `meeting:${meetingId}:transcript`;
    const messages = await publisher.lRange(key, 0, -1);
    return messages.map(msg => JSON.parse(msg));
}

// Function to store participant actions (join/leave)
async function addParticipantAction(meetingId, actionData) {
    const key = `meeting:${meetingId}:actions`;
    await publisher.lPush(key, JSON.stringify(actionData));
}

// Function to get participant actions
async function getParticipantActions(meetingId) {
    const key = `meeting:${meetingId}:actions`;
    const actions = await publisher.lRange(key, 0, -1);
    return actions.map(action => JSON.parse(action));
}

// Function to store meeting summary
async function setMeetingSummary(meetingId, summary) {
    const key = `meeting:${meetingId}:summary`;
    await publisher.set(key, summary);
}

// Function to get meeting summary
async function getMeetingSummary(meetingId) {
    const key = `meeting:${meetingId}:summary`;
    return await publisher.get(key);
}

// Function to handle Redis errors and reconnect attempts
function handleRedisConnection(client, name) {
    client.on('error', (error) => {
        console.error(`${name} Redis connection error:`, error);
    });

    client.on('connect', () => {
        console.log(`${name} Redis connected`);
    });

    client.on('reconnecting', () => {
        console.log(`${name} Redis reconnecting`);
    });

    client.on('ready', () => {
        console.log(`${name} Redis connection ready`);
    });
}

// Apply the connection handler to both publisher and subscriber
handleRedisConnection(publisher, 'Publisher');
handleRedisConnection(subscriber, 'Subscriber');

// Connect to Redis and set up subscription
(async () => {
    try {
        await publisher.connect();
        console.log(`Publisher connected to Redis server at ${process.env.REDIS_URL}`);

        await subscriber.connect();
        console.log(`Subscriber connected to Redis server at ${process.env.REDIS_URL}`);

        // Subscribe to multiple channels
        const channels = ['MESSAGE', 'TYPING', 'NEW_PRODUCER', 'NEW_CONSUMER', 'PARTICIPANT_JOINED', 'PARTICIPANT_LEFT'];
        await subscriber.subscribe(channels, (message, channel) => {
            console.log(`Received message from ${channel}`);

            // Parse the message and handle based on the channel
            const parsedMessage = JSON.parse(message);
            handleIncomingMessage(channel, parsedMessage);
        });
    } catch (error) {
        console.error('Redis connection error:', error);
    }
})();

async function handleIncomingMessage(channel, payload) {
    switch (channel) {
        case 'MESSAGE':
            console.log(`New message received:`, payload);
            broadcastToWebSocketClients(channel, payload);
            break;
        case 'TYPING':
            console.log(`Typing event:`, payload);
            broadcastToWebSocketClients(channel, payload);
            break;
        case 'NEW_PRODUCER':
            console.log(`New producer event:`);
            broadcastToWebSocketClients(channel, payload);
            break;
        case 'NEW_CONSUMER':
            console.log(`New consumer event:`, payload);
            broadcastToWebSocketClients(channel, payload);
            break;
        case 'PARTICIPANT_JOINED':
            console.log(`Participant joined event:`, payload);
            // await addParticipant(payload);
            console.log(`Participant added to meeting:`, payload.email);
            console.log(`Participants in meeting:`, payload);
            broadcastToWebSocketClients(channel, payload);
            break;
        case 'PARTICIPANT_LEFT':
            console.log(`Participant left event:`, payload);
            broadcastToWebSocketClients(channel, payload);
            break;
        default:
            console.log(`Unhandled channel: ${channel}`);
    }
}

// Broadcast to WebSocket clients using Redis pub/sub
function broadcastToWebSocketClients(channel, payload) {
    console.log(`Broadcasting to WebSocket clients: ${channel} with socket id ${socket.id}`);
    if (socket) {
        socket.broadcast.emit(channel, payload); // Broadcast to all connected clients
    } else {
        console.log("No WebSocket clients connected");
    }
}

// Function to publish events to Redis
async function publishEvent(channel, payload) {
    try {
        const message = JSON.stringify(payload);
        await publisher.publish(channel, message);
        console.log(`Event published to ${channel}`);
    } catch (error) {
        console.error('Error publishing event:', error);
    }
}

// Export the publishEvent function and the setIo function
module.exports = {
    publishEvent,
    setIo: (socketIo, socketInstance) => {
        io = socketIo;
        socket = socketInstance;
    },
    addParticipant,
    getParticipants,
    removeParticipant,
    addChatMessage,
    getChatMessages,
    setMeetingMetadata,
    getMeetingMetadata,
    addTranscriptMessage,
    getTranscriptMessages,
    addParticipantAction,
    getParticipantActions,
    setMeetingSummary,
    getMeetingSummary
};