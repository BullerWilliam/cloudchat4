# API Documentation

## Authentication

This API uses JWT (JSON Web Tokens) for authentication.

### What is JWT_SECRET?

JWT_SECRET is a private secret key used by the server to sign and verify authentication tokens.

When a user logs in or registers, the server creates a token using this secret. Every protected request must include this token.

Example header:

Authorization: Bearer YOUR_TOKEN

---

## Base Features

- User accounts
- Friend system
- Direct messages
- Notifications
- Real-time events (Socket.IO)

---

## Auth Endpoints

### Register
POST /auth/register

Body:
{
  "username": "user",
  "email": "mail",
  "password": "pass"
}

Response:
{
  "token": "..."
}

---

### Login
POST /auth/login

Body:
{
  "identifier": "username_or_email",
  "password": "pass"
}

Response:
{
  "token": "..."
}

---

## User

### Get Current User
GET /me

---

## Friends

### Send Friend Request
POST /friends/request

Body:
{
  "to": "userId"
}

---

### Respond to Request
POST /friends/respond

Body:
{
  "id": "requestId",
  "accept": true
}

---

## Messages

### Send Message
POST /messages

Body:
{
  "to": "userId",
  "content": "hello"
}

---

### Get Messages
GET /messages/:id

---

## Notes

- All protected routes require JWT
- IDs are MongoDB ObjectIds
- This API uses only REST (GET, POST, PATCH, DELETE)
- No WebSocket or real-time connections are used

- All protected routes require JWT
- IDs are MongoDB ObjectIds
- Real-time uses Socket.IO
