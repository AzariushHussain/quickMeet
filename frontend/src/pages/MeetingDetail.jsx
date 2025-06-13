import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { getMeeting } from '../api/meeting';
import { setTranscript, setParticipantActions, setMeetingSummary } from '../store/meetingSlice';

const MeetingDetail = () => {
  const { meetingId } = useParams();
  const [meeting, setMeeting] = useState(null);
  const [activeTab, setActiveTab] = useState('transcript');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [unauthorized, setUnauthorized] = useState(false);
  const user = useSelector(state => state.auth.user);
  const transcript = useSelector(state => state.meeting.transcript);
  const participantActions = useSelector(state => state.meeting.participantActions);
  const summary = useSelector(state => state.meeting.summary);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  useEffect(() => {
    // First check if user is logged in
    if (!user || !user.token) {
      console.log('User not logged in or token missing');
      setUnauthorized(true);
      setError('You must be logged in to view meeting details.');
      setIsLoading(false);
      return;
    }

    const fetchMeetingDetails = async () => {
      if (!meetingId) {
        console.log('No meetingId provided');
        setError('Meeting ID is missing');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        console.log(`Fetching details for meeting: ${meetingId}`);
        const meetingData = await getMeeting(meetingId, user.token);
        console.log('Meeting data received:', meetingData);
        setMeeting(meetingData);

        // Check if user was a participant or host of this meeting
        const wasParticipant = meetingData.participants.some(p => p.uid === user.uid || p.email === user.email);
        const wasHost = meetingData.host.uid === user.uid || meetingData.host.email === user.email;
        console.log(`User permission check: wasParticipant=${wasParticipant}, wasHost=${wasHost}`);
        
        if (!wasParticipant && !wasHost) {
          setUnauthorized(true);
          setError('You do not have permission to view this meeting. Only participants and hosts can access meeting details.');
          setIsLoading(false);
          return;
        }

        // Set transcript data to Redux store
        if (meetingData.transcript) {
          console.log(`Found ${meetingData.transcript.length} transcript messages`);
          dispatch(setTranscript(meetingData.transcript));
        } else {
          console.log('No transcript data available');
        }
        
        // Set participant actions to Redux store
        if (meetingData.participantActions) {
          console.log(`Found ${meetingData.participantActions.length} participant actions`);
          dispatch(setParticipantActions(meetingData.participantActions));
        } else {
          console.log('No participant actions available');
        }
        
        // Set meeting summary to Redux store
        if (meetingData.summary) {
          console.log('Meeting summary available');
          dispatch(setMeetingSummary(meetingData.summary));
        } else {
          console.log('No meeting summary available');
        }
        
        setError('');
      } catch (err) {
        console.error('Error fetching meeting details:', err);
        setError('Failed to load meeting details. Please try again. Error: ' + (err.message || 'Unknown error'));
        if (err.response) {
          console.error('Error response data:', err.response.data);
          console.error('Error response status:', err.response.status);
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchMeetingDetails();

    // Clean up on unmount
    return () => {
      // Clear transcript data from Redux store
      dispatch(setTranscript([]));
      dispatch(setParticipantActions([]));
      dispatch(setMeetingSummary(''));
    };
  }, [meetingId, user, dispatch]);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const formatDuration = (seconds) => {
    if (!seconds) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const sec = Math.floor(seconds % 60);
    
    return [
      hours > 0 ? `${hours}h` : '',
      minutes > 0 ? `${minutes}m` : '',
      `${sec}s`
    ].filter(Boolean).join(' ');
  };

  // Add export functionality for transcripts
  const exportTranscript = (format = 'txt') => {
    if (!transcript || transcript.length === 0) {
      return;
    }

    let content = '';
    const fileName = `transcript-${meeting.meetingId}-${new Date().toISOString().split('T')[0]}.${format}`;

    if (format === 'txt') {
      content = `MEETING TRANSCRIPT\n`;
      content += `Meeting ID: ${meeting.meetingId}\n`;
      content += `Date: ${new Date(meeting.createdAt).toLocaleString()}\n`;
      content += `Host: ${meeting.host.displayName || meeting.host.email}\n\n`;
      content += `TRANSCRIPT:\n\n`;

      transcript.forEach((item) => {
        content += `[${new Date(item.timestamp).toLocaleTimeString()}] ${item.userName}: ${item.text}\n\n`;
      });
    } else if (format === 'json') {
      // Export as JSON
      const data = {
        meetingDetails: {
          id: meeting.meetingId,
          date: new Date(meeting.createdAt).toISOString(),
          host: meeting.host.displayName || meeting.host.email,
          duration: meeting.duration,
          participants: meeting.participants.map(p => p.displayName || p.email)
        },
        transcript: transcript.map(item => ({
          speaker: item.userName,
          text: item.text,
          timestamp: new Date(item.timestamp).toISOString()
        }))
      };
      content = JSON.stringify(data, null, 2);
    }

    // Create a blob and download
    const blob = new Blob([content], { type: `text/${format === 'json' ? 'json' : 'plain'}` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6" role="alert">
          <p className="font-bold">Unauthorized</p>
          <p>{error}</p>
          <button 
            onClick={() => navigate('/meetings')} 
            className="mt-4 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark transition-colors"
          >
            Go back to meetings
          </button>
        </div>
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6" role="alert">
          <p>{error || 'Meeting not found'}</p>
          <button 
            onClick={() => navigate('/meetings')} 
            className="mt-4 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark transition-colors"
          >
            Go back to meetings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 dark:text-white">{`Meeting ${meeting.meetingId.substring(0, 8)}...`}</h1>
          <p className="text-gray-600 dark:text-gray-400">Created on {formatDate(meeting.createdAt)}</p>
        </div>
        <button 
          onClick={() => navigate('/meetings')} 
          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
        >
          Back to Meetings
        </button>
      </div>

      {/* Meeting Details Card */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">Meeting Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Meeting ID</p>
            <p className="text-gray-900 dark:text-gray-100">{meeting.meetingId}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Host</p>
            <p className="text-gray-900 dark:text-gray-100">{meeting.host.displayName || meeting.host.email}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Status</p>
            <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
              meeting.status === 'completed' 
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
            }`}>
              {meeting.status}
            </span>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Duration</p>
            <p className="text-gray-900 dark:text-gray-100">{formatDuration(meeting.duration)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Participants</p>
            <p className="text-gray-900 dark:text-gray-100">{meeting.participants.length}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden mb-6">
        <div className="flex border-b dark:border-gray-700">
          <button 
            onClick={() => setActiveTab('transcript')}
            className={`py-3 px-6 font-medium text-sm ${
              activeTab === 'transcript' 
                ? 'border-b-2 border-primary text-primary dark:border-primary-dark dark:text-primary-dark' 
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            Transcript
          </button>
          <button 
            onClick={() => setActiveTab('participants')}
            className={`py-3 px-6 font-medium text-sm ${
              activeTab === 'participants' 
                ? 'border-b-2 border-primary text-primary dark:border-primary-dark dark:text-primary-dark' 
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            Participants
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
        
        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'transcript' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Meeting Transcript</h3>
                
                {transcript.length > 0 && (
                  <div className="flex space-x-2">
                    <button
                      onClick={() => exportTranscript('txt')}
                      className="px-3 py-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 text-sm rounded-md flex items-center"
                    >
                      <svg className="w-4 h-4 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Export as TXT
                    </button>
                    <button
                      onClick={() => exportTranscript('json')}
                      className="px-3 py-1 bg-blue-100 hover:bg-blue-200 dark:bg-blue-800 dark:hover:bg-blue-700 text-blue-800 dark:text-blue-200 text-sm rounded-md flex items-center"
                    >
                      <svg className="w-4 h-4 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Export as JSON
                    </button>
                  </div>
                )}
              </div>
              
              {transcript.length > 0 ? (
                <div className="space-y-4">
                  {transcript.map((item, index) => (
                    <div key={index} className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4">
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
                  ))}
                </div>
              ) : (
                <p className="text-center text-gray-500 dark:text-gray-400 py-4">
                  No transcript available for this meeting.
                </p>
              )}
            </div>
          )}
          
          {activeTab === 'participants' && (
            <div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Participants</h3>
              
              <div className="mb-6">
                <h4 className="text-md font-medium text-gray-700 dark:text-gray-300 mb-2">Meeting Attendees</h4>
                {meeting.participants.length > 0 ? (
                  <ul className="bg-gray-50 dark:bg-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-600">
                    {meeting.participants.map((participant, index) => (                      <li key={index} className="px-4 py-3 flex items-center">
                        {participant.photoURL ? (
                          <img 
                            src={participant.photoURL} 
                            alt={participant.displayName} 
                            className="w-8 h-8 rounded-full mr-3" 
                            onError={(e) => {
                              console.log(`Meeting detail participant ${participant.email} image failed to load, using fallback`);
                              e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(participant.displayName || participant.email)}&size=32&background=8b5cf6&color=ffffff`;
                            }}
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white mr-3">
                            {(participant.displayName || participant.email).charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="text-gray-800 dark:text-gray-200">
                            {participant.displayName || participant.email}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {participant.email === meeting.host.email ? 'Host' : 'Participant'}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-center text-gray-500 dark:text-gray-400 py-4">
                    No participants data available.
                  </p>
                )}
              </div>
                <div>
                <h4 className="text-md font-medium text-gray-700 dark:text-gray-300 mb-2">Participant Timeline</h4>
                {participantActions.length > 0 ? (
                  <div className="relative">
                    <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gray-300 dark:bg-gray-600"></div>
                    
                    <div className="mb-4">
                      <div className="flex items-center">
                        <span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
                        <span className="text-sm text-gray-600 dark:text-gray-400">Join</span>
                        <span className="w-3 h-3 bg-red-500 rounded-full ml-4 mr-2"></span>
                        <span className="text-sm text-gray-600 dark:text-gray-400">Leave</span>
                      </div>
                    </div>
                    
                    <ul className="space-y-4">
                      {/* Group actions by user for better visualization */}
                      {(() => {
                        // Sort actions by timestamp
                        const sortedActions = [...participantActions].sort(
                          (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
                        );
                        
                        return sortedActions.map((action, index) => (
                          <li key={index} className="relative pl-10">
                            <span className={`absolute left-4 top-1 -ml-px h-4 w-4 rounded-full ${
                              action.action === 'join' 
                                ? 'bg-green-500'
                                : 'bg-red-500'
                            }`}></span>
                            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                              <div className="flex justify-between">
                                <span className="font-medium text-gray-800 dark:text-gray-200">
                                  {action.email}
                                </span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {new Date(action.timestamp).toLocaleTimeString()} • {new Date(action.timestamp).toLocaleDateString()}
                                </span>
                              </div>
                              <p className="text-sm text-gray-600 dark:text-gray-300">
                                {action.action === 'join' ? (
                                  <>
                                    <span className="text-green-500">●</span> Joined the meeting
                                  </>
                                ) : (
                                  <>
                                    <span className="text-red-500">●</span> Left the meeting
                                  </>
                                )}
                              </p>
                            </div>
                          </li>
                        ));
                      })()}
                    </ul>
                  </div>
                ) : (
                  <p className="text-center text-gray-500 dark:text-gray-400 py-4">
                    No participant activity data available.
                  </p>
                )}
              </div>
            </div>
          )}
          
          {activeTab === 'summary' && (
            <div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Meeting Summary</h3>
              
              {summary ? (
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line">{summary}</p>
                </div>
              ) : (
                <p className="text-center text-gray-500 dark:text-gray-400 py-4">
                  No summary available for this meeting.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MeetingDetail;
