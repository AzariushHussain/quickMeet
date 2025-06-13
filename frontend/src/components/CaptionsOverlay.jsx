import React, { useEffect } from 'react';
import { useSelector } from 'react-redux';
import useSpeechToText from '../hooks/useSpeechToText';

const CaptionsOverlay = ({ meetingId, enabled }) => {
  const { 
    isListening, 
    transcript: currentTranscript,
    startListening,
    stopListening
  } = useSpeechToText(meetingId);
  
  // Recent transcript entries
  const transcriptEntries = useSelector(state => state.meeting.transcript);
  const recentEntries = transcriptEntries.slice(-3).reverse();

  // Start/stop speech recognition based on enabled prop
  useEffect(() => {
    if (enabled && !isListening) {
      startListening();
    } else if (!enabled && isListening) {
      stopListening();
    }
    
    return () => {
      if (isListening) {
        stopListening();
      }
    };
  }, [enabled, isListening, startListening, stopListening]);

  // Don't render if captions are disabled
  if (!enabled) return null;

  return (
    <div className="absolute left-0 right-0 bottom-32 flex justify-center pointer-events-none">
      <div className="max-w-3xl w-full px-4">
        <div className="bg-black bg-opacity-60 rounded-lg p-3 text-center">
          {isListening && currentTranscript ? (
            <p className="text-white font-medium text-lg">
              {currentTranscript}
            </p>
          ) : recentEntries.length > 0 ? (
            <div className="space-y-2">
              {recentEntries.map((item, index) => (
                <div key={index}>
                  <span className="text-gray-300 font-medium mr-2">{item.userName}:</span>
                  <span className="text-white">{item.text}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-300 italic">Captions will appear here...</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default CaptionsOverlay;
