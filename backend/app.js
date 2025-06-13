const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const connectMongoDb = require('./connection');
const mediasoupController = require('./controllers/mediasoupController');
require('dotenv').config();
const { setIo } = require('./utils/redis');

const app = express();
const server = http.createServer(app);


app.use(cors({
    origin: (origin, callback) => {
        const allowedOrigins = [
            process.env.FRONTEND_URL || 'http://localhost:3000',
            'http://192.168.102.39:5173'
        ];
        
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

app.use(express.json());


// MongoDB connection
(async () => {
    try {
        await connectMongoDb.connect();
        console.log('Connected to MongoDB');
    } catch (error) {
        console.error('Error connecting to MongoDB:', error);
        process.exit(1); // Exit if unable to connect
    }
})();

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Set up routes
const indexRoutes = require('./routes');
app.use('/', indexRoutes);

// Initialize mediasoup
mediasoupController(io);

// Add detailed error handling for express
app.use((err, req, res, next) => {
  console.error('Unhandled error in request:', {
    method: req.method,
    url: req.originalUrl,
    body: req.body,
    error: err.message,
    stack: err.stack
  });
  
  res.status(500).json({ 
    message: 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred'
  });
});

// Start the server
const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
