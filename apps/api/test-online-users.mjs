#!/usr/bin/env node

/**
 * Quick test for GET /users/online endpoint
 * Run: node apps/api/test-online-users.mjs
 */

// You'll need to replace this with a valid access token
const TOKEN = process.env.ACCESS_TOKEN || 'YOUR_TOKEN_HERE';
const API_URL = 'http://localhost:3000';

async function testOnlineUsers() {
  console.log('Testing GET /users/online endpoint...\n');

  try {
    const response = await fetch(`${API_URL}/users/online`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    console.log(`Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const error = await response.text();
      console.error('Error response:', error);
      return;
    }

    const data = await response.json();
    console.log('\nSuccess! Response:');
    console.log(JSON.stringify(data, null, 2));

    console.log(`\n✅ Found ${data.total} online player(s)`);
    
    if (data.players && data.players.length > 0) {
      console.log('\nPlayers:');
      data.players.forEach((player, idx) => {
        console.log(`  ${idx + 1}. ${player.displayName} (ELO: ${player.elo}, Status: ${player.status})`);
      });
    }

  } catch (error) {
    console.error('Request failed:', error.message);
  }
}

// Run the test
testOnlineUsers();
