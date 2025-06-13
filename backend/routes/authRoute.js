const express = require('express')
const { loginUser } = require('../controllers/authController');
const { model } = require('mongoose');
const router = express.Router();

router.post('/login', loginUser);

module.exports = router;