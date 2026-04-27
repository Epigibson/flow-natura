import { test, describe } from 'node:test';
import assert from 'node:assert';
import { esc, sanitizeUrl } from './security.ts';

describe('Security Utilities', () => {
  describe('esc', () => {
    test('returns empty string for null or undefined', () => {
      assert.strictEqual(esc(null), '');
      assert.strictEqual(esc(undefined), '');
    });

    test('escapes HTML special characters', () => {
      assert.strictEqual(esc('<'), '&lt;');
      assert.strictEqual(esc('>'), '&gt;');
      assert.strictEqual(esc('&'), '&amp;');
      assert.strictEqual(esc('"'), '&quot;');
      assert.strictEqual(esc("'"), '&#39;');
    });

    test('escapes complex strings', () => {
      const input = '<script>alert("xss & risk")</script>';
      const expected = '&lt;script&gt;alert(&quot;xss &amp; risk&quot;)&lt;/script&gt;';
      assert.strictEqual(esc(input), expected);
    });

    test('converts and escapes non-string types', () => {
      assert.strictEqual(esc(123), '123');
      assert.strictEqual(esc(0), '0');
      assert.strictEqual(esc(true), 'true');
    });

    test('neutralizes common XSS payloads', () => {
      const payloads = [
        "<img src=x onerror=alert(1)>",
        "javascript:alert(1)",
        "'; alert(1); //",
        "\" onclick=\"alert(1)\""
      ];
      for (const p of payloads) {
        const escaped = esc(p);
        assert.ok(!escaped.includes('<'), `Payload ${p} still contains <`);
        assert.ok(!escaped.includes('>'), `Payload ${p} still contains >`);
        assert.ok(!escaped.includes('"'), `Payload ${p} still contains "`);
        assert.ok(!escaped.includes("'"), `Payload ${p} still contains '`);
      }
    });
  });

  describe('sanitizeUrl', () => {
    test('returns empty string for invalid inputs', () => {
      assert.strictEqual(sanitizeUrl(null), '');
      assert.strictEqual(sanitizeUrl(undefined), '');
      assert.strictEqual(sanitizeUrl(''), '');
      assert.strictEqual(sanitizeUrl(123 as any), '');
    });

    test('allows safe absolute URLs', () => {
      assert.strictEqual(sanitizeUrl('https://example.com'), 'https://example.com');
      assert.strictEqual(sanitizeUrl('http://example.com/path?q=1'), 'http://example.com/path?q=1');
      assert.strictEqual(sanitizeUrl('mailto:user@example.com'), 'mailto:user@example.com');
      assert.strictEqual(sanitizeUrl('tel:+123456789'), 'tel:+123456789');
    });

    test('allows relative URLs', () => {
      assert.strictEqual(sanitizeUrl('/dashboard'), '/dashboard');
      assert.strictEqual(sanitizeUrl('./images/logo.png'), './images/logo.png');
      assert.strictEqual(sanitizeUrl('../path'), '../path');
    });

    test('blocks dangerous protocols', () => {
      assert.strictEqual(sanitizeUrl('javascript:alert(1)'), '');
      assert.strictEqual(sanitizeUrl('data:text/html,<script>alert(1)</script>'), '');
      assert.strictEqual(sanitizeUrl('vbscript:msgbox("hello")'), '');
    });

    test('blocks dangerous protocols case-insensitively', () => {
      assert.strictEqual(sanitizeUrl('JAVASCRIPT:alert(1)'), '');
      assert.strictEqual(sanitizeUrl('Data:abc'), '');
      assert.strictEqual(sanitizeUrl('vBsCrIpT:xyz'), '');
    });

    test('trims whitespace before check', () => {
      assert.strictEqual(sanitizeUrl('   javascript:alert(1)   '), '');
      assert.strictEqual(sanitizeUrl('   https://example.com   '), 'https://example.com');
    });
  });
});
