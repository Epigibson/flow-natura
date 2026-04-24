import { test, describe } from 'node:test';
import assert from 'node:assert';
import { sanitizeUrl, esc } from './security.ts';

describe('Security Utility Functions', () => {
  describe('sanitizeUrl', () => {
    test('returns empty string for non-string inputs', () => {
      assert.strictEqual(sanitizeUrl(null), '');
      assert.strictEqual(sanitizeUrl(undefined), '');
      assert.strictEqual(sanitizeUrl(123), '');
      assert.strictEqual(sanitizeUrl({}), '');
      assert.strictEqual(sanitizeUrl([]), '');
    });

    test('returns empty string for empty string input', () => {
      assert.strictEqual(sanitizeUrl(''), '');
      assert.strictEqual(sanitizeUrl('   '), '');
    });

    test('returns original URL for valid URLs', () => {
      assert.strictEqual(sanitizeUrl('https://example.com'), 'https://example.com');
      assert.strictEqual(sanitizeUrl('http://example.com/path?q=1#hash'), 'http://example.com/path?q=1#hash');
      assert.strictEqual(sanitizeUrl('/relative/path'), '/relative/path');
      assert.strictEqual(sanitizeUrl('mailto:test@example.com'), 'mailto:test@example.com');
    });

    test('blocks javascript: protocol', () => {
      assert.strictEqual(sanitizeUrl('javascript:alert(1)'), '');
      assert.strictEqual(sanitizeUrl('  javascript:alert(1)'), '');
      assert.strictEqual(sanitizeUrl('JaVaScRiPt:alert(1)'), '');
      assert.strictEqual(sanitizeUrl('\tjavascript:alert(1)'), '');
    });

    test('blocks data: protocol', () => {
      assert.strictEqual(sanitizeUrl('data:text/html,<script>alert(1)</script>'), '');
      assert.strictEqual(sanitizeUrl('  data:text/plain,hello'), '');
      assert.strictEqual(sanitizeUrl('DaTa:text/plain,hello'), '');
    });

    test('blocks vbscript: protocol', () => {
      assert.strictEqual(sanitizeUrl('vbscript:msgbox(1)'), '');
      assert.strictEqual(sanitizeUrl('  vbscript:msgbox(1)'), '');
      assert.strictEqual(sanitizeUrl('VbScRiPt:msgbox(1)'), '');
    });
  });

  describe('esc', () => {
    test('returns empty string for null or undefined', () => {
      assert.strictEqual(esc(null), '');
      assert.strictEqual(esc(undefined), '');
    });

    test('converts non-string values to string', () => {
      assert.strictEqual(esc(123), '123');
      assert.strictEqual(esc(true), 'true');
    });

    test('escapes HTML special characters', () => {
      assert.strictEqual(esc('&'), '&amp;');
      assert.strictEqual(esc('<'), '&lt;');
      assert.strictEqual(esc('>'), '&gt;');
      assert.strictEqual(esc('"'), '&quot;');
      assert.strictEqual(esc("'"), '&#39;');

      assert.strictEqual(
        esc('<script>alert("XSS & \'attack\'")</script>'),
        '&lt;script&gt;alert(&quot;XSS &amp; &#39;attack&#39;&quot;)&lt;/script&gt;'
      );
    });
  });
});
