const byId = id => document.getElementById(id);

export class UI {
  constructor() {
    this.nodes = Object.fromEntries([
      "photoInput", "photoArea", "photoPreview", "camera", "cameraFrame", "cameraPlaceholder", "cameraStatus",
      "positionFeedback", "cameraSelect", "facingToggle", "startCamera", "stopCamera", "fullscreenCamera",
      "scanButton", "scanSpinner", "scanLabel", "progressBar", "status", "referenceState", "liveState",
      "threshold", "thresholdValue", "result", "resultBadge", "resultTitle", "resultMessage", "resultTime",
      "distanceValue", "resultThreshold", "sessionId", "codeArea", "code", "copyButton", "downloadReport",
      "scanAgain", "clearPhoto", "clearSession", "themeToggle", "soundToggle", "toast", "browserInfo",
      "secureInfo", "cameraApiInfo", "permissionInfo", "deviceInfo", "networkInfo", "libraryInfo", "modelInfo"
    ].map(id => [id, byId(id)]));
    this.toastTimer = null;
  }

  status(message, state = "info") {
    this.nodes.status.textContent = message;
    this.nodes.status.dataset.state = state;
  }

  toast(message) {
    const toast = this.nodes.toast;
    toast.textContent = message;
    toast.dataset.visible = "true";
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { toast.dataset.visible = "false"; }, 2800);
  }

  diagnostic(id, message, state = "") {
    const node = this.nodes[id];
    if (!node) return;
    node.textContent = message;
    node.dataset.state = state;
  }

  setPhoto(image) {
    this.nodes.photoPreview.src = image;
    this.nodes.photoArea.hidden = false;
  }

  clearPhoto() {
    this.nodes.photoPreview.removeAttribute("src");
    this.nodes.photoArea.hidden = true;
    this.nodes.photoInput.value = "";
  }

  setCamera(running, label = running ? "Camera on" : "Camera off") {
    this.nodes.cameraPlaceholder.hidden = running;
    this.nodes.cameraStatus.lastElementChild.textContent = label;
    this.nodes.cameraStatus.querySelector(".status-dot").dataset.active = String(running);
    this.nodes.startCamera.disabled = running;
    this.nodes.stopCamera.disabled = !running;
    this.nodes.fullscreenCamera.disabled = !running;
    this.nodes.facingToggle.disabled = !running;
    this.nodes.cameraSelect.disabled = false;
  }

  setPosition(message, state = "") {
    this.nodes.positionFeedback.textContent = message;
    this.nodes.positionFeedback.dataset.state = state;
    this.nodes.cameraFrame.querySelector(".face-guide").dataset.state = state === "good" ? "good" : "";
  }

  setDetection(which, message, state = "") {
    const node = this.nodes[which === "reference" ? "referenceState" : "liveState"];
    node.textContent = `${which === "reference" ? "Reference" : "Camera"}: ${message}`;
    node.dataset.state = state;
  }

  setBusy(busy, progress = 0) {
    this.nodes.scanButton.disabled = busy || this.nodes.scanButton.dataset.ready !== "true";
    this.nodes.scanSpinner.hidden = !busy;
    this.nodes.scanLabel.textContent = busy ? "Comparing…" : "Scan and compare";
    this.nodes.progressBar.parentElement.dataset.active = String(busy);
    this.nodes.progressBar.parentElement.style.setProperty("--progress", `${progress}%`);
  }

  updateScanAvailability(ready) {
    this.nodes.scanButton.dataset.ready = String(ready);
    this.nodes.scanButton.disabled = !ready;
  }

  clearResult() {
    this.nodes.result.hidden = true;
    this.nodes.result.removeAttribute("data-outcome");
    this.nodes.codeArea.hidden = true;
    this.nodes.distanceValue.textContent = "—";
    this.nodes.sessionId.textContent = "";
  }

  showResult(result) {
    const { matched, distance, threshold, timestamp, sessionId, code } = result;
    this.nodes.result.hidden = false;
    this.nodes.result.dataset.outcome = matched ? "match" : "no-match";
    this.nodes.resultBadge.textContent = matched ? "Below threshold" : "Above threshold";
    this.nodes.resultTitle.textContent = matched ? "Faces appear similar" : "Faces did not match";
    this.nodes.resultMessage.textContent = matched
      ? "The measured distance is at or below the configured demonstration threshold."
      : "The measured distance is above the configured demonstration threshold.";
    this.nodes.resultTime.dateTime = timestamp;
    this.nodes.resultTime.textContent = new Date(timestamp).toLocaleString();
    this.nodes.distanceValue.textContent = distance.toFixed(4);
    this.nodes.resultThreshold.textContent = threshold.toFixed(2);
    this.nodes.sessionId.textContent = sessionId;
    this.nodes.code.textContent = code || "";
    this.nodes.codeArea.hidden = !code;
  }

  updateCameraOptions(devices, selectedId) {
    const select = this.nodes.cameraSelect;
    const previous = selectedId || select.value;
    select.replaceChildren();
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Default camera";
    select.append(defaultOption);
    for (const [index, device] of devices.entries()) {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = device.label || `Camera ${index + 1}`;
      select.append(option);
    }
    if (devices.some(device => device.deviceId === previous)) select.value = previous;
    select.disabled = devices.length === 0;
    return devices.length;
  }

  setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    this.nodes.themeToggle.textContent = theme === "dark" ? "Light theme" : "Dark theme";
    this.nodes.themeToggle.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} theme`);
    document.querySelector('meta[name="theme-color"]').content = theme === "dark" ? "#111512" : "#f2f4f1";
  }
}
