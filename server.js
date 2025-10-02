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
    videoId: '',
    isPlaying: false,
    currentTime: 0,
    lastUpdate: Date.now()
};

let connectedUsers = new Map();
let messageHistory = [];
let currentPoll = null;
let pollVotes = new Map();

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
        if (currentVideoState.videoId) {
            socket.emit('video-sync', currentVideoState);
        }

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
        const triggerWords = ['ex', 'bc', 'wtf', 'heart', 'momo', 'aditya', 'xd'];
        
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
            videoId: videoData.videoId,
            isPlaying: false,
            currentTime: 0,
            lastUpdate: Date.now()
        };

        const user = connectedUsers.get(socket.id);
        io.emit('video-loaded', {
            ...videoData,
            user: user?.username || 'Someone'
        });
    });

    // Handle video play/pause
    socket.on('video-playpause', (data) => {
        currentVideoState.isPlaying = data.isPlaying;
        currentVideoState.currentTime = data.currentTime;
        currentVideoState.lastUpdate = Date.now();

        const user = connectedUsers.get(socket.id);
        
        // Broadcast to OTHER users (not sender)
        socket.broadcast.emit('video-playpause-sync', {
            isPlaying: data.isPlaying,
            currentTime: data.currentTime,
            user: user?.username || 'Someone'
        });
        
        // System message to everyone
        io.emit('system-message', {
            message: `${user?.username || 'Someone'} ${data.isPlaying ? 'played ▶️' : 'paused ⏸️'} the video`,
            timestamp: Date.now()
        });
    });

    // Handle video progress updates
    socket.on('video-progress', (data) => {
        currentVideoState.currentTime = data.currentTime;
        currentVideoState.lastUpdate = Date.now();
        
        // Broadcast current time to keep everyone in sync
        socket.broadcast.emit('video-progress-sync', {
            currentTime: data.currentTime
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
    socket.on('sync-request', (data) => {
        const user = connectedUsers.get(socket.id);
        
        // Update current state if provided
        if (data) {
            currentVideoState.currentTime = data.currentTime;
            currentVideoState.isPlaying = data.isPlaying;
            currentVideoState.lastUpdate = Date.now();
        }
        
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

    // Handle surprise me button
    socket.on('surprise-me', (data) => {
        const user = connectedUsers.get(socket.id);
        
        io.emit('surprise-popup', {
            message: data.message,
            user: user?.username || 'Someone'
        });
        
        io.emit('trigger-effect', { trigger: 'wholesome', user: user?.username });
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

    // Handle poll system
    socket.on('start-poll', (pollData) => {
        currentPoll = {
            ...pollData,
            id: Date.now(),
            startTime: Date.now()
        };
        pollVotes.clear();
        
        io.emit('poll-started', currentPoll);
    });

    socket.on('poll-vote', (voteData) => {
        if (currentPoll && voteData.pollId === currentPoll.id) {
            pollVotes.set(socket.id, {
                user: voteData.user,
                option: voteData.option
            });
            
            io.emit('poll-vote', {
                user: voteData.user,
                option: voteData.option
            });
        }
    });

    socket.on('poll-end', () => {
        if (currentPoll) {
            io.emit('poll-ended', {
                results: Array.from(pollVotes.values())
            });
            currentPoll = null;
            pollVotes.clear();
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
