const { createUser, findUserById, findUserByEmail } = require('../models/userModel');
const { successResponse, errorResponse } = require('../utils/response');
const formatMessage = require('../utils/messageFormatter');
const { responseMessages } = require('../utils/constants');

async function getUser(req, res) {
    const { id } = req.params;
    try {
        const user = await findUserById(id);
        if (!user) {
            const message = formatMessage(responseMessages.error.NotFound, { operation: 'User' });
            return errorResponse(res, message ,404);
        }
        const message = formatMessage(responseMessages.success.Created, { operation: 'User' });
        return successResponse(res, message, user, 201);
    } catch (error) {
        const message = responseMessages.error.internalServerError;
        return errorResponse(res, message);
    }
}

