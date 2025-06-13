import { useEffect } from 'react'
import { useDispatch } from 'react-redux';
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import MeetingRoom from "./pages/MeetingRoom";
import MeetingHistory from "./pages/MeetingHistory";
import MeetingDetail from "./pages/MeetingDetail";
import ThemeToggle from './components/ThemeToggle';
import { setUserFromStorage } from './store/authSlice'
import { setMeetingFromStorage } from './store/meetingSlice';

export default function App() {
  const dispatch = useDispatch();

  useEffect(()=> {
    dispatch(setUserFromStorage());
    dispatch(setMeetingFromStorage());
  },[dispatch]);
  
  return (
    <Router>
      <div className="fixed bottom-4 right-4 z-50">
        <ThemeToggle />
      </div>
      <div className="w-full min-h-screen">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/meeting/:meetingId" element={<MeetingRoom />} />
          <Route path="/meetings" element={<MeetingHistory />} />
          <Route path="/meeting-detail/:meetingId" element={<MeetingDetail />} />
        </Routes>
      </div>
    </Router>
  );
}
