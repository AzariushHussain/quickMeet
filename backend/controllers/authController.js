const { createUser, findUserById, findUserByEmail } = require('../models/userModel');
const { successResponse, errorResponse } = require('../utils/response');
const formatMessage = require('../utils/messageFormatter');
const { responseMessages } = require('../utils/constants');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_EXPIRATION = process.env.TOKEN_EXPIRATION;

async function loginUser(req, res){
    const { uid, displayName, email, photoURL } = req.body;
    try {
        let user = await findUserByEmail(email);
        if(!user){
            user = await createUser({ uid, displayName, email, photoURL });
        }
        const userToken = jwt.sign({ uid, email, displayName }, JWT_SECRET, { expiresIn: TOKEN_EXPIRATION });
        console.log('user token: ', userToken);
        const message = formatMessage(responseMessages.success.Created, {'operation': 'Token'})
        return successResponse(res, message, {userToken}, 200);
    } catch (error) {
        return errorResponse(res, error.message);
    }
}

module.exports = {
    loginUser
};