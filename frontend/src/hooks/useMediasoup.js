import { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import io from "socket.io-client";
import axios from "axios";
import { setMeetingParticipants, updateMeetingParticipants, removeMeetingParticipant } from "../store/meetingSlice";
import { Device } from "mediasoup-client";
import { deduplicateStreams } from "../utils/streamUtils";

const socket = io("http://localhost:8000"); // Replace with your backend URL

export const useMediasoup = () => {
  const dispatch = useDispatch();
  const [videoStream, setVideoStream] = useState(null);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [sendTransport, setSendTransport] = useState(null);
  const [recvTransport, setRecvTransport] = useState(null);
  const [producer, setProducer] = useState(null);
  const [consumers, setConsumers] = useState([]);  const user = useSelector((state) => state.auth.user);
  const meeting = useSelector((state) => state.meeting.meeting);
  const [device, setDevice] = useState(null);
  const [participantStreams, setParticipantStreams] = useState([]);  // Will contain {producerId, stream, email}
  const [joined, setJoined] = useState(false);
  useEffect(() => {
    const getMediaPermissions = async () => {
      try {
        // Request higher quality video for better fullscreen experience
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 }
          },
          audio: true
        });
        setVideoStream(stream);
        setPermissionsGranted(true);
      } catch (error) {
        console.log("Error accessing media devices.", error);
        setPermissionsGranted(false);
      }
    };

    getMediaPermissions();

    return () => {
      if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const getRtpCapabilities = async () => {
    return new Promise((resolve, reject) => {
      console.log("Emitting getRtpCapabilities event...");
      socket.emit("getRtpCapabilities", (rtpCapabilities) => {
        console.log("Received RTP Capabilities response:", rtpCapabilities);
        if (rtpCapabilities.error) {
          reject(rtpCapabilities.error);
        } else {
          resolve(rtpCapabilities);
        }
      });
    });
  };
  const loadDevice = async (rtpCapabilities) => {
    try {
      if (!rtpCapabilities) {
        console.error("Cannot load device: rtpCapabilities is null or undefined");
        return;
      }
      
      // Make sure rtpCapabilities has the expected structure
      if (!rtpCapabilities.codecs || !Array.isArray(rtpCapabilities.codecs) || rtpCapabilities.codecs.length === 0) {
        console.error("Invalid rtpCapabilities format:", rtpCapabilities);
        throw new Error("Invalid RTP capabilities format");
      }
      
      console.log("Loading device with RTP capabilities:", rtpCapabilities);
      const temp_device = new Device();
      
      await temp_device.load({ routerRtpCapabilities: rtpCapabilities });
      
      // Verify the device was properly loaded
      if (!temp_device.loaded) {
        console.error("Device reports it is not loaded after load() call");
        throw new Error("Device failed to load properly");
      }
      
      console.log("Device successfully loaded with capabilities:", temp_device.rtpCapabilities);
      
      // Verify canConsume function exists
      if (typeof temp_device.canConsume !== 'function') {
        console.warn("Warning: device.canConsume is not a function. This might cause issues later.");
      }
      
      setDevice(temp_device);
      console.log("Device created and set:", temp_device);
      return temp_device;
    } catch (error) {
      console.error("Error loading device:", error);
      throw error; // Re-throw to allow proper error handling
    }
  };

  useEffect(() => {
    const initializeTransports = async () => {
      if (device) {
        try {
          console.log("Initializing transports...");
          const sendTransport = await createSendTransport();
          const recvTransport = await createRecvTransport();
          console.log("Send transport:", sendTransport);
          console.log("Receive transport:", recvTransport);
          // Wait for transports to be set in state
          setSendTransport(sendTransport);
          setRecvTransport(recvTransport);
  
          console.log("Send and Receive transports initialized.");
        } catch (error) {
          console.error("Error initializing transports:", error);
        }
      }
    };
  
    initializeTransports();
  }, [device]);

  const createSendTransport = async () => {
    if (!device) {
      console.error("Device not initialized");
      return;
    }

    return new Promise((resolve, reject) => {
      socket.emit("createSendTransport", (response) => {
        if (response.error) {
          reject(response.error);
        } else {
          const transport = device.createSendTransport({
            id: response.id,
            iceParameters: response.iceParameters,
            iceCandidates: response.iceCandidates,
            dtlsParameters: response.dtlsParameters,
          });

          // Set the "connect" listener
          transport.on("connect", ({ dtlsParameters }, callback, errback) => {
            socket.emit("connectSendTransport", { dtlsParameters }, (response) => {
              if (response.error) {
                errback(response.error);
              } else {
                console.log("Send transport connected:", response);
                callback();
              }
            });
          });
          
          transport.on("produce", async ({ kind, rtpParameters, appData }, callback, errback) => {
            try {
              console.log("🎤 Producing media...");
          
              const { id } = await new Promise((resolve, reject) => {
                socket.emit("produce", { kind, rtpParameters, appData }, (response) => {
                  if (response.error) {
                    console.error("🚨 Produce error:", response.error);
                    reject(response.error);
                  } else {
                    console.log("✅ Producer created on server:", response);
                    resolve(response); // Only resolve the producer ID
                  }
                });
              });
          
              console.log("✅ Sending producer ID to transport callback:", id);
              callback({ id }); // Pass only the producer ID
          
            } catch (error) {
              console.error("🚨 Error during produce:", error);
              errback(error);
            }
          });

          resolve(transport);
        }
      });
    });
  };

  const createRecvTransport = async () => {
    if (!device) {
      console.error("Device not initialized");
      return;
    }

    return new Promise((resolve, reject) => {
      socket.emit("createRecvTransport", (response) => {
        if (response.error) {
          reject(response.error);
        } else {
          const transport = device.createRecvTransport({
            id: response.id,
            iceParameters: response.iceParameters,
            iceCandidates: response.iceCandidates,
            dtlsParameters: response.dtlsParameters,
          });

          // Set the "connect" listener
          transport.on("connect", ({ dtlsParameters }, callback, errback) => {
            socket.emit("connectRecvTransport", { dtlsParameters }, (response) => {
              if (response.error) {
                errback(response.error);
              } else {
                console.log("Receive transport connected:", response);
                callback();
              }
            });
          });

          transport.on("connectionstatechange", (state) => {
            console.log(`🔄 recvTransport state changed: ${state}`);
          
            if (state === "connected") {
              console.log("✅ Transport is connected, ready to consume.");
            } else if (state === "disconnected") {
              console.warn("⚠️ Transport disconnected. Attempting recovery...");
            } else if (state === "failed") {
              console.error("🚨 Transport connection failed!");
            } else if (state === "closed") {
              console.log("❌ Transport closed.");
            }
          });

          resolve(transport);
        }
      });
    });
  };

  const produceMedia = async (track) => {
    if (!sendTransport) {
      console.error("🚨 Send transport not initialized");
      return null;
    }
  
    try {
      console.log("🎥 Producing media...");
      
      // Verify track is valid and enabled
      if (!track || track.readyState === 'ended') {
        console.error("🚨 Invalid or ended track");
        return null;
      }
      
      // Ensure track is enabled
      if (!track.enabled) {
        console.log("Enabling track before producing");
        track.enabled = true;
      }
  
      // Add retry mechanism for producer creation
      let producer = null;
      let attempts = 0;
      const maxAttempts = 3;
      
      while (!producer && attempts < maxAttempts) {
        attempts++;
        try {
          console.log(`Producer creation attempt ${attempts}/${maxAttempts}`);
          
          // Add delay between retry attempts
          if (attempts > 1) {
            console.log(`Waiting before retry attempt ${attempts}...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

          producer = await sendTransport.produce({
            track,
            encodings: [
              { maxBitrate: 100000, scaleResolutionDownBy: 4 },
              { maxBitrate: 300000, scaleResolutionDownBy: 2 },
              { maxBitrate: 900000, scaleResolutionDownBy: 1 },
            ],
            codecOptions: {
              videoGoogleStartBitrate: 1000,
            },
          });
          
          console.log("✅ Producer created successfully:", producer.id);
        } catch (attemptError) {
          console.error(`🚨 Producer creation attempt ${attempts} failed:`, attemptError);
          if (attempts >= maxAttempts) {
            throw new Error(`Failed to create producer after ${maxAttempts} attempts: ${attemptError.message}`);
          }
        }
      }
      
      if (!producer) {
        throw new Error("Failed to create producer after multiple attempts");
      }
      
      // Set up producer event handlers
      producer.on("transportclose", () => {
        console.log("🔌 Producer transport closed");
      });
      
      producer.on("trackended", () => {
        console.log("🛑 Producer track ended");
        producer.close();
      });
  
      // Store the producer in state
      setProducer(producer);
  
      return producer;
    } catch (error) {
      console.error("🚨 Error producing media:", error);
      return null;
    }
  };  
const improvedWaitForTransportConnection = async (transport, timeoutMs = 5000) => {
  return new Promise((resolve) => {
    // If already connected, resolve immediately
    if (transport.connectionState === 'connected') {
      resolve(true);
      return;
    }
    
    let timeout;
    let resolved = false;
    
    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      transport.removeAllListeners('connectionstatechange');
    };
    
    const resolveOnce = (success) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(success);
      }
    };
    
    // Set up timeout
    timeout = setTimeout(() => {
      console.warn(`Transport connection timeout after ${timeoutMs}ms`);
      resolveOnce(false);
    }, timeoutMs);
    
    // Listen for connection state changes
    transport.on('connectionstatechange', (state) => {
      console.log(`Transport connection state changed to: ${state}`);
      if (state === 'connected') {
        resolveOnce(true);
      } else if (state === 'failed' || state === 'closed') {
        resolveOnce(false);
      }
    });
    
    // Also try to trigger connection if needed
    try {
      if (transport.connectionState === 'new' || transport.connectionState === 'connecting') {
        console.log(`Transport is in ${transport.connectionState} state, waiting for connection...`);
      }
    } catch (err) {
      console.warn('Error checking transport state:', err);
      resolveOnce(false);
    }
  });
};

// Also add the requestTransportRestartIce function that's referenced later
const requestTransportRestartIce = async (transportId) => {
  return new Promise((resolve, reject) => {
    socket.emit('restartIce', { transportId }, (response) => {
      if (response.error) {
        reject(new Error(response.error));
      } else {
        resolve(response);
      }
    });
  });
};
const resumeConsumer = async (consumer, maxRetries = 3) => {
  let attempts = 0;
  
  while (attempts < maxRetries) {
    attempts++;
    try {
      console.log(`Attempting to resume consumer ${consumer.id} (attempt ${attempts}/${maxRetries})`);
      
      // Add delay between attempts
      if (attempts > 1) {
        const delay = Math.min(500 * attempts, 2000);
        console.log(`Waiting ${delay}ms before resume attempt ${attempts}...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      await consumer.resume();
      console.log(`✅ Consumer ${consumer.id} resumed successfully`);
      return true;
      
    } catch (resumeErr) {
      console.error(`❌ Resume attempt ${attempts}/${maxRetries} failed for consumer ${consumer.id}:`, resumeErr);
      
      if (attempts >= maxRetries) {
        console.error(`❌ All resume attempts failed for consumer ${consumer.id}`);
        return false;
      }
    }
  }
  
  return false;
};
const consumeMedia = async (producerId) => {
    if (!recvTransport) {
      console.error("🚨 Receive transport not initialized");
      return null;
    }

    if (!producerId) {
      console.error("🚨 Invalid producerId:", producerId);
      return null;
    }

    // Log the current state of the receive transport
    console.log(`🔄 Receive transport state: ${recvTransport.connectionState}`);
    
    // Enhanced transport connection handling with improved helper
    if (recvTransport.connectionState !== 'connected') {
      console.warn(`⚠️ Receive transport is not connected (state: ${recvTransport.connectionState}). Using improved connection handler...`);
      
      try {
        // Use our improved connection handler with shorter timeout
        const connected = await improvedWaitForTransportConnection(recvTransport, 3000);
        
        if (connected) {
          console.log("✅ Transport successfully connected, proceeding with media consumption");
        } else {
          console.warn("⚠️ Proceeding with media consumption despite transport not being fully connected");
          // We'll still try to consume, some transports can recover later
        }
      } catch (connErr) {
        console.error("Error during transport connection:", connErr);
      }
    }
    
    console.log(`🔄 Attempting to consume media for producer: ${producerId}`);
    
    // Make sure device is properly loaded before trying to use it
    if (!device || !device.loaded) {
      console.error("🚨 Device not properly loaded for consuming media");
      return null;
    }
    
    console.log("💻 Using device with capabilities:", device.rtpCapabilities);
    
    try {
      // More robust capability check that works across mediasoup versions
      try {
        // Different versions of mediasoup-client have different APIs
        let canConsume = true;
        
        // First, make absolutely sure we have a valid device
        if (!device || !device.rtpCapabilities || !device.rtpCapabilities.codecs || !Array.isArray(device.rtpCapabilities.codecs)) {
          console.error("🚨 Invalid device or capabilities for consuming media");
          return null;
        }
        
        // Handle different mediasoup versions' capabilities checking
        if (device.canConsume && typeof device.canConsume === 'function') {
          try {
            canConsume = device.canConsume({ 
              producerId, 
              rtpCapabilities: device.rtpCapabilities 
            });
          } catch (canConsumeErr) {
            console.warn("Error using device.canConsume, falling back to manual check:", canConsumeErr.message);
            // Fall through to the manual check below
          }
        } else {
          // Manual compatibility check for older mediasoup versions
          console.log("device.canConsume not available, using fallback capability check");
          // This fallback assumes compatibility and relies on server-side checks
        }
        
        if (!canConsume) {
          console.error("🚨 Device cannot consume this producer based on capability check");
          return null;
        }
      } catch (err) {
        console.error("Error in capability check:", err);
        // Continue anyway as a fallback, server will reject if not compatible
        console.log("Continuing despite capability check error");
      }

      const stream = await new Promise((resolve, reject) => {
        // Add timeout to prevent hanging socket requests
        const consumeTimeout = setTimeout(() => {
          console.error(`Socket emit consume request timed out after 10 seconds for producer ${producerId}`);
          reject(new Error('Consume request timed out'));
        }, 10000);
        
        socket.emit("consume", { 
          producerId, 
          rtpCapabilities: device.rtpCapabilities,
          // Include additional flags to ensure server doesn't mark consumer as paused
          paused: false,
          forcePaused: false,
          // Add timestamp for debugging
          timestamp: Date.now()
        }, (response) => {
          clearTimeout(consumeTimeout); // Clear timeout on response
          
          if (!response) {
            console.error("🚨 Empty response received from consume request");
            reject(new Error("Empty response from consume request"));
            return;
          }
          
          if (response.error) {
            console.error("🚨 Consume error:", response.error);
            reject(new Error(response.error));
            return;
          }
          
          // Validate response has required fields
          const requiredFields = ['id', 'producerId', 'kind', 'rtpParameters'];
          const missingFields = requiredFields.filter(field => !response[field]);
          
          if (missingFields.length > 0) {
            console.error(`🚨 Response missing required fields: ${missingFields.join(', ')}`, response);
            reject(new Error(`Response missing required fields: ${missingFields.join(', ')}`));
            return;
          }
          
          // Inject visibility flags if they're missing
          if (response && !response.paused) {
            response.paused = false;
          }
          if (response && !response.producerPaused) {
            response.producerPaused = false;
          }
          
          console.log("✅ Consuming media response received:", response);
          
          const handleConsumer = async () => {
            try {
              const { id, producerId, kind, rtpParameters } = response;
              
              console.log(`🔄 Creating consumer with ID: ${id} for producer: ${producerId}, kind: ${kind}`);
              
              const consumer = await recvTransport.consume({
                id,
                producerId,
                kind,
                rtpParameters,
              });

              console.log(`✅ Consumer created: ${consumer.id}, kind: ${consumer.kind}`);

              // Add event handlers for consumer state changes
              consumer.on('transportclose', () => {
                console.error(`🔄 Consumer ${consumer.id} transport closed`);
              });
              
              consumer.on('trackended', () => {
                console.error(`🔄 Consumer ${consumer.id} track ended`);
              });
              
              // Use our improved consumer resume function
              await resumeConsumer(consumer, 3);
              
              // Add consumer to state for later tracking
              setConsumers(prev => [...prev, consumer]);
                // Create a new media stream to hold the consumer's track
              const stream = new MediaStream();
              
              if (consumer.track) {
                // Diagnostics for track availability
                console.log("Consumer track status:", 
                  consumer.track ? 
                    `Available (kind: ${consumer.track.kind}, enabled: ${consumer.track.enabled}, readyState: ${consumer.track.readyState})` : 
                    "No track"
                );

                try {
                  // Always explicitly enable the track to ensure visibility
                  console.log("Explicitly enabling consumer track before adding to stream");
                  consumer.track.enabled = true;
                  
                  // Try to set the track volume to maximum if it's an audio track
                  if (consumer.track.kind === 'audio' && consumer.track.getSettings) {
                    try {
                      // Attempt to set volume if supported
                      const settings = consumer.track.getSettings();
                      console.log("Audio track settings:", settings);
                    } catch (settingsErr) {
                      console.log("Error getting track settings:", settingsErr);
                    }
                  }

                  // Add the track to the stream
                  stream.addTrack(consumer.track);

                  // Check that track was added successfully
                  const tracks = stream.getTracks();
                  console.log(`After addTrack - Stream now has ${tracks.length} track(s):`, 
                    tracks.map(t => `${t.kind} (${t.enabled ? 'enabled' : 'disabled'}, ${t.readyState})`));
                  
                  // Verify stream has tracks
                  const trackCount = stream.getTracks().length;
                  if (trackCount === 0) {
                    console.error("🚨 Failed to add track to stream!");
                    
                    // Last resort: try cloning the track before giving up
                    try {
                      console.log("Attempting to clone the track as fallback...");
                      const clonedTrack = consumer.track.clone();
                      stream.addTrack(clonedTrack);
                      const newTrackCount = stream.getTracks().length;
                      
                      if (newTrackCount > 0) {
                        console.log("✅ Successfully added cloned track to stream");
                      } else {
                        console.error("🚨 Failed to add cloned track to stream!");
                        reject(new Error("Failed to add track to stream even after cloning"));
                        return;
                      }
                    } catch (cloneErr) {
                      console.error("Failed to clone track:", cloneErr);
                      reject(new Error("Failed to add track to stream"));
                      return;
                    }
                  }
                  
                  console.log(`✅ Stream created with ${trackCount} track(s) of kind: ${stream.getTracks()[0].kind}`);
                  
                  resolve(stream);
                } catch (trackErr) {
                  console.error("Error setting up track:", trackErr);
                  reject(trackErr);
                }
              } else {
                console.error("🚨 Consumer has no track!");
                reject(new Error("Consumer has no track"));
              }
            } catch (err) {
              console.error("🚨 Error creating consumer:", err);
              reject(err);
            }
          };

          // Run the async logic in a separate function
          handleConsumer();
        });
      });
      return stream;
    } catch (err) {
      console.error("🚨 Error in consumeMedia:", err);
      return null;
    }
  };
  const sendMessage = async (meetingId, user, message) => {
    return new Promise((resolve, reject) => {
      socket.emit("message", { meetingId, user, message }, (response) => {
        if (response.error) {
          reject(response.error);
        } else {  
          resolve(response);
        }
      });
    });
  };
  const addParticipant = async (meetingId, producerId, email) => {
    return new Promise((resolve, reject) => {
      // Validate required parameters
      if (!meetingId || !email) {
        const error = new Error("Missing required parameters: meetingId and email are mandatory");
        console.error(error);
        reject(error);
        return;
      }
      
      // If producerId is not provided but we have a producer, use its ID
      if (!producerId && producer) {
        console.log("No producerId provided, using current producer ID:", producer.id);
        producerId = producer.id;
      }
      
      // If we still don't have a producerId, this is an error - we need it for streams
      if (!producerId) {
        console.warn("⚠️ No producerId available for participant. Media sharing might not work properly.");
        // Instead of failing, we'll try to create a placeholder producer ID
        // This is just a temporary solution until a real producer is created
        producerId = `placeholder-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      }
      
      // Start with checking if we already have this participant in our state
      // to avoid duplicate processing
      const participantExists = meeting?.participants?.some(p => 
        p.email === email || p.producerId === producerId
      );
      
      if (participantExists) {
        console.log(`Participant ${email} already exists in meeting - skipping add operation`);
        resolve({ message: "Participant already exists" });
        return;
      }
      
      socket.emit("joined", { meetingId, producerId, email }, async (response) => {
        if (response.error) {
          reject(response.error);
        } else {
          const payload = response.data;
          console.log("add participant response:", payload);
          console.log("add participant type:", typeof payload);
          console.log("add participant count:", payload.length);
          dispatch(setMeetingParticipants(payload));
          // Add current user to participants list in Redux store
          // This ensures the current user appears in the participants list
          if (user && user.email === email) {
            // Create participant object with the current user's details
            const currentUserParticipant = {
              email: user.email,
              displayName: user.displayName || user.email,
              uid: user.uid,
              photoURL: user.photoURL,
              producerId: producerId
            };
              // Add participant to MongoDB via HTTP call (important for meeting history)
            try {
              // Check to make sure we have an auth token
              if (user.token) {
                // Add retry logic for the API call
                let retryCount = 0;
                const maxRetries = 3;
                let success = false;
                
                while (retryCount < maxRetries && !success) {
                  try {
                    console.log(`Attempting to add participant to MongoDB (try ${retryCount + 1}/${maxRetries})`);
                    await axios.post(`${import.meta.env.VITE_APP_API_URL}/meeting/${meetingId}/add`, 
                    // Include all required fields from userSchema
                    {
                      uid: user.uid || `client-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                      displayName: user.displayName || user.email,
                      email: user.email,
                      photoURL: user.photoURL || null,
                      producerId: producerId // Include producer ID for better identification
                    }, 
                    {
                      headers: {
                        Authorization: `Bearer ${user.token}`
                      },
                      // Add timeout to prevent hanging requests
                      timeout: 5000
                    });
                    
                    console.log("Participant successfully added to MongoDB meeting record");
                    success = true;
                  } catch (apiError) {
                    retryCount++;
                    // Log more detailed error information
                    console.error(`API call failed (attempt ${retryCount}/${maxRetries}):`, apiError.message);
                    if (apiError.response) {
                      // The request was made and the server responded with a status code
                      // that falls out of the range of 2xx
                      console.error('Error response data:', apiError.response.data);
                      console.error('Error response status:', apiError.response.status);
                      console.error('Error response headers:', apiError.response.headers);
                    } else if (apiError.request) {
                      // The request was made but no response was received
                      console.error('No response received from server. Request details:', apiError.request);
                    }
                    
                    if (retryCount < maxRetries) {
                      // Exponential backoff: wait longer between each retry
                      const delay = Math.min(1000 * Math.pow(2, retryCount), 5000);
                      console.log(`Waiting ${delay}ms before retry...`);
                      await new Promise(resolve => setTimeout(resolve, delay));
                    }
                  }
                }
                
                if (!success) {
                  console.error("Failed to add participant to MongoDB after multiple attempts");
                }
              } else {
                console.warn("No auth token available - skipping MongoDB update");
              }
            } catch (err) {
              console.error("Error in MongoDB participant addition process:", err);
            }
            
            // Add to Redux store
            dispatch(updateMeetingParticipants(currentUserParticipant));          
          }
          
          if (payload.length > 0) {
            payload.forEach(async (e) => {
              console.log('adding participant:', e);
              // Check if this participant is already in our streams
              const participantExists = participantStreams.some(p => 
                p.email === e.email || p.producerId === e.producerId
              );
              
              console.log("Processing participant:", e.email, "User is:", user?.email);
              
              // Check if this participant is already in Redux store before adding
              // This helps prevent duplicate entries in the participant list
              const meetingData = meeting || {};
              const participantInRedux = meetingData?.participants?.some(p => 
                p.email === e.email || p.producerId === e.producerId
              );
              
              if (!participantInRedux) {
                console.log(`Adding participant ${e.email} to Redux store`);
                dispatch(updateMeetingParticipants(e));
              } else {
                console.log(`Participant ${e.email} already in Redux store - skipping add`);
              }
                // Only add streams we don't already have and avoid adding our own stream twice
              if (!participantExists && e.producerId !== producer?.id) {
                console.log("Consuming media for participant:", e.email, e.producerId);
                try {
                  // Add a delay before consuming to ensure the transport is fully ready
                  // This can help with race conditions in WebRTC connection establishment
                  await new Promise(resolve => setTimeout(resolve, 500));
                      console.log(`Starting media consumption for ${e.email} (${e.producerId})`);
                  
                  // Enhanced robust stream consumption with retry mechanism
                  let stream = null;
                  let attempts = 0;
                  const maxAttempts = 3;
                  
                  while (!stream && attempts < maxAttempts) {
                    attempts++;
                    try {
                      console.log(`Consume attempt ${attempts}/${maxAttempts} for ${e.email}`);
                      
                      // Add delay between attempts
                      if (attempts > 1) {
                        const delayMs = Math.min(1000 * attempts, 3000);
                        console.log(`Waiting ${delayMs}ms before attempt ${attempts}...`);
                        await new Promise(resolve => setTimeout(resolve, delayMs));
                      }
                      
                      // Try to consume media
                      stream = await consumeMedia(e.producerId);
                      
                      // Validate stream has tracks
                      if (stream) {
                        const tracks = stream.getTracks();
                        if (tracks.length === 0) {
                          console.warn(`Stream for ${e.email} has no tracks (attempt ${attempts}/${maxAttempts}). Will retry...`);
                          stream = null; // Reset to force retry
                        } else {
                          console.log(`✅ Stream for ${e.email} has ${tracks.length} tracks!`);
                        }
                      }
                    } catch (consumeErr) {
                      console.error(`Error during consume attempt ${attempts}/${maxAttempts}:`, consumeErr);
                      // Continue to next attempt
                    }
                  }
                  
                  if (stream && stream.getTracks().length > 0) {
                    console.log(`Successfully created stream for ${e.email} with ${stream.getTracks().length} tracks`);
                    
                    // Log detailed track info for debugging
                    stream.getTracks().forEach(track => {
                      console.log(`Track for ${e.email}: ${track.kind}, enabled: ${track.enabled}, state: ${track.readyState}`);
                      
                      // Ensure tracks are enabled
                      if (!track.enabled) {
                        track.enabled = true;
                        console.log(`Enabled ${track.kind} track for ${e.email}`);
                      }
                    });
                    
                    // Add the participant stream to our list of streams
                    setParticipantStreams((prevStreams) => {
                      console.log("Adding participant stream to collection:", e.email);
                      return [...prevStreams, { 
                        producerId: e.producerId, 
                        stream,
                        email: e.email, // Include email to identify the user
                        displayName: e.displayName, // Include display name if available
                        addedAt: Date.now() // Track when the stream was added for diagnostics
                      }];
                    });
                    console.log("✅ Successfully consumed media stream for:", e.email);
                  } else {
                    console.error("❌ Failed to get stream with tracks for participant:", e.email);
                    
                    // Add a placeholder entry to allow UI to show the participant even without video
                    setParticipantStreams((prevStreams) => {
                      console.log("Adding placeholder entry for participant without stream:", e.email);
                      return [...prevStreams, { 
                        producerId: e.producerId, 
                        stream: null, // Null stream indicates a placeholder
                        email: e.email,
                        displayName: e.displayName,
                        isPlaceholder: true, // Flag to indicate this is a placeholder
                        addedAt: Date.now()
                      }];
                    });
                  }
                } catch (err) {
                  console.error("Error consuming media for participant:", e.email, err);
                }
              } else {
                console.log("Stream exists or is own producer - skipping consumption for", e.email);
              }
            });
          }
          resolve(response);
        }
      });
    });
  }  
  const removeParticipant = async (meetingId, email, producerId) => {
    return new Promise((resolve, reject) => {
      // Include the displayName to ensure complete information for history tracking
      const displayName = user?.displayName || email;
      const uid = user?.uid;
      
      // Include more participant data for accurate history tracking
      socket.emit("left", { 
        meetingId, 
        email, 
        uid, // Include UID for consistent user identification
        producerId, 
        displayName, // Ensure displayName is sent
        timestamp: new Date() // Include timestamp for accurate timeline
      }, (response) => {
        if (response.error) {
          console.error("Error removing participant:", response.error);
          reject(response.error);
        } else {
          // If successful, also update the local Redux store to immediately remove the participant
          dispatch(removeMeetingPatricipant({ email }));
          resolve(response);
        }
      });
    });
  }

  socket.on("MESSAGE", (payload) => {
    console.log("New message received:", payload);
    // Handle incoming message
    meeting.messages.push(payload);
  });
  // Make sure we only handle PARTICIPANT_JOINED once by removing previous listeners
  socket.off("PARTICIPANT_JOINED");    socket.on("PARTICIPANT_JOINED", async (payload) => {
    console.log("Participant joined event in frontend:", payload);
    
    // Validate payload contains required data
    if (!payload || !payload.email) {
      console.error("🚨 Invalid participant joined payload:", payload);
      return;
    }
    
    // Ensure producerId exists - create a placeholder if it doesn't
    if (!payload.producerId) {
      console.warn("Participant joined without a producerId, creating placeholder:", payload.email);
      payload.producerId = `placeholder-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      payload.isPlaceholder = true;
    }
    
    // Check if this participant already exists in our streams
    const participantExists = participantStreams.some(
      stream => stream.email === payload.email || stream.producerId === payload.producerId
    );
      // Don't add duplicates, but do update Redux
    if (!participantExists) {
      try {
        console.log("Attempting to consume media for:", payload.email, payload.producerId);
        
        // Always consume the media for any participant that isn't already in our streams
        // This ensures the host can see all participants and participants can see each other
        // We only avoid consuming our own producer since we already have that stream locally
        // IMPROVED: Always consume media from other participants
        // This ensures that all participants can see each other's videos
        
        // Fix: Make sure we're correctly checking if this is our own producer
        const isOwnProducer = producer && producer.id === payload.producerId;
        console.log(`Checking producer - isOwnProducer: ${isOwnProducer}, our producer ID: ${producer?.id}, participant producer ID: ${payload.producerId}`);
        
        // We should consume video for anyone who isn't us
        if (!isOwnProducer) {
          console.log(`Consuming media for participant ${payload.email} with producer ID ${payload.producerId}`);
          console.log(`Current user is ${user?.email} with producer ID ${producer?.id}`);          try {
            console.log(`Attempting to consume media for participant ${payload.email} with improved error handling...`);
            
            // Make sure device is ready before attempting to consume
            if (!device || !device.loaded) {
              console.error("🚨 Device not loaded, will attempt to reinitialize...");
              // Try to reinitialize device if possible
              try {
                if (!device) {
                  console.log("Creating new device...");
                  const newDevice = new Device();
                  const rtpCapabilities = await getRtpCapabilities();
                  await newDevice.load({ routerRtpCapabilities: rtpCapabilities });
                  setDevice(newDevice);
                  device = newDevice; // Update local reference
                }
              } catch (deviceErr) {
                console.error("Failed to initialize device:", deviceErr);
              }
            }
            
            // Enhanced retry logic with progressive backoff
            let stream = null;
            let attempts = 0;
            const maxAttempts = 5; // Increase max attempts
            const backoffFactor = 1.5;
            
            while (!stream && attempts < maxAttempts) {
              attempts++;
              try {
                console.log(`Consume attempt ${attempts}/${maxAttempts} for ${payload.email}`);
                
                // Add delay before first attempt on retries
                if (attempts > 1) {
                  const delayMs = Math.min(1000 * Math.pow(backoffFactor, attempts-1), 8000);
                  console.log(`Waiting ${delayMs}ms before attempt ${attempts}...`);
                  await new Promise(resolve => setTimeout(resolve, delayMs));
                }
                
                // Try to consume media
                stream = await consumeMedia(payload.producerId);
                
                // Validate stream has video tracks
                if (stream) {
                  const videoTracks = stream.getVideoTracks();
                  if (videoTracks.length === 0) {
                    console.warn(`Stream for ${payload.email} has no video tracks! Will retry...`);
                    stream = null; // Reset to force retry
                  } else {
                    console.log(`✅ Stream for ${payload.email} has ${videoTracks.length} video tracks`);
                  }
                } else {
                  console.warn(`Attempt ${attempts}/${maxAttempts}: Got null stream for ${payload.email}`);
                }
              } catch (consumeErr) {
                console.error(`Error during consume attempt ${attempts}/${maxAttempts}:`, consumeErr);
              }
            }
            
            if (stream && stream.getTracks().length > 0) {
              console.log("✅ Successfully consumed media stream for:", payload.email, "Track count:", stream.getTracks().length);
              
              // Log track details for debugging
              const tracks = stream.getTracks();
              tracks.forEach(track => {
                console.log(`Track for ${payload.email}: ${track.kind}, enabled: ${track.enabled}, state: ${track.readyState}`);
                
                // Ensure video track is enabled
                if (track.kind === 'video' && !track.enabled) {
                  console.log(`Enabling video track for ${payload.email}`);
                  track.enabled = true;
                }
              });                // Improved logic to add participant stream and prevent duplicates
              setParticipantStreams((prevStreams) => {
                console.log(`Current participant streams before JOINED update: ${prevStreams.length}`, 
                  prevStreams.map(p => `${p.email} (${p.producerId?.substring(0, 5)})`));
                
                // First, find all existing entries for this participant (both by producer ID and email)
                const allMatches = prevStreams.filter(ps => 
                  (ps.producerId === payload.producerId && ps.producerId) || 
                  (ps.email === payload.email && ps.email)
                );
                
                if (allMatches.length > 0) {
                  console.log(`Found ${allMatches.length} existing entries for participant ${payload.email}. Consolidating.`);
                  
                  // Step 1: Remove ALL existing entries for this participant
                  const filteredStreams = prevStreams.filter(ps => 
                    (ps.producerId !== payload.producerId || !ps.producerId) && 
                    (ps.email !== payload.email || !ps.email)
                  );
                  
                  // Step 2: Create a new entry with the latest stream and complete data
                  const newEntry = {
                    producerId: payload.producerId,
                    stream,
                    email: payload.email,
                    displayName: payload.displayName || payload.email,
                    isPlaceholder: false, // Real stream, not a placeholder
                    addedAt: Date.now(),
                    updatedAt: Date.now()
                  };
                  
                  console.log(`Adding consolidated stream entry for ${payload.email} with producerId ${payload.producerId?.substring(0, 5)}`);
                  
                  // Return the filtered streams plus our new entry
                  const updatedStreams = [...filteredStreams, newEntry];
                  
                  // Log the resulting streams array for verification
                  console.log(`Updated participant streams: ${updatedStreams.length}`, 
                    updatedStreams.map(p => `${p.email} (${p.producerId?.substring(0, 5)})`));
                    
                  return updatedStreams;
                } else {
                  // No existing entries found, just add a new one
                  console.log(`No existing entries for ${payload.email}. Adding new stream entry.`);
                  
                  const newEntry = {
                    producerId: payload.producerId,
                    stream,
                    email: payload.email,
                    displayName: payload.displayName || payload.email,
                    addedAt: Date.now()
                  };
                  
                  const updatedStreams = [...prevStreams, newEntry];
                  
                  // Log the resulting streams array for verification
                  console.log(`Updated participant streams: ${updatedStreams.length}`, 
                    updatedStreams.map(p => `${p.email} (${p.producerId?.substring(0, 5)})`));
                    
                  return updatedStreams;
                }
              });
            } else {
              console.error("❌ Stream has no tracks for participant:", payload.email);
            }
          } catch (err) {
            console.error("❌ Failed to consume media for participant:", payload.email, err);
          }} else {
          console.log(`Skipping consumption of our own stream with producer ID ${payload.producerId}`);
        }
        
        // Create a complete participant object with all needed info
        const participantData = {
          email: payload.email,
          displayName: payload.displayName || payload.email,
          producerId: payload.producerId,
          uid: payload.uid || payload.email // Ensure UID is included for meeting history
        };
        
        // Check if this participant is already in Redux store before adding
        // This helps prevent duplicate entries in the participant list
        const participantInRedux = meeting?.participants?.some(p => 
          p.email === payload.email || p.producerId === payload.producerId
        );
        
        if (!participantInRedux) {
          console.log(`Adding new participant ${payload.email} from PARTICIPANT_JOINED event`);
          dispatch(updateMeetingParticipants(participantData));
        } else {
          console.log(`Participant ${payload.email} already in Redux store - skipping add from event`);
        }
      } catch (err) {
        console.error("Error adding new participant:", err);
      }
    }  
  });  

  socket.on("PARTICIPANT_LEFT", (payload) => {
    // Receive the event and update the code accordingly
    console.log("Participant left event:", payload);
    // Handle participant left event
    if(payload.meetingId === meeting?.meetingId) { 
      // Use functional update to avoid stale closure issues
      setParticipantStreams(prevStreams => {
        // First try to find the stream by producer ID
        let stream = prevStreams.find(s => s.producerId === payload.producerId);
        
        // If not found by producer ID, try to find by email
        if (!stream) {
          stream = prevStreams.find(s => s.email === payload.email);
        }
        
        // Stop all tracks if found
        if (stream && stream.stream) {
          try {
            stream.stream.getTracks().forEach(track => {
              track.stop();
              console.log(`Track ${track.kind} from ${payload.email} stopped`);
            });
          } catch (err) {
            console.error(`Error stopping tracks for ${payload.email}:`, err);
          }
        }
        
        // Return filtered streams array
        return prevStreams.filter(s => s.email !== payload.email && s.producerId !== payload.producerId);
      });
      
      // Also update consumers state to remove this participant's consumers
      setConsumers(prevConsumers => {
        // Find any consumers associated with this participant
        const consumersToRemove = prevConsumers.filter(c => 
          c.producerId === payload.producerId
        );
        
        // Close them properly
        consumersToRemove.forEach(consumer => {
          try {
            if (!consumer.closed) {
              consumer.close();
              console.log(`Closed consumer for departed participant: ${payload.email}`);
            }
          } catch (err) {
            console.error(`Error closing consumer for ${payload.email}:`, err);
          }
        });
        
        // Return the updated consumers array
        return prevConsumers.filter(c => c.producerId !== payload.producerId);
      });
      
      // Always dispatch the remove action to update the Redux store
      dispatch(removeMeetingPatricipant(payload));
      
      console.log(`Participant ${payload.email} fully removed from meeting`);
    }
  });

  socket.on('connect', () => {
    console.log("Connected to socket server");
  });

  socket.on('disconnect', () => {
    console.log("Disconnected from socket server");
  });

  // Setup automatic reconnection for transient network issues
  useEffect(() => {
    const handleSocketDisconnect = () => {
      console.log("Socket disconnected, will attempt to reconnect...");
    };

    const handleSocketReconnect = async () => {
      console.log("Socket reconnected! Rebuilding WebRTC connections...");

      // If we have a device, check if we need to rebuild any consumers
      if (device && device.loaded) {
        // First, wait briefly to allow server to restore state
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Re-initialize transports if needed
        if (!recvTransport || recvTransport.connectionState === 'closed' || 
            recvTransport.connectionState === 'failed') {
          console.log("Recreating receive transport after reconnect...");
          try {
            const newRecvTransport = await createRecvTransport();
            setRecvTransport(newRecvTransport);
            console.log("Successfully recreated receive transport");
          } catch (err) {
            console.error("Failed to recreate receive transport:", err);
          }
        }
        
        // Reconnect any existing participant streams that may have been lost
        if (meeting && meeting.participants) {
          console.log("Attempting to reconnect participant streams...");
          
          // Get current participant emails for filtering
          const currentEmails = participantStreams.map(ps => ps.email);
          
          // Loop through meeting participants and try to reconnect missing streams
          for (const participant of meeting.participants) {
            // Skip reconnecting our own stream and already connected streams
            if (participant.email === user?.email || currentEmails.includes(participant.email)) {
              continue;
            }
            
            // Only reconnect if the participant has a producerId
            if (participant.producerId) {
              console.log(`Attempting to reconnect stream for ${participant.email}...`);
              try {
                const stream = await consumeMedia(participant.producerId);
                
                if (stream && stream.getTracks().length > 0) {
                  console.log(`Successfully reconnected stream for ${participant.email}`);
                  // Add to participant streams
                  setParticipantStreams(prev => [
                    ...prev.filter(ps => ps.email !== participant.email),
                    {
                      producerId: participant.producerId,
                      stream,
                      email: participant.email,
                      displayName: participant.displayName || participant.email
                    }
                  ]);
                }
              } catch (err) {
                console.error(`Failed to reconnect stream for ${participant.email}:`, err);
              }
            }
          }
        }
      }
    };
    
    socket.on('disconnect', handleSocketDisconnect);
    socket.on('reconnect', handleSocketReconnect);
    
    // Additional event listeners for connection status
    socket.on('connect_error', (error) => {
      console.error("Socket connection error:", error);
    });
    
    socket.on('connect_timeout', () => {
      console.error("Socket connection timeout");
    });
    
    return () => {
      socket.off('disconnect', handleSocketDisconnect);
      socket.off('reconnect', handleSocketReconnect);
      socket.off('connect_error');
      socket.off('connect_timeout');
    };
  }, [device, recvTransport, meeting?.participants, participantStreams, user?.email]);

  // Periodic health check for WebRTC connections
  useEffect(() => {
    if (!device || !device.loaded || !joined) return;
    
    console.log("Setting up enhanced WebRTC health checks for video recovery...");
    
    // Function to verify and potentially repair connections
    const checkConnections = async () => {
      console.log("Running WebRTC connection health check...");
      
      // Check receive transport health
      if (recvTransport) {
        console.log(`Receive transport state: ${recvTransport.connectionState}`);
        
        if (recvTransport.connectionState === 'failed' || recvTransport.connectionState === 'disconnected') {
          console.warn("Receive transport is in a bad state, attempting recovery...");
          
          try {
            // Use our helper function to properly restart ICE
            requestTransportRestartIce(recvTransport.id)
              .then(() => console.log("ICE restart successfully requested for receive transport"))
              .catch(err => console.error("Failed to restart ICE:", err.message));
          } catch (err) {
            console.error("Error attempting to restart ICE:", err);
          }
        }
      }        // Check participant streams and fix any issues with video tracks
      if (participantStreams.length > 0) {
        // Skip detailed logging unless needed to reduce console noise
        console.log(`Checking health of ${participantStreams.length} participant streams...`);
        
        // Make a copy to avoid modification issues during iteration
        const streams = [...participantStreams];
        let streamsModified = false; // Track if we need to update state
        
        // Track if any critical issues were found to reduce logging noise
        let criticalIssuesFound = false;
        
        for (const ps of streams) {
          try {
            if (!ps.stream) continue;
            
            const tracks = ps.stream.getTracks();
            const videoTracks = tracks.filter(t => t.kind === 'video');
            
            if (videoTracks.length > 0) {
              // Only log if we find issues
              let hasTrackIssues = false;
              
              // Fix common video track issues - ensure they are enabled
              videoTracks.forEach((track, i) => {
                // Only log if there's an issue
                if (!track.enabled || track.readyState === 'ended') {
                  if (!hasTrackIssues) {
                    console.log(`Stream for ${ps.email}: ${tracks.length} tracks, ${videoTracks.length} video tracks`);
                    hasTrackIssues = true;
                    criticalIssuesFound = true;
                  }
                  console.log(`Video track ${i} for ${ps.email}: enabled=${track.enabled}, state=${track.readyState}`);
                }
                  // Only fix truly disabled tracks
                if (!track.enabled) {
                  console.log(`Re-enabling video track for ${ps.email}`);
                  track.enabled = true;
                  streamsModified = true; // Mark as modified to trigger update
                  criticalIssuesFound = true; // This is a critical issue worth fixing
                }
                
                // If track was ended, we need to trigger a full reconnection
                if (track.readyState === 'ended') {
                  console.warn(`Video track for ${ps.email} is ended - marking for recovery`);
                  // Track ended state cannot be fixed directly - would need to recreate consumer
                  // This will be handled in the next health check cycle
                  streamsModified = true; // Mark for potential stream replacement
                }
              });            } else {
              console.warn(`No video tracks for ${ps.email} - may need to reconnect`);
              streamsModified = true; // Mark for potential stream reconnection
            }
          } catch (err) {
            console.error(`Error checking stream health for ${ps.email}:`, err);
          }
        }        // Only update state if we made significant changes that would require a new reference
        if (streamsModified && criticalIssuesFound) {
          console.log("Critical stream issues were found, updating participant streams state...");
          
          // Create a new array with the updated streams to maintain reference equality
          // for unmodified streams (which helps prevent unnecessary re-renders)
          setParticipantStreams(prevStreams => {
            // Before updating, check if any actual differences exist
            const hasActualChanges = prevStreams.some((prevPs, index) => {
              const modifiedPs = streams.find(s => s.producerId === prevPs.producerId);
              if (!modifiedPs) return true; // New or missing stream
              
              // ONLY consider CRITICAL changes as reasons to update references:
              // 1. Completely different stream object
              // 2. Track ended state (which breaks video)
              // 3. New/different producer ID (which means a different source)
              // Avoid updating for minor things like enabling/disabling as those don't require re-renders
              
              if (
                modifiedPs.stream !== prevPs.stream || 
                modifiedPs.producerId !== prevPs.producerId || 
                (modifiedPs.stream?.getVideoTracks()[0]?.readyState === 'ended' && 
                 prevPs.stream?.getVideoTracks()[0]?.readyState !== 'ended')
              ) {
                console.log(`Critical change detected for ${prevPs.email || modifiedPs.email}`);
                return true;
              }
              
              return false; // No critical changes
            });
            
            // Only create a new array if actual critical changes exist
            if (!hasActualChanges) {
              console.log("No critical stream changes detected, skipping update to prevent re-renders");
              return prevStreams; // Return previous array to avoid re-render
            }
            
            console.log("Creating new stream references only for modified streams");
            
            // Map through previous streams and only replace those that need updating
            return prevStreams.map(prevPs => {
              const modifiedPs = streams.find(s => s.producerId === prevPs.producerId);
              return modifiedPs || prevPs;
            });
          });
        } else if (streamsModified) {
          console.log("Minor stream modifications detected but no critical issues - skipping state update");
        }
      }
      
      // Also check consumers directly for issues
      if (consumers.length > 0) {
        console.log(`Checking health of ${consumers.length} consumers...`);
        
        for (const consumer of consumers) {
          try {
            if (consumer.closed) continue;
            
            // Try to resume consumer (especially important for video)
            try {
              await consumer.resume();
              console.log(`Consumer ${consumer.id} resumed during health check`);
            } catch (resumeErr) {
              console.error(`Failed to resume consumer ${consumer.id}:`, resumeErr);
            }
            
            // Check track health if track exists
            if (consumer.track) {
              console.log(`Consumer ${consumer.id} track: ${consumer.track.kind}, enabled: ${consumer.track.enabled}, state: ${consumer.track.readyState}`);
              
              // Make sure video tracks are enabled
              if (consumer.track.kind === 'video' && !consumer.track.enabled) {
                console.log(`Re-enabling consumer ${consumer.id} video track`);
                consumer.track.enabled = true;
              }
            }
          } catch (err) {
            console.error(`Error checking consumer ${consumer.id}:`, err);
          }
        }
      }
    };
    
    // Run the health check immediately once after a short delay to let things stabilize
    const initialCheckTimeout = setTimeout(checkConnections, 2000);    // Increase interval to 20 seconds to reduce render frequency even more
    // while still maintaining good recovery capabilities
    const intervalId = setInterval(checkConnections, 20000);
    
    return () => {
      clearTimeout(initialCheckTimeout);
      clearInterval(intervalId);
    };
  }, [device, recvTransport, consumers, participantStreams, joined]);

  // Update joined state when we've successfully joined a meeting
  useEffect(() => {
    if (producer && sendTransport && recvTransport && meeting?.meetingId) {
      setJoined(true);
      console.log("Meeting joined state activated - all required components ready");
    }
    return () => {
      if (joined) {
        setJoined(false);
      }
    };
  }, [producer, sendTransport, recvTransport, meeting?.meetingId]);
  
  // Track diagnostics utility
  const trackDiagnostics = async (stream, participantInfo) => {
    if (!stream) {
      console.error(`Diagnostics: Stream is ${stream} for ${participantInfo || 'unknown participant'}`);
      return {
        status: 'error',
        issue: 'no-stream',
        details: 'Stream object is null or undefined'
      };
    }
    
    try {
      // Get all tracks
      const tracks = stream.getTracks();
      
      if (!tracks || tracks.length === 0) {
        console.error(`Diagnostics: No tracks in stream for ${participantInfo}`);
        return {
          status: 'error',
          issue: 'no-tracks',
          details: 'Stream contains no tracks'
        };
      }
      
      // Analyze each track
      const trackAnalysis = tracks.map(track => {
        const analysis = {
          kind: track.kind,
          enabled: track.enabled,
          readyState: track.readyState,
          muted: track.muted,
          id: track.id
        };
        
        // Try to get more detailed info for video tracks
        if (track.kind === 'video') {
          try {
            analysis.height = track.getSettings().height;
            analysis.width = track.getSettings().width;
            analysis.frameRate = track.getSettings().frameRate;
          } catch (err) {
            analysis.settingsError = err.message;
          }
          
          // Fix common issues automatically
          if (!track.enabled) {
            console.log(`Diagnostics: Enabling disabled ${track.kind} track for ${participantInfo}`);
            track.enabled = true;
            analysis.autoFixed = 'enabled-track';
          }
        }
        
        return analysis;
      });
      
      console.log(`Diagnostics for ${participantInfo}:`, trackAnalysis);
      
      // Check specifically for missing video tracks
      const videoTracks = tracks.filter(t => t.kind === 'video');
      if (videoTracks.length === 0) {
        return {
          status: 'warning',
          issue: 'no-video-tracks',
          details: 'Stream has tracks but no video tracks',
          trackAnalysis
        };
      }
      
      return {
        status: 'ok',
        trackCount: tracks.length,
        videoTrackCount: videoTracks.length,
        audioTrackCount: tracks.filter(t => t.kind === 'audio').length,
        trackAnalysis
      };
    } catch (err) {
      console.error(`Diagnostics error for ${participantInfo}:`, err);
      return {
        status: 'error',
        issue: 'analysis-error',
        details: err.message
      };
    }
  };
  
  // Add diagnostic checks to participant streams when they change
  useEffect(() => {
    if (participantStreams.length === 0) return;
    
    const runDiagnostics = async () => {
      console.log(`Running diagnostics on ${participantStreams.length} participant streams...`);
      
      const results = await Promise.all(
        participantStreams.map(async ps => {
          const participantInfo = ps.email || ps.producerId?.substring(0, 8) || 'unknown';
          const diagnosticResult = await trackDiagnostics(ps.stream, participantInfo);
          return {
            email: ps.email,
            producerId: ps.producerId,
            result: diagnosticResult
          };
        })
      );
      
      // Log overall results
      const issues = results.filter(r => r.result.status !== 'ok');
      if (issues.length > 0) {
        console.warn(`Found ${issues.length} streams with issues:`, issues);
      } else {
        console.log(`All ${results.length} streams are healthy`);
      }
    };
    
    // Run diagnostics after a short delay to let streams initialize
    const timeoutId = setTimeout(runDiagnostics, 2000);
    
    return () => clearTimeout(timeoutId);
  }, [participantStreams]);
    // Utility function to ensure participant streams are connected
const ensureParticipantStream = async (participant, maxRetries = 3) => {
  if (!participant || !participant.producerId) {
    console.warn(`Cannot ensure stream for participant without producer ID: ${participant?.email}`);
    return null;
  }
  
  console.log(`Ensuring stream for ${participant.email} with producerId ${participant.producerId}`);
  
  // Improved duplicate detection - check both producer ID and email
  const existingByProducer = participantStreams.find(ps => 
    ps.producerId === participant.producerId && ps.producerId !== undefined
  );
  
  const existingByEmail = participantStreams.find(ps => 
    ps.email === participant.email && participant.email !== undefined
  );
  
  // Use whichever one exists - prefer the one with a matching producer ID
  const existingStream = existingByProducer || existingByEmail;
  
  // Check if the existing stream is valid and has tracks
  if (existingStream && existingStream.stream && existingStream.stream.getTracks && existingStream.stream.getTracks().length > 0) {
    // Log the existing stream details for debugging
    console.log(`Participant ${participant.email} already has a valid stream with ${existingStream.stream.getTracks().length} tracks`);
    
    // Return the existing stream to avoid duplication
    return existingStream.stream;
  }
  
  console.log(`No valid stream found for ${participant.email}, creating a new one`);
  
  // If no existing stream or invalid stream, try to create/recreate it
  let attempts = 0;
  let stream = null;
  
  while (!stream && attempts < maxRetries) {
    attempts++;
    try {
      console.log(`Attempting to consume media for ${participant.email} (attempt ${attempts}/${maxRetries})`);
      
      // Add delay between attempts
      if (attempts > 1) {
        const delay = Math.min(1000 * attempts, 3000);
        console.log(`Waiting ${delay}ms before attempt ${attempts}...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      // Try to consume media
      stream = await consumeMedia(participant.producerId);
      
      // Validate stream has tracks
      if (stream) {
        const tracks = stream.getTracks();
        if (tracks.length === 0) {
          console.warn(`Stream for ${participant.email} has no tracks. Will retry...`);
          stream = null; // Reset to force retry
        } else {
          console.log(`✅ Successfully created stream for ${participant.email} with ${tracks.length} tracks`);
          
          // Ensure all tracks are enabled
          tracks.forEach(track => {
            if (!track.enabled) {
              track.enabled = true;
              console.log(`Enabled ${track.kind} track for ${participant.email}`);
            }
          });
        }
      }
    } catch (error) {
      console.error(`Error consuming media for ${participant.email} (attempt ${attempts}/${maxRetries}):`, error);
    }
  }
  
  if (stream && stream.getTracks().length > 0) {
    // Add to participant streams if not already there - with improved deduplication
    setParticipantStreams(prevStreams => {
      // Log current participants for debugging
      console.log(`Current participant streams before update: ${prevStreams.length}`, 
        prevStreams.map(p => `${p.email} (${p.producerId?.substring(0, 5)})`));
      
      // First step: Remove any stream with same producer ID (most accurate)
      let deduplicatedStreams = prevStreams.filter(ps => 
        ps.producerId !== participant.producerId || !participant.producerId
      );
      
      // Second step: Check if we still have duplicates by email
      const duplicateEmails = deduplicatedStreams.filter(ps => ps.email === participant.email);
      
      // If we have duplicates by email, keep the most recent one
      if (duplicateEmails.length > 0) {
        console.log(`Found ${duplicateEmails.length} duplicate entries by email for ${participant.email}. Removing them.`);
        // Filter out all instances of this email
        deduplicatedStreams = deduplicatedStreams.filter(ps => ps.email !== participant.email);
      }
      
      // Create the new entry
      const newEntry = {
        producerId: participant.producerId,
        stream,
        email: participant.email,
        displayName: participant.displayName || participant.email,
        addedAt: Date.now() // Track when the stream was added for diagnostics
      };
      
      console.log(`Adding stream for ${participant.email} with producerId ${participant.producerId?.substring(0, 5)}`);
      
      // Add the new entry
      const updatedStreams = [...deduplicatedStreams, newEntry];
      
      // Log resulting stream list for verification
      console.log(`Updated participant streams: ${updatedStreams.length}`, 
        updatedStreams.map(p => `${p.email} (${p.producerId?.substring(0, 5)})`));
      
      return updatedStreams;
    });
    
    return stream;
  }
  
  console.error(`Failed to ensure stream for ${participant.email} after ${maxRetries} attempts`);
  return null;
};
    // Run periodic stream deduplication to prevent duplicate streams
  useEffect(() => {
    // Initial deduplication after a short delay to allow streams to initialize
    const initialDeduplicationTimeout = setTimeout(() => {
      console.log("Running initial stream deduplication...");
      setParticipantStreams(prevStreams => deduplicateStreams(prevStreams));
    }, 5000); // 5 seconds after component mount
    
    // Periodic deduplication every 30 seconds
    const periodicDeduplicationInterval = setInterval(() => {
      console.log("Running periodic stream deduplication...");
      setParticipantStreams(prevStreams => deduplicateStreams(prevStreams));
    }, 30000); // Every 30 seconds
    
    return () => {
      clearTimeout(initialDeduplicationTimeout);
      clearInterval(periodicDeduplicationInterval);
    };
  }, []);

  return {
    videoStream,
    permissionsGranted,
    getRtpCapabilities,
    loadDevice,
    createSendTransport,
    createRecvTransport,
    produceMedia,
    consumeMedia,
    producer,
    consumers,
    sendMessage,
    addParticipant,
    removeParticipant,
    sendTransport,
    recvTransport,
    participantStreams,
    setConsumers,
    setProducer,
    setSendTransport,
    setRecvTransport,
    joined,
    setJoined,
    ensureParticipantStream
  };
};
