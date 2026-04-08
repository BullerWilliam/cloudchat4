# CloudChat4

A Discord-style chat backend API built with Express.js and MongoDB.

## Overview

CloudChat4 is a feature-rich chat server providing real-time messaging capabilities, server management, user authentication, and permission systems similar to Discord. It supports direct messaging, group chats, server channels with categories, role-based permissions, and more.

## Website

The main website is available at `/site` — this serves `site.html` from the project folder.

## Tech Stack

- **Runtime:** Node.js (ES Modules)
- **Framework:** Express.js
- **Database:** MongoDB with Mongoose ODM
- **Authentication:** JWT + bcrypt
- **Security:** Helmet, CORS, Rate Limiting

## Environment Variables

```env
PORT=3000                          # Server port (default: 3000)
JWT_SECRET=your-secret-key         # JWT signing secret
MONGODB_URL=mongodb+srv://...      # MongoDB connection string
MONGODB_PASSWORD=your-password     # MongoDB password (if using template URL)
ADMIN_AUTH=admin-auth-key          # Admin key for database clearing
```

## Authentication

Most endpoints require authentication via Bearer token in the Authorization header:

```
Authorization: Bearer <jwt-token>
```

Tokens are obtained from `/auth/register` or `/auth/login`.

---

## API Endpoints

### Health & Admin

#### GET /health
Health check endpoint that stores a ping record.

**Response:**
```json
{
  "status": "ok",
  "time": "2024-01-15T10:30:00.000Z",
  "pingId": "65a123...",
  "random": 0.847291
}
```

---

#### POST /health
Store a custom health payload.

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "any": "data you want to store"
}
```

**Response:**
```json
{
  "status": "ok",
  "stored": true,
  "pingId": "65a123...",
  "received": { "any": "data you want to store" }
}
```

---

#### POST /clear-db
Clear the entire database. **WARNING: Destructive operation!**

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "key": "your-admin-auth-key"
}
```

**Response (200 OK):**
```json
{
  "ok": true,
  "cleared": true
}
```

**Response (403 Forbidden):**
```json
{
  "error": "Invalid admin key"
}
```

---

### Authentication

#### POST /auth/register
Register a new user account.

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "displayName": "John Doe",
  "email": "john@example.com",
  "password": "securepass123",
  "imageUrl": "https://example.com/avatar.jpg"
}
```

**Required Fields:**
- `displayName` - User display name (not unique)
- `email` - Unique email
- `password` - Minimum 6 characters

**Optional Fields:**
- `imageUrl` - Avatar URL

**Response (201 Created):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "65a123...",
    "displayName": "John Doe",
    "email": "john@example.com",
    "imageUrl": "https://example.com/avatar.jpg",
    "bio": "",
    "status": "offline",
    "activity": null,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "lastSeenAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Response (400 Bad Request):**
```json
{
  "error": "displayName, email and password are required"
}
```

**Response (409 Conflict):**
```json
{
  "error": "email already exists"
}
```

---

#### POST /auth/login
Authenticate and receive a JWT token.

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "email": "john@example.com",
  "password": "securepass123"
}
```

**Fields:**
- `email` - Account email (required)
- `password` - Account password

**Response (200 OK):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "65a123...",
    "displayName": "John Doe",
    "email": "john@example.com",
    "imageUrl": "",
    "bio": "",
    "status": "offline",
    "activity": null,
    "createdAt": "2024-01-15T10:00:00.000Z",
    "lastSeenAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Response (401 Unauthorized):**
```json
{
  "error": "Invalid credentials"
}
```

---

#### GET /auth/me
Get the current authenticated user's profile.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "user": {
    "id": "65a123...",
    "displayName": "John Doe",
    "email": "john@example.com",
    "imageUrl": "https://example.com/avatar.jpg",
    "bio": "Software developer",
    "status": "online",
    "activity": { "name": "Coding", "type": "PLAYING" },
    "createdAt": "2024-01-15T10:00:00.000Z",
    "lastSeenAt": "2024-01-15T10:30:00.000Z"
  }
}
```

---

#### PATCH /auth/me
Update the current user's profile.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "displayName": "New Name",
  "email": "new@example.com",
  "imageUrl": "https://example.com/new-avatar.jpg",
  "bio": "Updated bio"
}
```

**Fields:** All optional
- `displayName` - New display name
- `email` - New email (unique)
- `imageUrl` - New avatar URL
- `bio` - New bio

**Response (409 Conflict):**
```json
{
  "error": "email already exists"
}
```

---

#### PATCH /users/:userId/display-name
Change the authenticated user's display name.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "displayName": "New Name"
}
```

**Rules:**
- `:userId` must match the authenticated user id.
- `displayName` is required and can be shared by multiple users.

---

#### POST /auth/forgot-password
Request a password reset code.

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "email": "john@example.com",
  "userId": "65a123..."
}
```

**Behavior:**
- If `email` and `userId` match an account, a reset code is emailed.
- Response is still `{ "ok": true }` for non-matching accounts.

---

#### POST /auth/reset-password
Reset password using the emailed code.

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "email": "john@example.com",
  "userId": "65a123...",
  "code": "123456",
  "newPassword": "newsecurepass123"
}
```

**Required Fields:**
- `email`
- `userId`
- `code`
- `newPassword` (min 6 chars)

---

### Users

#### GET /users/search
Search for users by display name, email, or exact user id.

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `q` - Search query string

**Response (200 OK):**
```json
{
  "users": [
    {
      "id": "65a123...",
      "displayName": "John Doe",
      "email": "john@example.com",
      "imageUrl": "https://example.com/avatar.jpg",
      "bio": "Developer",
      "status": "online",
      "activity": null,
      "createdAt": "2024-01-15T10:00:00.000Z",
      "lastSeenAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

---

#### GET /users/:userId
Get a specific user's public profile. **No authentication required.**

**Response (200 OK):**
```json
{
  "user": {
    "id": "65a123...",
    "displayName": "John Doe",
    "email": "john@example.com",
    "imageUrl": "",
    "bio": "",
    "status": "online",
    "activity": null,
    "createdAt": "2024-01-15T10:00:00.000Z",
    "lastSeenAt": "2024-01-15T10:30:00.000Z"
  }
}
```

---

#### GET /users/:userId/notification-settings
Get notification preferences.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "notificationSettings": {
    "friend_requests": true,
    "server_mentions": true,
    "dm_messages": true
  }
}
```

**Response (403 Forbidden):**
```json
{
  "error": "Cannot view another user settings"
}
```

---

#### PATCH /users/:userId/notification-settings
Update notification preferences.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "friend_requests": false,
  "server_mentions": true,
  "dm_messages": false
}
```

**Response (200 OK):**
```json
{
  "notificationSettings": {
    "friend_requests": false,
    "server_mentions": true,
    "dm_messages": false
  }
}
```

---

#### GET /users/:userId/presence
Get a user's presence status. **No authentication required.**

**Response (200 OK):**
```json
{
  "userId": "65a123...",
  "status": "online",
  "activity": {
    "name": "Playing Minecraft",
    "type": "PLAYING"
  },
  "lastSeenAt": "2024-01-15T10:30:00.000Z"
}
```

**Response (404 Not Found):**
```json
{
  "error": "User not found"
}
```

---

#### PATCH /users/:userId/presence
Update online status and activity.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "status": "online",
  "activity": {
    "name": "Playing Minecraft",
    "type": "PLAYING"
  }
}
```

**Status Options:** `online`, `idle`, `dnd`, `offline`

**Response (200 OK):**
```json
{
  "presence": {
    "status": "online",
    "activity": {
      "name": "Playing Minecraft",
      "type": "PLAYING"
    }
  }
}
```

**Response (403 Forbidden):**
```json
{
  "error": "Cannot set another user presence"
}
```

---

#### POST /users/getid
Get a user's ID by email. **No authentication required.**

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "email": "john@example.com"
}
```

**Response (200 OK):**
```json
{
  "id": "65a123..."
}
```

---

### Friends

#### POST /friends/request
Send a friend request to another user.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "targetUserId": "65b456..."
}
```

**Response (201 Created):**
```json
{
  "request": {
    "_id": "65c789...",
    "fromUserId": "65a123...",
    "toUserId": "65b456...",
    "status": "pending",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "respondedAt": null
  }
}
```

**Response (400 Bad Request):**
```json
{
  "error": "You cannot add yourself"
}
```

**Response (409 Conflict):**
```json
{
  "error": "Already friends"
}
```

---

#### GET /friends/requests/incoming
Get pending friend requests received.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "requests": [
    {
      "id": "65c789...",
      "fromUserId": {
        "id": "65a123...",
        "displayName": "John Doe",
        "imageUrl": "",
        "status": "online",
        "activity": null
      },
      "toUserId": "65b456...",
      "status": "pending",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "respondedAt": null
    }
  ]
}
```

---

#### GET /friends/requests/outgoing
Get pending friend requests sent.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "requests": [
    {
      "id": "65c789...",
      "fromUserId": "65a123...",
      "toUserId": {
        "id": "65b456...",
        "displayName": "Jane Doe",
        "imageUrl": "",
        "status": "offline",
        "activity": null
      },
      "status": "pending",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "respondedAt": null
    }
  ]
}
```

---

#### POST /friends/requests/:requestId/respond
Accept or decline a friend request.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "action": "accept"
}
```

**Actions:** `accept`, `decline`

**Response (200 OK):**
```json
{
  "request": {
    "_id": "65c789...",
    "fromUserId": "65a123...",
    "toUserId": "65b456...",
    "status": "accepted",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "respondedAt": "2024-01-15T10:35:00.000Z"
  }
}
```

**Response (403 Forbidden):**
```json
{
  "error": "Not allowed"
}
```

---

#### GET /friends/list
Get list of all friends.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "friends": [
    {
      "id": "65b456...",
      "displayName": "Jane Doe",
      "imageUrl": "",
      "status": "offline",
      "activity": null
    }
  ]
}
```

---

### Blocking

#### POST /blocks
Block a user.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "blockedId": "65b456..."
}
```

**Response (200 OK):**
```json
{
  "ok": true
}
```

**Response (409 Conflict):**
```json
{
  "error": "Already blocked"
}
```

---

#### GET /blocks
Get list of blocked users.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "blocks": [
    {
      "id": "65d012...",
      "user": {
        "id": "65b456...",
        "displayName": "Jane Doe",
        "imageUrl": "",
        "status": "offline",
        "activity": null
      },
      "createdAt": "2024-01-15T11:00:00.000Z"
    }
  ]
}
```

---

#### DELETE /blocks/:blockedId
Unblock a user.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "ok": true
}
```

**Response (404 Not Found):**
```json
{
  "error": "Block not found"
}
```

---

### Servers

#### POST /servers
Create a new server.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "name": "My Awesome Server",
  "iconUrl": "https://example.com/icon.png",
  "description": "A place for friends",
  "rulesText": "Be nice!"
}
```

**Required Fields:**
- `name` - Server name

**Optional Fields:**
- `iconUrl` - Server icon URL
- `description` - Server description
- `rulesText` - Server rules

**Response (201 Created):**
```json
{
  "server": {
    "_id": "65e345...",
    "name": "My Awesome Server",
    "iconUrl": "https://example.com/icon.png",
    "bannerUrl": "",
    "splashUrl": "",
    "description": "A place for friends",
    "ownerId": "65a123...",
    "rulesText": "Be nice!",
    "verificationLevel": "none",
    "explicitContentFilter": "disabled",
    "defaultMessageNotifications": "ALL",
    "afkChannelId": null,
    "systemChannelId": null,
    "inviteCode": "a1b2c3d4...",
    "createdAt": "2024-01-15T12:00:00.000Z"
  }
}
```

*Note: Automatically creates @everyone role, "General" category, and "general"/"voice" channels.*

---

#### GET /servers
Get all servers the user is a member of.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "servers": [
    {
      "_id": "65e345...",
      "name": "My Awesome Server",
      "iconUrl": "",
      "description": "A place for friends",
      "ownerId": "65a123...",
      "createdAt": "2024-01-15T12:00:00.000Z"
    }
  ]
}
```

---

#### GET /servers/:serverId
Get detailed server information. **No authentication required.**

**Response (200 OK):**
```json
{
  "server": {
    "_id": "65e345...",
    "name": "My Awesome Server",
    "iconUrl": "",
    "bannerUrl": "",
    "splashUrl": "",
    "description": "A place for friends",
    "ownerId": "65a123...",
    "rulesText": "Be nice!",
    "verificationLevel": "none",
    "explicitContentFilter": "disabled",
    "defaultMessageNotifications": "ALL",
    "afkChannelId": null,
    "systemChannelId": null,
    "inviteCode": "a1b2c3d4...",
    "createdAt": "2024-01-15T12:00:00.000Z"
  },
  "members": [
    {
      "id": "65f678...",
      "serverId": "65e345...",
      "userId": {
        "id": "65a123...",
        "displayName": "John Doe",
        "imageUrl": "",
        "status": "online",
        "activity": null
      },
      "roleIds": ["65g901..."],
      "nick": "",
      "joinedAt": "2024-01-15T12:00:00.000Z",
      "muted": false,
      "deafened": false
    }
  ],
  "roles": [
    {
      "_id": "65g901...",
      "serverId": "65e345...",
      "name": "@everyone",
      "color": "#99aab5",
      "permissions": ["VIEW_CHANNEL", "SEND_MESSAGES", "READ_MESSAGE_HISTORY", "CONNECT_VOICE"],
      "position": 0,
      "hoist": false,
      "mentionable": false,
      "createdAt": "2024-01-15T12:00:00.000Z"
    }
  ],
  "categories": [
    {
      "_id": "65h234...",
      "serverId": "65e345...",
      "name": "General",
      "position": 0,
      "createdAt": "2024-01-15T12:00:00.000Z"
    }
  ],
  "channels": [
    {
      "_id": "65i567...",
      "serverId": "65e345...",
      "categoryId": "65h234...",
      "name": "general",
      "type": "text",
      "topic": "",
      "position": 0,
      "permissionOverwrites": [],
      "allowedRoleIds": [],
      "deniedRoleIds": [],
      "createdAt": "2024-01-15T12:00:00.000Z"
    }
  ],
  "emojis": []
}
```

**Response (404 Not Found):**
```json
{
  "error": "Server not found"
}
```
  ],
  "categories": [
    {
      "_id": "65h234...",
      "serverId": "65e345...",
      "name": "General",
      "position": 0,
      "createdAt": "2024-01-15T12:00:00.000Z"
    }
  ],
  "channels": [
    {
      "_id": "65i567...",
      "serverId": "65e345...",
      "categoryId": "65h234...",
      "name": "general",
      "type": "text",
      "topic": "",
      "position": 0,
      "permissionOverwrites": [],
      "allowedRoleIds": [],
      "deniedRoleIds": [],
      "createdAt": "2024-01-15T12:00:00.000Z"
    }
  ],
  "emojis": []
}
```

**Response (403 Forbidden):**
```json
{
  "error": "Not a server member"
}
```

---

#### GET /servers/:serverId/settings
Get server settings. **Only the server owner can view settings.**

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "settings": {
    "_id": "65e345...",
    "name": "My Awesome Server",
    "iconUrl": "",
    "bannerUrl": "",
    "splashUrl": "",
    "description": "A place for friends",
    "ownerId": "65a123...",
    "rulesText": "Be nice!",
    "verificationLevel": "none",
    "explicitContentFilter": "disabled",
    "defaultMessageNotifications": "ALL",
    "afkChannelId": null,
    "systemChannelId": null,
    "inviteCode": "a1b2c3d4...",
    "createdAt": "2024-01-15T12:00:00.000Z"
  }
}
```

**Response (403 Forbidden):**
```json
{
  "error": "Only the server owner can view settings"
}
```

**Response (404 Not Found):**
```json
{
  "error": "Server not found"
}
```

---

#### PATCH /servers/:serverId/settings
Update server settings.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "name": "New Server Name",
  "iconUrl": "https://example.com/new-icon.png",
  "bannerUrl": "https://example.com/banner.png",
  "splashUrl": "https://example.com/splash.png",
  "description": "Updated description",
  "rulesText": "Updated rules",
  "verificationLevel": "medium",
  "explicitContentFilter": "members_without_roles",
  "defaultMessageNotifications": "ONLY_MENTIONS",
  "afkChannelId": "65j890...",
  "systemChannelId": "65k123..."
}
```

**Fields:** All optional
- `name` - Server name
- `iconUrl` - Icon URL
- `bannerUrl` - Banner image URL
- `splashUrl` - Splash screen URL
- `description` - Description
- `rulesText` - Rules text
- `verificationLevel` - `none`, `low`, `medium`, `high`
- `explicitContentFilter` - `disabled`, `members_without_roles`, `all_members`
- `defaultMessageNotifications` - `ALL`, `ONLY_MENTIONS`
- `afkChannelId` - AFK voice channel ID
- `systemChannelId` - System messages channel ID

**Response (200 OK):**
```json
{
  "server": {
    "_id": "65e345...",
    "name": "New Server Name",
    "iconUrl": "https://example.com/new-icon.png",
    ...
  }
}
```

**Response (403 Forbidden):**
```json
{
  "error": "Only the server owner can edit settings"
}
```

---

#### POST /servers/:serverId/join
Join a server using invite code.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "code": "a1b2c3d4..."
}
```

**Response (200 OK):**
```json
{
  "ok": true
}
```

---

#### POST /servers/:serverId/leave
Leave a server.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "ok": true
}
```

**Response (400 Bad Request):**
```json
{
  "error": "Owner cannot leave the server"
}
```

---

### Server Ownership Transfer

Transfer ownership of a server to another member. The receiver must accept within 5 minutes or the transfer expires.

#### POST /servers/:serverId/ownership-transfer
Initiate ownership transfer to another server member. **Owner only.**

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "toUserId": "65b456..."
}
```

**Required Fields:**
- `toUserId` - ID of the member who will receive ownership

**Response (201 Created):**
```json
{
  "transfer": {
    "id": "65x012...",
    "serverId": "65e345...",
    "fromUserId": "65a123...",
    "toUserId": "65b456...",
    "status": "pending",
    "expiresAt": "2024-01-15T12:35:00.000Z",
    "createdAt": "2024-01-15T12:30:00.000Z"
  }
}
```

**Response (400 Bad Request):**
```json
{
  "error": "Cannot transfer ownership to yourself"
}
```

**Response (403 Forbidden):**
```json
{
  "error": "Only the server owner can transfer ownership"
}
```

**Response (409 Conflict):**
```json
{
  "error": "There is already a pending ownership transfer for this server"
}
```

---

#### GET /servers/:serverId/ownership-transfer/pending
Get the pending ownership transfer for the current user (receiver only).

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "transfer": {
    "id": "65x012...",
    "serverId": "65e345...",
    "fromUserId": {
      "id": "65a123...",
      "displayName": "John Doe",
      "imageUrl": "",
      "status": "online",
      "activity": null
    },
    "toUserId": "65b456...",
    "status": "pending",
    "expiresAt": "2024-01-15T12:35:00.000Z",
    "createdAt": "2024-01-15T12:30:00.000Z"
  }
}
```

**Response (404 Not Found):**
```json
{
  "error": "No pending ownership transfer found"
}
```

---

#### GET /servers/:serverId/ownership-transfers
Get all ownership transfer history for a server. **Owner only.**

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "transfers": [
    {
      "id": "65x012...",
      "serverId": "65e345...",
      "fromUserId": { ...user info... },
      "toUserId": { ...user info... },
      "status": "accepted",
      "expiresAt": "2024-01-15T12:35:00.000Z",
      "createdAt": "2024-01-15T12:30:00.000Z",
      "respondedAt": "2024-01-15T12:32:00.000Z"
    }
  ]
}
```

---

#### POST /servers/:serverId/ownership-transfer/respond
Accept or decline an ownership transfer. **Receiver only.**

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "action": "accept"
}
```

**Actions:** `accept`, `decline`

**Response (200 OK) - Accepted:**
```json
{
  "transfer": {
    "id": "65x012...",
    "serverId": "65e345...",
    "fromUserId": "65a123...",
    "toUserId": "65b456...",
    "status": "accepted",
    "expiresAt": "2024-01-15T12:35:00.000Z",
    "createdAt": "2024-01-15T12:30:00.000Z",
    "respondedAt": "2024-01-15T12:32:00.000Z"
  }
}
```

**Response (200 OK) - Declined:**
```json
{
  "transfer": {
    "id": "65x012...",
    ...,
    "status": "declined"
  }
}
```

**Response (410 Gone):**
```json
{
  "error": "Ownership transfer has expired"
}
```

---

#### DELETE /servers/:serverId/ownership-transfer
Cancel a pending ownership transfer. **Owner only.**

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "ok": true
}
```

---

### Webhooks

Server owners can create webhooks to post messages to channels. Webhooks have a name and optional avatar image, and use a token to authenticate message posts.

#### POST /servers/:serverId/channels/:channelId/webhooks
Create a webhook for a channel. **Owner only.**

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "name": "GitHub",
  "imageUrl": "https://example.com/github-icon.png"
}
```

**Required Fields:**
- `name` - Webhook display name

**Optional Fields:**
- `imageUrl` - Avatar image URL

**Response (201 Created):**
```json
{
  "webhook": {
    "id": "65y123...",
    "serverId": "65e345...",
    "channelId": "65o345...",
    "name": "GitHub",
    "imageUrl": "https://example.com/github-icon.png",
    "createdBy": "65a123...",
    "createdAt": "2024-01-15T14:00:00.000Z"
  },
  "token": "a1b2c3d4e5f6..."
}
```

**⚠️ Note:** The token is only returned once on creation. Store it securely!

**Response (403 Forbidden):**
```json
{
  "error": "Only the server owner can create webhooks"
}
```

---

#### GET /servers/:serverId/channels/:channelId/webhooks
Get all webhooks for a specific channel. **Owner only.**

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "webhooks": [
    {
      "id": "65y123...",
      "serverId": "65e345...",
      "channelId": "65o345...",
      "name": "GitHub",
      "imageUrl": "https://example.com/github-icon.png",
      "createdBy": "65a123...",
      "createdAt": "2024-01-15T14:00:00.000Z"
    }
  ]
}
```

---

#### GET /servers/:serverId/webhooks
Get all webhooks for a server. **Owner only.**

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "webhooks": [
    {
      "id": "65y123...",
      "serverId": "65e345...",
      "channelId": "65o345...",
      "channelName": "general",
      "name": "GitHub",
      "imageUrl": "https://example.com/github-icon.png",
      "createdBy": "65a123...",
      "createdAt": "2024-01-15T14:00:00.000Z"
    }
  ]
}
```

---

#### PATCH /servers/:serverId/webhooks/:webhookId
Update a webhook's name or image. **Owner only.**

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "name": "GitHub Bot",
  "imageUrl": "https://example.com/new-avatar.png"
}
```

**Response (200 OK):**
```json
{
  "webhook": {
    "id": "65y123...",
    "serverId": "65e345...",
    "channelId": "65o345...",
    "name": "GitHub Bot",
    "imageUrl": "https://example.com/new-avatar.png",
    "createdBy": "65a123...",
    "createdAt": "2024-01-15T14:00:00.000Z"
  }
}
```

---

#### DELETE /servers/:serverId/webhooks/:webhookId
Delete a webhook. **Owner only.**

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "ok": true
}
```

---

#### POST /webhooks/:webhookId/:webhookToken
Send a message using a webhook. **No authentication required** - just the webhook token.

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "content": "New commit pushed!",
  "attachments": ["https://example.com/screenshot.png"]
}
```

**Required Fields:**
- `content` - Message text

**Optional Fields:**
- `attachments` - Array of attachment URLs

**Response (201 Created):**
```json
{
  "message": {
    "id": "65z456...",
    "kind": "server",
    "serverId": "65e345...",
    "channelId": "65o345...",
    "content": "New commit pushed!",
    "attachments": ["https://example.com/screenshot.png"],
    "webhook": {
      "id": "65y123...",
      "name": "GitHub",
      "imageUrl": "https://example.com/github-icon.png"
    },
    "createdAt": "2024-01-15T14:30:00.000Z"
  }
}
```

**Response (401 Unauthorized):**
```json
{
  "error": "Invalid webhook token"
}
```

---

### Shop & Currency
A platform-wide shop with items users can purchase using their currency. Only admins (with `ADMIN_AUTH` key) can manage shop items.

Item types:
- `avatar_decoration` - Profile avatar decoration image
- `name_tag` - Name tag image

#### GET /shop/items
List all available shop items. **No authentication required.**

**Response (200 OK):**
```json
{
  "items": [
    {
      "_id": "65shop1...",
      "name": "Golden Crown",
      "description": "A royal golden crown",
      "type": "avatar_decoration",
      "imageUrl": "https://example.com/crown.png",
      "price": 500,
      "createdAt": "2024-01-15T10:00:00.000Z"
    },
    {
      "_id": "65shop2...",
      "name": "Ruby Tag",
      "description": "A shiny red name tag",
      "type": "name_tag",
      "imageUrl": "https://example.com/nametag.png",
      "price": 300,
      "createdAt": "2024-01-15T10:00:00.000Z"
  ]
}
```

---

#### POST /shop/items
Create a shop item. **Admin only.**

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "key": "admin-auth-key",
  "name": "Golden Crown",
  "description": "A royal golden crown",
  "type": "avatar_decoration",
  "imageUrl": "https://example.com/crown.png",
  "price": 500
}
```

**Types:** `avatar_decoration`, `name_tag`

**Response (201 Created):**
```json
{
  "item": {
    "_id": "65shop1...",
    "name": "Golden Crown",
    "description": "A royal golden crown",
    "type": "avatar_decoration",
    "imageUrl": "https://example.com/crown.png",
    "price": 500,
    "color": "",
    "createdAt": "2024-01-15T10:00:00.000Z"
  }
}
```

**Response (403 Forbidden):**
```json
{
  "error": "Invalid admin key"
}
```

---

#### PATCH /shop/items/:itemId
Update a shop item. **Admin only.**

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "key": "admin-auth-key",
  "name": "Updated Name",
  "price": 600
}
```

---

#### DELETE /shop/items/:itemId
Delete a shop item. **Admin only.**

**Headers:**
```
Authorization: Bearer <token>
```

**Query:**
- `key` - Admin auth key

**Example:** `DELETE /shop/items/65shop1...?key=admin-auth-key`

**Response (200 OK):**
```json
{
  "ok": true
}
```

---

#### GET /users/:userId/inventory
Get a user's purchased items. **Authenticated user only.**

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "items": [
    {
      "id": "65inv1...",
      "itemId": "65shop1...",
      "name": "Golden Crown",
      "description": "A royal golden crown",
      "type": "avatar_decoration",
      "imageUrl": "https://example.com/crown.png",
      "color": "",
      "price": 500,
      "purchasedAt": "2024-01-15T12:00:00.000Z"
    }
  ]
}
```

---

#### POST /shop/items/:itemId/buy
Purchase an item with currency. **Authenticated user only.**

**Headers:**
```
Authorization: Bearer <token>
```

**Response (201 Created):**
```json
{
  "inventory": {
    "id": "65inv1...",
    "itemId": "65shop1...",
    "purchasedAt": "2024-01-15T12:00:00.000Z"
  },
  "remainingCurrency": 3500
}
```

**Response (400 Bad Request):**
```json
{
  "error": "Insufficient currency"
}
```

**Response (409 Conflict):**
```json
{
  "error": "You already own this item"
}
```

---

#### POST /users/:userId/avatar-decoration
Select/unequip an avatar decoration. **Authenticated user only.**

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body (equip):**
```json
{
  "itemId": "65shop1..."
}
```

**Body (unequip):**
```json
{
  "itemId": null
}
```

**Response (200 OK):**
```json
{
  "ok": true,
  "selectedAvatarDecoration": "65shop1..."
}
```

---

#### POST /users/:userId/name-tag
Select/unequip a name tag. **Authenticated user only.**

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body (equip):**
```json
{
  "itemId": "65shop2..."
}
```

**Body (unequip):**
```json
{
  "itemId": null
}
```

**Response (200 OK):**
```json
{
  "ok": true,
  "selectedNameTag": "65shop2..."
}
```

---

**Updated User Objects:**

`GET /auth/me` and `GET /users/:userId` now return additional fields:

```json
{
  "user": {
    "id": "65a123...",
    "displayName": "John Doe",
    "email": "john@example.com",
    "imageUrl": "",
    "bio": "",
    "status": "online",
    "activity": null,
    "currency": 3500,
    "selectedAvatarDecoration": {
      "id": "65shop1...",
      "name": "Golden Crown",
      "imageUrl": "https://example.com/crown.png",
      "type": "avatar_decoration"
    },
    "selectedNameTag": {
      "id": "65shop2...",
      "name": "Ruby Name",
      "imageUrl": "",
      "color": "#ff0000",
      "type": "name_tag"
    },
    "createdAt": "2024-01-15T10:00:00.000Z",
    "lastSeenAt": "2024-01-15T12:00:00.000Z"
  }
}
```

---

### Server Invites

#### POST /servers/:serverId/invites/custom
Create a custom invite link.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "inviteeId": "65b456...",
  "maxUses": 5,
  "temporary": false,
  "expiresInMinutes": 60
}
```

**Fields:**
- `inviteeId` - Optional specific user to invite
- `maxUses` - Maximum uses (0 = unlimited)
- `temporary` - If true, member is removed when leaving voice
- `expiresInMinutes` - Expiration time (0 = never)

**Response (201 Created):**
```json
{
  "invite": {
    "_id": "65l456...",
    "serverId": "65e345...",
    "inviterId": "65a123...",
    "inviteeId": "65b456...",
    "code": "e5f6g7h8...",
    "status": "pending",
    "maxUses": 5,
    "uses": 0,
    "temporary": false,
    "expiresAt": "2024-01-15T13:00:00.000Z",
    "createdAt": "2024-01-15T12:00:00.000Z",
    "respondedAt": null
  }
}
```

---

#### GET /servers/:serverId/invites
List all invites for a server.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "invites": [
    {
      "_id": "65l456...",
      "serverId": "65e345...",
      "inviterId": "65a123...",
      "inviteeId": "65b456...",
      "code": "e5f6g7h8...",
      "status": "pending",
      "maxUses": 5,
      "uses": 0,
      "temporary": false,
      "expiresAt": "2024-01-15T13:00:00.000Z",
      "createdAt": "2024-01-15T12:00:00.000Z"
    }
  ]
}
```

---

#### GET /servers/:serverId/invites/:inviteId
Get a specific invite.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "invite": {
    "_id": "65l456...",
    "serverId": "65e345...",
    "inviterId": "65a123...",
    "inviteeId": "65b456...",
    "code": "e5f6g7h8...",
    "status": "pending",
    "maxUses": 5,
    "uses": 0,
    "temporary": false,
    "expiresAt": "2024-01-15T13:00:00.000Z",
    "createdAt": "2024-01-15T12:00:00.000Z",
    "respondedAt": null
  }
}
```

---

#### DELETE /servers/:serverId/invites/:inviteId
Delete an invite.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "ok": true
}
```

---

#### POST /server-invites/:inviteId/respond
Accept or decline a server invite.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "action": "accept"
}
```

**Actions:** `accept`, `decline`

**Response (200 OK):**
```json
{
  "invite": {
    "_id": "65l456...",
    "serverId": "65e345...",
    "status": "accepted",
    "uses": 1,
    ...
  }
}
```

**Response (410 Gone):**
```json
{
  "error": "Invite has expired"
}
```

---

### Roles

#### GET /servers/:serverId/roles
Get all roles for a server. **No authentication required.**

**Response (200 OK):**
```json
{
  "roles": [
    {
      "_id": "65g901...",
      "serverId": "65e345...",
      "name": "@everyone",
      "color": "#99aab5",
      "permissions": ["VIEW_CHANNEL", "SEND_MESSAGES", "READ_MESSAGE_HISTORY", "CONNECT_VOICE"],
      "position": 0,
      "hoist": false,
      "mentionable": false,
      "createdAt": "2024-01-15T12:00:00.000Z"
    },
    {
      "_id": "65m789...",
      "serverId": "65e345...",
      "name": "Moderator",
      "color": "#ff0000",
      "permissions": ["MANAGE_MESSAGES", "KICK_MEMBERS"],
      "position": 1,
      "hoist": true,
      "mentionable": true,
      "createdAt": "2024-01-15T12:30:00.000Z"
    }
  ]
}
```

---

#### POST /servers/:serverId/roles
Create a new role. Requires `MANAGE_ROLES` permission.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "name": "Moderator",
  "color": "#ff0000",
  "permissions": ["MANAGE_MESSAGES", "KICK_MEMBERS"],
  "position": 1,
  "hoist": true,
  "mentionable": true
}
```

**Fields:**
- `name` - Role name (required)
- `color` - Hex color (default: `#99aab5`)
- `permissions` - Array of permission strings
- `position` - Position in hierarchy
- `hoist` - Display separately in member list
- `mentionable` - Can be mentioned

**Response (201 Created):**
```json
{
  "role": {
    "_id": "65m789...",
    "serverId": "65e345...",
    "name": "Moderator",
    "color": "#ff0000",
    "permissions": ["MANAGE_MESSAGES", "KICK_MEMBERS"],
    "position": 1,
    "hoist": true,
    "mentionable": true,
    "createdAt": "2024-01-15T12:30:00.000Z"
  }
}
```

**Response (403 Forbidden):**
```json
{
  "error": "Missing required permission: MANAGE_ROLES"
}
```

---

#### PATCH /servers/:serverId/roles/:roleId
Update a role. Requires `MANAGE_ROLES` permission.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "name": "Super Moderator",
  "color": "#00ff00",
  "permissions": ["MANAGE_MESSAGES", "KICK_MEMBERS", "BAN_MEMBERS"],
  "position": 2,
  "hoist": true,
  "mentionable": true
}
```

**Response (200 OK):**
```json
{
  "role": {
    "_id": "65m789...",
    "serverId": "65e345...",
    "name": "Super Moderator",
    "color": "#00ff00",
    "permissions": ["MANAGE_MESSAGES", "KICK_MEMBERS", "BAN_MEMBERS"],
    "position": 2,
    "hoist": true,
    "mentionable": true,
    "createdAt": "2024-01-15T12:30:00.000Z"
  }
}
```

---

#### DELETE /servers/:serverId/roles/:roleId
Delete a role. Requires `MANAGE_ROLES` permission.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "ok": true
}
```

---

### Categories

#### POST /servers/:serverId/categories
Create a channel category. Requires `MANAGE_CHANNELS` permission.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "name": "Text Channels",
  "position": 1
}
```

**Response (201 Created):**
```json
{
  "category": {
    "_id": "65n012...",
    "serverId": "65e345...",
    "name": "Text Channels",
    "position": 1,
    "createdAt": "2024-01-15T12:45:00.000Z"
  }
}
```

---

#### PATCH /servers/:serverId/categories/:categoryId
Update a category. Requires `MANAGE_CHANNELS` permission.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "name": "Updated Category Name",
  "position": 2
}
```

**Response (200 OK):**
```json
{
  "category": {
    "_id": "65n012...",
    "serverId": "65e345...",
    "name": "Updated Category Name",
    "position": 2,
    "createdAt": "2024-01-15T12:45:00.000Z"
  }
}
```

---

#### DELETE /servers/:serverId/categories/:categoryId
Delete a category. Channels become uncategorized. Requires `MANAGE_CHANNELS` permission.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "ok": true
}
```

---

### Channels

#### POST /servers/:serverId/channels
Create a channel. Requires `MANAGE_CHANNELS` permission.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "categoryId": "65n012...",
  "name": "announcements",
  "type": "announcement",
  "topic": "Important server announcements",
  "position": 0,
  "allowedRoleIds": ["65g901..."],
  "deniedRoleIds": []
}
```

**Fields:**
- `categoryId` - Optional parent category ID
- `name` - Channel name (required)
- `type` - `text`, `voice`, `announcement`, `forum` (default: `text`)
- `topic` - Channel topic/description
- `position` - Sort position
- `allowedRoleIds` - Roles with explicit access
- `deniedRoleIds` - Roles denied access

**Response (201 Created):**
```json
{
  "channel": {
    "_id": "65o345...",
    "serverId": "65e345...",
    "categoryId": "65n012...",
    "name": "announcements",
    "type": "announcement",
    "topic": "Important server announcements",
    "position": 0,
    "permissionOverwrites": [],
    "allowedRoleIds": ["65g901..."],
    "deniedRoleIds": [],
    "createdAt": "2024-01-15T13:00:00.000Z"
  }
}
```

---

#### PATCH /servers/:serverId/channels/:channelId
Update a channel. Requires `MANAGE_CHANNELS` permission.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "categoryId": "65p678...",
  "name": "general-chat",
  "type": "text",
  "topic": "General discussion",
  "position": 1,
  "allowedRoleIds": [],
  "deniedRoleIds": []
}
```

**Response (200 OK):**
```json
{
  "channel": {
    "_id": "65o345...",
    "serverId": "65e345...",
    "categoryId": "65p678...",
    "name": "general-chat",
    "type": "text",
    "topic": "General discussion",
    "position": 1,
    ...
  }
}
```

---

#### DELETE /servers/:serverId/channels/:channelId
Delete a channel. Requires `MANAGE_CHANNELS` permission.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "ok": true
}
```

---

### Channel Permission Overwrites

#### POST /channels/:channelId/overwrites
Add a permission overwrite. Requires `MANAGE_CHANNELS` permission.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "targetId": "65m789...",
  "type": "role",
  "allow": ["SEND_MESSAGES", "EMBED_LINKS"],
  "deny": ["MANAGE_MESSAGES"]
}
```

**Fields:**
- `targetId` - Role ID or User ID
- `type` - `role` or `member`
- `allow` - Array of allowed permissions
- `deny` - Array of denied permissions

**Response (200 OK):**
```json
{
  "channel": {
    "_id": "65o345...",
    "serverId": "65e345...",
    "permissionOverwrites": [
      {
        "_id": "65q901...",
        "targetId": "65m789...",
        "type": "role",
        "allow": ["SEND_MESSAGES", "EMBED_LINKS"],
        "deny": ["MANAGE_MESSAGES"]
      }
    ],
    ...
  }
}
```

---

#### PATCH /channels/:channelId/overwrites/:overwriteId
Update a permission overwrite.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "allow": ["SEND_MESSAGES"],
  "deny": ["MANAGE_MESSAGES", "EMBED_LINKS"]
}
```

**Response (200 OK):**
```json
{
  "channel": {
    "_id": "65o345...",
    "permissionOverwrites": [...],
    ...
  }
}
```

---

#### DELETE /channels/:channelId/overwrites/:overwriteId
Remove a permission overwrite.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "ok": true
}
```

---

### Messages

#### POST /channels/:channelId/messages
Send a message in a channel.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "content": "Hello everyone!",
  "attachments": ["https://example.com/image.png"]
}
```

**Fields:**
- `content` - Message text (required)
- `attachments` - Array of attachment URLs

**Response (201 Created):**
```json
{
  "message": {
    "_id": "65r234...",
    "kind": "server",
    "senderId": "65a123...",
    "serverId": "65e345...",
    "channelId": "65o345...",
    "content": "Hello everyone!",
    "attachments": ["https://example.com/image.png"],
    "editHistory": [],
    "createdAt": "2024-01-15T13:30:00.000Z",
    "editedAt": null,
    "deletedAt": null
  }
}
```

---

#### GET /channels/:channelId/messages
Get messages in a channel (max 500).

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "messages": [
    {
      "_id": "65r234...",
      "kind": "server",
      "senderId": "65a123...",
      "serverId": "65e345...",
      "channelId": "65o345...",
      "content": "Hello everyone!",
      "attachments": [],
      "editHistory": [],
      "createdAt": "2024-01-15T13:30:00.000Z",
      "editedAt": null,
      "deletedAt": null
    }
  ]
}
```

---

#### PATCH /channels/:channelId/messages/:messageId
Edit a message. Only author or users with `MANAGE_MESSAGES` permission.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "content": "Hello everyone! (edited)"
}
```

**Response (200 OK):**
```json
{
  "message": {
    "_id": "65r234...",
    "content": "Hello everyone! (edited)",
    "editHistory": [
      {
        "editedAt": "2024-01-15T13:35:00.000Z",
        "before": "Hello everyone!",
        "after": "Hello everyone! (edited)"
      }
    ],
    "editedAt": "2024-01-15T13:35:00.000Z",
    ...
  }
}
```

**Response (403 Forbidden):**
```json
{
  "error": "Not allowed to edit this message"
}
```

---

#### DELETE /channels/:channelId/messages/:messageId
Delete a message (soft delete). Only author or users with `MANAGE_MESSAGES`.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "ok": true
}
```

---

### Pinned Messages

#### POST /channels/:channelId/pins/:messageId
Pin a message. Requires `MANAGE_MESSAGES` permission.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "ok": true
}
```

---

#### GET /channels/:channelId/pins
Get pinned messages.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "pinned": [
    {
      "_id": "65r234...",
      "content": "Important announcement!",
      "pinned": true,
      ...
    }
  ]
}
```

---

#### DELETE /channels/:channelId/pins/:messageId
Unpin a message. Requires `MANAGE_MESSAGES` permission.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "ok": true
}
```

---

### Reactions

#### POST /channels/:channelId/messages/:messageId/reactions
Add a reaction to a message.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "emoji": "👍"
}
```

**Response (200 OK):**
```json
{
  "ok": true
}
```

**Response (409 Conflict):**
```json
{
  "error": "Already reacted"
}
```

---

#### DELETE /channels/:channelId/messages/:messageId/reactions
Remove your reaction from a message.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "emoji": "👍"
}
```

**Response (200 OK):**
```json
{
  "ok": true
}
```

---

### Custom Emojis

#### GET /servers/:serverId/emojis
List custom emojis for a server.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "emojis": [
    {
      "_id": "65s567...",
      "serverId": "65e345...",
      "name": "pepe",
      "imageUrl": "https://example.com/pepe.png",
      "roleId": null,
      "createdAt": "2024-01-15T14:00:00.000Z"
    }
  ]
}
```

---

#### POST /servers/:serverId/emojis
Add a custom emoji. Requires `MANAGE_EMOJIS` permission.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "name": "pepe",
  "imageUrl": "https://example.com/pepe.png",
  "roleId": "65m789..."
}
```

**Fields:**
- `name` - Emoji name (required)
- `imageUrl` - Image URL (required)
- `roleId` - Optional role restriction

**Response (201 Created):**
```json
{
  "emoji": {
    "_id": "65s567...",
    "serverId": "65e345...",
    "name": "pepe",
    "imageUrl": "https://example.com/pepe.png",
    "roleId": "65m789...",
    "createdAt": "2024-01-15T14:00:00.000Z"
  }
}
```

---

#### DELETE /servers/:serverId/emojis/:emojiId
Delete a custom emoji. Requires `MANAGE_EMOJIS` permission.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "ok": true
}
```

---

### Audit Logs

#### GET /servers/:serverId/audit-logs
Get server audit logs. Requires `VIEW_AUDIT_LOG` or `ADMINISTRATOR` permission.

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `limit` - Number of entries to return (max 200, default 50)

**Example:** `GET /servers/65e345/audit-logs?limit=100`

**Response (200 OK):**
```json
{
  "logs": [
    {
      "_id": "65t890...",
      "serverId": "65e345...",
      "actionType": "ROLE_CREATE",
      "actorId": "65a123...",
      "targetId": "65m789...",
      "extra": { "name": "Moderator" },
      "createdAt": "2024-01-15T12:30:00.000Z"
    },
    {
      "_id": "65u123...",
      "serverId": "65e345...",
      "actionType": "CHANNEL_CREATE",
      "actorId": "65a123...",
      "targetId": "65o345...",
      "extra": { "name": "announcements", "type": "announcement" },
      "createdAt": "2024-01-15T13:00:00.000Z"
    }
  ]
}
```

**Response (403 Forbidden):**
```json
{
  "error": "Missing permission: VIEW_AUDIT_LOG"
}
```

---

### AI Chat

User-specific AI chat sessions with persistent history using Hugging Face's Meta-Llama-3-8B-Instruct model.

#### POST /ai/chats
Create a new AI chat session.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "title": "My AI Chat"
}
```

**Fields:**
- `title` - Chat title (optional, defaults to "New Chat")

**Response (201 Created):**
```json
{
  "chat": {
    "_id": "65v456...",
    "userId": "65a123...",
    "title": "My AI Chat",
    "messages": [],
    "createdAt": "2024-01-15T15:00:00.000Z",
    "updatedAt": "2024-01-15T15:00:00.000Z"
  }
}
```

---

#### GET /ai/chats
Get all AI chat sessions for the authenticated user.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "chats": [
    {
      "_id": "65v456...",
      "title": "My AI Chat",
      "createdAt": "2024-01-15T15:00:00.000Z",
      "updatedAt": "2024-01-15T15:30:00.000Z"
    }
  ]
}
```

---

#### GET /ai/chats/:chatId
Get a specific chat session with full message history.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "chat": {
    "_id": "65v456...",
    "userId": "65a123...",
    "title": "My AI Chat",
    "messages": [
      {
        "role": "user",
        "content": "Hello, how are you?",
        "createdAt": "2024-01-15T15:00:00.000Z"
      },
      {
        "role": "assistant",
        "content": "I'm doing well, thank you! How can I help you today?",
        "createdAt": "2024-01-15T15:00:05.000Z"
      }
    ],
    "createdAt": "2024-01-15T15:00:00.000Z",
    "updatedAt": "2024-01-15T15:30:00.000Z"
  }
}
```

**Response (404 Not Found):**
```json
{
  "error": "Chat not found"
}
```

---

#### DELETE /ai/chats/:chatId
Delete an AI chat session.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "ok": true
}
```

**Response (404 Not Found):**
```json
{
  "error": "Chat not found"
}
```

---

#### POST /ai/chats/:chatId/messages
Send a message to the AI and get a response. The AI receives the last 20 messages for context. Optional realtime data can be included.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "message": "What's the weather like?",
  "data": {
    "location": "Copenhagen",
    "temperature": 18,
    "humidity": 65,
    "windSpeed": 12
  }
}
```

**Fields:**
- `message` - User message text (required)
- `data` - JSON object with realtime data for the AI to see (optional)

**How data is formatted:**
When `data` is provided, it's appended to your message in a JSON code block format:
```
Your message here

[Realtime Data]:
```json
{"key": "value", ...}
```
```

**Response (200 OK):**
```json
{
  "reply": "I can see it's currently 18°C in Copenhagen with 65% humidity and 12 km/h winds. That's pleasant weather!",
  "messageCount": 4
}
```

**Response (400 Bad Request):**
```json
{
  "error": "message is required"
}
```

**Response (500 Internal Server Error):**
```json
{
  "error": "AI error"
}
```

---

#### GET /ai/chats/:chatId/export
Export a chat session to JSON format.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "chatId": "65v456...",
  "title": "My AI Chat",
  "createdAt": "2024-01-15T15:00:00.000Z",
  "updatedAt": "2024-01-15T15:30:00.000Z",
  "messages": [
    {
      "role": "user",
      "content": "Hello!",
      "createdAt": "2024-01-15T15:00:00.000Z"
    },
    {
      "role": "assistant",
      "content": "Hello! How can I assist you?",
      "createdAt": "2024-01-15T15:00:05.000Z"
    }
  ]
}
```

---

#### POST /ai/chats/import
Import a chat session from JSON.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "title": "Imported Chat",
  "messages": [
    {
      "role": "user",
      "content": "Hello!",
      "createdAt": "2024-01-15T10:00:00.000Z"
    },
    {
      "role": "assistant",
      "content": "Hi there!",
      "createdAt": "2024-01-15T10:00:05.000Z"
    }
  ]
}
```

**Fields:**
- `title` - Chat title (optional)
- `messages` - Array of message objects (required)
  - `role` - `"user"` or `"assistant"`
  - `content` - Message text
  - `createdAt` - Timestamp (optional)

**Response (201 Created):**
```json
{
  "chat": {
    "_id": "65w789...",
    "userId": "65a123...",
    "title": "Imported Chat",
    "messages": [...],
    "createdAt": "2024-01-15T16:00:00.000Z",
    "updatedAt": "2024-01-15T16:00:00.000Z"
  }
}
```

**Response (400 Bad Request):**
```json
{
  "error": "messages array required"
}
```

---

## Permission System

Available permissions:

| Permission | Description |
|------------|-------------|
| `MANAGE_GUILD` | Server management |
| `MANAGE_ROLES` | Role CRUD operations |
| `MANAGE_CHANNELS` | Channel/category management |
| `MANAGE_MESSAGES` | Edit/delete/pin messages |
| `MANAGE_EMOJIS` | Custom emoji management |
| `KICK_MEMBERS` | Kick members |
| `BAN_MEMBERS` | Ban members |
| `ADMINISTRATOR` | Full access to everything |
| `VIEW_AUDIT_LOG` | View server audit logs |
| `VIEW_CHANNEL` | View channel |
| `SEND_MESSAGES` | Send messages |
| `READ_MESSAGE_HISTORY` | Read message history |
| `CONNECT_VOICE` | Connect to voice channels |
| `EMBED_LINKS` | Embed links in messages |

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message here"
}
```

Common HTTP status codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request (invalid input)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (duplicate, already exists)
- `410` - Gone (expired resource)
- `429` - Too Many Requests (rate limited)
- `500` - Server Error

---

## Rate Limiting

Default rate limit: **300 requests per minute** per IP.

## Getting Started

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables** in a `.env` file

3. **Start the server:**
   ```bash
   node index.js
   ```

4. **Access the API** at `http://localhost:3000`

---

## License

MIT
