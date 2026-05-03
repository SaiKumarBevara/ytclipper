const { google } = require('googleapis');
const readline = require('readline');

// Check for required environment variables
const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Error: Please set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET as environment variables before running this script.");
  console.error("Example (Windows/PowerShell):");
  console.error("$env:YOUTUBE_CLIENT_ID=\"your-client-id\"");
  console.error("$env:YOUTUBE_CLIENT_SECRET=\"your-client-secret\"");
  console.error("node scripts/get-youtube-token.js");
  process.exit(1);
}

const REDIRECT_URI = 'http://localhost'; // Can be localhost if you just copy-paste the code

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent' // Forces a refresh token to be issued
});

console.log('Authorize this app by visiting this url:', authUrl);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('Enter the code from that page here: ', (code) => {
  rl.close();
  oauth2Client.getToken(code, (err, token) => {
    if (err) return console.error('Error retrieving access token', err);
    console.log('\n--- SUCCESS! ---');
    console.log('Your Refresh Token is:\n');
    console.log(token.refresh_token);
    
    // Automatically write to .env.local
    try {
      const fs = require('fs');
      const path = require('path');
      const envPath = path.resolve(__dirname, '../.env.local');
      
      if (fs.existsSync(envPath)) {
        let envFile = fs.readFileSync(envPath, 'utf8');
        
        if (envFile.includes('YOUTUBE_REFRESH_TOKEN=')) {
          // Replace existing token or placeholder
          envFile = envFile.replace(/YOUTUBE_REFRESH_TOKEN=.*/, `YOUTUBE_REFRESH_TOKEN="${token.refresh_token}"`);
        } else {
          // Append if it doesn't exist
          envFile += `\nYOUTUBE_REFRESH_TOKEN="${token.refresh_token}"\n`;
        }
        
        fs.writeFileSync(envPath, envFile);
        console.log('\n✅ Successfully saved your Refresh Token to .env.local!');
      } else {
        console.log('\n⚠️ Could not find .env.local to save automatically.');
        console.log(`Add this manually: YOUTUBE_REFRESH_TOKEN="${token.refresh_token}"`);
      }
    } catch (fsErr) {
      console.log('\n⚠️ Error writing to .env.local automatically:', fsErr.message);
      console.log(`Add this manually: YOUTUBE_REFRESH_TOKEN="${token.refresh_token}"`);
    }
  });
});
