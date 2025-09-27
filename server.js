const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files
app.use(express.static('public'));

// Store current video state
let currentVideoState = {
    url: '',
    isPlaying: false,
    currentTime: 0,
    lastUpdate: Date.now()
};

let connectedUsers = new Map();
let messageHistory = [];

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Handle user joining
    socket.on('user-join', (userData) => {
        connectedUsers.set(socket.id, userData);
        
        // Send welcome message
        io.emit('system-message', {
            message: `${userData.username} joined the virtual date! 💕`,
            timestamp: Date.now()
        });

        // Send current video state to new user
        socket.emit('video-sync', currentVideoState);

        // Send message history to new user
        messageHistory.forEach(msg => {
            socket.emit('new-message', msg);
        });

        // Send user count
        io.emit('user-count', connectedUsers.size);
    });

    // Handle chat messages
    socket.on('send-message', (messageData) => {
        const message = {
            ...messageData,
            timestamp: Date.now(),
            id: socket.id
        };

        // Store in history (keep last 50 messages)
        messageHistory.push(message);
        if (messageHistory.length > 50) {
            messageHistory = messageHistory.slice(-50);
        }

        // Broadcast to all users
        io.emit('new-message', message);

        // Check for trigger words and emit effects
        const triggerWords = ['heart', 'love', 'lol', 'lmao', 'haha', 'cute', 'beautiful', 'amazing', 'wow', 'fire', 'based', 'cringe', 'poggers', 'nice', 'wholesome'];
        
        const lowerMessage = messageData.content.toLowerCase();
        triggerWords.forEach(trigger => {
            if (lowerMessage.includes(trigger)) {
                io.emit('trigger-effect', { trigger, user: messageData.username });
            }
        });
    });

    // Handle video loading
    socket.on('load-video', (videoData) => {
        currentVideoState = {
            url: videoData.url,
            embedUrl: videoData.embedUrl,
            isPlaying: false,
            currentTime: 0,
            lastUpdate: Date.now()
        };

        const user = connectedUsers.get(socket.id);
        io.emit('video-loaded', {
            ...videoData,
            user: user?.username || 'Someone'
        });

        io.emit('video-sync', currentVideoState);
    });

    // Handle video play/pause
    socket.on('video-playpause', (data) => {
        currentVideoState.isPlaying = data.isPlaying;
        currentVideoState.currentTime = data.currentTime;
        currentVideoState.lastUpdate = Date.now();

        const user = connectedUsers.get(socket.id);
        socket.broadcast.emit('video-playpause', {
            isPlaying: data.isPlaying,
            currentTime: data.currentTime,
            user: user?.username || 'Someone'
        });
    });

    // Handle video seeking
    socket.on('video-seek', (data) => {
        currentVideoState.currentTime = data.currentTime;
        currentVideoState.lastUpdate = Date.now();

        const user = connectedUsers.get(socket.id);
        socket.broadcast.emit('video-seek', {
            currentTime: data.currentTime,
            user: user?.username || 'Someone'
        });
    });

    // Handle sync request
    socket.on('sync-request', () => {
        const user = connectedUsers.get(socket.id);
        io.emit('sync-requested', {
            user: user?.username || 'Someone'
        });
        
        // Send current state to everyone
        io.emit('video-sync', currentVideoState);
    });

    // Handle awards
    socket.on('give-award', (awardData) => {
        const user = connectedUsers.get(socket.id);
        io.emit('award-given', {
            award: awardData,
            user: user?.username || 'Someone'
        });
    });

    // Handle typing indicators
    socket.on('typing-start', () => {
        const user = connectedUsers.get(socket.id);
        if (user) {
            socket.broadcast.emit('user-typing', {
                username: user.username,
                isTyping: true
            });
        }
    });

    socket.on('typing-stop', () => {
        const user = connectedUsers.get(socket.id);
        if (user) {
            socket.broadcast.emit('user-typing', {
                username: user.username,
                isTyping: false
            });
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        const user = connectedUsers.get(socket.id);
        if (user) {
            io.emit('system-message', {
                message: `${user.username} left the date 😢`,
                timestamp: Date.now()
            });
        }
        
        connectedUsers.delete(socket.id);
        io.emit('user-count', connectedUsers.size);
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Virtual Date Server running on port ${PORT}`);
    console.log(`💕 Your date platform is ready at http://localhost:${PORT}`);
});
