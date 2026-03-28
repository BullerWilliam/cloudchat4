# API Documentation

## Authentication

This API uses JWT (JSON Web Tokens) for authentication.

### What is JWT_SECRET?

JWT_SECRET is a private secret key used by the server to sign and verify authentication tokens.

---

## Authentication Usage

All protected endpoints require this header:

Authorization: Bearer YOUR_TOKEN

---

## Auth Endpoints

### Register
POST /auth/register

Body:
```json
{
  "username": "user",
  "email": "mail",
  "password": "pass"
}
```

Response:
```json
{
  "token": "jwt_token_here"
}
```

---

### Login
POST /auth/login

Body:
```json
{
  "identifier": "username_or_email",
  "password": "pass"
}
```

Response:
```json
{
  "token": "jwt_token_here"
}
```

---

## User

### Get Current User
GET /me

Headers:
Authorization: Bearer YOUR_TOKEN

Response:
```json
{
  "_id": "userId",
  "username": "user",
  "displayName": "user",
  "email": "mail",
  "imageUrl": null,
  "friends": []
}
```

---

## Friends

### Send Friend Request
POST /friends/request

Headers:
Authorization: Bearer YOUR_TOKEN

Body:
```json
{
  "to": "userId"
}
```

Response:
```json
{
  "_id": "requestId",
  "from": "yourId",
  "to": "userId",
  "status": "pending"
}
```

---

### Respond to Request
POST /friends/respond

Headers:
Authorization: Bearer YOUR_TOKEN

Body:
```json
{
  "id": "requestId",
  "accept": true
}
```

Response:
```json
{
  "_id": "requestId",
  "status": "accepted"
}
```

---

## Messages

### Send Message
POST /messages

Headers:
Authorization: Bearer YOUR_TOKEN

Body:
```json
{
  "to": "userId",
  "content": "hello"
}
```

Response:
```json
{
  "_id": "messageId",
  "from": "yourId",
  "to": "userId",
  "content": "hello",
  "createdAt": "timestamp"
}
```

---

### Get Messages
GET /messages/:id

Headers:
Authorization: Bearer YOUR_TOKEN

Response:
```json
[
  {
    "_id": "messageId",
    "from": "userId",
    "to": "yourId",
    "content": "hello",
    "createdAt": "timestamp"
  }
]
```

---

## Admin

### Clear Database
POST /clear-db

Body:
```json
{
  "key": "admin-auth"
}

## Notes

- All protected routes require JWT
- IDs are MongoDB ObjectIds
- This API uses only REST (GET, POST, PATCH, DELETE)
- No WebSocket or real-time connections are used
