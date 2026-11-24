const WAIT_TIMEOUT_MS = 12000;

function waitForVideoReady(video) {
  return new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("error", onError);
    };
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("The browser could not initialize the camera preview."));
    };
    video.addEventListener("loadedmetadata", onReady, { once: true });
    video.addEventListener("error", onError, { once: true });
    timer = setTimeout(() => {
      cleanup();
      reject(new Error("The camera did not provide video metadata in time."));
    }, WAIT_TIMEOUT_MS);
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA && video.videoWidth) onReady();
  });
}

export function cameraErrorMessage(error) {
  const messages = {
    NotAllowedError: "Camera permission was denied. Allow camera access in your browser settings and try again.",
    PermissionDeniedError: "Camera permission was denied. Allow camera access in your browser settings and try again.",
    NotFoundError: "No available camera was found. Connect a camera and try again.",
    DevicesNotFoundError: "No available camera was found. Connect a camera and try again.",
    NotReadableError: "The camera is busy or could not be read. Close other apps using it and try again.",
    TrackStartError: "The camera is busy or could not start. Close other apps using it and try again.",
    OverconstrainedError: "That camera does not support the requested settings. Choose another camera.",
    SecurityError: "Camera access requires HTTPS or localhost in a supported browser.",
    AbortError: "The camera operation was interrupted. Try starting it again."
  };
  return messages[error?.name] || error?.message || "The camera could not be started.";
}

export class CameraManager {
  constructor(video, callbacks = {}) {
    this.video = video;
    this.onLost = callbacks.onLost || (() => {});
    this.stream = null;
    this.facingMode = "user";
    this.selectedDeviceId = "";
    this.deviceChangeHandler = () => callbacks.onDevicesChanged?.();
    navigator.mediaDevices?.addEventListener?.("devicechange", this.deviceChangeHandler);
  }

  get isRunning() {
    return Boolean(this.stream?.getVideoTracks().some(track => track.readyState === "live"));
  }

  async listDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device => device.kind === "videoinput");
  }

  async start(options = {}) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(window.isSecureContext ? "This browser does not support camera access." : "Camera access requires HTTPS or localhost.");
    }

    await this.stop();
    const deviceId = options.deviceId ?? this.selectedDeviceId;
    const cameraConstraints = deviceId
      ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
      : {
          ...(options.mobile ? { facingMode: { ideal: this.facingMode } } : {}),
          width: { ideal: 1280 },
          height: { ideal: 720 }
        };
    let stream;
    try {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: cameraConstraints });
      } catch (firstError) {
        if (firstError?.name === "NotAllowedError" || firstError?.name === "NotFoundError") throw firstError;
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: deviceId ? { deviceId: { exact: deviceId } } : true });
      }

      const metadataReady = waitForVideoReady(this.video);
      this.video.srcObject = stream;
      await metadataReady;
      await this.video.play();
      this.stream = stream;
      this.video.parentElement?.style.setProperty("--camera-aspect", `${this.video.videoWidth} / ${this.video.videoHeight}`);
      const track = stream.getVideoTracks()[0];
      track?.addEventListener("ended", () => {
        if (this.stream !== stream) return;
        this.stream = null;
        this.video.srcObject = null;
        this.onLost("Camera disconnected. Start a camera again to continue.");
      }, { once: true });
      return stream;
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      if (this.video.srcObject === stream) this.video.srcObject = null;
      this.stream = null;
      throw error;
    }
  }

  async select(deviceId) {
    this.selectedDeviceId = deviceId;
    if (this.isRunning) return this.start({ deviceId });
    return null;
  }

  async switchFacing() {
    this.selectedDeviceId = "";
    this.facingMode = this.facingMode === "user" ? "environment" : "user";
    if (this.isRunning) return this.start();
    return null;
  }

  async stop() {
    const stream = this.stream || this.video.srcObject;
    if (stream?.getTracks) stream.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.video.pause();
    this.video.srcObject = null;
    this.video.parentElement?.style.removeProperty("--camera-aspect");
  }

  destroy() {
    void this.stop();
    navigator.mediaDevices?.removeEventListener?.("devicechange", this.deviceChangeHandler);
  }
}
