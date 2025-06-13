const { 
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
  setMeetingSummary
} = require('../utils/redis');
const { 
  addTranscriptMessage: dbAddTranscriptMessage, 
  addParticipantAction: dbAddParticipantAction,
  updateMeetingSummary,
  completeMeeting 
} = require('../models/meetingModel');

module.exports = async (io) => {
  const mediasoup = require('mediasoup');
  const mediasoupConfig = require('../config/mediasoup-config');
  const { publishEvent } = require('../utils/redis');
  const { setIo } = require('../utils/redis');

  let worker, router;
  const producers = new Map();  // Store producer objects
  const consumers = new Map(); 
  
  // Create mediasoup worker and router
  worker = await mediasoup.createWorker(mediasoupConfig.worker);
  router = await worker.createRouter({ mediaCodecs: mediasoupConfig.router.mediaCodecs });

  console.log('Mediasoup worker and router initialized.');
  worker.on('died', () => {
    console.error('Mediasoup worker died, exiting...');
    process.exit(1);
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    setIo(io, socket);
    
    // Handle transport creation
    async function createTransport(callback) {
      try {
        // Create WebRTC transport with enhanced options
        const transport = await router.createWebRtcTransport({
          listenIps: [
            // Use a specific IP instead of 0.0.0.0 for better ICE connectivity
            // Use localhost for testing, but in production use your actual server IP
            { ip: "127.0.0.1", announcedIp: null }
          ],
          enableUdp: true,
          enableTcp: true,
          preferUdp: true,
          initialAvailableOutgoingBitrate: 1000000, // 1 Mbps
          minimumAvailableOutgoingBitrate: 600000, // 600 kbps
          maxIncomingBitrate: 1500000, // 1.5 Mbps
          // Add TURN server options here if needed
          // webRtcServer: webRtcServer,
        });
        
        console.log(`✅ Transport created with ID: ${transport.id}`);
        // Set up enhanced transport event listeners
        transport.on('icestatechange', (iceState) => {
          console.log(`Transport ${transport.id} ICE state changed to ${iceState}`);
          
          // Handle different ICE connection states with improved monitoring
          if (iceState === 'completed') {
            console.log(`✅ Transport ${transport.id} ICE connection established successfully`);
          } else if (iceState === 'disconnected') {
            console.warn(`⚠️ Transport ${transport.id} ICE connection disconnected - may recover automatically`);
          } else if (iceState === 'failed') {
            console.error(`🚨 Transport ${transport.id} ICE connection failed - will need restart`);
            // Transport might need recovery in production scenarios
          }
        });
        
        transport.on('iceselectedtuplechange', (iceSelectedTuple) => {
          console.log(`Transport ${transport.id} ICE tuple selected: ${JSON.stringify(iceSelectedTuple)}`);
        });
        
        // Add connectionstatechange monitoring for better reliability
        transport.on('connectionstatechange', (connectionState) => {
          console.log(`Transport ${transport.id} connection state changed to ${connectionState}`);
          
          if (connectionState === 'connected') {
            console.log(`✅ Transport ${transport.id} DTLS connected successfully`);
          } else if (connectionState === 'failed') {
            console.error(`🚨 Transport ${transport.id} DTLS connection failed`);
          }
        });

        if (!transport.dtlsParameters) {
          console.error("🚨 dtlsParameters is missing!");
        }
        
        callback({
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
        });
        
        return transport;
      } catch (error) {
        console.error('Error creating transport:', error);
        callback({ error: error.message });
        throw error;
      }
    }
    
    socket.on("createSendTransport", async (callback) => {
      try {
        socket.SendTransport = await createTransport(callback);
        socket.SendTransport.on('dtlsstatechange', (dtlsState) => {
          console.log('SendTransport dtlsState changed:', dtlsState);
          if (dtlsState === 'closed') {
            console.log('Transport closed:', socket.SendTransport.id);
            socket.SendTransport.close();
          }
        });
      } catch (error) {
        console.error("🚨 Error creating transport:", error);
        callback({ error: "Failed to create transport" });
      }
    });

    socket.on("createRecvTransport", async (callback) => {
      try {
        socket.RecvTransport = await createTransport(callback);
        socket.RecvTransport.on('dtlsstatechange', (dtlsState) => {
          console.log('RecvTransport dtlsState changed:', dtlsState);
          if (dtlsState === 'closed') {
            console.log('Transport closed:', socket.RecvTransport.id);
            socket.RecvTransport.close();
          }
        });
      } catch (error) {
        console.error("🚨 Error creating transport:", error);
        callback({ error: "Failed to create transport" });
      }
    });
    
    async function connectTransport(callback, transport, dtlsParameters) {
      if (transport) {
        await transport.connect({ dtlsParameters });
        callback({ success: true, transportId: transport.id });
        console.log(`Transport connected: ${transport.id}`);
      } else {
        callback({ error: 'Transport not found' });
      }
    }
  
    // Handle transport connection
    socket.on('connectSendTransport', async ({ dtlsParameters }, callback) => {
      try {
        await connectTransport(callback, socket.SendTransport, dtlsParameters);
      } catch (error) {
        console.error("Error connecting transport:", error);
        callback({ error: error.message });
      }
    });
    
    socket.on('connectRecvTransport', async ({ dtlsParameters }, callback) => {
      try {
        await connectTransport(callback, socket.RecvTransport, dtlsParameters);
      } catch (error) {
        console.error("Error connecting transport:", error);
        callback({ error: error.message });
      }
    });

    // Handle producing (sending) media
    socket.on("produce", async ({ kind, rtpParameters }, callback) => {
      try {
        if (!socket.SendTransport) {
          console.error("🚨 SendTransport not found!");
          
          // Try to recreate the transport before failing
          try {
            console.log("Attempting to recreate SendTransport...");
            socket.SendTransport = await createTransport(transportData => {
              // Just store the transport data, we'll send it as part of the produce response
              return transportData;
            });
            
            if (!socket.SendTransport) {
              return callback({ error: "Failed to recreate SendTransport" });
            }
            
            console.log("SendTransport recreated successfully");
          } catch (transportError) {
            console.error("🚨 Failed to recreate SendTransport:", transportError);
            return callback({ error: "SendTransport not found and recreation failed" });
          }
        }
    
        // ✅ Create a producer using the server-side SendTransport
        const producer = await socket.SendTransport.produce({
          kind,
          rtpParameters,
        });
        
        // Store both by socket ID and by producer ID for easier retrieval
        producers.set(socket.id, producer.id);
        producers.set(producer.id, producer); // Also store the actual producer object
        
        console.log(`✅ Producer created (${kind}):`, producer.id);
        console.log("📡 Producer Active?:", producer.paused ? "Paused" : "Active");

        // ✅ Send back producer ID to the client
        callback({ id: producer.id });
    
        // ✅ Publish producer event (optional)
        await publishEvent("NEW_PRODUCER", {
          producerId: producer.id,
          socketId: socket.id,
          kind,
          rtpCapabilities: router.rtpCapabilities,
        });
    
      } catch (error) {
        console.error("🚨 Error producing media:", error);
        callback({ error: "Failed to produce media: " + error.message });
      }
    });
    

    socket.on('message', async (message) => {
      console.log(`Message received:`, message);
      // ✅ Publish message event to Redis
      await publishEvent('MESSAGE', message);
    });

    socket.on('typing', async (data) => {
      console.log(`Typing event:`, data);
      // ✅ Publish typing event to Redis
      await publishEvent('TYPING', data);
    });      
    
    socket.on('joined', async (data, callback) => {
      console.log(`Participant joined:`, data);
      
      // Make sure we have complete participant data with displayName and UID
      const completeData = {
        ...data,
        displayName: data.displayName || data.email, // Ensure displayName exists
        uid: data.uid || data.email, // Ensure UID exists (use email as fallback)
        timestamp: new Date()
      };
      
      // Ensure producerId exists - even if it's a placeholder
      if (!completeData.producerId) {
        console.warn(`Participant ${completeData.email} joined without a producerId!`);
        // Generate a placeholder producer ID to allow the participant to be identified
        completeData.producerId = `placeholder-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        console.log(`Generated placeholder producerId: ${completeData.producerId}`);
      }
      
      // Add participant to Redis
      await addParticipant(completeData);
      
      // Get the updated list of participants to send back to the client
      const participants = await getParticipants(data.meetingId);
      console.log(`Returning participants ${JSON.stringify(participants)}`);

      // Send the list back to the client that requested it
      callback({
        data: participants
      });      // Notify all other clients about the new participant
      // Include additional flags to ensure better stream handling
      await publishEvent('PARTICIPANT_JOINED', {
        ...completeData,
        needsStream: true, // Flag to indicate this participant needs a stream
        joinedAt: Date.now() // Add precise timestamp
      });
      
      // NOTE: Participant join action is already recorded in meetingController.js
      // when the HTTP API endpoint is called, so we don't need to duplicate it here
      console.log(`Participant ${data.email} joined via WebSocket - join action already recorded in HTTP endpoint`);
    });
    
    socket.on('left', async ({meetingId, email, uid, producerId, displayName, timestamp}) => {
      console.log(`Participant left: ${email} (${meetingId})`);
      
      // Remove participant from Redis store
      await removeParticipant(meetingId, email);
      
      // Create a complete payload with all needed info
      const completePayload = {
        meetingId,
        email,
        uid,
        producerId,
        displayName: displayName || email,
        timestamp: timestamp || new Date()
      };
      
      // Track the participant action for meeting history in both Redis and DB
      try {
        // Add to Redis for real-time tracking
        await addParticipantAction(meetingId, {
          userId: uid || email,
          displayName: displayName || email, // Changed userName to displayName
          email: email, // Ensure email is also passed
          action: 'leave',
          timestamp: timestamp || new Date()
        });
        
        // Also record in the database for permanent history
        await dbAddParticipantAction(meetingId, { // This function is from meetingModel.js
          userId: uid || email,
          displayName: displayName || email, 
          email: email, // Ensure email is also passed
          action: 'leave',
          timestamp: timestamp || new Date()
        });
      } catch (err) {
        console.error('Error recording participant leave action:', err);
      }
      
      // Publish participant left event to Redis for all clients
      await publishEvent('PARTICIPANT_LEFT', completePayload);
    });

    // Handle consuming (receiving) media
    socket.on('consume', async ({ producerId, rtpCapabilities }, callback) => {
      try {
        console.log('consume event received for producer:', producerId);
        
        // Validate transport and consumption capability
        if (!socket.RecvTransport) {
          console.error('🚨 No receive transport for socket:', socket.id);
          return callback({ error: 'Receive transport not initialized' });
        }
        
        if (!router.canConsume({ producerId, rtpCapabilities })) {
          console.error('🚨 Router cannot consume media:', { producerId, rtpCapabilities });
          return callback({ error: 'Cannot consume media - incompatible parameters' });
        }
        
        console.log(`✅ Creating consumer for producer: ${producerId}`);
        
        // Verify that the producer exists
        const producerExists = await router.canConsume({ producerId, rtpCapabilities });
        if (!producerExists) {
          console.error(`🚨 Producer ${producerId} doesn't exist or can't be consumed`);
          return callback({ error: 'Producer not found or cannot be consumed' });
        }
        
        // Create the consumer with paused=false to start active
        const consumer = await socket.RecvTransport.consume({
          producerId,
          rtpCapabilities,
          paused: false  // Start active immediately - critical for video visibility
        });
        
        // Store the consumer
        consumers.set(consumer.id, consumer);
        
        // Enhanced resume logic with more reliable retry mechanism
        try {
          await consumer.resume();
          console.log(`✅ Consumer ${consumer.id} resumed for producer ${producerId}`);
        } catch (resumeErr) {
          console.error(`🚨 Error resuming consumer ${consumer.id}:`, resumeErr);
          
          // Try again with a slight delay (helps with timing issues)
          setTimeout(async () => {
            try {
              await consumer.resume();
              console.log(`✅ Consumer ${consumer.id} resumed on second attempt for producer ${producerId}`);
            } catch (retryErr) {
              console.error(`🚨 Failed to resume consumer ${consumer.id} on retry:`, retryErr);
              
              // Last attempt with longer delay
              setTimeout(async () => {
                try {
                  await consumer.resume();
                  console.log(`✅ Consumer ${consumer.id} resumed on final attempt for producer ${producerId}`);
                } catch (finalErr) {
                  console.error(`🚨 All attempts to resume consumer ${consumer.id} failed:`, finalErr);
                }
              }, 1500);
            }
          }, 500);
        }
        
        // Send consumer parameters to client with enhanced visibility settings
        callback({
          id: consumer.id,
          producerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
          producerPaused: false, // Ensure producer is seen as NOT paused
          paused: false,         // Ensure consumer is NOT paused
          active: true           // Additional flag to signal that this stream is ready to display
        });
        
        // Monitor consumer state
        consumer.on('producerclose', () => {
          console.log(`⚠️ Producer closed for consumer ${consumer.id}`);
          consumer.close();
          consumers.delete(consumer.id);
        });
        
        consumer.on('transportclose', () => {
          console.log(`⚠️ Transport closed for consumer ${consumer.id}`);
          consumer.close();
          consumers.delete(consumer.id);
        });
        
      } catch (error) {
        console.error('🚨 Error in consume handler:', error);
        callback({ error: 'Internal server error while consuming media' });
      }
    });

    // Handle getting RTP capabilities
    socket.on('getRtpCapabilities', (callback) => {
      const rtpCapabilities = router.rtpCapabilities;
      callback(rtpCapabilities);
    });

    // Helper function to create default ICE parameters when needed
    function createDefaultIceParameters() {
      // Generate standardized ICE parameters compatible with mediasoup
      const usernameFragment = `${Math.random().toString(36).substring(2, 15)}${Date.now().toString(36)}`;
      const password = `${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 8)}`;
      
      console.log('Creating fallback ICE parameters');
      
      return {
        usernameFragment: usernameFragment,
        password: password,
        iceLite: true
      };
    }

    // Handle ICE restart requests
    socket.on('restartIce', async ({ transportId }, callback) => {
      try {
        let transport;
        
        // Determine which transport needs restart
        if (socket.SendTransport && socket.SendTransport.id === transportId) {
          transport = socket.SendTransport;
        } else if (socket.RecvTransport && socket.RecvTransport.id === transportId) {
          transport = socket.RecvTransport;
        }
        
        if (!transport) {
          console.error(`Transport not found for restart: ${transportId}`);
          callback({ error: 'Transport not found' });
          return;
        }
        
        // Check if the transport has the method or use standard ICE parameters
        let iceParameters;
        
        if (typeof transport.getIceParameters === 'function') {
          // Use the method if it exists
          iceParameters = await transport.getIceParameters();
        } else {
          // Fallback to transport.iceParameters if the method doesn't exist
          if (transport.iceParameters) {
            iceParameters = transport.iceParameters;
            console.log(`Using stored ICE parameters from transport object`);
          } else {
            // Create new ICE parameters as a last resort
            iceParameters = createDefaultIceParameters();
            console.log(`Created new ICE parameters as fallback`);
          }
        }
        
        console.log(`ICE parameters for transport ${transportId}:`, JSON.stringify(iceParameters));
        
        // Return the ICE parameters to the client
        callback({ iceParameters });
      } catch (error) {
        console.error('Error during ICE restart:', error);
        callback({ error: error.message });
      }
    });
    
    // Handle disconnect
    socket.on('disconnect', async() => {
      console.log(`User disconnected: ${socket.id}`);
      // Clean up code is commented out for now to avoid potential issues
      // console.log("user send transport", typeof socket.SendTransport);
      // console.log("user recv transport", typeof socket.RecvTransport);
      // const producer = producers.get(socket.id);
      // if (producer) {
      //   // producer.close();
      //   console.log(`Closed producer: ${producer.id}`);
      //   producers.delete(socket.id);
      // }
      // const consumer = consumers.get(socket.id);
      // if (consumer) {
      //   // consumer.close();
      //   consumers.delete(socket.id);
      //   console.log(`Closed consumer: ${consumer.id}`);
      // }
      // if (socket.SendTransport) {
      //   console.log('Closing send transport:', socket.SendTransport.id);
      //   await socket.SendTransport.close();
      // }
      // if (socket.RecvTransport) {
      //   console.log('Closing recv transport:', socket.RecvTransport.id);
      //   await socket.RecvTransport.close();
      // }
      // Send event to frontend and remove the participant.
    });
  });
};
