#!/usr/bin/env npx tsx
/**
 * Combined Google OAuth re-authentication for Gmail + Calendar.
 * Opens browser once, requests both scopes, saves tokens to ~/.gmail-mcp/.
 *
 * Usage: npx tsx scripts/google-reauth.ts
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import { URL } from 'url';

const CRED_DIR = path.join(os.homedir(), '.gmail-mcp');
const KEYS_PATH = path.join(CRED_DIR, 'gcp-oauth.keys.json');
const GMAIL_TOKEN_PATH = path.join(CRED_DIR, 'credentials.json');
const GCAL_TOKEN_PATH = path.join(CRED_DIR, 'mcp-google-calendar-token.json');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

const PORT = 8976;
// Google allows any port on loopback for installed apps
const REDIRECT_URI = `http://127.0.0.1:${PORT}`;

async function main() {
  if (!fs.existsSync(KEYS_PATH)) {
    console.error(`OAuth keys not found at ${KEYS_PATH}`);
    process.exit(1);
  }

  const keys = JSON.parse(fs.readFileSync(KEYS_PATH, 'utf-8'));
  const { client_id, client_secret } = keys.installed || keys.web || keys;

  // Build authorization URL
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', client_id);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPES.join(' '));
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent'); // Force new refresh token

  console.log('\nOpening browser for Google OAuth consent...\n');
  console.log('If the browser does not open, visit this URL:\n');
  console.log(authUrl.toString());
  console.log('');

  // Open browser
  const { exec } = await import('child_process');
  exec(`open "${authUrl.toString()}"`);

  // Wait for callback
  const code = await waitForCallback();

  // Exchange code for tokens
  console.log('Exchanging authorization code for tokens...');
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id,
      client_secret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  const tokenData = await tokenRes.json() as Record<string, unknown>;

  if (tokenData.error) {
    console.error('Token exchange failed:', tokenData.error, tokenData.error_description);
    process.exit(1);
  }

  if (!tokenData.refresh_token) {
    console.error('No refresh_token returned. Make sure you clicked "Allow" and the app is published (not in testing mode).');
    process.exit(1);
  }

  const tokens = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    scope: tokenData.scope,
    token_type: tokenData.token_type,
    expiry_date: Date.now() + (tokenData.expires_in as number) * 1000,
  };

  // Save Gmail tokens
  fs.writeFileSync(GMAIL_TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log(`Saved Gmail tokens to ${GMAIL_TOKEN_PATH}`);

  // Save GCal tokens (same tokens, separate file)
  fs.writeFileSync(GCAL_TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log(`Saved GCal tokens to ${GCAL_TOKEN_PATH}`);

  // Verify both APIs work
  console.log('\nVerifying...');

  const headers = { Authorization: `Bearer ${tokens.access_token}` };

  const [gmailRes, gcalRes] = await Promise.all([
    fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers }),
    fetch('https://www.googleapis.com/calendar/v3/calendars/primary', { headers }),
  ]);

  const gmailProfile = await gmailRes.json() as Record<string, unknown>;
  const gcalData = await gcalRes.json() as Record<string, unknown>;

  if (gmailProfile.emailAddress) {
    console.log(`  Gmail: OK (${gmailProfile.emailAddress})`);
  } else {
    console.error('  Gmail: FAILED', gmailProfile);
  }

  if (gcalData.summary || gcalData.id) {
    console.log(`  Calendar: OK (${gcalData.summary || gcalData.id})`);
  } else {
    console.error('  Calendar: FAILED', gcalData);
  }

  console.log('\nDone! Restart NanoClaw to pick up the new tokens:');
  console.log('  launchctl kickstart -k gui/$(id -u)/com.nanoclaw');
}

function waitForCallback(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost:${PORT}`);
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<h1>Auth failed</h1><p>${error}</p><p>You can close this tab.</p>`);
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (code) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Authenticated!</h1><p>You can close this tab and return to the terminal.</p>');
        server.close();
        resolve(code);
        return;
      }

      res.writeHead(400);
      res.end('Missing code parameter');
    });

    server.listen(PORT, () => {
      console.log(`Listening for OAuth callback on port ${PORT}...`);
    });

    // Timeout after 2 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Timed out waiting for OAuth callback'));
    }, 120000);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
