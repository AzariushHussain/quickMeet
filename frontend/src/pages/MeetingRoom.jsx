import { useEffect, useState, useRef, memo, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useMediasoup } from "../hooks/useMediasoup";
import { updateMeetingParticipants, resetMeeting, setMeetingSummary } from "../store/meetingSlice";
import { Consumer } from "mediasoup-client/lib/Consumer";
import { Socket } from "socket.io-client";
import CaptionsOverlay from "../components/CaptionsOverlay";
import VideoGrid from "../components/VideoGrid";
import { saveMeetingSummary, endMeeting, getMeeting } from "../api/meeting";
import useSpeechToText from "../hooks/useSpeechToText";
import axios from "axios";
import { deduplicateStreams } from "../utils/streamUtils";
import ProfileImage from "../components/ProfileImage";

export default function MeetingRoom() {
  const dispatch = useDispatch();
  const meeting = useSelector((state) => state.meeting.meeting);
  const user = useSelector((state) => state.auth.user);
  const { videoStream, permissionsGranted, getRtpCapabilities, loadDevice, createSendTransport, createRecvTransport, produceMedia, consumeMedia, sendMessage, addParticipant, removeParticipant, sendTransport, recvTransport, participantStreams, producer, consumers, setConsumers, setProducer, setSendTransport, setRecvTransport, joined, setJoined, ensureParticipantStream } = useMediasoup();
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [deviceInitialized, setDeviceInitialized] = useState(false);
  const [showCaptions, setShowCaptions] = useState(false);
  const [meetingStartTime, setMeetingStartTime] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [showParticipants, setShowParticipants] = useState(false);  
  const localVideoRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  // Add ref to track previous participant streams
  const previousParticipantStreamsRef = useRef(null);
      // Memoize participant streams to prevent unnecessary re-renders
  const memoizedParticipantStreams = useMemo(() => {
    // If we have previous streams and they haven't changed, return the previous result
    if (previousParticipantStreamsRef.current && 
        participantStreams === previousParticipantStreamsRef.current.originalStreams && 
        meeting.participants === previousParticipantStreamsRef.current.originalParticipants) {
      console.log("Reusing previous memoized participant streams - no change detected");
      return previousParticipantStreamsRef.current.result;
    }
    
    // Create a map of participant email to displayName for faster lookups
    const participantDisplayNames = {};
    if (meeting.participants) {
      meeting.participants.forEach(p => {
        if (p.email) participantDisplayNames[p.email] = p.displayName || p.email;
      });
    }
    
    // Only create new objects when something meaningful changes
    const result = participantStreams.map(ps => {
      const displayName = participantDisplayNames[ps.email] || ps.email || 'Participant';
      
      // Only create a new object if the displayName is different
      if (ps.displayName === displayName) {
        return ps; // Return the same object reference if nothing changed
      }
      
      return {
        ...ps,
        displayName
      };
    });
    
    // Store references for future comparison
    previousParticipantStreamsRef.current = {
      originalStreams: participantStreams,
      originalParticipants: meeting.participants,
      result
    };
    
    return result;
  }, [participantStreams, meeting.participants]);

  const toggleVideo = () => {
    if (videoStream) {
      videoStream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
        setVideoEnabled(track.enabled);
      });
    }
  };

  const toggleAudio = () => {
    if (videoStream) {
      videoStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
        setAudioEnabled(track.enabled);
      });
    }
  };
  const joinMeeting = async () => {
    try {
      setJoined(true);
      setMeetingStartTime(new Date());
      
      // Retrieve rtpCapabilities from the server
      console.log("Getting RTP Capabilities...");
      const rtpCapabilities = await getRtpCapabilities();
      console.log("RTP Capabilities:", rtpCapabilities);
      
      // Load device with rtpCapabilities
      await loadDevice(rtpCapabilities);
      setDeviceInitialized(true);
    } catch (error) {
      console.error("Error joining meeting:", error);
    }
  };
  const transcriptData = useSelector(state => state.meeting.transcript);
  const participantActionData = useSelector(state => state.meeting.participantActions);
  
  const generateMeetingSummary = async () => {
    try {
      // Basic meeting details
      const meetingDetails = {
        meetingId: meeting.meetingId,
        host: meeting.host.email,
        participants: meeting.participants.length,
        date: new Date().toLocaleString(),
        duration: meetingStartTime ? Math.floor((new Date() - meetingStartTime) / 1000) : 0
      };
      
      // Format duration in a human-readable format
      const formatDuration = (seconds) => {
        if (!seconds) return 'N/A';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        return [
          hours > 0 ? `${hours}h` : '',
          minutes > 0 ? `${minutes}m` : '',
          `${secs}s`
        ].filter(Boolean).join(' ');
      };

      // Generate summary content
      let summary = `# Meeting Summary\n\n`;
      summary += `## Meeting Details\n`;
      summary += `- **Meeting ID:** ${meetingDetails.meetingId}\n`;
      summary += `- **Date:** ${meetingDetails.date}\n`;
      summary += `- **Duration:** ${formatDuration(meetingDetails.duration)}\n`;
      summary += `- **Host:** ${meetingDetails.host}\n`;
      summary += `- **Participants:** ${meetingDetails.participants}\n\n`;
      
      // Add participant activity
      if (participantActionData && participantActionData.length > 0) {
        summary += `## Participant Activity\n`;
        
        // Group actions by user
        const userActions = {};
        participantActionData.forEach(action => {
          if (!userActions[action.userId]) {
            userActions[action.userId] = {
              name: action.userName,
              actions: []
            };
          }
          userActions[action.userId].actions.push({
            action: action.action,
            timestamp: new Date(action.timestamp)
          });
        });
        
        // Generate activity summary
        Object.values(userActions).forEach(user => {
          const joinTimes = user.actions.filter(a => a.action === 'join').map(a => a.timestamp);
          const leaveTimes = user.actions.filter(a => a.action === 'leave').map(a => a.timestamp);
          
          if (joinTimes.length > 0) {
            summary += `- **${user.name}** joined at ${joinTimes[0].toLocaleTimeString()}`;
            if (leaveTimes.length > 0) {
              summary += ` and left at ${leaveTimes[leaveTimes.length-1].toLocaleTimeString()}`;
            }
            summary += `\n`;
          }
        });
        summary += `\n`;
      }
      
      // Add transcript highlights
      if (transcriptData && transcriptData.length > 0) {
        summary += `## Discussion Highlights\n`;
        
        // Find unique participants in the transcript
        const uniqueSpeakers = [...new Set(transcriptData.map(item => item.userName))];
        summary += `- ${uniqueSpeakers.length} participants contributed to the discussion\n`;
        
        // Get transcript total length
        const totalTranscriptWords = transcriptData.reduce((sum, item) => 
          sum + item.text.split(/\s+/).length, 0);
        summary += `- Total conversation length: ${totalTranscriptWords} words\n\n`;
        
        // Add some key points (simplified - in a real app you might use more sophisticated extraction)
        summary += `## Key Points\n`;
        
        // Get the longest messages as they might contain key points (simplified approach)
        const keyMessages = [...transcriptData]
          .sort((a, b) => b.text.length - a.text.length)
          .slice(0, 3);
          
        keyMessages.forEach(message => {
          summary += `- ${message.userName}: "${message.text.substring(0, 100)}${message.text.length > 100 ? '...' : ''}"\n`;
        });
      }
      
      // Save the summary to Redux and backend
      dispatch(setMeetingSummary(summary));
      
      if (user.token) {
        await saveMeetingSummary(meeting.meetingId, summary, user.token);
      }
      
      return summary;
    } catch (error) {
      console.error("Error generating meeting summary:", error);
      // Fallback to basic summary in case of error
      const basicSummary = `Meeting ID: ${meeting.meetingId}\nHost: ${meeting.host.email}\nParticipants: ${meeting.participants.length}\nDate: ${new Date().toLocaleString()}`;
      
      dispatch(setMeetingSummary(basicSummary));
      return basicSummary;
    }
  };
  const leaveMeeting = async () => {
    try {
      setJoined(false);
      
      // Calculate meeting duration
      let duration = 0;
      if (meetingStartTime) {
        duration = Math.floor((new Date() - meetingStartTime) / 1000); // in seconds
      }
      
      // Show loading message
      // alert("Generating meeting summary... You'll be redirected once complete.");
      
      // Generate and save meeting summary
      const summary = await generateMeetingSummary();
      
      // End the meeting in the backend if user is the host
      if (user.email === meeting.host.email && user.token) {
        await endMeeting(meeting.meetingId, duration, user.token);
      }
      
      // Clean up media
      if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
      }
      
      consumers.forEach(({ consumer }) => {
        if (consumer) {
          console.log("Closing consumer:", consumer.id);
          consumer.close();
        }
      });
      
      setConsumers([]);
      
      if (producer) {
        console.log("Closing producer:", producer.id);
        producer.close();
      }
      
      setProducer(null);
      
      if (sendTransport) {
        await sendTransport.close();
        setSendTransport(null);
      }
      
      if (recvTransport) {
        await recvTransport.close();
        setRecvTransport(null);
      }
      
      console.log("participant close event");
      if (producer && producer.id) {
        removeParticipant(meeting.meetingId, user.email, producer.id);
      }
      
      dispatch(resetMeeting());
      window.location.href = '/'; // Redirect to home
    } catch (error) {
      console.error("Error leaving meeting:", error);
    }
  }
  useEffect(() => {
    const initializeTransports = async () => {
      if (deviceInitialized && sendTransport && recvTransport) {
        try {
          console.log("video stream:", videoStream);
          
          // Check if we already have a producer
          if (!producer) {
            // Try to create a producer with retry mechanism
            let newProducer = null;
            let attempts = 0;
            const maxAttempts = 3;
            
            while (!newProducer && attempts < maxAttempts) {
              attempts++;
              try {
                console.log(`Attempting to create producer (attempt ${attempts}/${maxAttempts})...`);
                
                // Add delay between attempts
                if (attempts > 1) {
                  await new Promise(resolve => setTimeout(resolve, 1000));
                }
                
                // Make sure we have video tracks
                if (videoStream && videoStream.getVideoTracks().length > 0) {
                  const videoTrack = videoStream.getVideoTracks()[0];
                  newProducer = await produceMedia(videoTrack);
                } else {
                  console.error("No video tracks available in the stream");
                  break;
                }
              } catch (produceError) {
                console.error(`Error creating producer (attempt ${attempts}/${maxAttempts}):`, produceError);
              }
            }
            
            if (newProducer) {
              console.log("Producer created successfully:", newProducer.id);
              setProducer(newProducer);
            } else {
              console.error("Failed to create producer after multiple attempts");
            }
          }
          
          // Add participant with the producer ID
          if (producer && producer.id) {
            console.warn("Adding participant to meeting with producer ID:", producer.id);
            await addParticipant(meeting.meetingId, producer.id, user.email);
          } else {
            // No producer, but still add participant for UI display
            console.warn(`producer: ${producer}No producer available - adding participant without media`);
          }
          
          console.log("Participant successfully added to meeting");
        } catch (error) {
          console.error("Error initializing transports or adding participant:", error);
        }
      }
    };

    initializeTransports();
  }, [deviceInitialized, sendTransport, recvTransport, videoStream, producer]);useEffect(() => {
    if (localVideoRef.current && videoStream) {
      console.log("Assigning video stream to local video element");
      
      // Helper function to properly initialize the video element
      const setupVideoElement = () => {
        if (!localVideoRef.current) return;
        
        // Always ensure local video is muted to prevent echo
        localVideoRef.current.muted = true;
        
        // Double-check that it's muted before playing
        localVideoRef.current.onloadedmetadata = () => {
          console.log("Local video element metadata loaded");
          if (!localVideoRef.current) return;
          
          localVideoRef.current.muted = true;
          
          // Force autoplay attributes
          localVideoRef.current.setAttribute('autoplay', 'true');
          localVideoRef.current.setAttribute('playsinline', 'true');
          
          localVideoRef.current.play()
            .then(() => {
              console.log("Local video element is playing");
            })
            .catch(error => {
              console.error("Error playing local video element:", error);
              
              // Try once more after a short delay
              setTimeout(() => {
                if (localVideoRef.current) {
                  localVideoRef.current.play()
                    .then(() => console.log("Local video replay successful"))
                    .catch(err => console.error("Second play attempt failed:", err));
                }
              }, 1000);
            });
        };
        
        // If we're replacing a stream, first remove the old one
        if (localVideoRef.current.srcObject !== videoStream) {
          console.log("Setting new local videostream:", videoStream);
          
          // Handle case where the old stream might be interfering
          if (localVideoRef.current.srcObject) {
            localVideoRef.current.srcObject = null;
            
            // Small timeout before assigning the new stream
            setTimeout(() => {
              if (localVideoRef.current) {
                localVideoRef.current.srcObject = videoStream;
                localVideoRef.current.muted = true;
                
                // If metadata is already loaded, try playing immediately
                if (localVideoRef.current.readyState >= 2) {
                  setupVideoElement();
                }
              }
            }, 100);
          } else {
            // No previous stream, just assign the new one directly
            localVideoRef.current.srcObject = videoStream;
            localVideoRef.current.muted = true;
            
            // If metadata is already loaded, try playing immediately
            if (localVideoRef.current.readyState >= 2) {
              setupVideoElement();
            }
          }
        } else {
          // Same stream, just make sure it's properly set up
          localVideoRef.current.muted = true;
          
          // Try playing if it's not already playing
          if (localVideoRef.current.paused) {
            localVideoRef.current.play()
              .catch(error => console.error("Error playing existing stream:", error));
          }
        }
      };
      
      // Set up the video element
      setupVideoElement();
    }
  }, [videoStream]);
  
  // Handle mouse movement to show/hide controls
  const handleMouseMove = () => {
    // Show controls when mouse moves
    setControlsVisible(true);
    
    // Clear previous timeout
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    
    // Hide controls after 3 seconds of inactivity
    controlsTimeoutRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, 3000);
  };
  
  // Setup mouse movement detection
  useEffect(() => {
    if (joined) {
      window.addEventListener('mousemove', handleMouseMove);
      // Initial timeout to hide controls
      controlsTimeoutRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, 3000);
    }
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [joined]);

  useEffect(() => {
    if (joined) {
      // Debug logging for participant streams
      console.log("Current participantStreams:", participantStreams);
      
      // Validate participantStreams to make sure they have valid data
      const validStreams = participantStreams.filter(ps => 
        ps && ps.producerId && ps.stream && ps.stream.getTracks && ps.stream.getTracks().length > 0
      );
      
      if (validStreams.length !== participantStreams.length) {
        console.warn(`Found ${participantStreams.length - validStreams.length} invalid streams out of ${participantStreams.length} total`);
      }
      
      // Log stream details
      validStreams.forEach(ps => {
        const tracks = ps.stream.getTracks();
        console.log(`Stream for ${ps.email}: ${tracks.length} tracks`, 
          tracks.map(t => `${t.kind} (${t.enabled ? 'enabled' : 'disabled'}, ${t.readyState})`));
      });
      
      // Log meeting participants vs streams
      if (meeting.participants) {
        const participantsWithoutStream = meeting.participants.filter(
          p => p.email !== user?.email && !participantStreams.some(s => s.email === p.email)
        );
        
        if (participantsWithoutStream.length > 0) {
          console.warn("Participants without streams:", participantsWithoutStream);
          
          // Try to recover streams for participants that don't have them
          participantsWithoutStream.forEach(async (p) => {
            if (p.producerId) {
              console.log(`Attempting to recover stream for ${p.email} with producerId ${p.producerId}`);
              try {
                const stream = await consumeMedia(p.producerId);
                if (stream && stream.getTracks().length > 0) {
                  console.log(`Successfully recovered stream for ${p.email}`);
                }
              } catch (err) {
                console.error(`Failed to recover stream for ${p.email}:`, err);
              }
            }
          });
        }
      }
    }
  }, [joined, participantStreams, meeting.participants]);
  // Media permissions are already being handled in useMediasoup hook
  useEffect(() => {
    // No need to duplicate permission handling here
    // The useMediasoup hook already handles media permissions
    console.log("Permission state:", permissionsGranted);
  }, [permissionsGranted]);

  // Add this useEffect to expose media functions globally for component access
  useEffect(() => {
    // Create a global object to store media function references
    // This allows components like ParticipantVideo to access these functions
    window.__mediaHookFunctions = {
      ensureParticipantStream,
      consumeMedia,
      produceMedia,
      addParticipant,
      removeParticipant
    };
    
    return () => {
      // Clean up global references when component unmounts
      window.__mediaHookFunctions = null;
    };
  }, [ensureParticipantStream, consumeMedia, produceMedia, addParticipant, removeParticipant]);

  // Deduplicate participant streams when they change
  useEffect(() => {
    // Only run if we have participantStreams to work with
    if (participantStreams && participantStreams.length > 1) {
      console.log("Checking for duplicate participant streams...");
      
      // Create a new deduped array without modifying original array directly
      const dedupedStreams = deduplicateStreams(participantStreams);
      
      // Only update if we actually found and removed duplicates
      if (dedupedStreams.length < participantStreams.length) {
        console.log(`Found and removed ${participantStreams.length - dedupedStreams.length} duplicate streams`);
        
        // Update the participantStreams globally by replacing them with deduped version
        // We'll use a timeout to avoid immediate state conflicts
        setTimeout(() => {
          if (window.__mediaHookFunctions) {
            // Use reference to the setter function exposed in global context
            // This avoids import cycles while still allowing access
            window.__mediaHookFunctions.setParticipantStreams(dedupedStreams);
          }
        }, 500);
      }
    }
  }, [participantStreams]);

  if (!permissionsGranted) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-screen bg-gradient-to-b from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900">
        <div className="w-full max-w-md p-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg text-center">
          <svg className="w-20 h-20 mx-auto text-yellow-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-4">Camera & Microphone Access Required</h1>
          <p className="text-lg text-gray-700 dark:text-gray-300 mt-4">Please allow access to your camera and microphone to join the meeting.</p>
        </div>
      </div>
    );
  }  return (
    <div className="flex flex-col w-full h-screen bg-gray-100 dark:bg-gray-900">      {/* Floating Header - only visible when controls are visible */}
      <header className={`absolute top-0 left-0 right-0 z-20 bg-black bg-opacity-60 py-2 px-4 transition-opacity duration-300 ${controlsVisible ? 'opacity-100' : 'opacity-0'}`}>
        <div className="w-full mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <svg className="w-6 h-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <h1 className="font-bold text-lg text-white">QuickMeet</h1>
          </div>
          
          <div className="flex items-center">
            <div className="text-right">
              <p className="text-sm font-medium text-white">Meeting ID: <span className="text-blue-300">{meeting.meetingId}</span></p>
              <p className="text-xs text-gray-300">Host: {meeting.host.email}</p>
            </div>
          </div>
        </div>
      </header>{/* Main content */}      {/* Add state variables for pagination */}      <div className="flex flex-1 overflow-hidden">
        {/* Full-screen video container */}
        <div className="relative w-full h-full">
          {/* Video grid */}
          <div className="absolute inset-0 bg-gray-900">
            {joined ? (              <div className="h-full">                  <VideoGrid 
                  participantStreams={memoizedParticipantStreams} 
                  localStream={videoStream} 
                  producer={producer}
                  videoEnabled={videoEnabled}
                />
                {participantStreams.length === 0 ? (
                  <div className="flex items-center justify-center h-full bg-gray-900 rounded-lg">
                    <p className="text-gray-400">Waiting for participants to join...</p>
                  </div>
                ) : (
                  <div className="absolute top-2 left-2 z-20 bg-black bg-opacity-70 text-white p-2 rounded">
                    <div className="mb-1">
                      {meeting.participants.length} participants | {participantStreams.length} video streams
                    </div>
                    <div className="text-xs max-h-20 overflow-y-auto">
                      {meeting.participants.map((p, i) => (
                        <div key={i} className="text-xs">
                          {p.displayName || p.email} {p.email === user?.email ? "(You)" : ""}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <svg className="w-16 h-16 mx-auto text-gray-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
                  </svg>
                  <p className="text-xl text-gray-300">No participants yet</p>
                  <p className="text-sm text-gray-500 mt-2">When others join, they'll appear here</p>
                </div>
              </div>
            )}
          </div>
          
          {/* Live Captions Overlay */}
          {joined && <CaptionsOverlay meetingId={meeting.meetingId} enabled={showCaptions} />}
          
          {/* Floating Controls */}
          {joined && (
            <div 
              className={`absolute bottom-8 left-1/2 transform -translate-x-1/2 flex items-center justify-center space-x-4 py-4 px-6 rounded-full bg-black bg-opacity-70 transition-opacity duration-300 ${controlsVisible ? 'opacity-100' : 'opacity-0'}`}
            >
              <button
                onClick={toggleVideo}
                className={`flex items-center justify-center w-12 h-12 rounded-full ${videoEnabled ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-500 hover:bg-red-600'} text-white transition-colors shadow`}
                title={videoEnabled ? "Turn off camera" : "Turn on camera"}
              >
                {videoEnabled ? (
                  <svg className="w-6 h-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                )}
              </button>
              
              <button
                onClick={toggleAudio}
                className={`flex items-center justify-center w-12 h-12 rounded-full ${audioEnabled ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-500 hover:bg-red-600'} text-white transition-colors shadow`}
                title={audioEnabled ? "Mute microphone" : "Unmute microphone"}
              >
                {audioEnabled ? (
                  <svg className="w-6 h-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clipRule="evenodd" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                )}
              </button>
                <button
                onClick={() => setShowCaptions(!showCaptions)}
                className={`flex items-center justify-center w-12 h-12 rounded-full ${showCaptions ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'} text-white transition-colors shadow`}
                title={showCaptions ? "Turn off captions" : "Turn on captions"}
              >
                <svg className="w-6 h-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </button>

              <button
                onClick={() => setShowParticipants(!showParticipants)}
                className={`flex items-center justify-center w-12 h-12 rounded-full ${showParticipants ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'} text-white transition-colors shadow`}
                title={showParticipants ? "Hide participants" : "Show participants"}
              >
                <svg className="w-6 h-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </button>
              
              <button
                onClick={leaveMeeting}
                className="flex items-center justify-center px-6 py-2 rounded-full bg-red-500 hover:bg-red-600 text-white transition-colors shadow"
                title="End call"
              >
                End
              </button>
            </div>
          )}
            {/* Join screen with video/audio preview (when not joined) */}
          {!joined && (
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-gray-800 bg-opacity-90 rounded-xl shadow-lg p-6 text-center">
              <h2 className="text-2xl font-bold text-white mb-4">Ready to join?</h2>
              
              {/* Video preview */}
              <div className="w-full aspect-video bg-black rounded-lg mb-6 overflow-hidden">
                <video 
                  ref={localVideoRef}
                  autoPlay 
                  playsInline 
                  muted 
                  className="w-full h-full object-cover"
                />
              </div>
              
              {/* Controls for preview */}
              <div className="flex justify-center space-x-4 mb-6">
                <button
                  onClick={toggleVideo}
                  className={`flex items-center justify-center w-12 h-12 rounded-full ${videoEnabled ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-500 hover:bg-red-600'} text-white transition-colors shadow`}
                  title={videoEnabled ? "Turn off camera" : "Turn on camera"}
                >
                  {videoEnabled ? (
                    <svg className="w-6 h-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                  )}
                </button>
                
                <button
                  onClick={toggleAudio}
                  className={`flex items-center justify-center w-12 h-12 rounded-full ${audioEnabled ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-500 hover:bg-red-600'} text-white transition-colors shadow`}
                  title={audioEnabled ? "Mute microphone" : "Unmute microphone"}
                >
                  {audioEnabled ? (
                    <svg className="w-6 h-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clipRule="evenodd" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                    </svg>
                  )}
                </button>
              </div>
              
              {/* Meeting details */}
              <div className="mb-6 text-gray-300">
                <p>Meeting ID: <span className="text-blue-300 font-medium">{meeting.meetingId}</span></p>
                <p>Host: {meeting.host.email}</p>
              </div>
              
              {/* Join button */}
              <button
                onClick={joinMeeting}
                className="flex items-center justify-center px-8 py-3 w-full rounded-full bg-green-500 hover:bg-green-600 text-white transition-colors shadow-lg text-lg font-medium"
              >
                Join Now
              </button>
            </div>
          )}      {/* Floating participants panel */}
          {joined && showParticipants && (
            <div className="absolute top-12 right-4 w-72 bg-black bg-opacity-80 rounded-lg shadow-lg overflow-hidden z-30 transition-all">
              <div className="flex items-center justify-between p-3 border-b border-gray-700">
                <h3 className="font-semibold text-white">
                  Participants ({meeting.participants ? meeting.participants.length : 0})
                </h3>
                <button onClick={() => setShowParticipants(false)} className="text-gray-300 hover:text-white">
                  <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="max-h-96 overflow-y-auto p-3">
                {/* Current User - You (always shown first) */}
                <div className="mb-4">                  <div className="flex items-center space-x-3 p-2 bg-gray-800 bg-opacity-50 rounded-md">
                    <div className="relative">
                      <ProfileImage
                        src={user.photoURL}
                        alt="You"
                        name={user.displayName || user.email}
                        size={32}
                        className="w-8 h-8 rounded-full"
                        backgroundColor="3b82f6"
                      />
                      <div className="absolute bottom-0 right-0 w-2 h-2 bg-green-500 rounded-full border-2 border-gray-800"></div>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{user.displayName || user.email} (You)</p>
                      <p className="text-xs text-gray-300">{user.email === meeting.host.email ? 'Host' : 'Participant'}</p>
                    </div>
                  </div>
                </div>

                {/* Remote participants - Other participants (not you) */}
                {meeting.participants && meeting.participants.filter(p => p.email !== user.email).map((participant, index) => (                  <div key={index} className="flex items-center space-x-3 p-2 hover:bg-gray-800 hover:bg-opacity-50 rounded-md mb-1">
                    <div className="relative">
                      <ProfileImage
                        src={participant.photoURL}
                        alt={participant.displayName || participant.email}
                        name={participant.displayName || participant.email}
                        size={32}
                        className="w-8 h-8 rounded-full"
                        backgroundColor="6366f1"
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">
                        {participant.displayName || participant.email}
                      </p>
                      <p className="text-xs text-gray-300">
                        {participant.email === meeting.host.email ? 'Host' : 'Participant'}
                      </p>
                    </div>
                  </div>
                ))}
                
                {(!meeting.participants || meeting.participants.filter(p => p.email !== user.email).length === 0) && (
                  <p className="text-center text-gray-400 py-4">No other participants</p>
                )}
              </div>
            </div>          )}
        </div>
      </div>
      {/* No separate mobile view - the responsive design with floating controls works on all devices */}
    </div>
  );
}