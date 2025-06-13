import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import useSpeechToText from '../hooks/useSpeechToText';

const TranscriptPanel = ({ meetingId }) => {
  const [activeTab, setActiveTab] = useState('transcript');
  const transcript = useSelector(state => state.meeting.transcript);
  const { 
    isListening, 
    toggleListening, 
    transcript: currentTranscript, 
    error 
  } = useSpeechToText(meetingId);

  return (
    <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg overflow-hidden flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b dark:border-gray-700">
        <button 
          onClick={() => setActiveTab('transcript')}
          className={`py-3 px-6 font-medium text-sm ${
            activeTab === 'transcript' 
              ? 'border-b-2 border-primary text-primary dark:border-primary-dark dark:text-primary-dark' 
              : 'text-gray-600 dark:text-gray-400'
          }`}
        >
          Live Transcript
        </button>
        <button 
          onClick={() => setActiveTab('summary')}
          className={`py-3 px-6 font-medium text-sm ${
            activeTab === 'summary' 
              ? 'border-b-2 border-primary text-primary dark:border-primary-dark dark:text-primary-dark' 
              : 'text-gray-600 dark:text-gray-400'
          }`}
        >
          Summary
        </button>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'transcript' && (
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Live Transcript</h3>
              <button 
                onClick={toggleListening}
                className={`flex items-center px-3 py-2 rounded-full ${
                  isListening 
                    ? 'bg-red-500 hover:bg-red-600' 
                    : 'bg-green-500 hover:bg-green-600'
                } text-white transition-colors`}
              >
                {isListening ? (
                  <>
                    <svg className="w-4 h-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                    </svg>
                    Stop Listening
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                    Start Listening
                  </>
                )}
              </button>
            </div>
            
            {error && (
              <div className="bg-red-100 dark:bg-red-900 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 px-4 py-2 rounded-md mb-4">
                {error}
              </div>
            )}
            
            {isListening && currentTranscript && (
              <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-3 rounded-md mb-4 italic">
                <p className="text-gray-600 dark:text-gray-400">
                  {currentTranscript || "Listening..."}
                </p>
              </div>
            )}
            
            <div className="space-y-4">
              {transcript.length > 0 ? (
                transcript.slice().reverse().map((item, index) => (
                  <div key={index} className="bg-gray-100 dark:bg-gray-700 rounded-lg p-3">
                    <div className="flex justify-between mb-1">
                      <span className="font-medium text-gray-800 dark:text-gray-200">
                        {item.userName}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(item.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-gray-700 dark:text-gray-300">{item.text}</p>
                  </div>
                ))
              ) : (
                <p className="text-center text-gray-500 dark:text-gray-400 py-4">
                  No transcripts yet. Start speaking to generate a transcript.
                </p>
              )}
            </div>
          </div>
        )}
        
        {activeTab === 'summary' && (
          <div className="p-4">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Meeting Summary</h3>
            <p className="text-gray-700 dark:text-gray-300">
              Meeting summary will appear here after processing the conversation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TranscriptPanel;
