/**
 * Native BarcodeDetector scanner with html5-qrcode fallback.
 * Uses the browser's native BarcodeDetector API (Chrome 83+/Android)
 * for much faster and more reliable barcode detection.
 */

// Types for the native BarcodeDetector API
declare global {
  interface Window {
    BarcodeDetector: typeof BarcodeDetector;
  }
  class BarcodeDetector {
    constructor(options?: { formats: string[] });
    detect(source: ImageBitmapSource): Promise<{ rawValue: string; format: string }[]>;
    static getSupportedFormats(): Promise<string[]>;
  }
}

export interface ScannerOptions {
  /** Target element ID where video will be rendered */
  targetId: string;
  /** Callback when a barcode is successfully decoded */
  onScan: (code: string, format: string) => void;
  /** Optional callback for errors */
  onError?: (error: string) => void;
}

export class NativeBarcodeScanner {
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private detector: BarcodeDetector | null = null;
  private animFrameId: number = 0;
  private isRunning = false;
  private lastCode = '';
  private lastCodeTime = 0;
  private options: ScannerOptions;
  private useFallback = false;
  private fallbackScanner: any = null;

  constructor(options: ScannerOptions) {
    this.options = options;
  }

  /** Check if native BarcodeDetector is available and supports required formats */
  static async checkNativeSupport(): Promise<boolean> {
    if (!('BarcodeDetector' in window)) return false;
    try {
      const formats = await BarcodeDetector.getSupportedFormats();
      // We need it to support EAN/UPC or at least a good chunk of formats
      // If it only supports QR (common on some Windows Edge/Chrome implementations), we want fallback.
      const hasBarcodes = formats.includes('ean_13') || formats.includes('code_128') || formats.includes('upc_a');
      return hasBarcodes;
    } catch (e) {
      return false;
    }
  }

  /** Start scanning */
  async start(): Promise<void> {
    this.lastCode = '';
    this.isRunning = true; // Set to true early so async loops don't abort

    const isNativeGood = await NativeBarcodeScanner.checkNativeSupport();

    if (isNativeGood) {
      await this.startNative();
    } else {
      await this.startFallback();
    }
  }

  /** Stop scanning and release camera */
  async stop(): Promise<void> {
    this.isRunning = false;

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = 0;
    }

    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }

    if (this.video) {
      this.video.srcObject = null;
      this.video.remove();
      this.video = null;
    }

    if (this.fallbackScanner) {
      try { this.fallbackScanner.reset(); } catch (e) {}
      this.fallbackScanner = null;
    }

    // Clear the container
    const container = document.getElementById(this.options.targetId);
    if (container) container.innerHTML = '';
  }

  /** Reset last scanned code (allows re-scanning same code) */
  resetLastCode(): void {
    this.lastCode = '';
  }

  get running(): boolean {
    return this.isRunning;
  }

  // ═══════════ NATIVE IMPLEMENTATION ═══════════

  private async startNative(): Promise<void> {
    const container = document.getElementById(this.options.targetId);
    if (!container) return;

    // Create video element
    this.video = document.createElement('video');
    this.video.setAttribute('playsinline', 'true');
    this.video.setAttribute('autoplay', 'true');
    this.video.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:inherit;';
    container.innerHTML = '';
    container.appendChild(this.video);

    // Get camera stream with high resolution for better detection
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Request back camera
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.options.onError?.('No se pudo acceder a la cámara: ' + message);
      return;
    }

    this.video.srcObject = this.stream;
    
    // Wait for video to be ready before detecting
    await new Promise<void>((resolve) => {
      this.video!.onloadedmetadata = () => {
        this.video!.play().then(resolve).catch(resolve);
      };
    });

    // Create detector with wide format support
    try {
      this.detector = new BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'],
      });
    } catch (err) {
      console.warn("BarcodeDetector config failed", err);
      // Fallback if instantiation fails for some reason
      this.stop();
      this.startFallback();
      return;
    }

    this.scanLoop();
  }

  private scanLoop(): void {
    if (!this.isRunning || !this.video || !this.detector) return;

    // CRITICAL: We only process one frame at a time.
    // Calling detect inside requestAnimationFrame without waiting causes hundreds of overlaps, freezing the UI.
    this.detector.detect(this.video)
      .then(barcodes => {
        if (!this.isRunning) return;

        if (barcodes.length > 0) {
          const code = barcodes[0].rawValue;
          const format = barcodes[0].format;
          const now = Date.now();

          // Debounce: ignore same code within 2 seconds
          if (code !== this.lastCode || now - this.lastCodeTime > 2000) {
            this.lastCode = code;
            this.lastCodeTime = now;

            // Haptic feedback
            if (navigator.vibrate) navigator.vibrate(100);

            this.options.onScan(code, format);
          }
        }
      })
      .catch((e) => {
        // Ignore decode errors on empty/blurry frames
      })
      .finally(() => {
        // ONLY schedule the next frame AFTER processing completes to avoid thread saturation
        if (this.isRunning) {
          this.animFrameId = requestAnimationFrame(() => this.scanLoop());
        }
      });
  }

  // ═══════════ FALLBACK (@zxing/library) ═══════════

  private async startFallback(): Promise<void> {
    this.useFallback = true;
    const container = document.getElementById(this.options.targetId);
    if (!container) return;

    try {
      // Dynamic import for Zxing
      const { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } = await import('@zxing/library');

      // Zxing requires a video element
      this.video = document.createElement('video');
      this.video.setAttribute('playsinline', 'true');
      this.video.setAttribute('autoplay', 'true');
      this.video.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:inherit;';
      container.innerHTML = '';
      container.appendChild(this.video);

      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.ITF
      ]);

      this.fallbackScanner = new BrowserMultiFormatReader(hints);
      this.isRunning = true;

      // decodeFromConstraints handles stream acquisition automatically
      await this.fallbackScanner.decodeFromConstraints(
        { video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } },
        this.video,
        (result: any, err: any) => {
          if (!this.isRunning) return;
          if (result) {
            const code = result.getText();
            const now = Date.now();

            if (code !== this.lastCode || now - this.lastCodeTime > 2000) {
              this.lastCode = code;
              this.lastCodeTime = now;
              if (navigator.vibrate) navigator.vibrate(100);
              this.options.onScan(code, 'unknown');
            }
          }
        }
      );

    } catch (err: unknown) {
      if (this.isRunning) {
        const message = err instanceof Error ? err.message : String(err);
        this.options.onError?.('Error del escáner: ' + message);
      }
    }
  }
}
