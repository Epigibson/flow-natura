import { test, describe, before, after, mock } from 'node:test';
import assert from 'node:assert';
import { NativeBarcodeScanner } from './barcode-scanner.ts';

describe('NativeBarcodeScanner', () => {
  let originalWindow: any;
  let originalNavigator: any;
  let originalDocument: any;
  let originalBarcodeDetector: any;

  before(() => {
    // Save original globals
    originalWindow = (global as any).window;
    originalNavigator = (global as any).navigator;
    originalDocument = (global as any).document;
    originalBarcodeDetector = (global as any).BarcodeDetector;
  });

  after(() => {
    // Restore original globals
    Object.defineProperty(global, 'window', { value: originalWindow, writable: true, configurable: true });
    Object.defineProperty(global, 'navigator', { value: originalNavigator, writable: true, configurable: true });
    Object.defineProperty(global, 'document', { value: originalDocument, writable: true, configurable: true });
    Object.defineProperty(global, 'BarcodeDetector', { value: originalBarcodeDetector, writable: true, configurable: true });
  });

  describe('startNative error handling', () => {
    test('calls onError when getUserMedia throws an Error', async () => {
      // Mock DOM and browser APIs
      const mockElement = {
        innerHTML: '',
        appendChild: mock.fn(),
      };

      Object.defineProperty(global, 'document', {
        value: {
          createElement: mock.fn(() => ({
            setAttribute: mock.fn(),
            style: {},
            play: mock.fn(async () => {}),
          })),
          getElementById: mock.fn((id: string) => {
            if (id === 'test-target') return mockElement;
            return null;
          }),
        },
        writable: true,
        configurable: true
      });

      Object.defineProperty(global, 'navigator', {
        value: {
          mediaDevices: {
            getUserMedia: mock.fn(async () => {
              throw new Error('Permission denied');
            }),
          },
        },
        writable: true,
        configurable: true
      });

      class MockBarcodeDetector {
        static async getSupportedFormats() {
          return ['ean_13']; // Ensures startNative is called
        }
      }

      Object.defineProperty(global, 'window', {
        value: { BarcodeDetector: MockBarcodeDetector },
        writable: true,
        configurable: true
      });

      Object.defineProperty(global, 'BarcodeDetector', {
        value: MockBarcodeDetector,
        writable: true,
        configurable: true
      });

      let errorReceived = '';
      const scanner = new NativeBarcodeScanner({
        targetId: 'test-target',
        onScan: () => {},
        onError: (err) => {
          errorReceived = err;
        },
      });

      await scanner.start();

      assert.strictEqual(
        errorReceived,
        'No se pudo acceder a la cámara: Permission denied'
      );
    });

    test('calls onError when getUserMedia throws a string', async () => {
      // Setup mock to throw string instead of Error
      Object.defineProperty(global, 'navigator', {
        value: {
          mediaDevices: {
            getUserMedia: mock.fn(async () => {
              throw 'NotAllowedError';
            }),
          },
        },
        writable: true,
        configurable: true
      });

      let errorReceived = '';
      const scanner = new NativeBarcodeScanner({
        targetId: 'test-target',
        onScan: () => {},
        onError: (err) => {
          errorReceived = err;
        },
      });

      await scanner.start();

      assert.strictEqual(
        errorReceived,
        'No se pudo acceder a la cámara: NotAllowedError'
      );
    });
  });
});
