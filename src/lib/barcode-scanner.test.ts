import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { NativeBarcodeScanner } from './barcode-scanner.ts';

describe('NativeBarcodeScanner', () => {
  let originalWindow: any;
  let originalDocument: any;
  let originalNavigator: any;

  beforeEach(() => {
    originalWindow = global.window;
    originalDocument = global.document;
    originalNavigator = global.navigator;

    (global as any).window = {} as any;
    (global as any).document = {
      getElementById: () => ({
        appendChild: () => {},
        innerHTML: ''
      }),
      createElement: () => {
        const el: any = {
          setAttribute: () => {},
          style: {},
          play: async () => {},
          remove: () => {}
        };
        Object.defineProperty(el, 'onloadedmetadata', {
          set: (cb) => {
            if (cb) setTimeout(cb, 0);
          }
        });
        return el;
      }
    } as any;

    Object.defineProperty(global, 'navigator', {
        value: {
          mediaDevices: {
            getUserMedia: async () => ({
              getTracks: () => []
            })
          }
        },
        configurable: true
    });
  });

  afterEach(() => {
    (global as any).window = originalWindow;
    (global as any).document = originalDocument;
    if (originalNavigator) {
        Object.defineProperty(global, 'navigator', {
            value: originalNavigator,
            configurable: true
        });
    } else {
        delete (global as any).navigator;
    }
    delete (global as any).BarcodeDetector;
    mock.restoreAll();
  });

  test('should initialize fallback scanner if BarcodeDetector initialization fails', async () => {
    class MockBarcodeDetector {
      constructor() {
        throw new Error('Instantiation failed for testing purposes');
      }
      static async getSupportedFormats() {
        return ['ean_13', 'upc_a'];
      }
    }

    (global.window as any).BarcodeDetector = MockBarcodeDetector;
    (global as any).BarcodeDetector = MockBarcodeDetector;

    const scanner = new NativeBarcodeScanner({
      targetId: 'test-target',
      onScan: () => {}
    });

    const startFallbackMock = mock.method(scanner as any, 'startFallback', async () => {});
    const stopMock = mock.method(scanner as any, 'stop', async () => {});

    await scanner.start();

    assert.strictEqual(stopMock.mock.calls.length, 1, 'stop() should have been called 1 time');
    assert.strictEqual(startFallbackMock.mock.calls.length, 1, 'startFallback() should have been called 1 time');
  });
});
