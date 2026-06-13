import { describe, expect, it } from 'vitest';
import { isGoogleHost, isYouTubeHost } from './index';

describe('isGoogleHost', () => {
  it.each([
    'google.com',
    'google.com.ua',
    'google.co.uk',
    'google.co.jp',
    'google.com.au',
    'google.com.br',
    'www.google.de',
    'news.google.co.jp',
    'google.es',
  ])('accepts %s', (host) => {
    expect(isGoogleHost(host)).toBe(true);
  });

  it.each([
    // Spoof hosts: registrable domain is the attacker's, not Google's. The
    // `google` label is followed by labels that are NOT a Google public suffix.
    'google.evil.com',
    'google.attacker.io',
    'google.example.net',
    'sub.google.evil.com',
    'a.google.b',
    // Pre-existing lookalikes.
    'notgoogle.com',
    'google.com.evil.com',
    'youtube.com',
    'example.com',
    'mygoogle.org',
    'google',
  ])('rejects %s', (host) => {
    expect(isGoogleHost(host)).toBe(false);
  });
});

describe('isYouTubeHost', () => {
  it.each(['youtube.com', 'www.youtube.com', 'm.youtube.com'])('accepts %s', (host) => {
    expect(isYouTubeHost(host)).toBe(true);
  });

  it.each(['example.com', 'google.com', 'fake-youtube.com'])('rejects %s', (host) => {
    expect(isYouTubeHost(host)).toBe(false);
  });
});
