// jshint esversion:6
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const bodyParser = require("body-parser");
const multer = require("multer");
const fs = require("fs");
const User = require("./models/user");
const Message = require("./models/Message");
const Poll = require("./models/Poll");

dotenv.config();

const app = express();
const server = require("http").createServer(app);
const io = require("socket.io")(server);
const PORT = process.env.PORT || 3000;

// ✅ MongoDB Connect
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.log("Mongo Error:", err));

// ✅ Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

// ✅ Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath = 'uploads/';
    if (file.mimetype.startsWith('audio/')) {
      uploadPath += 'audio/';
    } else if (file.mimetype.startsWith('image/')) {
      uploadPath += 'images/';
    } else if (file.mimetype.startsWith('video/')) {
      uploadPath += 'videos/';
    } else {
      uploadPath += 'files/';
    }
    
    // Ensure directory exists
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const originalName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    cb(null, `${timestamp}_${originalName}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'audio/webm', 'audio/wav', 'audio/mp3', 'audio/ogg',
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/webm', 'video/avi', 'video/mov',
      'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'), false);
    }
  }
});

// ✅ Routes FIRST — Serve HTML files
app.get("/", (req, res) => {
  res.sendFile("welcome.html", { root: path.join(__dirname, "public") });
});
app.get("/login", (req, res) => {
  res.sendFile("login.html", { root: path.join(__dirname, "public") });
});
app.get("/signup", (req, res) => {
  res.sendFile("signup.html", { root: path.join(__dirname, "public") });
});
app.get("/chat", (req, res) => {
  res.sendFile("index.html", { root: path.join(__dirname, "public") }); // 🔁 Rename from index.html to chat.html
});

// ✅ Serve Static Files (AFTER routing to avoid overriding `/`)
app.use(express.static(path.join(__dirname, "public")));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ✅ File Upload Route
app.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileUrl = `/uploads/${req.file.path.split('/').slice(-2).join('/')}`;
    
    res.json({
      success: true,
      filename: req.file.filename,
      originalname: req.file.originalname,
      url: fileUrl,
      mimetype: req.file.mimetype,
      size: req.file.size
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

app.post("/signup", async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hashedPassword });
    await user.save();

    res.status(201).json({ message: "Signup successful" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid password" });

    const token = jwt.sign({ id: user._id, name: user.name }, process.env.JWT_SECRET, { expiresIn: "1h" });

    res.json({
      message: "Login successful",
      token,
      user: {
        name: user.name,
        email: user.email
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Chat Message API – for loading chat history
app.get("/api/messages", async (req, res) => {
  try {
    const messages = await Message.find().sort({ timestamp: 1 }).limit(20);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: "Failed to load messages" });
  }
});

// ✅ SOCKET.IO Logic
const users = {};
const userSockets = new Map(); // Map username to socket ID
const activeCalls = new Map(); // Track active voice calls

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on("new-user-joined", async (name) => {
    users[socket.id] = name;
    userSockets.set(name, socket.id);
    console.log(`${name} connected with socket ID: ${socket.id}`);

    try {
      const pastMessages = await Message.find().sort({ timestamp: 1 }).lean();
      socket.emit("chat-history", pastMessages);
    } catch (err) {
      console.error("Error fetching messages:", err);
    }

    socket.emit("self-joined", {
      name,
      activeUsers: Object.keys(users).length,
    });

    // Send list of online users for voice calls (exclude current user)
    const onlineUsers = Object.entries(users)
      .filter(([id, username]) => id !== socket.id)
      .map(([id, username]) => ({
        id,
        username,
        socketId: id
      }));
    
    socket.emit("online-users", onlineUsers);

    socket.broadcast.emit("user-joined", {
      name,
      activeUsers: Object.keys(users).length,
    });

    // Notify others about new user for voice calls
    socket.broadcast.emit("user-online", { 
      id: socket.id, 
      username: name,
      socketId: socket.id 
    });
  });

  socket.on("msg-sent", async (message) => {
    const sender = users[socket.id];
    if (!sender) return;

    const newMsg = new Message({ sender, text: message, timestamp: new Date() });
    await newMsg.save();

    socket.broadcast.emit("msg-receive", { name: sender, message });
  });

  // Voice Call Events
  socket.on("call-user", (data) => {
    const { targetUserId } = data;
    const caller = users[socket.id];
    
    console.log(`Call initiated from ${caller} (${socket.id}) to target ${targetUserId}`);
    
    if (!users[targetUserId]) {
      console.log(`Target user ${targetUserId} not found`);
      socket.emit("call-error", { message: "User not found or offline" });
      return;
    }
    
    if (activeCalls.has(targetUserId) || activeCalls.has(socket.id)) {
      console.log(`Call busy - either caller or target already in call`);
      socket.emit("call-busy");
      return;
    }

    console.log(`Sending incoming call to ${targetUserId}`);
    socket.to(targetUserId).emit("incoming-call", {
      callerId: socket.id,
      callerName: caller
    });
  });

  socket.on("accept-call", (data) => {
    const { callerId } = data;
    const accepter = users[socket.id];
    
    console.log(`Call accepted by ${accepter} (${socket.id}) from ${callerId}`);
    
    activeCalls.set(socket.id, callerId);
    activeCalls.set(callerId, socket.id);
    
    socket.to(callerId).emit("call-accepted", { peerId: socket.id });
    socket.emit("call-connected", { peerId: callerId });
  });

  socket.on("reject-call", (data) => {
    const { callerId } = data;
    const rejecter = users[socket.id];
    
    console.log(`Call rejected by ${rejecter} (${socket.id}) from ${callerId}`);
    socket.to(callerId).emit("call-rejected");
  });

  socket.on("end-call", (data) => {
    const { peerId } = data;
    const caller = users[socket.id];
    
    console.log(`Call ended by ${caller} (${socket.id}) with peer ${peerId}`);
    
    activeCalls.delete(socket.id);
    activeCalls.delete(peerId);
    
    if (peerId) {
      socket.to(peerId).emit("call-ended");
    }
  });

  // WebRTC Signaling
  socket.on("webrtc-offer", (data) => {
    socket.to(data.targetId).emit("webrtc-offer", {
      offer: data.offer,
      callerId: socket.id
    });
  });

  socket.on("webrtc-answer", (data) => {
    socket.to(data.targetId).emit("webrtc-answer", {
      answer: data.answer,
      answerId: socket.id
    });
  });

  socket.on("webrtc-ice-candidate", (data) => {
    socket.to(data.targetId).emit("webrtc-ice-candidate", {
      candidate: data.candidate,
      senderId: socket.id
    });
  });

  // Poll Events
  socket.on("create-poll", async (pollData) => {
    try {
      const { question, options } = pollData;
      const creator = users[socket.id];
      
      const poll = new Poll({
        question,
        options: options.map(text => ({ text, votes: [] })),
        creator
      });
      
      await poll.save();
      
      io.emit("new-poll", {
        id: poll._id,
        question: poll.question,
        options: poll.options,
        creator: poll.creator,
        createdAt: poll.createdAt
      });
    } catch (error) {
      console.error("Error creating poll:", error);
      socket.emit("poll-error", "Failed to create poll");
    }
  });

  socket.on("vote-poll", async (voteData) => {
    try {
      const { pollId, optionIndex } = voteData;
      const voter = users[socket.id];
      
      const poll = await Poll.findById(pollId);
      if (!poll || !poll.isActive) {
        socket.emit("poll-error", "Poll not found or inactive");
        return;
      }

      // Remove previous vote from same user
      poll.options.forEach(option => {
        option.votes = option.votes.filter(vote => vote.userId !== socket.id);
      });

      // Add new vote
      if (poll.options[optionIndex]) {
        poll.options[optionIndex].votes.push({
          userId: socket.id,
          username: voter
        });
      }

      await poll.save();

      // Broadcast updated poll results
      io.emit("poll-updated", {
        id: poll._id,
        options: poll.options
      });
    } catch (error) {
      console.error("Error voting on poll:", error);
      socket.emit("poll-error", "Failed to vote");
    }
  });

  // File/Media sharing
  socket.on("file-shared", (fileData) => {
    const sender = users[socket.id];
    socket.broadcast.emit("file-received", {
      sender,
      ...fileData
    });
  });

  socket.on("disconnect", () => {
    const username = users[socket.id];
    if (!username) return;
    
    console.log(`${username} disconnected (${socket.id})`);
    
    // Clean up active calls
    const peerId = activeCalls.get(socket.id);
    if (peerId) {
      activeCalls.delete(socket.id);
      activeCalls.delete(peerId);
      socket.to(peerId).emit("call-ended");
      console.log(`Cleaned up call between ${socket.id} and ${peerId}`);
    }
    
    // Clean up user mappings
    userSockets.delete(username);
    delete users[socket.id];
    
    socket.broadcast.emit("who-disconnected", username);
    socket.broadcast.emit("user-offline", socket.id);
    socket.broadcast.emit("user-disconnected", Object.keys(users).length);
  });
});

// ✅ Start Server
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
