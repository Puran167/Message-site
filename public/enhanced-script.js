const socket = io();
const chatDisplay = document.querySelector("#chat-display");
const container = document.querySelector("#container");
const form = document.querySelector("#send-msg");
const input = document.querySelector("#input");

// Get or prompt user name
let name = localStorage.getItem("username");
if (!name) {
  name = prompt("Enter your name:");
  localStorage.setItem("username", name);
}

// Global variables
let isRecording = false;
let mediaRecorder = null;
let recordedChunks = [];
let recordingTimer = null;
let recordingStartTime = 0;
let currentCall = null;
let onlineUsers = [];
let localStream = null;
let peerConnection = null;

// ✅ Sound alert on new message
const notificationSound = new Audio("notify.mp3");

// ✅ Detect if tab is hidden for in-app notifications
document.addEventListener("visibilitychange", () => {
  window.isTabHidden = document.hidden;
});

// ✅ Initialize Dark Mode
initializeDarkMode();

// ✅ Load chat history
loadChatHistory();

// ✅ Setup UI components
setupTopBar();
setupEventListeners();

// ✅ Announce new user
socket.emit("new-user-joined", name);

// ==================== CORE CHAT FUNCTIONALITY ====================

function loadChatHistory() {
  fetch("/api/messages")
    .then(res => res.json())
    .then(messages => {
      chatDisplay.innerHTML = "";
      messages.forEach(data => {
        const isSelf = data.sender === name;
        appendMessage({
          name: data.sender,
          message: data.text,
          isSelf: isSelf,
        });
      });
      scrollToBottom();
    });
}

function setupTopBar() {
  const topBar = document.createElement("div");
  topBar.classList.add("new-div");
  topBar.style.padding = "5px";
  topBar.style.display = "flex";
  topBar.style.justifyContent = "space-between";
  topBar.style.alignItems = "center";
  topBar.style.background = "var(--bg-secondary)";
  topBar.style.borderRadius = "8px";
  topBar.style.marginBottom = "10px";
  topBar.style.color = "var(--text-primary)";
  
  container.insertBefore(topBar, chatDisplay);

  const activeDiv = document.createElement("div");
  topBar.appendChild(activeDiv);

  const selfDiv = document.createElement("div");
  selfDiv.innerHTML = `You: ${name}`;
  topBar.appendChild(selfDiv);

  window.activeDiv = activeDiv;
}

function setupEventListeners() {
  // Message form
  form.addEventListener("submit", handleMessageSubmit);
  
  // Dark mode toggle
  document.getElementById("darkModeToggle").addEventListener("change", toggleDarkMode);
  
  // Header buttons
  document.getElementById("users-btn").addEventListener("click", toggleUsersSidebar);
  document.getElementById("poll-btn").addEventListener("click", openPollModal);
  
  // Sidebar
  document.getElementById("close-users").addEventListener("click", closeUsersSidebar);
  
  // Poll modal
  document.getElementById("close-poll-modal").addEventListener("click", closePollModal);
  document.getElementById("add-poll-option").addEventListener("click", addPollOption);
  document.getElementById("create-poll-btn").addEventListener("click", createPoll);
  document.getElementById("cancel-poll-btn").addEventListener("click", closePollModal);
  
  // File upload
  document.getElementById("file-btn").addEventListener("click", () => {
    document.getElementById("file-input").click();
  });
  document.getElementById("file-input").addEventListener("change", handleFileUpload);
  
  // Voice recording
  document.getElementById("voice-btn").addEventListener("click", toggleVoiceRecording);
  document.getElementById("stop-recording-btn").addEventListener("click", stopRecording);
  document.getElementById("cancel-recording-btn").addEventListener("click", cancelRecording);
  
  // Voice call
  document.getElementById("end-call-btn").addEventListener("click", endCall);
  document.getElementById("mute-btn").addEventListener("click", toggleMute);
  
  // Close modals on outside click
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal")) {
      e.target.classList.remove("open");
    }
  });
}

// ==================== SOCKET EVENT HANDLERS ====================

socket.on("self-joined", data => {
  window.activeDiv.textContent = `Active Users: ${data.activeUsers}`;
  showNotification(`You joined as "${data.name}"`);
});

socket.on("user-joined", data => {
  window.activeDiv.textContent = `Active Users: ${data.activeUsers}`;
  showNotification(`"${data.name}" joined`);
});

socket.on("online-users", (users) => {
  onlineUsers = users;
  updateOnlineUsersList();
});

socket.on("user-online", (user) => {
  onlineUsers.push(user);
  updateOnlineUsersList();
});

socket.on("user-offline", (userId) => {
  onlineUsers = onlineUsers.filter(user => user.id !== userId);
  updateOnlineUsersList();
});

socket.on("msg-receive", data => {
  appendMessage({
    name: data.name,
    message: data.message,
    isSelf: false
  });

  notificationSound.play();

  if (window.isTabHidden) {
    document.title = `New message from ${data.name}`;
    setTimeout(() => {
      document.title = "PuruVerse";
    }, 3000);
  }
});

socket.on("who-disconnected", disconnectedName => {
  showNotification(`"${disconnectedName}" disconnected`);
});

socket.on("user-disconnected", activeUsers => {
  window.activeDiv.textContent = `Active Users: ${activeUsers}`;
});

// ==================== VOICE CALL EVENTS ====================

socket.on("incoming-call", (data) => {
  console.log("Incoming call from:", data.callerName, "ID:", data.callerId);
  
  if (currentCall) {
    console.log("Already in call, rejecting incoming call");
    socket.emit("reject-call", { callerId: data.callerId });
    return;
  }

  // Show a more user-friendly modal instead of confirm
  showIncomingCallModal(data.callerId, data.callerName);
});

socket.on("call-accepted", async (data) => {
  console.log("Call accepted, peer ID:", data.peerId);
  currentCall = { peerId: data.peerId, status: "connected" };
  showCallUI(`Connected with user`, true);
  await setupPeerConnection(data.peerId, true);
});

socket.on("call-connected", async (data) => {
  console.log("Call connected, peer ID:", data.peerId);
  currentCall = { peerId: data.peerId, status: "connected" };
  showCallUI(`Connected with user`, true);
  await setupPeerConnection(data.peerId, false);
});

socket.on("call-rejected", () => {
  console.log("Call was rejected");
  showNotification("Call was rejected");
  hideCallUI();
  currentCall = null;
});

socket.on("call-ended", () => {
  console.log("Call ended by peer");
  showNotification("Call ended");
  endCall();
});

socket.on("call-busy", () => {
  console.log("User is busy");
  showNotification("User is busy");
  hideCallUI();
  currentCall = null;
});

socket.on("call-error", (data) => {
  console.log("Call error:", data.message);
  showNotification(`Call error: ${data.message}`);
  hideCallUI();
  currentCall = null;
});

// WebRTC signaling events
socket.on("webrtc-offer", async (data) => {
  if (peerConnection && currentCall) {
    await peerConnection.setRemoteDescription(data.offer);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    
    socket.emit("webrtc-answer", {
      answer: answer,
      targetId: data.callerId
    });
  }
});

socket.on("webrtc-answer", async (data) => {
  if (peerConnection) {
    await peerConnection.setRemoteDescription(data.answer);
  }
});

socket.on("webrtc-ice-candidate", async (data) => {
  if (peerConnection) {
    await peerConnection.addIceCandidate(data.candidate);
  }
});

// ==================== POLL EVENTS ====================

socket.on("new-poll", (pollData) => {
  appendPollMessage(pollData);
});

socket.on("poll-updated", (pollData) => {
  updatePollResults(pollData);
});

socket.on("poll-error", (error) => {
  alert(`Poll Error: ${error}`);
});

// ==================== FILE SHARING EVENTS ====================

socket.on("file-received", (fileData) => {
  appendFileMessage(fileData);
});

// ==================== MESSAGE HANDLING ====================

function handleMessageSubmit(e) {
  e.preventDefault();
  const msg = input.value.trim();
  if (!msg) return;

  socket.emit("msg-sent", msg);

  appendMessage({
    name,
    message: msg,
    isSelf: true
  });

  input.value = "";
  scrollToBottom();
}

function appendMessage({ name, message, isSelf }) {
  const msgDiv = document.createElement("div");
  msgDiv.classList.add("msgs", isSelf ? "self" : "other");

  const nameP = document.createElement("p");
  nameP.id = isSelf ? "self-name" : "other-name";
  nameP.textContent = isSelf ? "You" : name;
  msgDiv.appendChild(nameP);

  const msgP = document.createElement("p");
  msgP.id = isSelf ? "self-msg" : "other-msg";
  msgP.textContent = message;
  msgDiv.appendChild(msgP);

  chatDisplay.appendChild(msgDiv);
  scrollToBottom();
}

function appendFileMessage(fileData) {
  const msgDiv = document.createElement("div");
  msgDiv.classList.add("msgs", "other");

  const nameP = document.createElement("p");
  nameP.id = "other-name";
  nameP.textContent = fileData.sender;
  msgDiv.appendChild(nameP);

  const fileContainer = createFileDisplay(fileData);
  msgDiv.appendChild(fileContainer);

  chatDisplay.appendChild(msgDiv);
  scrollToBottom();
}

function appendPollMessage(pollData) {
  const msgDiv = document.createElement("div");
  msgDiv.classList.add("msgs", "other");

  const nameP = document.createElement("p");
  nameP.id = "other-name";
  nameP.textContent = pollData.creator;
  msgDiv.appendChild(nameP);

  const pollContainer = createPollDisplay(pollData);
  msgDiv.appendChild(pollContainer);

  chatDisplay.appendChild(msgDiv);
  scrollToBottom();
}

// ==================== DARK MODE ====================

function initializeDarkMode() {
  const isDarkMode = localStorage.getItem("darkMode") === "true";
  if (isDarkMode) {
    document.body.classList.add("dark-theme");
    document.getElementById("darkModeToggle").checked = true;
  }
}

function toggleDarkMode() {
  const isDarkMode = document.getElementById("darkModeToggle").checked;
  if (isDarkMode) {
    document.body.classList.add("dark-theme");
  } else {
    document.body.classList.remove("dark-theme");
  }
  localStorage.setItem("darkMode", isDarkMode);
}

// ==================== VOICE RECORDING ====================

async function toggleVoiceRecording() {
  if (!isRecording) {
    await startRecording();
  } else {
    await stopRecording();
  }
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    recordedChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(recordedChunks, { type: 'audio/webm' });
      await uploadAudio(blob);
      
      // Stop all tracks
      stream.getTracks().forEach(track => track.stop());
    };

    mediaRecorder.start();
    isRecording = true;
    
    document.getElementById("voice-btn").classList.add("recording");
    document.getElementById("voice-recording-ui").classList.add("active");
    
    recordingStartTime = Date.now();
    startRecordingTimer();
    
  } catch (error) {
    console.error("Error starting recording:", error);
    alert("Could not access microphone. Please check permissions.");
  }
}

async function stopRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    
    document.getElementById("voice-btn").classList.remove("recording");
    document.getElementById("voice-recording-ui").classList.remove("active");
    
    clearInterval(recordingTimer);
  }
}

function cancelRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    recordedChunks = [];
    
    document.getElementById("voice-btn").classList.remove("recording");
    document.getElementById("voice-recording-ui").classList.remove("active");
    
    clearInterval(recordingTimer);
    
    // Stop all tracks without uploading
    if (mediaRecorder.stream) {
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
  }
}

function startRecordingTimer() {
  recordingTimer = setInterval(() => {
    const elapsed = Date.now() - recordingStartTime;
    const seconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(seconds / 60);
    const displaySeconds = seconds % 60;
    
    document.getElementById("recording-timer").textContent = 
      `${minutes.toString().padStart(2, '0')}:${displaySeconds.toString().padStart(2, '0')}`;
  }, 1000);
}

async function uploadAudio(blob) {
  const formData = new FormData();
  formData.append('file', blob, 'voice_message.webm');

  try {
    const response = await fetch('/upload', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();
    if (result.success) {
      // Send audio message
      appendAudioMessage(result, true);
      
      // Emit to other users
      socket.emit("file-shared", {
        type: 'audio',
        url: result.url,
        filename: result.filename,
        originalname: result.originalname
      });
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    console.error("Error uploading audio:", error);
    alert("Failed to send voice message");
  }
}

function appendAudioMessage(fileData, isSelf) {
  const msgDiv = document.createElement("div");
  msgDiv.classList.add("msgs", isSelf ? "self" : "other");

  const nameP = document.createElement("p");
  nameP.id = isSelf ? "self-name" : "other-name";
  nameP.textContent = isSelf ? "You" : fileData.sender;
  msgDiv.appendChild(nameP);

  const audioElement = document.createElement("audio");
  audioElement.controls = true;
  audioElement.src = fileData.url;
  audioElement.classList.add("media-message");
  msgDiv.appendChild(audioElement);

  chatDisplay.appendChild(msgDiv);
  scrollToBottom();
}

// ==================== FILE UPLOAD ====================

async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch('/upload', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();
    if (result.success) {
      // Display file in chat
      appendSelfFileMessage(result);
      
      // Emit to other users
      socket.emit("file-shared", {
        type: getFileType(result.mimetype),
        url: result.url,
        filename: result.filename,
        originalname: result.originalname,
        mimetype: result.mimetype,
        size: result.size
      });
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    console.error("Error uploading file:", error);
    alert("Failed to upload file");
  }

  // Reset file input
  event.target.value = '';
}

function appendSelfFileMessage(fileData) {
  const msgDiv = document.createElement("div");
  msgDiv.classList.add("msgs", "self");

  const nameP = document.createElement("p");
  nameP.id = "self-name";
  nameP.textContent = "You";
  msgDiv.appendChild(nameP);

  const fileContainer = createFileDisplay(fileData);
  msgDiv.appendChild(fileContainer);

  chatDisplay.appendChild(msgDiv);
  scrollToBottom();
}

function createFileDisplay(fileData) {
  const fileType = getFileType(fileData.mimetype);
  
  switch (fileType) {
    case 'image':
      return createImageDisplay(fileData);
    case 'video':
      return createVideoDisplay(fileData);
    case 'audio':
      return createAudioDisplay(fileData);
    default:
      return createDocumentDisplay(fileData);
  }
}

function createImageDisplay(fileData) {
  const img = document.createElement("img");
  img.src = fileData.url;
  img.alt = fileData.originalname;
  img.classList.add("media-message");
  img.style.cursor = "pointer";
  img.onclick = () => window.open(fileData.url, '_blank');
  return img;
}

function createVideoDisplay(fileData) {
  const video = document.createElement("video");
  video.src = fileData.url;
  video.controls = true;
  video.classList.add("media-message");
  return video;
}

function createAudioDisplay(fileData) {
  const audio = document.createElement("audio");
  audio.src = fileData.url;
  audio.controls = true;
  audio.classList.add("media-message");
  return audio;
}

function createDocumentDisplay(fileData) {
  const fileContainer = document.createElement("div");
  fileContainer.classList.add("file-message");

  const fileInfo = document.createElement("div");
  fileInfo.classList.add("file-info");

  const fileIcon = document.createElement("span");
  fileIcon.classList.add("file-icon");
  fileIcon.textContent = getFileIcon(fileData.mimetype);

  const fileDetails = document.createElement("div");
  fileDetails.classList.add("file-details");

  const fileName = document.createElement("div");
  fileName.classList.add("file-name");
  fileName.textContent = fileData.originalname;

  const fileSize = document.createElement("div");
  fileSize.classList.add("file-size");
  fileSize.textContent = formatFileSize(fileData.size);

  const downloadBtn = document.createElement("button");
  downloadBtn.classList.add("download-btn");
  downloadBtn.textContent = "Download";
  downloadBtn.onclick = () => window.open(fileData.url, '_blank');

  fileDetails.appendChild(fileName);
  fileDetails.appendChild(fileSize);

  fileInfo.appendChild(fileIcon);
  fileInfo.appendChild(fileDetails);
  fileInfo.appendChild(downloadBtn);

  fileContainer.appendChild(fileInfo);

  return fileContainer;
}

function getFileType(mimetype) {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  return 'document';
}

function getFileIcon(mimetype) {
  if (mimetype.includes('pdf')) return '📄';
  if (mimetype.includes('word') || mimetype.includes('doc')) return '📝';
  if (mimetype.includes('text')) return '📄';
  return '📎';
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ==================== VOICE CALLS ====================

function updateOnlineUsersList() {
  const usersList = document.getElementById("online-users-list");
  if (!usersList) return;
  
  usersList.innerHTML = "";
  console.log("Updating online users list:", onlineUsers);

  onlineUsers.forEach(user => {
    const userItem = document.createElement("div");
    userItem.classList.add("user-item");

    const userName = document.createElement("span");
    userName.textContent = user.username;

    const callBtn = document.createElement("button");
    callBtn.classList.add("call-user-btn");
    callBtn.textContent = "📞 Call";
    callBtn.onclick = () => startCall(user.id, user.username);

    userItem.appendChild(userName);
    userItem.appendChild(callBtn);
    usersList.appendChild(userItem);
  });
}

async function startCall(userId, username) {
  console.log(`Starting call to ${username} with ID: ${userId}`);
  
  if (currentCall) {
    alert("You're already in a call");
    return;
  }

  // Check microphone permission first
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop()); // Stop the test stream
  } catch (error) {
    alert("Microphone access is required for voice calls. Please allow microphone access and try again.");
    return;
  }

  currentCall = { peerId: userId, status: "calling" };
  showCallUI(`Calling ${username}...`, false);

  socket.emit("call-user", { targetUserId: userId });
  closeUsersSidebar();
}

async function acceptCall(callerId) {
  console.log(`Accepting call from: ${callerId}`);
  
  // Check microphone permission before accepting
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop()); // Stop the test stream
    
    socket.emit("accept-call", { callerId });
  } catch (error) {
    alert("Microphone access is required to accept calls. Please allow microphone access.");
    socket.emit("reject-call", { callerId });
  }
}

function rejectCall(callerId) {
  console.log(`Rejecting call from: ${callerId}`);
  socket.emit("reject-call", { callerId });
  hideIncomingCallModal();
}

function showIncomingCallModal(callerId, callerName) {
  // Remove existing modal if any
  const existingModal = document.getElementById("incoming-call-modal");
  if (existingModal) {
    existingModal.remove();
  }

  const modal = document.createElement("div");
  modal.id = "incoming-call-modal";
  modal.className = "modal open";
  modal.innerHTML = `
    <div class="modal-content">
      <div class="incoming-call-content">
        <div class="call-avatar">📞</div>
        <h3>Incoming Call</h3>
        <p>From: ${callerName}</p>
        <div class="call-actions">
          <button id="accept-call-btn" class="primary-btn">Accept</button>
          <button id="reject-call-btn" class="secondary-btn">Reject</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Add event listeners
  document.getElementById("accept-call-btn").onclick = () => {
    hideIncomingCallModal();
    acceptCall(callerId);
  };

  document.getElementById("reject-call-btn").onclick = () => {
    rejectCall(callerId);
  };

  // Auto-reject after 30 seconds
  setTimeout(() => {
    if (document.getElementById("incoming-call-modal")) {
      rejectCall(callerId);
    }
  }, 30000);
}

function hideIncomingCallModal() {
  const modal = document.getElementById("incoming-call-modal");
  if (modal) {
    modal.remove();
  }
}

function endCall() {
  console.log("Ending call");
  
  if (currentCall) {
    socket.emit("end-call", { peerId: currentCall.peerId });
  }

  // Clean up peer connection
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  // Stop local stream
  if (localStream) {
    localStream.getTracks().forEach(track => {
      track.stop();
      console.log("Stopped track:", track.kind);
    });
    localStream = null;
  }

  // Clean up UI
  hideCallUI();
  hideIncomingCallModal();
  currentCall = null;
  
  console.log("Call cleanup completed");
}

async function setupPeerConnection(peerId, isInitiator) {
  console.log(`Setting up peer connection with ${peerId}, isInitiator: ${isInitiator}`);
  
  try {
    // Get microphone access
    localStream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      } 
    });
    console.log("Got local audio stream");

    // Create peer connection with better configuration
    peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    });

    // Add local stream tracks
    localStream.getTracks().forEach(track => {
      console.log("Adding track to peer connection:", track.kind);
      peerConnection.addTrack(track, localStream);
    });

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("Sending ICE candidate");
        socket.emit("webrtc-ice-candidate", {
          candidate: event.candidate,
          targetId: peerId
        });
      }
    };

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      console.log("Received remote track");
      const remoteAudio = new Audio();
      remoteAudio.srcObject = event.streams[0];
      remoteAudio.autoplay = true;
      remoteAudio.play().catch(error => {
        console.error("Error playing remote audio:", error);
      });
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      console.log("Connection state:", peerConnection.connectionState);
      if (peerConnection.connectionState === 'connected') {
        showCallUI("Connected", true);
      } else if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
        console.log("Connection failed or disconnected");
        endCall();
      }
    };

    // Create offer if initiator
    if (isInitiator) {
      console.log("Creating offer as initiator");
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      socket.emit("webrtc-offer", {
        offer: offer,
        targetId: peerId
      });
    }

  } catch (error) {
    console.error("Error setting up peer connection:", error);
    alert("Failed to setup voice call: " + error.message);
    endCall();
  }
}

function showCallUI(status, isConnected) {
  const callUI = document.getElementById("voice-call-ui");
  const callStatus = document.getElementById("call-status");
  
  callStatus.textContent = status;
  callUI.classList.add("active");

  if (isConnected) {
    document.getElementById("mute-btn").style.display = "block";
  } else {
    document.getElementById("mute-btn").style.display = "none";
  }
}

function hideCallUI() {
  document.getElementById("voice-call-ui").classList.remove("active");
}

function toggleMute() {
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      const muteBtn = document.getElementById("mute-btn");
      if (audioTrack.enabled) {
        muteBtn.textContent = "🎤";
        muteBtn.classList.remove("muted");
      } else {
        muteBtn.textContent = "🔇";
        muteBtn.classList.add("muted");
      }
    }
  }
}

// ==================== POLLS ====================

function openPollModal() {
  document.getElementById("poll-modal").classList.add("open");
}

function closePollModal() {
  document.getElementById("poll-modal").classList.remove("open");
  document.getElementById("poll-question").value = "";
  
  // Reset options to default 2
  const optionsContainer = document.getElementById("poll-options");
  optionsContainer.innerHTML = `
    <input type="text" class="poll-option" placeholder="Option 1" maxlength="100">
    <input type="text" class="poll-option" placeholder="Option 2" maxlength="100">
  `;
}

function addPollOption() {
  const optionsContainer = document.getElementById("poll-options");
  const optionCount = optionsContainer.children.length;
  
  if (optionCount < 6) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "poll-option";
    input.placeholder = `Option ${optionCount + 1}`;
    input.maxLength = 100;
    optionsContainer.appendChild(input);
  } else {
    alert("Maximum 6 options allowed");
  }
}

function createPoll() {
  const question = document.getElementById("poll-question").value.trim();
  const optionInputs = document.querySelectorAll(".poll-option");
  
  if (!question) {
    alert("Please enter a question");
    return;
  }

  const options = Array.from(optionInputs)
    .map(input => input.value.trim())
    .filter(text => text.length > 0);

  if (options.length < 2) {
    alert("Please provide at least 2 options");
    return;
  }

  socket.emit("create-poll", { question, options });
  closePollModal();
}

function createPollDisplay(pollData) {
  const pollContainer = document.createElement("div");
  pollContainer.classList.add("poll-message");
  pollContainer.dataset.pollId = pollData.id;

  const question = document.createElement("div");
  question.classList.add("poll-question");
  question.textContent = pollData.question;

  const creator = document.createElement("div");
  creator.classList.add("poll-creator");
  creator.textContent = `Created by ${pollData.creator}`;

  const optionsContainer = document.createElement("div");
  optionsContainer.classList.add("poll-options");

  pollData.options.forEach((option, index) => {
    const optionElement = createPollOption(option, index, pollData.id);
    optionsContainer.appendChild(optionElement);
  });

  pollContainer.appendChild(question);
  pollContainer.appendChild(creator);
  pollContainer.appendChild(optionsContainer);

  return pollContainer;
}

function createPollOption(option, index, pollId) {
  const optionDiv = document.createElement("div");
  optionDiv.classList.add("poll-option");
  optionDiv.dataset.optionIndex = index;
  optionDiv.onclick = () => votePoll(pollId, index);

  const content = document.createElement("div");
  content.classList.add("poll-option-content");

  const text = document.createElement("span");
  text.classList.add("poll-option-text");
  text.textContent = option.text;

  const votes = document.createElement("span");
  votes.classList.add("poll-option-votes");
  votes.textContent = `${option.votes.length} votes`;

  content.appendChild(text);
  content.appendChild(votes);
  optionDiv.appendChild(content);

  return optionDiv;
}

function votePoll(pollId, optionIndex) {
  socket.emit("vote-poll", { pollId, optionIndex });
}

function updatePollResults(pollData) {
  const pollContainer = document.querySelector(`[data-poll-id="${pollData.id}"]`);
  if (!pollContainer) return;

  const optionsContainer = pollContainer.querySelector(".poll-options");
  const totalVotes = pollData.options.reduce((sum, option) => sum + option.votes.length, 0);

  pollData.options.forEach((option, index) => {
    const optionElement = optionsContainer.children[index];
    if (!optionElement) return;

    const votesSpan = optionElement.querySelector(".poll-option-votes");
    votesSpan.textContent = `${option.votes.length} votes`;

    // Update visual percentage
    const percentage = totalVotes > 0 ? (option.votes.length / totalVotes) * 100 : 0;
    optionElement.style.setProperty('--vote-percentage', `${percentage}%`);
    
    if (option.votes.length > 0) {
      optionElement.classList.add("voted");
    }
  });
}

// ==================== UI HELPERS ====================

function toggleUsersSidebar() {
  const sidebar = document.getElementById("users-sidebar");
  sidebar.classList.toggle("open");
}

function closeUsersSidebar() {
  document.getElementById("users-sidebar").classList.remove("open");
}

function showNotification(text) {
  const notif = document.createElement("div");
  notif.classList.add("msgs", "updates");
  notif.innerHTML = `<p>${text}</p>`;
  chatDisplay.appendChild(notif);
  scrollToBottom();
}

function scrollToBottom() {
  chatDisplay.scrollTo(0, chatDisplay.scrollHeight);
}

// ==================== EMOJI PICKER ====================

const inputField = document.getElementById('input');
const emojiBtn = document.getElementById('emoji-btn');

const picker = new EmojiButton({
  position: 'top-end',
  autoHide: false,
  showSearch: true,
  showPreview: false
});

emojiBtn.addEventListener('click', () => {
  picker.togglePicker(emojiBtn);
});

picker.on('emoji', emoji => {
  const start = inputField.selectionStart;
  const end = inputField.selectionEnd;
  const text = inputField.value;
  inputField.value = text.substring(0, start) + emoji + text.substring(end);
  inputField.focus();
  inputField.selectionStart = inputField.selectionEnd = start + emoji.length;
});

// ==================== KEYBOARD SHORTCUTS ====================

document.addEventListener('keydown', (e) => {
  // Ctrl/Cmd + D for dark mode toggle
  if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
    e.preventDefault();
    document.getElementById('darkModeToggle').click();
  }
  
  // Escape to close modals/sidebars
  if (e.key === 'Escape') {
    closeUsersSidebar();
    closePollModal();
    if (isRecording) {
      cancelRecording();
    }
  }
});

// ==================== INITIALIZE ====================

console.log("PuruVerse Chat App Loaded Successfully! 🚀");
