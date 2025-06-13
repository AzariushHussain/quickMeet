const successResponse = (res, message, data = {}, statusCode = 200) => {
    res.status(statusCode).json({
        status: true,
        message,
        data,
    });
};

const errorResponse = (res, message, statusCode = 500) => {
    res.status(statusCode).json({
        status: false,
        message,
    });
};


module.exports = { successResponse, errorResponse };