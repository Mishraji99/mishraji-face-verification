import { CameraManager, cameraErrorMessage } from "./camera.js";
import { FaceDetection } from "./face-detection.js";
import { UI } from "./ui.js";

const ui = new UI();
const camera = new CameraManager(ui.nodes.camera, {
  onLost: message => {
    ui.setCamera(false);
    ui.updateScanAvailability(false);
    ui.status(message, "error");
    ui.toast(message);
    refreshDiagnostics();
  },
  onDevicesChanged: () => void refreshDevices()
});
const detector = new FaceDetection((state, message) => {
  ui.diagnostic("libraryInfo", state === "loading" ? "Loading" : "Ready", state === "ready" ? "good" : "");
  if (message.includes("model")) ui.diagnostic("modelInfo", state === "loading" ? "Loading" : "Ready", state === "ready" ? "good" : "");
});
const state = { referenceImage: null, objectUrl: null, modelsReady: false, scanning: false, sound: false, threshold: 0.5, lastResult: null, photoLoadId: 0, scanGeneration: 0 };
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40000000;
const DEMO_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function randomToken(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
}

function randomCode() {
  const bytes = new Uint8Array(30);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, value => DEMO_CODE_CHARS[value % DEMO_CODE_CHARS.length]).join("");
}

function updateScanAvailability() {
  ui.updateScanAvailability(Boolean(state.modelsReady && state.referenceImage && camera.isRunning && !state.scanning));
}

function parseBrowser() {
  const ua = navigator.userAgent;
  const patterns = [
    [/Edg\/([\d.]+)/, "Microsoft Edge"],
    [/OPR\/([\d.]+)/, "Opera"],
    [/Chrome\/([\d.]+)/, "Chrome"],
    [/Firefox\/([\d.]+)/, "Firefox"],
    [/Version\/([\d.]+).*Safari/, "Safari"]
  ];
  for (const [pattern, name] of patterns) {
    const match = ua.match(pattern);
    if (match) return `${name} ${match[1]}`;
  }
  return "Browser not identified";
}

async function refreshDiagnostics() {
  ui.diagnostic("browserInfo", parseBrowser());
  ui.diagnostic("secureInfo", window.isSecureContext ? "Secure (HTTPS/localhost)" : "Not secure", window.isSecureContext ? "good" : "error");
  const supported = Boolean(navigator.mediaDevices?.getUserMedia);
  ui.diagnostic("cameraApiInfo", supported ? "Available" : "Unavailable", supported ? "good" : "error");
  ui.diagnostic("networkInfo", navigator.onLine ? "Online" : "Offline", navigator.onLine ? "good" : "warning");
  try {
    const permission = await navigator.permissions?.query({ name: "camera" });
    ui.diagnostic("permissionInfo", permission?.state || "Not reported by browser", permission?.state === "denied" ? "error" : permission?.state === "granted" ? "good" : "");
  } catch {
    ui.diagnostic("permissionInfo", "Not reported by browser");
  }
  await refreshDevices();
}

async function refreshDevices() {
  try {
    const devices = await camera.listDevices();
    const count = ui.updateCameraOptions(devices, camera.selectedDeviceId);
    ui.diagnostic("deviceInfo", count ? `${count} available` : "No camera found", count ? "good" : "warning");
  } catch {
    ui.diagnostic("deviceInfo", "Unavailable", "warning");
  }
}

function setSound(enabled) {
  state.sound = enabled;
  ui.nodes.soundToggle.textContent = enabled ? "Sound on" : "Sound off";
  ui.nodes.soundToggle.setAttribute("aria-pressed", String(enabled));
  try { localStorage.setItem("mfv-sound", String(enabled)); } catch {}
}

function playResultSound() {
  if (!state.sound) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0.06, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.18);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.18);
    oscillator.onended = () => void context.close();
  } catch {}
}

function clearCurrentResult() {
  state.lastResult = null;
  ui.clearResult();
  ui.setDetection("reference", state.referenceImage ? "ready" : "waiting", state.referenceImage ? "good" : "");
  ui.setDetection("live", camera.isRunning ? "ready" : "waiting", camera.isRunning ? "good" : "");
}

function clearPhoto() {
  state.photoLoadId++;
  state.scanGeneration++;
  state.referenceImage = null;
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  state.objectUrl = null;
  ui.clearPhoto();
  clearCurrentResult();
  updateScanAvailability();
  ui.setPosition("Center one face in the guide after starting the camera.");
  ui.status("Reference photo cleared. Photo data was removed from this session.");
}

function clearSession() {
  clearPhoto();
  void camera.stop();
  ui.setCamera(false);
  ui.clearResult();
  ui.setDetection("live", "waiting");
  ui.updateScanAvailability(false);
  ui.status("Session cleared and camera stopped. Local face data is no longer referenced.");
  ui.toast("Session cleared.");
}

function imageFromFile(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => resolve({ image, url });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This image could not be decoded. Choose another photo."));
    };
    image.src = url;
  });
}

async function onPhotoSelected() {
  const file = ui.nodes.photoInput.files?.[0];
  if (!file) return;
  const loadId = ++state.photoLoadId;
  if (!file.type.startsWith("image/")) {
    ui.nodes.photoInput.value = "";
    ui.status("Choose a supported image file.", "error");
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    ui.nodes.photoInput.value = "";
    ui.status("That image is larger than 10 MB. Choose a smaller file.", "error");
    return;
  }
  ui.status("Reading the reference image locally…");
  try {
    const { image, url } = await imageFromFile(file);
    if (loadId !== state.photoLoadId) {
      URL.revokeObjectURL(url);
      return;
    }
    if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > MAX_IMAGE_PIXELS) {
      URL.revokeObjectURL(url);
      throw new Error("This image is too large to process safely. Choose an image with fewer pixels.");
    }
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = url;
    state.referenceImage = image;
    state.scanGeneration++;
    ui.setPhoto(url);
    clearCurrentResult();
    ui.setDetection("reference", "ready", "good");
    updateScanAvailability();
    ui.status("Reference photo is ready. Face processing remains on this device.", "success");
    ui.toast("Reference photo loaded.");
  } catch (error) {
    ui.nodes.photoInput.value = "";
    ui.status(error.message, "error");
  }
}

function updatePositionFeedback(box, input) {
  const width = input.videoWidth || input.naturalWidth;
  const height = input.videoHeight || input.naturalHeight;
  const centerX = (box.x + box.width / 2) / width;
  const centerY = (box.y + box.height / 2) / height;
  const relativeHeight = box.height / height;
  if (Math.abs(centerX - 0.5) > 0.22 || Math.abs(centerY - 0.5) > 0.25) {
    ui.setPosition("Move your face toward the center of the guide.", "warning");
  } else if (relativeHeight < 0.22) {
    ui.setPosition("Move a little closer to the camera.", "warning");
  } else if (relativeHeight > 0.78) {
    ui.setPosition("Move a little farther from the camera.", "warning");
  } else {
    ui.setPosition("Face is centered. Hold still for a clear scan.", "good");
  }
}

function requireSecureRandom() {
  if (!window.crypto?.getRandomValues) throw new Error("Secure random generation is unavailable in this browser.");
}

async function scan() {
  if (state.scanning || !state.modelsReady || !state.referenceImage || !camera.isRunning) return;
  state.scanning = true;
  const generation = ++state.scanGeneration;
  const referenceImage = state.referenceImage;
  const threshold = state.threshold;
  let stage = "reference";
  clearCurrentResult();
  updateScanAvailability();
  ui.setBusy(true, 10);
  let referenceDescriptor;
  let liveDescriptor;
  try {
    if (!ui.nodes.camera.videoWidth || !ui.nodes.camera.videoHeight) throw new Error("Camera preview is not ready. Restart the camera and try again.");
    ui.setDetection("reference", "scanning");
    ui.status("1/4 — Detecting one face in the reference photo…");
    const reference = await detector.detectOne(referenceImage);
    referenceDescriptor = reference.descriptor;
    if (generation !== state.scanGeneration) return;
    ui.setDetection("reference", "one face found", "good");
    ui.setBusy(true, 35);

    ui.setDetection("live", "scanning");
    stage = "live";
    ui.status("2/4 — Detecting one face in the live camera frame…");
    const live = await detector.detectOne(ui.nodes.camera);
    liveDescriptor = live.descriptor;
    if (generation !== state.scanGeneration) return;
    ui.setDetection("live", "one face found", "good");
    updatePositionFeedback(live.box, ui.nodes.camera);
    ui.setBusy(true, 68);

    stage = "comparison";
    ui.status("3/4 — Comparing face descriptors in this browser…");
    const distance = detector.distance(referenceDescriptor, liveDescriptor);
    if (!Number.isFinite(distance)) throw new Error("The comparison returned an invalid measurement. Scan again.");
    requireSecureRandom();
    const matched = distance <= threshold;
    const timestamp = new Date().toISOString();
    const result = {
      matched,
      distance,
      threshold,
      timestamp,
      sessionId: `MFV-${randomToken(12).toUpperCase()}`,
      code: matched ? randomCode() : ""
    };
    state.lastResult = result;
    ui.showResult(result);
    ui.setBusy(false, 100);
    ui.status("4/4 — Comparison complete. This is an educational similarity result, not identity verification.", matched ? "success" : "info");
    ui.toast(matched ? "Comparison completed: below demo threshold." : "Comparison completed: above demo threshold.");
    playResultSound();
  } catch (error) {
    if (generation === state.scanGeneration) {
      ui.setDetection(stage === "reference" ? "reference" : "live", error.message, "error");
      ui.status(error.message, "error");
      ui.toast(error.message);
    }
  } finally {
    if (referenceDescriptor?.fill) referenceDescriptor.fill(0);
    if (liveDescriptor?.fill) liveDescriptor.fill(0);
    referenceDescriptor = null;
    liveDescriptor = null;
    state.scanning = false;
    ui.setBusy(false, 0);
    updateScanAvailability();
  }
}

async function startCamera() {
  try {
    ui.nodes.startCamera.disabled = true;
    ui.status("Requesting camera permission…");
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    await camera.start({ mobile });
    ui.setCamera(true);
    ui.nodes.facingToggle.textContent = camera.facingMode === "user" ? "Use back camera" : "Use front camera";
    await refreshDiagnostics();
    ui.status("Camera ready. Center one face in the guide before scanning.", "success");
    ui.setPosition("Center one face in the guide after starting the camera.");
    updateScanAvailability();
  } catch (error) {
    ui.setCamera(false);
    ui.nodes.startCamera.disabled = false;
    ui.updateScanAvailability(false);
    const message = cameraErrorMessage(error);
    ui.status(message, "error");
    ui.toast(message);
  }
}

async function handleCameraSwitch(action) {
  try {
    state.scanGeneration++;
    ui.nodes.startCamera.disabled = true;
    ui.status("Switching camera…");
    await action();
    const running = camera.isRunning;
    ui.setCamera(running);
    ui.nodes.startCamera.disabled = running;
    ui.nodes.facingToggle.textContent = camera.facingMode === "user" ? "Use back camera" : "Use front camera";
    await refreshDiagnostics();
    ui.status(running ? "Camera switched and ready." : "Camera selection updated. Start the camera to use it.");
    updateScanAvailability();
  } catch (error) {
    ui.setCamera(false);
    ui.nodes.startCamera.disabled = false;
    ui.updateScanAvailability(false);
    ui.status(cameraErrorMessage(error), "error");
    ui.toast(cameraErrorMessage(error));
  }
}

async function fullscreenCamera() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await ui.nodes.cameraFrame.requestFullscreen();
  } catch {
    ui.toast("Fullscreen is unavailable in this browser or context.");
  }
}

async function copyCode() {
  if (!state.lastResult?.code) return;
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
    await navigator.clipboard.writeText(state.lastResult.code);
    ui.toast("Demo code copied.");
  } catch {
    ui.toast("Copy is unavailable. Select the code and copy it manually.");
  }
}

function downloadReport() {
  const result = state.lastResult;
  if (!result) return;
  const report = {
    title: "Mishraji Face Verification — Educational Demonstration",
    sessionId: result.sessionId,
    timestamp: result.timestamp,
    outcome: result.matched ? "Below configured demo threshold" : "Above configured demo threshold",
    comparisonDistance: Number(result.distance.toFixed(6)),
    configuredThreshold: result.threshold,
    disclaimer: "This report is not proof of identity and must not be used for authentication or access control.",
    privacy: "No image or face descriptor is included."
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `mfv-demo-report-${result.sessionId}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  ui.toast("Demonstration report downloaded.");
}

function bindEvents() {
  ui.nodes.photoInput.addEventListener("change", () => void onPhotoSelected());
  ui.nodes.clearPhoto.addEventListener("click", clearPhoto);
  ui.nodes.startCamera.addEventListener("click", () => void startCamera());
  ui.nodes.stopCamera.addEventListener("click", () => {
    void camera.stop();
    ui.setCamera(false);
    updateScanAvailability();
    ui.status("Camera stopped and camera tracks released.");
  });
  ui.nodes.facingToggle.addEventListener("click", () => void handleCameraSwitch(() => camera.switchFacing()));
  ui.nodes.cameraSelect.addEventListener("change", event => void handleCameraSwitch(() => camera.select(event.target.value)));
  ui.nodes.fullscreenCamera.addEventListener("click", () => void fullscreenCamera());
  ui.nodes.scanButton.addEventListener("click", () => void scan());
  ui.nodes.scanAgain.addEventListener("click", () => {
    clearCurrentResult();
    ui.status("Previous result cleared. Start a new comparison when ready.");
    updateScanAvailability();
  });
  ui.nodes.clearSession.addEventListener("click", clearSession);
  ui.nodes.copyButton.addEventListener("click", () => void copyCode());
  ui.nodes.downloadReport.addEventListener("click", downloadReport);
  ui.nodes.threshold.addEventListener("input", event => {
    state.scanGeneration++;
    state.threshold = Number(event.target.value);
    ui.nodes.thresholdValue.textContent = state.threshold.toFixed(2);
    if (state.lastResult) ui.clearResult();
    state.lastResult = null;
  });
  ui.nodes.themeToggle.addEventListener("click", () => {
    const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    ui.setTheme(theme);
    try { localStorage.setItem("mfv-theme", theme); } catch {}
  });
  ui.nodes.soundToggle.addEventListener("click", () => setSound(!state.sound));
  window.addEventListener("online", () => void refreshDiagnostics());
  window.addEventListener("offline", () => void refreshDiagnostics());
  window.addEventListener("pagehide", () => {
    state.referenceImage = null;
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    camera.destroy();
  }, { once: true });
  document.addEventListener("fullscreenchange", () => {
    ui.nodes.fullscreenCamera.textContent = document.fullscreenElement ? "Exit fullscreen" : "Fullscreen";
  });
}

async function initialize() {
  try {
    const savedTheme = localStorage.getItem("mfv-theme");
    ui.setTheme(savedTheme === "light" ? "light" : "dark");
    setSound(localStorage.getItem("mfv-sound") === "true");
  } catch {
    ui.setTheme("dark");
  }
  bindEvents();
  ui.diagnostic("libraryInfo", "Waiting…");
  ui.diagnostic("modelInfo", "Waiting…");
  void refreshDiagnostics();
  try {
    await detector.load();
    state.modelsReady = true;
    ui.diagnostic("libraryInfo", "Ready", "good");
    ui.diagnostic("modelInfo", "Ready", "good");
    ui.status("System ready. Choose a reference photo and start the camera.");
  } catch (error) {
    ui.diagnostic("libraryInfo", window.faceapi ? "Loaded" : "Unavailable", window.faceapi ? "warning" : "error");
    ui.diagnostic("modelInfo", "Unavailable", "error");
    ui.status(`${error.message} You can still review the interface, but scanning needs the library and models online.`, "error");
  }
  updateScanAvailability();
  if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => ui.toast("Offline interface caching could not be enabled."));
  }
}

initialize();
