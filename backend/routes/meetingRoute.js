const express = require('express');
const { 
    getMeetingLink, 
    addParticipant, 
    getMeeting, 
    getMeetingHistory, 
    saveTranscriptMessage, 
    saveMeetingSummary, 
    endMeeting 
} = require('../controllers/meetingController');
const verifyToken = require('../middlewares/auth');
const router = express.Router();

router.use(verifyToken);

// Meeting history (must come before /:id route to avoid conflict)
router.get('/history', getMeetingHistory);

// Meeting creation and management
router.post('/create', getMeetingLink);
router.get('/:id', getMeeting);
router.post('/:id/add', addParticipant);

// Transcript and summary management
router.post('/:meetingId/transcript', saveTranscriptMessage);
router.post('/:meetingId/summary', saveMeetingSummary);

// End meeting
router.post('/:meetingId/end', endMeeting);

module.exports = router;