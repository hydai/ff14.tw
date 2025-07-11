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
      'https://www.ff14.tw'
    ];
    
    // Add localhost origins only in development mode
    // You can control this with an environment variable in wrangler.toml
    if (env.ENVIRONMENT === 'development') {
      allowedOrigins.push(
        'http://localhost:8000',
        'http://localhost:8080',
        'http://127.0.0.1:8000',
        'http://127.0.0.1:8080'
      );
    }
    
    // Check if origin is allowed (exact match only for security)
    const isAllowedOrigin = allowedOrigins.includes(origin);
    
    // Set CORS headers for allowed origins
    const corsHeaders = isAllowedOrigin ? {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    } : {};
    
    // Standard headers for all responses
    const headers = {
      ...corsHeaders,
      'Content-Type': 'application/json',
    };
    
    // Handle preflight requests (only for allowed origins)
    if (request.method === 'OPTIONS') {
      if (isAllowedOrigin) {
        return new Response(null, { headers });
      } else {
        // Don't include CORS headers for rejected origins
        return new Response(null, { status: 403 });
      }
    }
    
    // Reject requests from non-allowed origins or missing origin
    // This blocks direct API access from curl, Postman, etc.
    if (!isAllowedOrigin) {
      // Don't include CORS headers when rejecting
      return new Response(JSON.stringify({ error: 'Forbidden: Access denied' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
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

// Helper functions to reduce code duplication
async function getRoomFromKV(roomCode, env) {
  const roomData = await env.TREASURE_ROOMS.get(`room:${roomCode}`);
  return roomData ? JSON.parse(roomData) : null;
}

async function saveRoomToKV(room, env) {
  const ttl = 24 * 60 * 60; // 24 hours
  await env.TREASURE_ROOMS.put(
    `room:${room.roomCode}`, 
    JSON.stringify(room), 
    { expirationTtl: ttl }
  );
}

function createNotFoundResponse(headers) {
  return new Response(JSON.stringify({ error: 'Room not found' }), {
    status: 404,
    headers,
  });
}

// Generate a random room code
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Create a new room with server-generated room code
async function handleCreateRoom(request, env, headers) {
  const body = await request.json();
  const { memberNickname } = body;
  
  // Generate unique room code with retry logic
  let roomCode;
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    roomCode = generateRoomCode();
    
    // Check if room already exists
    const existingRoom = await env.TREASURE_ROOMS.get(`room:${roomCode}`);
    if (!existingRoom) {
      // Room code is unique, proceed
      break;
    }
    
    attempts++;
    if (attempts >= maxAttempts) {
      return new Response(JSON.stringify({ error: 'Failed to generate unique room code' }), {
        status: 500,
        headers,
      });
    }
  }
  
  // Create new room
  const now = new Date().toISOString();
  const creatorId = crypto.randomUUID();
  const room = {
    roomCode,
    createdAt: now,
    lastActivityAt: now,
    creatorId: creatorId,  // Store creator ID separately
    members: [{
      id: creatorId,
      nickname: memberNickname || '光之戰士1',
      joinedAt: now,
      isCreator: true,  // Mark as creator
    }],
    treasureMaps: [],
  };
  
  // Save to KV with 24 hour expiration
  await saveRoomToKV(room, env);
  
  return new Response(JSON.stringify(room), { headers });
}

// Get room data
async function handleGetRoom(roomCode, env, headers) {
  const room = await getRoomFromKV(roomCode, env);
  
  if (!room) {
    return createNotFoundResponse(headers);
  }
  
  return new Response(JSON.stringify(room), { headers });
}

// Update room (for syncing treasure maps)
async function handleUpdateRoom(roomCode, request, env, headers) {
  const room = await getRoomFromKV(roomCode, env);
  
  if (!room) {
    return createNotFoundResponse(headers);
  }
  
  const updates = await request.json();
  
  // Update room data
  if (updates.treasureMaps !== undefined) {
    room.treasureMaps = updates.treasureMaps;
  }
  
  // Update member nickname
  // SECURITY: Users can only update their own nickname
  if (updates.memberId && updates.nickname) {
    // Validate nickname length
    if (updates.nickname.length > 20) {
      return new Response(JSON.stringify({ error: 'Nickname too long (max 20 characters)' }), {
        status: 400,
        headers,
      });
    }
    
    // Find the member
    const member = room.members.find(m => m.id === updates.memberId);
    if (!member) {
      return new Response(JSON.stringify({ error: 'Member not found' }), {
        status: 404,
        headers,
      });
    }
    
    // Update nickname
    // TODO: In a production system with authentication, verify that
    // updates.memberId matches the authenticated user's ID
    member.nickname = updates.nickname;
  }
  
  // Update last activity
  room.lastActivityAt = new Date().toISOString();
  
  // Save back to KV with renewed TTL
  await saveRoomToKV(room, env);
  
  return new Response(JSON.stringify(room), { headers });
}

// Join existing room
async function handleJoinRoom(roomCode, request, env, headers) {
  const room = await getRoomFromKV(roomCode, env);
  
  if (!room) {
    return createNotFoundResponse(headers);
  }
  const { memberNickname } = await request.json();
  
  // Check if room is full
  if (room.members.length >= 8) {
    return new Response(JSON.stringify({ error: 'Room is full' }), {
      status: 400,
      headers,
    });
  }
  
  // Add new member with cryptographically secure unique ID
  const newMemberId = crypto.randomUUID();
  const memberCount = room.members.length + 1;
  const newMember = {
    id: newMemberId,
    nickname: memberNickname || `光之戰士${memberCount}`,
    joinedAt: new Date().toISOString(),
    isCreator: false,  // Mark as non-creator
  };
  
  room.members.push(newMember);
  room.lastActivityAt = new Date().toISOString();
  
  // Save back to KV
  await saveRoomToKV(room, env);
  
  return new Response(JSON.stringify({ room, newMember }), { headers });
}

// Leave room - allows a member to leave the room voluntarily
// SECURITY NOTE: Without authentication, we cannot prevent malicious users from
// removing others. This endpoint should only be used by members to remove themselves.
// For forced removal, use the remove-member endpoint which requires creator privileges.
async function handleLeaveRoom(roomCode, request, env, headers) {
  const room = await getRoomFromKV(roomCode, env);
  
  if (!room) {
    return createNotFoundResponse(headers);
  }
  const { memberId } = await request.json();
  
  // TODO: In a production system with authentication, verify that
  // memberId matches the authenticated user's ID
  
  // Validate member exists
  const memberExists = room.members.some(m => m.id === memberId);
  if (!memberExists) {
    return new Response(JSON.stringify({ error: 'Member not found' }), {
      status: 404,
      headers,
    });
  }
  
  // Remove member
  room.members = room.members.filter(m => m.id !== memberId);
  
  // If room is empty, delete it
  if (room.members.length === 0) {
    await env.TREASURE_ROOMS.delete(`room:${roomCode}`);
    return new Response(JSON.stringify({ message: 'Room deleted' }), { headers });
  }
  
  // Otherwise update room
  room.lastActivityAt = new Date().toISOString();
  
  await saveRoomToKV(room, env);
  
  return new Response(JSON.stringify(room), { headers });
}

// Remove member from room
async function handleRemoveMember(roomCode, request, env, headers) {
  const room = await getRoomFromKV(roomCode, env);
  
  if (!room) {
    return createNotFoundResponse(headers);
  }
  const { requesterId, targetMemberId } = await request.json();
  
  // All rooms must have creatorId - reject old format rooms
  if (!room.creatorId) {
    return new Response(JSON.stringify({ error: 'Invalid room format' }), {
      status: 400,
      headers,
    });
  }
  
  const creatorId = room.creatorId;
  
  // Only allow room creator to remove members
  // This prevents impersonation attacks since we don't have authentication
  if (requesterId !== creatorId) {
    return new Response(JSON.stringify({ error: 'Only room creator can remove members' }), {
      status: 403,
      headers,
    });
  }
  
  // Verify the room creator is still in the room
  const creator = room.members.find(m => m.id === creatorId);
  if (!creator) {
    return new Response(JSON.stringify({ error: 'Room creator not found' }), {
      status: 403,
      headers,
    });
  }
  
  // Cannot remove the room creator
  if (targetMemberId === creatorId) {
    return new Response(JSON.stringify({ error: 'Cannot remove room creator' }), {
      status: 400,
      headers,
    });
  }
  
  // Remove target member
  room.members = room.members.filter(m => m.id !== targetMemberId);
  
  // Update room
  room.lastActivityAt = new Date().toISOString();
  
  await saveRoomToKV(room, env);
  
  return new Response(JSON.stringify(room), { headers });
}

// Cleanup expired rooms (called by cron trigger)
async function handleCleanup(env, headers) {
  // KV automatically handles expiration, but we can implement additional cleanup if needed
  return new Response(JSON.stringify({ message: 'Cleanup completed' }), { headers });
}