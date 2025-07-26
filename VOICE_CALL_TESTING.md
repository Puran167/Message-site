# 🎤 Voice Call Testing Guide - PuruVerse

## 📋 Pre-Testing Checklist

### 1. Browser Requirements
- ✅ Use Chrome, Firefox, Safari, or Edge (latest versions)
- ✅ Ensure HTTPS in production (localhost is fine for testing)
- ✅ Allow microphone permissions when prompted

### 2. System Requirements
- ✅ Working microphone
- ✅ Working speakers/headphones
- ✅ Stable internet connection

## 🧪 Testing Steps

### Step 1: Microphone Test
1. Open the chat application
2. Click the 🎤 (microphone test) button in the header
3. Allow microphone permissions when prompted
4. You should see: "✅ Microphone access granted! Voice calls should work."

### Step 2: Multiple Users Setup
1. Open the chat in **two different browser tabs** or **different browsers**
2. Join with different usernames (e.g., "User1" and "User2")
3. Both users should appear in the active users count

### Step 3: Initiate Voice Call
1. In User1's window: Click 👥 (users) button
2. You should see User2 in the online users list
3. Click "📞 Call" next to User2's name
4. User1 should see "Calling User2..." with debug info

### Step 4: Accept/Reject Call
1. In User2's window: A modal should appear with "Incoming Call from User1"
2. Click "Accept" to accept or "Reject" to reject
3. If accepted, both users should see "Connected" status

### Step 5: Test Voice Communication
1. Both users should now be able to speak and hear each other
2. Test the mute/unmute button (🎤/🔇)
3. Test ending the call with the red phone button

## 🔍 Debugging Features

### Debug Information
- Real-time debug messages appear in the call UI
- Check browser console for detailed logs
- Monitor connection states and WebRTC events

### Common Debug Messages
- `🎤 Microphone access granted` - Audio permission OK
- `🔗 Setting up peer connection` - WebRTC initialization
- `📡 Local tracks added to connection` - Audio tracks ready
- `🧊 Sending ICE candidate` - Network discovery
- `🔊 Remote audio track received` - Peer audio connected
- `✅ Voice call connected successfully` - Call established

## ❌ Troubleshooting

### Issue: "Call automatically rejected"
**Solutions:**
1. Check microphone permissions in browser
2. Ensure both users are online and connected
3. Try refreshing both browser tabs
4. Check browser console for error messages

### Issue: "No sound during call"
**Solutions:**
1. Check speaker/headphone volume
2. Test microphone with the 🎤 test button
3. Try using headphones to avoid audio feedback
4. Check browser audio settings

### Issue: "Connection failed"
**Solutions:**
1. Check internet connectivity
2. Try refreshing and reconnecting
3. Ensure firewalls aren't blocking WebRTC
4. Try different browsers

### Issue: "User not found in online list"
**Solutions:**
1. Ensure both users have joined the chat
2. Refresh the users list (click 👥 again)
3. Check that usernames are different
4. Verify server connection

## 🔧 Technical Details

### WebRTC Configuration
- **STUN Servers**: Google STUN servers for NAT traversal
- **Audio Settings**: Echo cancellation, noise suppression, auto gain
- **Signaling**: Socket.IO for call management and WebRTC signaling

### Audio Quality Settings
```javascript
audio: {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true
}
```

### Connection States
1. **Calling** - Initial call request sent
2. **Connecting** - WebRTC negotiation in progress  
3. **Connected** - Voice call established
4. **Ended** - Call terminated

## 📊 Expected Behavior

### Successful Call Flow
1. User1 clicks call → "Calling..." appears
2. User2 receives call modal → Clicks "Accept"
3. WebRTC negotiation occurs (3-10 seconds)
4. Both users see "Connected" status
5. Audio flows bidirectionally
6. Either user can end the call

### Call Rejection Flow
1. User1 clicks call → "Calling..." appears
2. User2 receives call modal → Clicks "Reject"
3. User1 sees "Call was rejected" notification
4. Call UI closes automatically

## 🚀 Performance Tips

1. **Use headphones** to prevent audio feedback
2. **Close unnecessary browser tabs** for better performance
3. **Ensure good internet connection** (especially for mobile)
4. **Test microphone** before important calls
5. **Use latest browser versions** for best WebRTC support

## 📝 Test Scenarios

### Scenario 1: Basic Call Test
- [ ] Two users can establish a call
- [ ] Audio flows in both directions
- [ ] Call can be ended cleanly

### Scenario 2: Permission Handling
- [ ] Microphone permissions requested properly
- [ ] Graceful handling of denied permissions
- [ ] Clear error messages for users

### Scenario 3: Edge Cases
- [ ] User goes offline during call
- [ ] Network interruption handling
- [ ] Multiple call attempts
- [ ] Busy user handling

### Scenario 4: UI/UX
- [ ] Call buttons work on all screen sizes
- [ ] Notifications are clear and helpful
- [ ] Debug information is useful
- [ ] Modal appears correctly

## 📞 Support

If voice calls still don't work after following this guide:
1. Check browser console for errors
2. Verify network connectivity
3. Try different browsers/devices
4. Contact support with debug information

---

**Happy Testing! 🎉**
