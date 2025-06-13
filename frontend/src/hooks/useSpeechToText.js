import { useState, useEffect, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { addTranscriptMessage } from '../store/meetingSlice';
import { saveTranscriptMessage } from '../api/meeting';

const useSpeechToText = (meetingId) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');
  const recognitionRef = useRef(null);
  const dispatch = useDispatch();
  const user = useSelector(state => state.auth.user);

  useEffect(() => {
    // Check if browser supports the Web Speech API
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setError('Your browser does not support speech recognition.');
      return;
    }

    // Create a speech recognition instance
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    
    // Configure options
    recognitionRef.current.continuous = true;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.lang = 'en-US';

    // Set up event handlers
    recognitionRef.current.onstart = () => {
      console.log('Speech recognition started');
      setIsListening(true);
    };

    recognitionRef.current.onend = () => {
      console.log('Speech recognition stopped');
      setIsListening(false);
      // Restart if was listening
      if (isListening) {
        try {
          recognitionRef.current.start();
        } catch (e) {
          console.error('Error restarting speech recognition:', e);
        }
      }
    };

    recognitionRef.current.onresult = (event) => {
      let final = '';
      let interim = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        
        if (event.results[i].isFinal) {
          final += transcript + ' ';
          
          // Once we have a final result, save it to the transcript
          if (meetingId && user) {
            handleFinalTranscript(transcript);
          }
        } else {
          interim += transcript;
        }
      }
      
      setTranscript(final + interim);
    };

    recognitionRef.current.onerror = (event) => {
      console.error('Speech recognition error', event.error);
      setError(`Recognition error: ${event.error}`);
    };

    // Clean up
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [meetingId]);

  // Handle completed transcription
  const handleFinalTranscript = useCallback(async (text) => {
    if (!text.trim()) return;
    
    try {
      const transcriptMessage = {
        userId: user.uid,
        userName: user.displayName || user.email,
        text,
        timestamp: new Date()
      };
      
      dispatch(addTranscriptMessage(transcriptMessage));
      
      // Save to backend
      if (user.token) {
        await saveTranscriptMessage(meetingId, text, user.token);
      }
    } catch (error) {
      console.error('Error saving transcript:', error);
    }
  }, [meetingId, user, dispatch]);

  // Start listening
  const startListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (error) {
        console.error('Error starting speech recognition:', error);
      }
    }
  }, []);

  // Stop listening
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, []);
  
  // Toggle listening state
  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  return {
    isListening,
    transcript,
    startListening,
    stopListening,
    toggleListening,
    error
  };
};

export default useSpeechToText;
