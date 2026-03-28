# HF Chat API

## Base URL

```id="moh3l5"
http://localhost:8000
```

---

## Overview

This API allows you to create and manage AI-powered chat sessions using Hugging Face.

Each chat stores its own message history and can be interacted with independently.

---

## Endpoints

---

### Create Chat

**Method:** POST
**URL:** `http://localhost:8000/chat/create`

**Description**
Creates a new chat session.

**Body**

```json id="3se9ti"
{}
```

**Response**

```json id="gq3t4b"
{
  "chatId": "uuid"
}
```

---

### Delete Chat

**Method:** POST
**URL:** `http://localhost:8000/chat/(id)/delete`

**Description**
Deletes an existing chat session.

**Body**

```json id="delbody01"
{}
```

**Response**

```json id="d8fgi5"
{
  "success": true
}
```

---

### Get Chat Messages

**Method:** GET
**URL:** `http://localhost:8000/chat/(id)`

**Description**
Returns all messages in a chat.

**Response**

```json id="3y7gtp"
{
  "messages": [
    { "role": "user", "content": "Hello" },
    { "role": "assistant", "content": "Hi!" }
  ]
}
```

---

### Send Message

**Method:** POST
**URL:** `http://localhost:8000/chat/(id)/message`

**Description**
Sends a message to the chat and gets an AI response.

**Body**

```json id="4jkoob"
{
  "message": "Hello AI"
}
```

**Response**

```json id="bp5ini"
{
  "reply": "Hello! How can I help you?"
}
```

---

### List Chats

**Method:** GET
**URL:** `http://localhost:8000/chats`

**Description**
Returns all active chat IDs.

**Response**

```json id="iji19h"
{
  "chats": ["id1", "id2", "id3"]
}
```

---

### Export Chat

**Method:** GET
**URL:** `http://localhost:8000/chat/(id)/export`

**Description**
Exports a chat’s full data.

**Response**

```json id="uh6bwq"
{
  "id": "chat-id",
  "messages": [
    { "role": "user", "content": "Hello" },
    { "role": "assistant", "content": "Hi!" }
  ]
}
```

---

### Import Chat

**Method:** POST
**URL:** `http://localhost:8000/chat/import`

**Description**
Imports a chat from data.

**Body**

```json id="q18kg2"
{
  "id": "optional-id",
  "messages": [
    { "role": "user", "content": "Hello" },
    { "role": "assistant", "content": "Hi!" }
  ]
}
```

**Response**

```json id="awkw74"
{
  "chatId": "new-or-provided-id"
}
```

---

## Notes

* All chats are stored in memory
* Data resets when the server restarts
* Requires a valid Hugging Face API token
* Runs on port 8000 locally
* Designed for use with Railway or other Node.js hosting

---

## Example Flow

1. Create a chat
2. Send messages
3. Retrieve or export chat
4. Delete when done
