const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoute');
const meetingRoutes = require('./meetingRoute');

router.use('/auth', authRoutes);
router.use('/meeting', meetingRoutes);

module.exports = router;
