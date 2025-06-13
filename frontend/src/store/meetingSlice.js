import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  meeting: null,
  meetingHistory: [],
  transcript: [],
  participantActions: [],
  summary: ""
};

const meetingSlice = createSlice({
  name: "meeting",
  initialState,
  reducers: {
    setMeetingId: (state, action) => {
      state.meeting = {
        meetingId: action.payload.meetingId,
        host: action.payload.host,
        participants: []
      };
      localStorage.setItem('meeting', JSON.stringify(state.meeting));
    },    
    setMeetingParticipants: (state, action) => {
      if (!state.meeting) {
        console.error("Meeting not initialized!");
        return;
      }
      state.meeting.participants = action.payload;
      localStorage.setItem('meeting', JSON.stringify(state.meeting));
    },
    updateMeetingParticipants: (state, action) => {
      console.log("Adding participant to Redux:", action.payload);
      
      if (!state.meeting || !state.meeting.participants) {
        console.error("Meeting or participants list not initialized!");
        return;
      }
      
      // More thorough duplicate check using both email and producerId
      const existingIndex = state.meeting.participants.findIndex(
        participant => (
          (participant.email === action.payload.email) || 
          (action.payload.producerId && participant.producerId === action.payload.producerId)
        )
      );
      
      if (existingIndex >= 0) {
        console.log(`Participant ${action.payload.email} already exists in the meeting`);
        
        // Update the existing participant with any new info we have
        // This ensures that if a producer ID was added later, we capture it
        if (action.payload.producerId && !state.meeting.participants[existingIndex].producerId) {
          console.log(`Updating producer ID for ${action.payload.email}`);
          state.meeting.participants[existingIndex].producerId = action.payload.producerId;
          
          // If the payload has data we didn't have before, add it
          if (action.payload.displayName && !state.meeting.participants[existingIndex].displayName) {
            state.meeting.participants[existingIndex].displayName = action.payload.displayName;
          }
          
          if (action.payload.photoURL && !state.meeting.participants[existingIndex].photoURL) {
            state.meeting.participants[existingIndex].photoURL = action.payload.photoURL;
          }
          
          localStorage.setItem('meeting', JSON.stringify(state.meeting));
        }
      } else {
        console.log(`Adding new participant ${action.payload.email} to meeting`);
        state.meeting.participants = [...state.meeting.participants, action.payload];
        localStorage.setItem('meeting', JSON.stringify(state.meeting));
      }
    },
    updateMeetingChat: (state, action) => {
      state.meeting.chats = action.payload.chats;
      localStorage.setItem('meeting', JSON.stringify(state.meeting));
    },
    removeMeetingId: (state) => {
      state.meeting = "";
      localStorage.removeItem('meeting');
    },
    setMeetingFromStorage: (state) => {
      const meeting = localStorage.getItem('meeting') ? JSON.parse(localStorage.getItem('meeting')) : null;
      console.log("meeting", meeting);
      state.meeting = meeting;
    },
    resetMeeting: (state) => {
      state.meeting = null;
    },    
    removeMeetingParticipant: (state, action) => {
      console.log("Removing participant with email:", action.payload.email);
      // Check if meeting exists before attempting to filter
      if (state.meeting && state.meeting.participants) {
        state.meeting.participants = state.meeting.participants.filter(
          participant => participant.email !== action.payload.email
        );
        localStorage.setItem('meeting', JSON.stringify(state.meeting));
      }
    },
    setMeetingHistory: (state, action) => {
      state.meetingHistory = action.payload;
    },
    addTranscriptMessage: (state, action) => {
      state.transcript.push(action.payload);
    },
    setTranscript: (state, action) => {
      state.transcript = action.payload;
    },
    addParticipantAction: (state, action) => {
      state.participantActions.push(action.payload);
    },
    setParticipantActions: (state, action) => {
      state.participantActions = action.payload;
    },
    setMeetingSummary: (state, action) => {
      state.summary = action.payload;
    },
    clearTranscriptData: (state) => {
      state.transcript = [];
      state.participantActions = [];
      state.summary = "";
    }
  },
});

export const { 
  setMeetingId, 
  setMeetingParticipants,
  removeMeetingId, 
  setMeetingFromStorage, 
  updateMeetingParticipants, 
  updateMeetingChat, 
  resetMeeting, 
  removeMeetingParticipant,
  setMeetingHistory,
  addTranscriptMessage,
  setTranscript,
  addParticipantAction,
  setParticipantActions,
  setMeetingSummary,
  clearTranscriptData
} = meetingSlice.actions;
export default meetingSlice.reducer;