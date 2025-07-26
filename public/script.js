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

// ✅ Sound alert on new message
const notificationSound = new Audio("notify.mp3");

// ✅ Detect if tab is hidden for in-app notifications
document.addEventListener("visibilitychange", () => {
  window.isTabHidden = document.hidden;
});

// ✅ Step 1: Load last 20 messages from server
fetch("/api/messages")
  .then(res => res.json())
  .then(messages => {
    chatDisplay.innerHTML = ""; // ✅ Clear old content
    messages.forEach(data => {
      const isSelf = data.sender === name;
      appendMessage({
        name: data.sender,
        message: data.text,
        isSelf: isSelf,
      });
    });
    chatDisplay.scrollTo(0, chatDisplay.scrollHeight);
  });

// ✅ Step 2: Top Bar – Active Users + Username
const topBar = document.createElement("div");
topBar.classList.add("new-div");
topBar.style.padding = "5px";
topBar.style.display = "flex";
topBar.style.justifyContent = "space-between";
topBar.style.alignItems = "center";
container.insertBefore(topBar, chatDisplay);

const activeDiv = document.createElement("div");
topBar.appendChild(activeDiv);

const selfDiv = document.createElement("div");
selfDiv.innerHTML = `You: ${name}`;
topBar.appendChild(selfDiv);

// ✅ Step 3: Announce new user
socket.emit("new-user-joined", name);

// ✅ Step 4: Handle self join
socket.on("self-joined", data => {
  activeDiv.textContent = `Active Users: ${data.activeUsers}`;
  showNotification(`You joined as "${data.name}"`);
});

// ✅ Step 5: Handle other user join
socket.on("user-joined", data => {
  activeDiv.textContent = `Active Users: ${data.activeUsers}`;
  showNotification(`"${data.name}" joined`);
});

// ✅ Step 6: Send message
form.addEventListener("submit", e => {
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
  chatDisplay.scrollTo(0, chatDisplay.scrollHeight);
});

// ✅ Step 7: Receive new message with sound and notification
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
      document.title = "Gossip Deck";
    }, 3000);
  }
});

// ✅ Step 8: Handle disconnects
socket.on("who-disconnected", disconnectedName => {
  showNotification(`"${disconnectedName}" disconnected`);
});

socket.on("user-disconnected", activeUsers => {
  activeDiv.textContent = `Active Users: ${activeUsers}`;
});

// ✅ Utilities
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
  chatDisplay.scrollTo(0, chatDisplay.scrollHeight);
}

function showNotification(text) {
  const notif = document.createElement("div");
  notif.classList.add("msgs", "updates");
  notif.innerHTML = `<p>${text}</p>`;
  chatDisplay.appendChild(notif);
  chatDisplay.scrollTo(0, chatDisplay.scrollHeight);
}

// 😄 Step 9: Emoji Picker Integration
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
