import React, { useState, useEffect, memo, useRef } from 'react';
import { useSelector } from 'react-redux';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';

// ParticipantVideo component from MeetingRoom extracted and can be reused
const ParticipantVideo = memo(({ producerId, stream, isCurrentUser, email, displayName, isPlaceholder, videoEnabled = true }) => {
  const videoRef = React.useRef(null);
  // Add isPlaying ref to track video state without re-renders
  const isPlayingRef = React.useRef(false);
  // Add stream ref to compare when stream actually changes
  const streamRef = React.useRef(null);
  const producer = useSelector(state => state.meeting?.producer);
  const user = useSelector(state => state.auth.user);
  const meeting = useSelector(state => state.meeting?.meeting);
  const [retryCount, setRetryCount] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [lastActivity, setLastActivity] = useState(Date.now());
  
  // Check if this is the current user's producer
  const isSelf = isCurrentUser || producerId === producer?.id;
  // User display information
  const userName = isSelf ? 
    (user?.displayName || user?.email || 'You') : 
    (displayName || email || producerId?.substring(0, 8) || 'Unknown');
    
  // Function to retry connection for this participant
  const retryConnection = async () => {
    if (!producerId || !email) return;
    
    try {
      setRetryCount(prev => prev + 1);
      console.log(`Manually retrying connection for ${email}, attempt ${retryCount + 1}`);
      
      // Find and use the ensureParticipantStream function from parent context
      const mediaHookFn = window.__mediaHookFunctions;
      if (mediaHookFn?.ensureParticipantStream) {
        const participant = { email, producerId, displayName };
        await mediaHookFn.ensureParticipantStream(participant, 2);
      } else {
        console.error("ensureParticipantStream function not available");
      }
    } catch (err) {
      console.error(`Error retrying connection for ${email}:`, err);
    }
  };
  
  // Track stream state for UI feedback
  const [streamState, setStreamState] = useState({
    hasStream: !!stream && !isPlaceholder,
    hasVideo: false,
    isLoading: !!stream && !isPlaceholder,
    error: null
  });  
  useEffect(() => {
    const setupVideo = async () => {
      // Handle case where we have a placeholder or no stream
      if (!stream || isPlaceholder) {
        console.log(`Participant ${userName} has no stream or is a placeholder`);
        setStreamState(prev => ({
          ...prev,
          hasStream: false,
          isLoading: false
        }));
        return;
      }
      
      // Set hasStream to true immediately once we have a valid stream
      if (!streamState.hasStream) {
        setStreamState(prev => ({
          ...prev,
          hasStream: true,
          isLoading: true
        }));
      }
      
      // Check if the stream reference is actually different from what we had before
      if (stream === streamRef.current && isPlayingRef.current) {
        // Same stream reference and already playing, no need to do anything
        console.log(`Same stream reference for ${userName} and already playing, skipping setup`);
        return;
      }
      
      // Store the new stream reference
      streamRef.current = stream;
      isPlayingRef.current = false; // Reset playing state for new stream
      
      // Update state to reflect we have a stream
      setStreamState(prev => ({
        ...prev,
        hasStream: true,
        isLoading: true
      }));
      
      if (videoRef.current && stream) {
        console.log(`Setting up video for ${userName}, isSelf=${isSelf}`);
        
        try {
          // Only set srcObject when stream has actually changed
          const streamChanged = videoRef.current.srcObject !== stream;
          if (streamChanged) {
            console.log(`Stream for ${userName} has changed, updating video element`);
            
            // Check if the stream has tracks
            const tracks = stream.getTracks();
            console.log(`Stream for ${userName} has ${tracks.length} tracks:`, 
              tracks.map(t => `${t.kind} (${t.enabled ? 'enabled' : 'disabled'}, state: ${t.readyState})`));
            
            if (tracks.length === 0) {
              console.error(`No tracks in stream for ${userName}`);
              setStreamState(prev => ({
                ...prev,
                hasVideo: false,
                isLoading: false,
                error: 'No video tracks available'
              }));
              return;
            }
            
            // Setup track event listeners for better diagnostics
            tracks.forEach(track => {
              track.onended = () => console.warn(`Track ${track.kind} for ${userName} has ended`);
              track.onmute = () => {
                console.warn(`Track ${track.kind} for ${userName} was muted`);                // Automatic recovery for muted tracks - optimized for instant response
                setTimeout(() => {
                  if (track && !track.enabled) {
                    console.log(`Auto-recovery: Re-enabling muted track for ${userName}`);
                    track.enabled = true;
                    
                    // Force video element reload if this is a video track
                    if (track.kind === 'video' && videoRef.current) {
                      console.log(`Refreshing video element for ${userName} after track mute`);
                      const currentStream = videoRef.current.srcObject;
                      videoRef.current.srcObject = null;
                      
                      // Immediate reattach for faster recovery
                      requestAnimationFrame(() => {
                        if (videoRef.current) {
                          videoRef.current.srcObject = currentStream;
                          videoRef.current.play().catch(err => 
                            console.error(`Error restarting video after mute for ${userName}:`, err)
                          );
                        }
                      });
                    }
                  }
                }, 50);
              };
              track.onunmute = () => console.log(`Track ${track.kind} for ${userName} was unmuted`);
            });
              // Ensure video track is enabled and active (but respect remote user's choices)
            const videoTrack = tracks.find(t => t.kind === 'video');
            if (videoTrack) {
              // Only force-enable video tracks for our own stream, not remote participants
              if (!videoTrack.enabled && isSelf && videoEnabled) {
                console.log(`Enabling video track for ${userName} (self stream)`);
                videoTrack.enabled = true;
              }
              
              if (videoTrack.readyState === 'ended') {
                console.error(`Video track for ${userName} is in 'ended' state`);
                setStreamState(prev => ({
                  ...prev,
                  hasVideo: false,
                  isLoading: false,
                  error: 'Video track ended'
                }));
                return; // Don't proceed with a dead track
              }
            } else {
              console.error(`No video track found for ${userName}`);
              setStreamState(prev => ({
                ...prev,
                hasVideo: false,
                isLoading: false,
                error: 'No video track found'
              }));
              // Continue anyway, as we might have just audio
            }
                // Clean up any existing srcObject
          if (videoRef.current.srcObject) {
            videoRef.current.srcObject = null;
          }
            // Immediate stream setup for faster video initialization
          requestAnimationFrame(() => {
            if (!videoRef.current) return;
            
            // Set the stream - critical for video display
            videoRef.current.srcObject = stream;
            
            // Always mute our own audio to prevent echo
            videoRef.current.muted = isSelf;
            
            // Force browser to recognize autoplay attributes
            videoRef.current.setAttribute('autoplay', 'true');
            videoRef.current.setAttribute('playsinline', 'true');
          });
            
            // Wait for metadata to load then play with retry logic
            videoRef.current.onloadedmetadata = async () => {
              console.log(`Video metadata loaded for ${userName}`);
              
              // Ensure muted state is correct
              videoRef.current.muted = isSelf;
              
              // Try to play the video with multiple retries
              let attempts = 0;
              const maxAttempts = 3;              const attemptPlay = async () => {
                // Skip play if already playing to avoid unnecessary attempts
                if (isPlayingRef.current) {
                  console.log(`Video for ${userName} is already playing, skipping play attempt`);
                  setStreamState(prev => ({
                    ...prev,
                    hasVideo: true,
                    isLoading: false
                  }));
                  return;
                }
                
                try {
                  attempts++;
                  
                  // Force muted for self-stream to avoid audio feedback
                  if (isSelf) {
                    videoRef.current.muted = true;
                  }                  // For Chrome and Safari, we need to check readyState
                  if (videoRef.current.readyState < 2) { // HAVE_CURRENT_DATA (2) or higher needed
                    console.log(`Video element not fully ready yet for ${userName}, waiting...`);
                    // Minimal wait for more data - optimized for faster response
                    await new Promise(resolve => setTimeout(resolve, 50));
                  }

                  await videoRef.current.play();
                  console.log(`Video playing for ${userName} (attempt ${attempts})`);
                  isPlayingRef.current = true; // Mark as playing
                  setStreamState(prev => ({
                    ...prev,
                    hasVideo: true,
                    isLoading: false
                  }));
                } catch (err) {                  console.error(`Error playing video for ${userName} (attempt ${attempts}):`, err);
                  if (attempts < maxAttempts) {
                    console.log(`Retrying play for ${userName} immediately...`);
                    // Immediate retry for faster response
                    requestAnimationFrame(attemptPlay);
                  } else {
                    console.error(`Failed to play video for ${userName} after ${maxAttempts} attempts`);
                    isPlayingRef.current = false; // Reset playing state
                      // If this is the local stream (host alone), let's try one more desperate attempt
                    if (isSelf) {
                      console.log("This is the local stream - attempting emergency recovery");
                      // Immediate emergency recovery for faster response
                      requestAnimationFrame(() => {
                        if (videoRef.current) {
                          videoRef.current.srcObject = null;
                          requestAnimationFrame(() => {
                            if (videoRef.current && stream) {
                              videoRef.current.srcObject = stream;
                              videoRef.current.muted = true; // Ensure muted
                              videoRef.current.play()
                                .then(() => {
                                  isPlayingRef.current = true;
                                  setStreamState(prev => ({
                                    ...prev,
                                    hasVideo: true,
                                    isLoading: false
                                  }));
                                })
                                .catch(finalErr => {
                                  console.error("Final play attempt failed:", finalErr);
                                  setStreamState(prev => ({
                                    ...prev,
                                    hasVideo: false,
                                    isLoading: false,
                                    error: 'Failed to play video'
                                  }));
                                });
                            }
                          }, 300);
                        }
                      }, 1000);
                    } else {
                      setStreamState(prev => ({
                        ...prev,
                        hasVideo: false,
                        isLoading: false,
                        error: 'Failed to play video'
                      }));
                    }
                  }
                }
              };
              
              // Start the first play attempt
              attemptPlay();
            };
            
            // Handle errors
            videoRef.current.onerror = (error) => {
              console.error(`Video element error for ${userName}:`, error);
              setStreamState(prev => ({
                ...prev,
                hasVideo: false,
                isLoading: false,
                error: 'Video playback error'
              }));
            };
          }
        } catch (err) {
          console.error(`Error setting up video for ${userName}:`, err);
          setStreamState(prev => ({
            ...prev,
            hasVideo: false,
            isLoading: false,
            error: err.message
          }));
        }
      }
    };

    setupVideo();
    
    // Add a more aggressive video recovery check
    const checkVideoInterval = setInterval(() => {
      if (videoRef.current && stream) {
        // First check if the video element has a stream attached
        if (!videoRef.current.srcObject) {
          console.warn(`${userName}'s video element has no srcObject, re-attaching stream...`);
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(err => console.error(`Failed to play video after reattaching:`, err));
          return;
        }
        
        // Check if there are tracks in the stream
        const tracks = videoRef.current.srcObject.getTracks();
        if (tracks.length === 0) {
          console.warn(`${userName}'s stream has no tracks, attempting to recover...`);
            // Re-initialize with the original stream
          videoRef.current.srcObject = null;
          // Immediate recovery for faster response
          requestAnimationFrame(() => {
            if (videoRef.current) {
              console.log(`Re-attaching stream for ${userName}`);
              videoRef.current.srcObject = stream;
              videoRef.current.play().catch(err => console.error(`Failed to play video after recovery:`, err));
            }
          });
          return;
        }
          // Check video track health specifically
        const videoTrack = videoRef.current.srcObject.getVideoTracks()[0];
        if (videoTrack) {
          console.log(`${userName} video track stats - enabled: ${videoTrack.enabled}, readyState: ${videoTrack.readyState}, muted: ${videoTrack.muted}`);
          
          // If video track is not enabled or ended, try to fix it (but respect user's video disable choice)
          if (!videoTrack.enabled || videoTrack.readyState === 'ended') {
            // Only try to re-enable if this is our own video and the user has video enabled
            if (isSelf && videoEnabled && !videoTrack.enabled) {
              console.log(`Attempting to re-enable video for ${userName} (user has video enabled)...`);
              videoTrack.enabled = true;
            } else if (!videoEnabled && isSelf) {
              console.log(`Video disabled by user for ${userName}, skipping re-enable`);
            } else if (!isSelf) {
              console.log(`Remote participant ${userName} has disabled video, respecting their choice`);
            }
            
            // If the track is ended, we need more drastic measures
            if (videoTrack.readyState === 'ended') {
              console.log(`Video track for ${userName} is in 'ended' state, attempting recovery...`);
                // Re-initialize the video element with the original stream
              videoRef.current.srcObject = null;
              // Immediate recovery for ended tracks
              requestAnimationFrame(() => {
                if (videoRef.current) {
                  videoRef.current.srcObject = stream;
                  videoRef.current.play().catch(err => console.error(`Failed to recover ended track:`, err));
                }
              });
            }
          }
          
          // Check if video freezes by monitoring timestamp
          if (typeof videoRef.current._lastTimeCheck === 'undefined') {
            videoRef.current._lastTimeCheck = Date.now();
            videoRef.current._lastCurrentTime = videoRef.current.currentTime || 0;
          } else {
            const now = Date.now();
            const currentTime = videoRef.current.currentTime || 0;
            
            // If video hasn't advanced in 2 seconds but should be playing, it might be frozen
            if (now - videoRef.current._lastTimeCheck > 2000 && 
                currentTime === videoRef.current._lastCurrentTime && 
                !videoRef.current.paused) {
              console.warn(`Video appears frozen for ${userName}, attempting refresh`);
                // Re-initialize the video element
              videoRef.current.srcObject = null;
              // Immediate recovery for frozen video
              requestAnimationFrame(() => {
                if (videoRef.current) {
                  videoRef.current.srcObject = stream;
                  videoRef.current.play().catch(err => console.error(`Failed to unfreeze video:`, err));
                }
              });
            }
            
            // Update check values
            videoRef.current._lastTimeCheck = now;
            videoRef.current._lastCurrentTime = currentTime;
          }
        }
      }
    }, 2000); // Check every 2 seconds - optimized for faster response
    
    return () => {
      clearInterval(checkVideoInterval);
      // Clean up video element and disconnect any stream when component unmounts
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject = null;
      }
    };
  }, [stream, userName, isSelf, isPlaceholder, videoEnabled]);  // Determine when to show avatar circle vs video
  // Show avatar when: no stream, placeholder, or camera disabled for self
  const showAvatarCircle = !stream || isPlaceholder || (isSelf && !videoEnabled);
  
  // Debug logging for video display
  console.log(`ParticipantVideo ${userName}: showAvatarCircle=${showAvatarCircle}, stream=${!!stream}, isPlaceholder=${isPlaceholder}, isSelf=${isSelf}, videoEnabled=${videoEnabled}`);
  
  return (
    <div className={`relative h-full rounded-lg overflow-hidden shadow-md ${isSelf ? 'bg-gray-900' : 'bg-gray-800'}`}>
      {showAvatarCircle ? (
        // Enhanced placeholder for participants without video streams
        <div className="w-full h-full flex items-center justify-center bg-gray-700">
          <div className="bg-blue-500 rounded-full w-20 h-20 flex items-center justify-center text-white text-2xl font-bold">
            {userName?.charAt(0)?.toUpperCase() || '?'}
          </div>          <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded-md">
            {userName}{isSelf ? " (You)" : ""} 
            {isSelf && !videoEnabled ? (
              <span className="text-blue-300"> (Camera disabled)</span>
            ) : streamState.isLoading && !streamState.hasStream ? (
              <span className="text-yellow-300"> (Connecting...)</span>
            ) : streamState.error ? (
              <span className="text-red-300"> (Connection failed)</span>
            ) : (
              <span className="text-gray-300"> (No video)</span>
            )}
          </div>
          
          {/* Show a troubleshooting button when video fails */}
          <div className="absolute top-2 right-2 bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1 rounded-md cursor-pointer"
               onClick={() => {
                 if (isSelf && videoRef.current && stream) {
                   // For local video, just reset the video element
                   videoRef.current.srcObject = null;
                   setTimeout(() => {
                     if (videoRef.current && stream) {
                       videoRef.current.srcObject = stream;
                       videoRef.current.muted = true;
                       videoRef.current.play()
                         .then(() => {
                           isPlayingRef.current = true;
                           setStreamState(prev => ({ ...prev, hasVideo: true, isLoading: false }));
                         })
                         .catch(err => console.error("Retry failed:", err));
                     }
                   }, 300);
                 } else {
                   // For remote participants, try to re-establish the connection
                   retryConnection();
                 }
               }}>
            Retry Video
          </div>
        </div>      ) : (
        // Normal video display
        <>
          <video
            key={isSelf ? 'self-video' : producerId}
            ref={videoRef}
            autoPlay
            playsInline
            muted={isSelf}
            className={`w-full h-full ${isSelf ? 'object-contain md:object-cover' : 'object-cover'}`}
            onLoadedMetadata={() => {
              console.log(`Video metadata loaded for ${userName}, stream tracks:`, stream?.getTracks().length);
              // Ensure video plays when metadata is loaded
              if (videoRef.current && videoRef.current.paused) {
                videoRef.current.play().catch(err => 
                  console.log(`Auto-play failed for ${userName}:`, err.message)
                );
              }
            }}
          />
          <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded-md">
            {userName}{isSelf ? " (You)" : ""}
          </div>
        </>
      )}
    </div>
  );
});

// Create a placeholder component for participants who don't have streams
const ParticipantPlaceholder = ({ email, displayName, isCurrentUser }) => {
  const user = useSelector(state => state.auth.user);
  
  // User display information - handle current user case
  const userName = isCurrentUser ? 
    (user?.displayName || user?.email || 'You') : 
    (displayName || email || 'Participant');
  
  return (
    <div className="relative h-full rounded-lg overflow-hidden shadow-md bg-gray-800 flex items-center justify-center">
      <div className="w-24 h-24 rounded-full bg-gray-700 flex items-center justify-center text-2xl font-bold text-white">
        {userName.charAt(0).toUpperCase()}
      </div>
      <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded-md">
        {userName}{isCurrentUser ? " (You)" : ""} (No video)
      </div>
    </div>
  );
};

const VideoGrid = memo(({ participantStreams = [], localStream, producer, videoEnabled = true }) => {
  // Removed console.log that was causing re-renders
  // Using useRef for current page to avoid re-renders when changing pages
  const currentPageRef = useRef(0);
  const [currentPage, setCurrentPage] = useState(0);
  const participantsPerPage = 4; // Show 4 participants at a time in the main view
  const user = useSelector(state => state.auth.user);
  const meeting = useSelector(state => state.meeting.meeting);
  const [reconnectingParticipants, setReconnectingParticipants] = useState({});
  
  // Calculate which participants to show on the current page
  const startIndex = currentPage * participantsPerPage;
  const remoteParticipants = participantStreams.filter(ps => ps.email !== user?.email);
  const pageCount = Math.ceil(remoteParticipants.length / participantsPerPage);
  const hasMultiplePages = pageCount > 1;
  
  // Get participants for the current page
  const currentParticipants = remoteParticipants.slice(startIndex, startIndex + participantsPerPage);
  
  // Add all participants that are in meeting.participants but not in participantStreams
  // This ensures we show placeholders for participants who haven't established media yet
  useEffect(() => {
    if (meeting?.participants && meeting.participants.length > 0) {
      // Find participants who are in meeting.participants but not in participantStreams
      const missingParticipants = meeting.participants.filter(
        p => p.email !== user?.email && !participantStreams.some(ps => ps.email === p.email)
      );
      
      if (missingParticipants.length > 0) {
        console.log("Found participants without streams:", missingParticipants.length);
        
        // For each missing participant, create a placeholder with their data
        missingParticipants.forEach(p => {
          if (!reconnectingParticipants[p.email]) {
            console.log(`Adding placeholder for ${p.email}`);
            setReconnectingParticipants(prev => ({
              ...prev,
              [p.email]: { 
                isReconnecting: true,
                lastAttempt: Date.now() 
              }
            }));
          }
        });
      }
    }
  }, [meeting?.participants, participantStreams, user?.email]);
  
  // Navigation handlers - use the ref to avoid unnecessary re-renders
  const goToNextPage = () => {
    currentPageRef.current = (currentPageRef.current + 1) % pageCount;
    setCurrentPage(currentPageRef.current);
  };
  
  const goToPrevPage = () => {
    currentPageRef.current = (currentPageRef.current - 1 + pageCount) % pageCount;
    setCurrentPage(currentPageRef.current);
  };
  
  // Calculate grid columns based on participant count
  const getGridCols = (count) => {
    if (count <= 1) return 'grid-cols-1';
    if (count <= 2) return 'grid-cols-2';
    if (count <= 4) return 'grid-cols-2';
    return 'grid-cols-3'; // Future expansion if needed
  };
  
  // Calculate grid rows based on participant count
  const getGridRows = (count) => {
    if (count <= 3) return 'grid-rows-1';
    return 'grid-rows-2'; // 2 rows for 4 participants
  };
  
  return (
    <div className="h-full w-full">
      {/* Main participants grid - larger area for participant videos */}
      <div className="relative h-full w-full">
        {(remoteParticipants.length > 0 || (meeting?.participants?.length > 0 && meeting.participants.some(p => p.email !== user?.email))) ? (
          <>
            <div className={`grid ${getGridCols(currentParticipants.length)} ${getGridRows(currentParticipants.length)} gap-2 h-full`}>
              {/* First, render participants with streams */}              {currentParticipants.map((participant) => (
                <ParticipantVideo
                  key={participant.producerId || participant.email}
                  producerId={participant.producerId}
                  stream={participant.stream}
                  isCurrentUser={false}
                  email={participant.email}
                  displayName={participant.displayName}
                  isPlaceholder={!participant.stream || participant.isPlaceholder}
                  videoEnabled={videoEnabled}
                />
              ))}
              
              {/* Then, render participants from meeting.participants who don't have streams */}              {meeting?.participants && meeting.participants
                .filter(p => p.email !== user?.email && !participantStreams.some(ps => ps.email === p.email))
                .slice(0, Math.max(0, participantsPerPage - currentParticipants.length)) // Only show enough to fill the grid
                .map((participant) => (
                  <ParticipantVideo
                    key={`placeholder-${participant.email}`}
                    producerId={participant.producerId || `placeholder-${participant.email}`}
                    stream={null}
                    isCurrentUser={false}
                    email={participant.email}
                    displayName={participant.displayName}
                    isPlaceholder={true}
                    videoEnabled={videoEnabled}
                  />
                ))
              }
            </div>
            
            {/* Navigation controls for multiple pages */}
            {hasMultiplePages && (
              <div className="absolute bottom-2 right-2 flex space-x-2">
                <button
                  onClick={goToPrevPage}
                  className="bg-gray-700 hover:bg-gray-600 text-white p-2 rounded-full"
                >
                  <FaChevronLeft />
                </button>
                <div className="bg-gray-700 text-white px-3 py-2 rounded-full text-xs">
                  {currentPage + 1} / {pageCount}
                </div>
                <button
                  onClick={goToNextPage}
                  className="bg-gray-700 hover:bg-gray-600 text-white p-2 rounded-full"
                >
                  <FaChevronRight />
                </button>
              </div>
            )}
          </>        ) : (
          // Show local video in full screen if no remote participants
          <div className="w-full h-full">
            {localStream ? (
              <div className="h-full w-full relative">                <ParticipantVideo
                  stream={localStream}
                  isCurrentUser={true}
                  email={user?.email}
                  displayName={user?.displayName || user?.email || 'You'}
                  key="local-video-solo" // Add a stable key to ensure proper mounting
                  producerId={producer?.id} // Make sure to pass the producer ID
                  videoEnabled={videoEnabled}
                />
                
                {/* Debug info overlay for troubleshooting - smaller and less intrusive */}
                <div className="absolute top-2 right-2 bg-black bg-opacity-70 text-white p-1 rounded text-xs opacity-50 hover:opacity-100 transition-opacity">
                  <p>Stream: Active</p>
                </div>
              </div>
            ) : (
              <div className="bg-gray-800 rounded p-4 text-center text-white">
                No stream available. Please check your camera permissions.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Local user video - smaller overlay */}
      {((remoteParticipants.length > 0 || (meeting?.participants?.length > 0 && meeting.participants.some(p => p.email !== user?.email))) && localStream) && (        <div className="absolute bottom-4 right-4 w-48 h-36 shadow-lg rounded-lg overflow-hidden border-2 border-blue-500">
          <ParticipantVideo
            stream={localStream}
            isCurrentUser={true}
            email={user?.email}
            displayName={user?.displayName}
            videoEnabled={videoEnabled}
          />
        </div>
      )}
    </div>
  );

}, 
(prevProps, nextProps) => {
  // Custom comparison function that checks for actual changes
  // Return true if props are equal (no re-render needed)
  if (prevProps.localStream !== nextProps.localStream) return false;
  if (prevProps.producer?.id !== nextProps.producer?.id) return false;
  if (prevProps.videoEnabled !== nextProps.videoEnabled) return false;
  
  // Deep compare participant streams (just the essential props)
  if (prevProps.participantStreams.length !== nextProps.participantStreams.length) return false;
  
  // Skip deep comparison completely if the arrays have the same reference
  if (prevProps.participantStreams === nextProps.participantStreams) return true;
  
  // Compare each stream by reference - only trigger re-render if actual streams changed
  const streamsChanged = prevProps.participantStreams.some((prevStream, index) => {
    const nextStream = nextProps.participantStreams[index];
    // Short-circuit if references are identical
    if (prevStream === nextStream) return false;
    
    return prevStream.stream !== nextStream.stream || 
           prevStream.producerId !== nextStream.producerId ||
           prevStream.email !== nextStream.email ||
           prevStream.displayName !== nextStream.displayName;
  });
  
  return !streamsChanged; // Return true if nothing changed (no re-render)
});

export default VideoGrid;
