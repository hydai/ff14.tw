// Cloudflare Workers API for Treasure Map Room Collaboration
// This worker handles room CRUD operations using Cloudflare KV

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Get request origin
    const origin = request.headers.get('Origin') || '';
    
    // Define allowed origins
    const allowedOrigins = [
      'https://ff14.tw',
      'https://www.ff14.tw',
      'http://localhost:8000',
      'http://localhost:8080',
      'http://127.0.0.1:8000',
      'http://127.0.0.1:8080'
    ];
    
    // Check if origin is allowed (exact match only for security)
    const isAllowedOrigin = allowedOrigins.includes(origin);
    
    // Set CORS headers based on origin
    const headers = {
      'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://ff14.tw',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
    };
    
    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }
    
    // Reject requests from non-allowed origins
    if (!isAllowedOrigin && origin) {
      return new Response(JSON.stringify({ error: 'Forbidden: Invalid origin' }), {
        status: 403,
        headers,
      });
    }
    
    try {
      // Route handlers with regex-based routing for better maintainability
      
      // POST /api/rooms - Create new room
      if (path === '/api/rooms' && request.method === 'POST') {
        return await handleCreateRoom(request, env, headers);
      }
      
      // Extract room code from path using regex
      const roomMatch = path.match(/^\/api\/rooms\/([A-Z0-9]{6})(\/.*)?$/);
      const roomCode = roomMatch ? roomMatch[1] : null;
      const roomAction = roomMatch ? roomMatch[2] : null;
      
      if (roomCode) {
        // GET /api/rooms/{roomCode} - Get room details
        if (request.method === 'GET' && !roomAction) {
          return await handleGetRoom(roomCode, env, headers);
        }
        // PUT /api/rooms/{roomCode} - Update room
        else if (request.method === 'PUT' && !roomAction) {
          return await handleUpdateRoom(roomCode, request, env, headers);
        }
        // POST /api/rooms/{roomCode}/join - Join room
        else if (request.method === 'POST' && roomAction === '/join') {
          return await handleJoinRoom(roomCode, request, env, headers);
        }
        // POST /api/rooms/{roomCode}/leave - Leave room
        else if (request.method === 'POST' && roomAction === '/leave') {
          return await handleLeaveRoom(roomCode, request, env, headers);
        }
        // POST /api/rooms/{roomCode}/remove-member - Remove member
        else if (request.method === 'POST' && roomAction === '/remove-member') {
          return await handleRemoveMember(roomCode, request, env, headers);
        }
      }
      
      // POST /api/cleanup - Cleanup expired rooms
      if (path === '/api/cleanup' && request.method === 'POST') {
        return await handleCleanup(env, headers);
      }
      
      // No matching route found
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers,
      });
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
  const newMemberId = room.members.length > 0 
    ? Math.max(...room.members.map(m => m.id)) + 1 
    : 1;
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
  
  // Only allow room creator (member with id: 1) to remove members
  // This prevents impersonation attacks since we don't have authentication
  if (requesterId !== 1) {
    return new Response(JSON.stringify({ error: 'Only room creator can remove members' }), {
      status: 403,
      headers,
    });
  }
  
  // Verify the room creator is still in the room
  const creator = room.members.find(m => m.id === 1);
  if (!creator) {
    return new Response(JSON.stringify({ error: 'Room creator not found' }), {
      status: 403,
      headers,
    });
  }
  
  // Cannot remove the room creator
  if (targetMemberId === 1) {
    return new Response(JSON.stringify({ error: 'Cannot remove room creator' }), {
      status: 400,
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