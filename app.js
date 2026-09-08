// app.js

let model;
let isStudying = false;
let isDistracted = false;
let distractionFrames = 0;
let focusFrames = 0;
let animationId;
let memeWindows = [];
let focusSeconds = 0;
let timerInterval;

const timerWidget = document.getElementById('timer-widget');
const studyTimer = document.getElementById('study-timer');

const webcam = document.getElementById('webcam');
const canvasOverlay = document.getElementById('canvas-overlay');
const ctx = canvasOverlay.getContext('2d');

const pipCanvas = document.getElementById('pip-canvas');
const pipCtx = pipCanvas.getContext('2d');
const pipVideo = document.getElementById('pip-video');
const startBtn = document.getElementById('start-btn');
const launcher = document.getElementById('launcher');
const monitorContainer = document.getElementById('monitor-container');
const webcamContainer = document.getElementById('webcam-container');
const memeCanvas = document.getElementById('meme-canvas');
const statusBadge = document.getElementById('status-badge');
const audioPlayer = document.getElementById('punishment-audio');
const loadingOverlay = document.getElementById('loading');

// Initialize the app
async function init() {
  loadingOverlay.classList.add('active');
  const loadingTitle = document.getElementById('loading-title');
  const loadingSub = document.getElementById('loading-sub');
  
  try {
    loadingTitle.innerHTML = "Loading Study App <span id='loading-percent'>0%</span>";
    loadingSub.textContent = "Waiting for Camera...";
    
    const progressElement = document.getElementById('loading-percent');
    let progress = 0;
    const progressInterval = setInterval(() => {
      if (progress < 99) {
        progress += Math.floor(Math.random() * 4) + 1;
        if (progress > 99) progress = 99;
        if (progressElement) progressElement.textContent = `${progress}%`;
      }
    }, 200);

    // 1. CAMERA ACCESS
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      webcam.srcObject = stream;
    } catch (e) {
      throw new Error("Camera Access Failed: " + (e.message || e));
    }
    
    // Wait for video to load
    await new Promise((resolve) => {
      webcam.onloadedmetadata = () => {
        webcam.play().then(resolve).catch(resolve);
      };
    });
    
    canvasOverlay.width = webcam.videoWidth;
    canvasOverlay.height = webcam.videoHeight;
    pipCanvas.width = webcam.videoWidth;
    pipCanvas.height = webcam.videoHeight;
    
    pipCtx.save();
    pipCtx.scale(-1, 1);
    pipCtx.drawImage(webcam, -pipCanvas.width, 0, pipCanvas.width, pipCanvas.height);
    pipCtx.restore();
    
    // 2. PIP SETUP
    try {
      pipVideo.srcObject = pipCanvas.captureStream(30);
      await pipVideo.play().catch(e => console.log("PiP Video play error", e));
    } catch (e) {
      throw new Error("PiP Stream Setup Failed: " + (e.message || e));
    }
    
    loadingSub.textContent = "Almost ready...";
    
    // 3. AI MODEL
    try {
      model = await cocoSsd.load();
    } catch (e) {
      throw new Error("AI Load Failed: " + (e.message || e));
    }
    
    clearInterval(progressInterval);
    if (progressElement) progressElement.textContent = "100%";
    
    setTimeout(() => {
      loadingOverlay.classList.remove('active');
    }, 400);
    
    // 4. POPUP TEST
    try {
      const testPopup = window.open('about:blank', 'TestPopup', 'width=100,height=100');
      if (!testPopup) {
        document.getElementById('popup-warning').classList.remove('hidden');
      } else {
        testPopup.close();
      }
    } catch (e) {
      console.warn("Popup check threw error, ignoring.", e);
    }
    
  } catch (err) {
    console.error("Error initializing:", err);
    alert("SYSTEM ERROR:\n" + (err.message || err) + "\n\nPlease send this exact message back to me.");
  }
}

// Start Studying Button Click
startBtn.addEventListener('click', async () => {
  if (!model) {
    alert("AI Model is still loading. Please wait a moment!");
    return;
  }
  
  // Automatically trigger Mini Player (PiP) immediately to catch the user gesture.
  // Doing this after window.open or other logic can cause the browser to drop the gesture.
  pipVideo.requestPictureInPicture().catch(err => {
    console.warn("Auto-PiP failed or unsupported:", err);
  });
  
  launcher.classList.add('hidden');
  monitorContainer.classList.add('active');
  webcamContainer.classList.remove('hidden');
  timerWidget.classList.remove('hidden');
  isStudying = true;
  
  startTimer();
  
  // Start the detection loop immediately so frames start streaming
  detectLoop();
  
  // Set up audio loop event
  audioPlayer.addEventListener('ended', playRandomSound);
});

// The AI Detection Loop
async function detectLoop() {
  if (!isStudying) return;
  
  try {
    if (webcam.videoWidth === 0 || webcam.videoHeight === 0) {
      return;
    }
    
    // Ensure canvas matches video resolution
    if (canvasOverlay.width !== webcam.videoWidth) {
      canvasOverlay.width = webcam.videoWidth;
      canvasOverlay.height = webcam.videoHeight;
      pipCanvas.width = webcam.videoWidth;
      pipCanvas.height = webcam.videoHeight;
    }
    
    // Draw flipped webcam to PiP canvas
    pipCtx.save();
    pipCtx.scale(-1, 1);
    pipCtx.drawImage(webcam, -pipCanvas.width, 0, pipCanvas.width, pipCanvas.height);
    pipCtx.restore();
    
    // Draw the timer and "FOCUS TIME" on the PiP canvas
    const timeStr = studyTimer.textContent;
    pipCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    pipCtx.fillRect(10, 10, 180, 70);
    
    pipCtx.fillStyle = '#cccccc'; // Light grey label
    pipCtx.font = 'bold 14px sans-serif';
    pipCtx.fillText("FOCUS TIME", 25, 32);

    pipCtx.fillStyle = '#ffbc0d'; // McDonald's Yellow time
    pipCtx.font = 'bold 36px sans-serif';
    pipCtx.fillText(timeStr, 23, 68);

    // Draw status alert / badge
    if (isDistracted) {
      pipCtx.fillStyle = 'rgba(219, 0, 7, 0.8)'; // Red
      pipCtx.fillRect(0, pipCanvas.height - 50, pipCanvas.width, 50);
      pipCtx.fillStyle = 'white';
      pipCtx.font = 'bold 24px sans-serif';
      pipCtx.fillText("⚠️ PHONE DETECTED! ⚠️", 20, pipCanvas.height - 18);
    } else {
      pipCtx.fillStyle = 'rgba(0, 0, 0, 0.6)'; // Semi-transparent black background
      pipCtx.fillRect(pipCanvas.width - 130, 10, 120, 35);
      pipCtx.fillStyle = '#22c55e'; // Green text
      pipCtx.font = 'bold 18px sans-serif';
      pipCtx.fillText("STUDYING", pipCanvas.width - 115, 34);
    }
    
    // Detect objects
    const predictions = await model.detect(webcam);
    
    ctx.clearRect(0, 0, canvasOverlay.width, canvasOverlay.height);
    
    let phoneDetected = false;
    
    // Draw boxes and check for phone
    for (let i = 0; i < predictions.length; i++) {
      const pred = predictions[i];
      
      // Draw all boxes for debugging/visuals
      ctx.beginPath();
      ctx.rect(...pred.bbox);
      ctx.lineWidth = 2;
      ctx.strokeStyle = pred.class === 'cell phone' ? 'red' : '#22c55e';
      ctx.fillStyle = pred.class === 'cell phone' ? 'red' : '#22c55e';
      ctx.stroke();
      
      // Text background
      ctx.fillRect(pred.bbox[0], pred.bbox[1] - 15, ctx.measureText(pred.class).width + 30, 15);
      ctx.fillStyle = 'white';
      ctx.fillText(`${pred.class} (${Math.round(pred.score * 100)}%)`, pred.bbox[0], pred.bbox[1] - 3);
      
      if (pred.class === 'cell phone') {
        phoneDetected = true;
      }
    }
    
    // State smoothing logic
    if (phoneDetected) {
      distractionFrames++;
      focusFrames = 0;
      if (distractionFrames >= 2 && !isDistracted) {
        triggerDistraction();
      }
      
      // Force the job application window to stay on top
      if (isDistracted && jobWindow && !jobWindow.closed) {
        try { jobWindow.focus(); } catch (e) {}
      }
    } else {
      focusFrames++;
      distractionFrames = 0;
      if (focusFrames >= 8 && isDistracted) {
        triggerFocus();
      }
    }
  } catch (err) {
    console.error("Detect Error:", err);
    // Only alert once to prevent infinite popups
    if (!window.hasAlertedError) {
      alert("AI Detection crashed! Error: " + err.message);
      window.hasAlertedError = true;
    }
  } finally {
    // Loop using requestAnimationFrame
    animationId = requestAnimationFrame(detectLoop);
  }
}

// Play a random sound
function playRandomSound() {
  if (!isDistracted || typeof SOUND_FILES === 'undefined' || SOUND_FILES.length === 0) return;
  
  const randomSound = SOUND_FILES[Math.floor(Math.random() * SOUND_FILES.length)];
  audioPlayer.src = `Sounds To Play/${randomSound}`;
  audioPlayer.play().catch(e => console.error("Audio play failed:", e));
}

// Spawn memes as popups
function spawnMemes() {
  if (typeof MEME_FILES === 'undefined' || MEME_FILES.length === 0) return;
  if (memeWindows.length > 0) return; // Prevent infinite popping
  
  const canvasElement = document.getElementById('meme-canvas');
  const canvasRect = canvasElement.getBoundingClientRect();
  const screenW = window.screen.availWidth || 1920;
  const screenH = window.screen.availHeight || 1080;
  
  const placedCanvasRects = [];
  const placedPopupRects = [];
  
  // Only spawn 3 to avoid instantly crashing the browser
  for (let i = 0; i < 3; i++) {
    const randomMeme = MEME_FILES[Math.floor(Math.random() * MEME_FILES.length)];
    
    // Vary size between 250px and 450px
    const memeW = Math.max(250, Math.floor(Math.random() * 200) + 250);
    const memeH = Math.max(250, Math.floor(Math.random() * 200) + 250);
    
    // --- CANVAS OVERLAP LOGIC ---
    let canvasLeft, canvasTop;
    let attempts = 0;
    let overlapping = true;
    while (overlapping && attempts < 50) {
      canvasLeft = Math.floor(Math.random() * Math.max(1, canvasRect.width - memeW));
      canvasTop = Math.floor(Math.random() * Math.max(1, canvasRect.height - memeH));
      const newRect = { l: canvasLeft, t: canvasTop, r: canvasLeft + memeW, b: canvasTop + memeH };
      overlapping = placedCanvasRects.some(rect => !(newRect.r < rect.l || newRect.l > rect.r || newRect.b < rect.t || newRect.t > rect.b));
      attempts++;
    }
    placedCanvasRects.push({ l: canvasLeft, t: canvasTop, r: canvasLeft + memeW, b: canvasTop + memeH });
    
    // --- POPUP OVERLAP LOGIC ---
    let popLeft, popTop;
    attempts = 0;
    overlapping = true;
    while (overlapping && attempts < 50) {
      // Force popLeft to strictly be between screenW/2 and screenW-memeW
      popLeft = Math.floor(Math.random() * ((screenW / 2) - memeW)) + (screenW / 2);
      popTop = Math.floor(Math.random() * (screenH - memeH));
      const newRect = { l: popLeft, t: popTop, r: popLeft + memeW, b: popTop + memeH };
      overlapping = placedPopupRects.some(rect => !(newRect.r < rect.l || newRect.l > rect.r || newRect.b < rect.t || newRect.t > rect.b));
      attempts++;
    }
    placedPopupRects.push({ l: popLeft, t: popTop, r: popLeft + memeW, b: popTop + memeH });
    
    const imgPath = `Crazy%20Meme%20Pictures/${encodeURIComponent(randomMeme)}`;

    // 1. Append to the on-screen canvas for maximum chaos
    const img = document.createElement('img');
    img.src = decodeURIComponent(imgPath); // decode for local src assignment, browser re-encodes
    img.className = 'meme-img';
    img.style.width = `${memeW}px`;
    img.style.height = `${memeH}px`;
    img.style.left = `${canvasLeft}px`;
    img.style.top = `${canvasTop}px`;
    img.style.zIndex = Math.floor(Math.random() * 100);
    canvasElement.appendChild(img);

    // 2. Spawn the popup window
    const mw = window.open("", `Meme_${Date.now()}_${i}`, `width=${memeW},height=${memeH},left=${popLeft},top=${popTop},popup=yes,toolbar=no,location=no,status=no,menubar=no,scrollbars=no`);
    if (mw) {
      const imgUrl = new URL(decodeURIComponent(imgPath), window.location.href).href;
      mw.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>PUT THE PHONE DOWN!</title>
          <style>
            body { margin: 0; background: #000; display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; }
            img { max-width: 100%; max-height: 100%; object-fit: contain; }
          </style>
        </head>
        <body>
          <img src="${imgUrl}" />
        </body>
        </html>
      `);
      mw.document.close();
      memeWindows.push(mw);
    }
  }
}

let jobWindow = null;

function triggerDistraction() {
  isDistracted = true;
  statusBadge.textContent = "DISTRACTED (Phone Detected)";
  statusBadge.classList.add('distracted');
  
  if (!jobWindow || jobWindow.closed) {
    const url = Math.random() > 0.5 ? "https://jobs.mchire.com/" : "https://kfcjobs.mcidirecthire.com/Vacancy?PSN=External%20Store";
    jobWindow = window.open(url, "JobApp", "width=800,height=1000,left=0,top=0");
    
    if (!jobWindow) {
      statusBadge.textContent = "POPUPS BLOCKED! PLEASE ALLOW POPUPS!";
      alert("Please allow popups for this site so the job applications can open!");
    }
  }
  
  playRandomSound();
  spawnMemes();
}

function triggerFocus() {
  isDistracted = false;
  statusBadge.textContent = "STUDYING";
  statusBadge.classList.remove('distracted');
  
  if (jobWindow && !jobWindow.closed) {
    jobWindow.close();
    jobWindow = null;
  }
  
  // Close native meme windows
  memeWindows.forEach(mw => {
    if (mw && !mw.closed) mw.close();
  });
  memeWindows = [];
  
  // Clear on-screen canvas
  document.getElementById('meme-canvas').innerHTML = '';
  
  // Stop audio
  audioPlayer.pause();
  audioPlayer.currentTime = 0;
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function startTimer() {
  timerInterval = setInterval(() => {
    if (isStudying && !isDistracted) {
      focusSeconds++;
      studyTimer.textContent = formatTime(focusSeconds);
    }
  }, 1000);
}

// Start everything
window.onload = init;
