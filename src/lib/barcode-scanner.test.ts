import { test, describe, before, after, mock } from 'node:test';
import assert from 'node:assert';
import { NativeBarcodeScanner } from './barcode-scanner.ts';

describe('NativeBarcodeScanner', () => {
  let originalWindow: any;
  let originalDocument: any;
  let originalNavigator: any;

  before(() => {
    originalWindow = global.window;
    originalDocument = global.document;
    // Store original navigator property descriptor to restore it later
    const descriptor = Object.getOwnPropertyDescriptor(global, 'navigator');
    originalNavigator = descriptor;
  });

  after(() => {
    global.window = originalWindow;
    global.document = originalDocument;

    if (originalNavigator) {
      Object.defineProperty(global, 'navigator', originalNavigator);
    } else {
      delete (global as any).navigator;
    }
  });

  test('calls onError when getUserMedia fails in startNative', async () => {
    let errorReceived = '';

    // Mock document
    const mockContainer = {
      innerHTML: '',
      appendChild: mock.fn(),
    };

    const mockVideo = {
      setAttribute: mock.fn(),
      style: {},
      srcObject: null,
      onloadedmetadata: null,
      play: mock.fn(() => Promise.resolve()),
      remove: mock.fn(),
    };

    global.document = {
      getElementById: mock.fn((id) => {
        if (id === 'test-target') return mockContainer;
        return null;
      }),
      createElement: mock.fn((tag) => {
        if (tag === 'video') return mockVideo;
        return {};
      }),
    } as any;

    // Mock navigator using Object.defineProperty to bypass getter-only constraints
    Object.defineProperty(global, 'navigator', {
        value: {
          mediaDevices: {
            getUserMedia: mock.fn(() => Promise.reject(new Error('Permission denied'))),
          },
        },
        writable: true,
        configurable: true
    });

    // Mock window and BarcodeDetector
    class MockBarcodeDetector {
      static async getSupportedFormats() {
        return ['ean_13']; // satisfies isNativeGood check
      }
      constructor() {}
      async detect() { return []; }
    }

    global.window = {
      BarcodeDetector: MockBarcodeDetector,
    } as any;
    (global as any).BarcodeDetector = MockBarcodeDetector;

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
});
