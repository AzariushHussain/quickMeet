const responseMessages = {
    success: {
        Created: "{operation} created successfully.",
        Deleted: "{operation} deleted successfully.",
        Fetched: "{operation} fetched successfully.",
        operationSuccessful: "{operation} completed successfully.",
    },
    error: {
        NotFound: "{operation} not found.",
        invalidInput: "Invalid {operation} provided.",
        internalServerError: "An internal server error occurred. Please try again later.",
        limitReached: "Limit reached for {operation}.",
        Timeout: "Timeout reached for {operation}.",
        alreadyExists: "{operation} already exists.",
    },
};


const constants = {
    bool:{
        TRUE: true,
        FALSE: false
    },
    operation:{
        status:{
            SUCCESS: 'success',
            FAILED: 'failed',
        }
    },
    user: {
        status: {
            ONLINE: 'online',
            OFFLINE: 'offline'
        },
        default: {
            about: 'Hey there! I am using QuickChat.',
        }
    },
    chat: {
        type: {
            SINGLE: 'single',
            GROUP: 'group',
        }
    },
    message: {
        status: {
            SENT: 'sent',
            DELIVERED: 'delivered',
            READ: 'read',
        },
        type: {
            TEXT: 'text',
            IMAGE: 'image',
            VIDEO: 'video',
            AUDIO: 'audio',
            DOCUMENT: 'document',
        }
    }
};

module.exports = {responseMessages, constants};