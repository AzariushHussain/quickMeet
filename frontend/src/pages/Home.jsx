import GoogleLoginButton from "../components/GoogleLoginButton";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { setMeetingId } from "../store/meetingSlice";
import { getMeetingLink, getMeeting } from '../api/meeting'

export default function Home() {
  const [meetingCode, setMeetingCode] = useState("");
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const user = useSelector((state) => state.auth.user);

  const createMeeting = async () => {
    const response = await getMeetingLink(user.token);
    dispatch(setMeetingId({meetingId:response.meetingId, host: response.host, participants: response.participants}));
    navigate(`/meeting/${response.meetingId}`);
  };

  const toggleDropdown = () => {
    setDropdownVisible(!dropdownVisible);
  };  return (
    <div className="flex flex-col items-center justify-center w-full min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 p-4">
      <div className="w-full max-w-md px-6 py-8 bg-white dark:bg-gray-800 shadow-xl rounded-xl">
        <div className="flex items-center justify-center mb-6">
          <svg className="w-10 h-10 text-primary mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <h1 className="text-4xl font-bold text-primary">QuickMeet</h1>
        </div>
        <div className="mb-8 text-center text-gray-600 dark:text-gray-300">
          Fast, reliable video meetings for everyone
        </div>
        <GoogleLoginButton />
        {user && (
          <>
            <div className="mt-8 relative">
              <button 
                onClick={toggleDropdown} 
                className="w-full flex items-center justify-center bg-green-500 hover:bg-green-600 transition-colors text-white px-6 py-3 rounded-lg text-lg font-medium shadow-md">
                <svg className="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Meeting
              </button>
              {dropdownVisible && (
                <div className="absolute mt-2 w-full bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg shadow-lg z-10">
                  <button
                    onClick={createMeeting}
                    className="flex items-center w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-t-lg"
                  >
                    <svg className="w-5 h-5 mr-2 text-green-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Instant Meeting 
                  </button>
                  <button
                    onClick={() => navigate('/schedule-meeting')}
                    className="flex items-center w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200"
                  >
                    <svg className="w-5 h-5 mr-2 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Schedule a Meeting
                  </button>
                  <button
                    onClick={() => navigate('/meetings')}
                    className="flex items-center w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-b-lg"
                  >
                    <svg className="w-5 h-5 mr-2 text-purple-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    View Meeting History
                  </button>
                </div>
              )}
            </div>
            
            <div className="relative mt-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
              </div>
              <div className="relative flex justify-center">
                <span className="px-3 bg-white dark:bg-gray-800 text-sm text-gray-500 dark:text-gray-400">or join a meeting</span>
              </div>
            </div>
            
            <div className="mt-6">
              <div className="flex flex-col sm:flex-row">
                <input
                  type="text"
                  placeholder="Enter meeting code"
                  className="flex-grow border dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  value={meetingCode}
                  onChange={(e) => setMeetingCode(e.target.value)}
                />
                <button
                  onClick={async() => {
                    if (!meetingCode.trim()) return;
                    const response = await getMeeting(meetingCode, user.token);
                    console.log('got meeting',response);
                    dispatch(setMeetingId({meetingId:response.meetingId, host: response.host, participants: response.participants}));
                    navigate(`/meeting/${meetingCode}`);
                  }}
                  className="mt-2 sm:mt-0 sm:ml-2 bg-blue-500 hover:bg-blue-600 transition-colors text-white px-6 py-3 rounded-lg font-medium shadow-md flex items-center justify-center"
                >
                  <svg className="w-5 h-5 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14" />
                  </svg>
                  Join
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      
      {user && (
        <div className="mt-6 text-center">
          <button 
            onClick={() => navigate('/meetings')}
            className="text-primary hover:text-primary-dark dark:text-primary-dark dark:hover:text-primary flex items-center justify-center mx-auto"
          >
            <svg className="w-5 h-5 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            View your meeting history
          </button>
        </div>
      )}
    </div>
  );
}