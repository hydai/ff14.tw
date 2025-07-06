// Cloudflare Workers API for Treasure Map Room Collaboration
// This worker handles room CRUD operations using Cloudflare KV

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Enable CORS
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
    };
    
    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }
    
    try {
      // Route handlers
      if (path === '/api/rooms' && request.method === 'POST') {
        return await handleCreateRoom(request, env, headers);
      } else if (path.startsWith('/api/rooms/') && request.method === 'GET') {
        const roomCode = path.split('/')[3];
        return await handleGetRoom(roomCode, env, headers);
      } else if (path.startsWith('/api/rooms/') && request.method === 'PUT') {
        const roomCode = path.split('/')[3];
        return await handleUpdateRoom(roomCode, request, env, headers);
      } else if (path.startsWith('/api/rooms/') && path.endsWith('/join') && request.method === 'POST') {
        const roomCode = path.split('/')[3];
        return await handleJoinRoom(roomCode, request, env, headers);
      } else if (path.startsWith('/api/rooms/') && path.endsWith('/leave') && request.method === 'POST') {
        const roomCode = path.split('/')[3];
        return await handleLeaveRoom(roomCode, request, env, headers);
      } else if (path.startsWith('/api/rooms/') && path.endsWith('/remove-member') && request.method === 'POST') {
        const roomCode = path.split('/')[3];
        return await handleRemoveMember(roomCode, request, env, headers);
      } else if (path === '/api/cleanup' && request.method === 'POST') {
        return await handleCleanup(env, headers);
      } else {
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers,
        });
      }
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers,
      });
    }
  },
};

// Create a new room
async function handleCreateRoom(request, env, headers) {
  const body = await request.json();
  const { roomCode, memberNickname } = body;
  
  // Check if room already exists
  const existingRoom = await env.TREASURE_ROOMS.get(`room:${roomCode}`);
  if (existingRoom) {
    return new Response(JSON.stringify({ error: 'Room already exists' }), {
      status: 409,
      headers,
    });
  }
  
  // Create new room
  const now = new Date().toISOString();
  const room = {
    roomCode,
    createdAt: now,
    lastActivityAt: now,
    members: [{
      id: 1,
      nickname: memberNickname || '光之戰士1',
      joinedAt: now,
    }],
    treasureMaps: [],
  };
  
  // Save to KV with 24 hour expiration
  const ttl = 24 * 60 * 60; // 24 hours in seconds
  await env.TREASURE_ROOMS.put(`room:${roomCode}`, JSON.stringify(room), {
    expirationTtl: ttl,
  });
  
  return new Response(JSON.stringify(room), { headers });
}

// Get room data
async function handleGetRoom(roomCode, env, headers) {
  const roomData = await env.TREASURE_ROOMS.get(`room:${roomCode}`);
  
  if (!roomData) {
    return new Response(JSON.stringify({ error: 'Room not found' }), {
      status: 404,
      headers,
    });
  }
  
  return new Response(roomData, { headers });
}

// Update room (for syncing treasure maps)
async function handleUpdateRoom(roomCode, request, env, headers) {
  const roomData = await env.TREASURE_ROOMS.get(`room:${roomCode}`);
  
  if (!roomData) {
    return new Response(JSON.stringify({ error: 'Room not found' }), {
      status: 404,
      headers,
    });
  }
  
  const room = JSON.parse(roomData);
  const updates = await request.json();
  
  // Update room data
  if (updates.treasureMaps !== undefined) {
    room.treasureMaps = updates.treasureMaps;
  }
  
  // Update member nickname
  if (updates.memberId && updates.nickname) {
    const member = room.members.find(m => m.id === updates.memberId);
    if (member) {
      member.nickname = updates.nickname;
    }
  }
  
  // Update last activity
  room.lastActivityAt = new Date().toISOString();
  
  // Save back to KV with renewed TTL
  const ttl = 24 * 60 * 60;
  await env.TREASURE_ROOMS.put(`room:${roomCode}`, JSON.stringify(room), {
    expirationTtl: ttl,
  });
  
  return new Response(JSON.stringify(room), { headers });
}

// Join existing room
async function handleJoinRoom(roomCode, request, env, headers) {
  const roomData = await env.TREASURE_ROOMS.get(`room:${roomCode}`);
  
  if (!roomData) {
    return new Response(JSON.stringify({ error: 'Room not found' }), {
      status: 404,
      headers,
    });
  }
  
  const room = JSON.parse(roomData);
  const { memberNickname } = await request.json();
  
  // Check if room is full
  if (room.members.length >= 8) {
    return new Response(JSON.stringify({ error: 'Room is full' }), {
      status: 400,
      headers,
    });
  }
  
  // Add new member
  const newMemberId = Math.max(...room.members.map(m => m.id)) + 1;
  const newMember = {
    id: newMemberId,
    nickname: memberNickname || `光之戰士${newMemberId}`,
    joinedAt: new Date().toISOString(),
  };
  
  room.members.push(newMember);
  room.lastActivityAt = new Date().toISOString();
  
  // Save back to KV
  const ttl = 24 * 60 * 60;
  await env.TREASURE_ROOMS.put(`room:${roomCode}`, JSON.stringify(room), {
    expirationTtl: ttl,
  });
  
  return new Response(JSON.stringify({ room, newMember }), { headers });
}

// Leave room
async function handleLeaveRoom(roomCode, request, env, headers) {
  const roomData = await env.TREASURE_ROOMS.get(`room:${roomCode}`);
  
  if (!roomData) {
    return new Response(JSON.stringify({ error: 'Room not found' }), {
      status: 404,
      headers,
    });
  }
  
  const room = JSON.parse(roomData);
  const { memberId } = await request.json();
  
  // Remove member
  room.members = room.members.filter(m => m.id !== memberId);
  
  // If room is empty, delete it
  if (room.members.length === 0) {
    await env.TREASURE_ROOMS.delete(`room:${roomCode}`);
    return new Response(JSON.stringify({ message: 'Room deleted' }), { headers });
  }
  
  // Otherwise update room
  room.lastActivityAt = new Date().toISOString();
  
  const ttl = 24 * 60 * 60;
  await env.TREASURE_ROOMS.put(`room:${roomCode}`, JSON.stringify(room), {
    expirationTtl: ttl,
  });
  
  return new Response(JSON.stringify(room), { headers });
}

// Remove member from room
async function handleRemoveMember(roomCode, request, env, headers) {
  const roomData = await env.TREASURE_ROOMS.get(`room:${roomCode}`);
  
  if (!roomData) {
    return new Response(JSON.stringify({ error: 'Room not found' }), {
      status: 404,
      headers,
    });
  }
  
  const room = JSON.parse(roomData);
  const { requesterId, targetMemberId } = await request.json();
  
  // Verify requester is in the room
  const requester = room.members.find(m => m.id === requesterId);
  if (!requester) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 403,
      headers,
    });
  }
  
  // Remove target member
  room.members = room.members.filter(m => m.id !== targetMemberId);
  
  // Update room
  room.lastActivityAt = new Date().toISOString();
  
  const ttl = 24 * 60 * 60;
  await env.TREASURE_ROOMS.put(`room:${roomCode}`, JSON.stringify(room), {
    expirationTtl: ttl,
  });
  
  return new Response(JSON.stringify(room), { headers });
}

// Cleanup expired rooms (called by cron trigger)
async function handleCleanup(env, headers) {
  // KV automatically handles expiration, but we can implement additional cleanup if needed
  return new Response(JSON.stringify({ message: 'Cleanup completed' }), { headers });
}