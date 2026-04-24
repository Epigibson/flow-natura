import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { NativeBarcodeScanner } from './barcode-scanner.ts';

describe('NativeBarcodeScanner.checkNativeSupport', () => {
  let originalWindow: any;
  let originalBarcodeDetector: any;

  before(() => {
    // Store original globals if they exist
    originalWindow = (global as any).window;
    originalBarcodeDetector = (global as any).BarcodeDetector;
  });

  beforeEach(() => {
    // Reset global state before each test
    delete (global as any).window;
    delete (global as any).BarcodeDetector;
  });

  after(() => {
    // Restore original globals
    if (originalWindow !== undefined) {
      (global as any).window = originalWindow;
    } else {
      delete (global as any).window;
    }

    if (originalBarcodeDetector !== undefined) {
      (global as any).BarcodeDetector = originalBarcodeDetector;
    } else {
      delete (global as any).BarcodeDetector;
    }
  });

  test('returns false when BarcodeDetector is not in window', async () => {
    // Mock window without BarcodeDetector
    (global as any).window = {};
    const result = await NativeBarcodeScanner.checkNativeSupport();
    assert.strictEqual(result, false);
  });

  test('returns false when getSupportedFormats throws an error', async () => {
    // Mock BarcodeDetector to throw an error
    (global as any).BarcodeDetector = {
      getSupportedFormats: async () => {
        throw new Error('Not supported');
      }
    };
    (global as any).window = {
      BarcodeDetector: (global as any).BarcodeDetector
    };

    const result = await NativeBarcodeScanner.checkNativeSupport();
    assert.strictEqual(result, false);
  });

  test('returns false when only qr_code is supported', async () => {
    // Mock BarcodeDetector supporting only QR codes
    (global as any).BarcodeDetector = {
      getSupportedFormats: async () => ['qr_code']
    };
    (global as any).window = {
      BarcodeDetector: (global as any).BarcodeDetector
    };

    const result = await NativeBarcodeScanner.checkNativeSupport();
    assert.strictEqual(result, false);
  });

  test('returns true when valid formats are supported', async () => {
    // Mock BarcodeDetector supporting required formats
    (global as any).BarcodeDetector = {
      getSupportedFormats: async () => ['ean_13', 'qr_code']
    };
    (global as any).window = {
      BarcodeDetector: (global as any).BarcodeDetector
    };

    const result = await NativeBarcodeScanner.checkNativeSupport();
    assert.strictEqual(result, true);
  });
});
