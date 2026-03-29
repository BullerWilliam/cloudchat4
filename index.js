// ──────────────────────────────────────────────────────────────────────────────
//  index.js – Discord‑style backend (original code + massive feature add‑on)
// ──────────────────────────────────────────────────────────────────────────────
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import crypto from 'crypto'
import http from 'http'
import https from 'https'
import { v4 as uuidv4 } from 'uuid'
import InferenceClient from '@huggingface/inference'

const app = express()
const PORT = process.env.PORT || 3000
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret'
const MONGODB_URL =
  process.env.MONGODB_URL ||
  `mongodb+srv://mongo:${encodeURIComponent(
    process.env.MONGODB_PASSWORD || ''
  )}@cloudchat4.aoxoo9t.mongodb.net/?appName=cloudchat4`
const ADMIN_AUTH = process.env.ADMIN_AUTH || 'admin-auth'

// ──────────────────────────────────────────────────────────────────────────────
//  Global middlewares
// ──────────────────────────────────────────────────────────────────────────────
app.use(helmet())
app.use(cors({ origin: '*', credentials: true }))
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 300,
  })
)

// ──────────────────────────────────────────────────────────────────────────────
//  Mongoose & Schemas
// ──────────────────────────────────────────────────────────────────────────────
mongoose.set('strictQuery', true)

// ---------- USER ----------
const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  displayName: { type: String, default: '' },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  emailVerified: { type: Boolean, default: false }, // ← new
  passwordHash: { type: String, required: true },
  imageUrl: { type: String, default: '' },
  bio: { type: String, default: '' },
  status: {
    // online / idle / dnd / offline
    type: String,
    enum: ['online', 'idle', 'dnd', 'offline'],
    default: 'offline',
  },
  activity: {
    // { name: 'Playing Apex', type: 'PLAYING' }
    type: Object,
    default: null,
  },
  notificationSettings: {
    // per‑user toggle: friend_requests, server_mentions, dm_messages …
    type: Map,
    of: Boolean,
    default: {},
  },
  createdAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
})

// ---------- FRIEND REQUEST ----------
const friendRequestSchema = new mongoose.Schema({
  fromUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  toUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined'],
    default: 'pending',
  },
  createdAt: { type: Date, default: Date.now },
  respondedAt: { type: Date, default: null },
})
friendRequestSchema.index({ fromUserId: 1, toUserId: 1 }, { unique: true })

// ---------- SERVER ----------
const serverSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  iconUrl: { type: String, default: '' },
  bannerUrl: { type: String, default: '' }, // new
  splashUrl: { type: String, default: '' }, // new
  description: { type: String, default: '' },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  rulesText: { type: String, default: '' },

  // ── NEW SETTINGS ────────────────────────────────────────────────────────
  verificationLevel: {
    // none / low / medium / high
    type: String,
    enum: ['none', 'low', 'medium', 'high'],
    default: 'none',
  },
  explicitContentFilter: {
    // disabled / members_without_roles / all_members
    type: String,
    enum: ['disabled', 'members_without_roles', 'all_members'],
    default: 'disabled',
  },
  defaultMessageNotifications: {
    // ALL / ONLY_MENTIONS
    type: String,
    enum: ['ALL', 'ONLY_MENTIONS'],
    default: 'ALL',
  },
  afkChannelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', default: null },
  systemChannelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', default: null },
  // ────────────────────────────────────────────────────────────────────────

  inviteCode: { type: String, unique: true, index: true },
  createdAt: { type: Date, default: Date.now },
})

// ---------- SERVER MEMBER ----------
const serverMemberSchema = new mongoose.Schema({
  serverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Server',
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  roleIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Role' }],
  nick: { type: String, default: '' },
  joinedAt: { type: Date, default: Date.now },
  muted: { type: Boolean, default: false },
  deafened: { type: Boolean, default: false },
})
serverMemberSchema.index({ serverId: 1, userId: 1 }, { unique: true })

// ---------- ROLE ----------
const roleSchema = new mongoose.Schema({
  serverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Server',
    required: true,
  },
  name: { type: String, required: true },
  color: { type: String, default: '#99aab5' },
  permissions: [{ type: String }], // e.g. 'MANAGE_ROLES', 'MANAGE_CHANNELS', …
  position: { type: Number, default: 0 },
  hoist: { type: Boolean, default: false },
  mentionable: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
})

// ---------- CATEGORY ----------
const categorySchema = new mongoose.Schema({
  serverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Server',
    required: true,
  },
  name: { type: String, required: true },
  position: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
})

// ---------- CHANNEL ----------
const channelSchema = new mongoose.Schema({
  serverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Server',
    required: true,
  },
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null,
  },
  name: { type: String, required: true },
  type: {
    type: String,
    enum: ['text', 'voice', 'announcement', 'forum'],
    default: 'text',
  },
  topic: { type: String, default: '' },
  position: { type: Number, default: 0 },

  // Permission overwrites – array of sub‑documents
  permissionOverwrites: [
    {
      targetId: {
        // roleId OR userId
        type: mongoose.Schema.Types.ObjectId,
        required: true,
      },
      type: { type: String, enum: ['role', 'member'], required: true },
      allow: [{ type: String }], // list of permission strings
      deny: [{ type: String }],
    },
  ],

  allowedRoleIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Role' }],
  deniedRoleIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Role' }],
  createdAt: { type: Date, default: Date.now },
})

// ---------- SERVER INVITE ----------
const serverInviteSchema = new mongoose.Schema({
  serverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Server',
    required: true,
  },
  inviterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  inviteeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  code: { type: String, unique: true, index: true },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'cancelled'],
    default: 'pending',
  },
  maxUses: { type: Number, default: 0 }, // 0 = unlimited
  uses: { type: Number, default: 0 },
  temporary: { type: Boolean, default: false }, // true → member gets kicked when they leave voice
  expiresAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  respondedAt: { type: Date, default: null },
})

// ---------- GROUP ----------
const groupSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  name: { type: String, required: true },
  imageUrl: { type: String, default: '' },
  memberIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now },
})
groupSchema.pre('save', function (next) {
  if (!this.memberIds.some((id) => id.toString() === this.ownerId.toString()))
    this.memberIds.unshift(this.ownerId)
  next()
})

// ---------- DM THREAD ----------
const dmThreadSchema = new mongoose.Schema({
  key: { type: String, unique: true, index: true },
  memberIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now },
  lastMessageAt: { type: Date, default: Date.now },
})

// ---------- MESSAGE ----------
const messageSchema = new mongoose.Schema({
  kind: {
    type: String,
    enum: ['dm', 'server', 'group'],
    required: true,
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  threadId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DmThread',
    default: null,
  },
  serverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Server', default: null },
  channelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', default: null },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  content: { type: String, required: true, trim: true },
  attachments: [{ type: String }],
  // ── EDIT HISTORY ────────────────────────────────────────────────────────
  editHistory: [
    {
      editedAt: { type: Date, default: Date.now },
      before: { type: String },
      after: { type: String },
    },
  ],
  // ────────────────────────────────────────────────────────────────────────
  createdAt: { type: Date, default: Date.now },
  editedAt: { type: Date, default: null },
  deletedAt: { type: Date, default: null },
})

// ---------- NOTIFICATION ----------
const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  type: {
    type: String,
    enum: ['friend_request', 'server_invite', 'group_added', 'message', 'system'],
    required: true,
  },
  title: { type: String, required: true },
  body: { type: String, default: '' },
  data: { type: Object, default: {} },
  readAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
})

// ---------- HEALTH PING ----------
const healthPingSchema = new mongoose.Schema({
  source: { type: String, default: 'external' },
  payload: { type: Object, default: {} },
  createdAt: { type: Date, default: Date.now },
})

// ---------- EMAIL VERIFICATION (for account verification) ----------
const emailVerificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  code: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
})

// ---------- PASSWORD RESET ----------
const passwordResetSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  code: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
})

// ---------- BLOCK ----------
const blockSchema = new mongoose.Schema({
  blockerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  blockedId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  createdAt: { type: Date, default: Date.now },
})
blockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true })

// ---------- EMOJI ----------
const emojiSchema = new mongoose.Schema({
  serverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Server',
    required: true,
  },
  name: { type: String, required: true },
  imageUrl: { type: String, required: true },
  roleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role',
    default: null,
  }, // optional role restriction
  createdAt: { type: Date, default: Date.now },
})
emojiSchema.index({ serverId: 1, name: 1 }, { unique: true })

// ---------- AUDIT LOG ----------
const auditLogSchema = new mongoose.Schema({
  serverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Server',
    required: true,
  },
  actionType: { type: String, required: true }, // e.g. 'ROLE_CREATE', 'CHANNEL_DELETE', …
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  targetId: { type: mongoose.Schema.Types.ObjectId, default: null }, // could be roleId, channelId …
  extra: { type: Object, default: {} },
  createdAt: { type: Date, default: Date.now },
})

// ---------- AI CHAT SESSION ----------
const aiChatSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  title: { type: String, default: 'New Chat' },
  messages: [
    {
      role: { type: String, enum: ['user', 'assistant'], required: true },
      content: { type: String, required: true },
      createdAt: { type: Date, default: Date.now },
    },
  ],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

// ==================== Model registration =====================
const User = mongoose.model('User', userSchema)
const FriendRequest = mongoose.model('FriendRequest', friendRequestSchema)
const Server = mongoose.model('Server', serverSchema)
const ServerMember = mongoose.model('ServerMember', serverMemberSchema)
const Role = mongoose.model('Role', roleSchema)
const Category = mongoose.model('Category', categorySchema)
const Channel = mongoose.model('Channel', channelSchema)
const ServerInvite = mongoose.model('ServerInvite', serverInviteSchema)
const Group = mongoose.model('Group', groupSchema)
const DmThread = mongoose.model('DmThread', dmThreadSchema)
const Message = mongoose.model('Message', messageSchema)
const Notification = mongoose.model('Notification', notificationSchema)
const HealthPing = mongoose.model('HealthPing', healthPingSchema)
const EmailVerification = mongoose.model('EmailVerification', emailVerificationSchema)
const PasswordReset = mongoose.model('PasswordReset', passwordResetSchema)
const Block = mongoose.model('Block', blockSchema)
const Emoji = mongoose.model('Emoji', emojiSchema)
const AuditLog = mongoose.model('AuditLog', auditLogSchema)
const AiChat = mongoose.model('AiChat', aiChatSchema)

// ── AI Chat config ─────────────────────────────────────────────────────────
const HF_TOKEN = process.env.HF_TOKEN || ''
const hf = new InferenceClient(HF_TOKEN)

// ──────────────────────────────────────────────────────────────────────────────
//  Helper Functions (utility, middleware, permission checks)
// ──────────────────────────────────────────────────────────────────────────────
function sanitizeUser(user) {
  if (!user) return null
  return {
    id: user._id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    emailVerified: user.emailVerified,
    imageUrl: user.imageUrl,
    bio: user.bio,
    status: user.status,
    activity: user.activity,
    createdAt: user.createdAt,
    lastSeenAt: user.lastSeenAt,
  }
}

function signToken(user) {
  return jwt.sign({ id: user._id.toString() }, JWT_SECRET, { expiresIn: '30d' })
}
function normalizeText(value) {
  return String(value || '').trim()
}
function makeInviteCode() {
  return crypto.randomBytes(8).toString('hex')
}
function getDmKey(a, b) {
  return [a.toString(), b.toString()].sort().join(':')
}
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}
function generateNumericCode(length = 6) {
  const min = Math.pow(10, length - 1)
  const max = Math.pow(10, length) - 1
  return String(Math.floor(Math.random() * (max - min + 1)) + min)
}
// Placeholder – in a real app you’d plug in nodemailer or another SMTP service.
async function sendEmail(to, subject, text) {
  console.log(`[EMAIL] To: ${to} | Subject: ${subject} | Text: ${text}`)
}

// ── Auth middlewares ───────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Missing token' })
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.userId = payload.id
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }
}
async function loadUser(req, res, next) {
  const user = await User.findById(req.userId)
  if (!user) return res.status(401).json({ error: 'Invalid token' })
  req.user = user
  next()
}

// ── Verification middlewares ──────────────────────────────────────────────────
function requireEmailVerified(req, res, next) {
  if (!req.user.emailVerified)
    return res
      .status(403)
      .json({ error: 'You must verify your email to use this endpoint' })
  next()
}

// ── Server / Permission utils ───────────────────────────────────────────────
async function getUserRoles(userId, serverId) {
  const member = await ServerMember.findOne({ serverId, userId })
  return member ? member.roleIds : []
}
async function getAggregatedPermissions(userId, serverId) {
  const roleIds = await getUserRoles(userId, serverId)
  const roles = await Role.find({ _id: { $in: roleIds } })
  const perms = new Set()
  for (const r of roles) perms.add(...r.permissions)
  // Owner = all permissions
  const server = await Server.findById(serverId)
  if (server && server.ownerId.toString() === userId.toString()) {
    // Discord‑like full set – you can adjust to your needs.
    const ALL_PERMS = [
      'MANAGE_GUILD',
      'MANAGE_ROLES',
      'MANAGE_CHANNELS',
      'MANAGE_MESSAGES',
      'KICK_MEMBERS',
      'BAN_MEMBERS',
      'ADMINISTRATOR',
      'VIEW_AUDIT_LOG',
    ]
    ALL_PERMS.forEach((p) => perms.add(p))
  }
  return perms
}
function requirePermission(permission) {
  // permission = string such as 'MANAGE_ROLES' etc.
  return asyncHandler(async (req, res, next) => {
    const serverId = req.params.serverId || req.body.serverId
    if (!serverId) return res.status(400).json({ error: 'serverId missing' })
    const perms = await getAggregatedPermissions(req.user._id, serverId)
    if (!perms.has(permission) && !perms.has('ADMINISTRATOR'))
      return res
        .status(403)
        .json({ error: `Missing required permission: ${permission}` })
    next()
  })
}

// ── Audit‑log helper ───────────────────────────────────────────────────────
async function createAuditLog(serverId, actionType, actorId, targetId = null, extra = {}) {
  return AuditLog.create({
    serverId,
    actionType,
    actorId,
    targetId,
    extra,
  })
}

// ── Friend / DM helpers ─────────────────────────────────────────────────────
async function createNotification(userId, type, title, body, data = {}) {
  return Notification.create({ userId, type, title, body, data })
}
async function isFriends(userA, userB) {
  const existing = await FriendRequest.findOne({
    $or: [
      { fromUserId: userA, toUserId: userB, status: 'accepted' },
      { fromUserId: userB, toUserId: userA, status: 'accepted' },
    ],
  })
  return !!existing
}
async function areInSameServer(userA, userB) {
  const aServers = await ServerMember.find({ userId: userA }).select('serverId')
  const b = await ServerMember.findOne({
    userId: userB,
    serverId: { $in: aServers.map((x) => x.serverId) },
  })
  return !!b
}
async function canDM(userA, userB) {
  return (await isFriends(userA, userB)) || (await areInSameServer(userA, userB))
}

// ── Server membership guards ─────────────────────────────────────────────────
async function requireServerMember(req, res, next) {
  const serverId = req.params.serverId || req.body.serverId || req.query.serverId
  const member = await ServerMember.findOne({
    serverId,
    userId: req.user._id,
  })
  if (!member) return res.status(403).json({ error: 'Not a server member' })
  req.serverMember = member
  next()
}
async function requireChannelMember(req, res, next) {
  const channel = await Channel.findById(req.params.channelId)
  if (!channel) return res.status(404).json({ error: 'Channel not found' })
  const member = await ServerMember.findOne({
    serverId: channel.serverId,
    userId: req.user._id,
  })
  if (!member) return res.status(403).json({ error: 'Not a member of this server' })
  req.channel = channel
  next()
}

// ──────────────────────────────────────────────────────────────────────────────
//  Existing Routes (unchanged – copied from your original file)
// ──────────────────────────────────────────────────────────────────────────────
app.get(
  '/health',
  asyncHandler(async (req, res) => {
    const ping = await HealthPing.create({
      source: 'request',
      payload: {
        ip:
          req.headers['x-forwarded-for'] ||
          req.socket.remoteAddress ||
          '',
        query: req.query,
        time: new Date().toISOString(),
      },
    })
    res.json({
      status: 'ok',
      time: new Date().toISOString(),
      pingId: ping._id,
      random: Math.random(),
    })
  })
)

app.post(
  '/health',
  asyncHandler(async (req, res) => {
    const ping = await HealthPing.create({
      source: 'request',
      payload: req.body || {},
    })
    res.json({
      status: 'ok',
      stored: true,
      pingId: ping._id,
      received: req.body || {},
    })
  })
)

// ── AUTH ───────────────────────────────────────────────────────────────────
app.post(
  '/auth/register',
  asyncHandler(async (req, res) => {
    const username = normalizeText(req.body.username).toLowerCase()
    const email = normalizeText(req.body.email).toLowerCase()
    const password = normalizeText(req.body.password)
    const displayName = normalizeText(req.body.displayName)
    const imageUrl = normalizeText(req.body.imageUrl)

    if (!username || !email || !password)
      return res
        .status(400)
        .json({ error: 'username, email and password are required' })
    if (password.length < 6)
      return res
        .status(400)
        .json({ error: 'password must be at least 6 characters' })

    const existing = await User.findOne({
      $or: [{ username }, { email }],
    })
    if (existing)
      return res
        .status(409)
        .json({ error: 'username or email already exists' })

    const passwordHash = await bcrypt.hash(password, 12)
    const user = await User.create({
      username,
      displayName: displayName || username,
      email,
      passwordHash,
      imageUrl,
    })

    // send verification email (placeholder)
    const code = generateNumericCode(6)
    await EmailVerification.create({
      userId: user._id,
      code,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
    })
    await sendEmail(
      user.email,
      'Verify your account',
      `Your verification code is: ${code}`
    )

    res
      .status(201)
      .json({ token: signToken(user), user: sanitizeUser(user) })
  })
)

app.post(
  '/auth/login',
  asyncHandler(async (req, res) => {
    const identifier = normalizeText(req.body.identifier).toLowerCase()
    const password = normalizeText(req.body.password)

    if (!identifier || !password)
      return res
        .status(400)
        .json({ error: 'identifier and password are required' })

    const user = await User.findOne({
      $or: [{ username: identifier }, { email: identifier }],
    })
    if (!user) return res.status(401).json({ error: 'Invalid credentials' })

    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' })

    user.lastSeenAt = new Date()
    await user.save()

    // if the user hasn't verified email yet we still allow login,
    // but many privileged endpoints check `requireEmailVerified`.
    res.json({ token: signToken(user), user: sanitizeUser(user) })
  })
)

app.get(
  '/auth/me',
  requireAuth,
  loadUser,
  asyncHandler(async (req, res) => {
    res.json({ user: sanitizeUser(req.user) })
  })
)

app.patch(
  '/auth/me',
  requireAuth,
  loadUser,
  asyncHandler(async (req, res) => {
    const updates = {}
    const allowed = [
      'username',
      'displayName',
      'email',
      'imageUrl',
      'bio',
    ]
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = normalizeText(req.body[key])
    }

    if (updates.username) updates.username = updates.username.toLowerCase()
    if (updates.email) updates.email = updates.email.toLowerCase()

    if (updates.username || updates.email) {
      const conflict = await User.findOne({
        _id: { $ne: req.user._id },
        $or: [
          updates.username ? { username: updates.username } : null,
          updates.email ? { email: updates.email } : null,
        ].filter(Boolean),
      })
      if (conflict)
        return res.status(409).json({ error: 'username or email already exists' })
    }

    Object.assign(req.user, updates)
    await req.user.save()
    res.json({ user: sanitizeUser(req.user) })
  })
)

/* ---------- EMAIL VERIFICATION ENDPOINTS ---------- */
app.post(
  '/auth/verify/email/request',
  requireAuth,
  loadUser,
  asyncHandler(async (req, res) => {
    // throttle: only 1 request per 2 minutes per user
    const last = await EmailVerification.findOne({ userId: req.user._id })
    if (last && last.createdAt > new Date(Date.now() - 2 * 60 * 1000))
      return res
        .status(429)
        .json({ error: 'You can request a new code only every 2 minutes' })

    const code = generateNumericCode(6)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 min

    await EmailVerification.findOneAndUpdate(
      { userId: req.user._id },
      { code, expiresAt, createdAt: new Date() },
      { upsert: true }
    )

    await sendEmail(
      req.user.email,
      'Your verification code',
      `Your verification code is ${code}. It expires in 15 minutes.`
    )
    res.json({ ok: true })
  })
)

app.post(
  '/auth/verify/email/confirm',
  requireAuth,
  loadUser,
  asyncHandler(async (req, res) => {
    const code = normalizeText(req.body.code)
    if (!code) return res.status(400).json({ error: 'code required' })

    const verification = await EmailVerification.findOne({ userId: req.user._id })
    if (!verification)
      return res.status(404).json({ error: 'Verification not requested' })

    if (verification.expiresAt < new Date())
      return res.status(410).json({ error: 'Verification code expired' })

    if (verification.code !== code)
      return res.status(400).json({ error: 'Invalid verification code' })

    req.user.emailVerified = true
    await req.user.save()
    await EmailVerification.deleteOne({ _id: verification._id })
    res.json({ ok: true })
  })
)

/* ---------- PASSWORD RESET ENDPOINTS ---------- */
app.post(
  '/auth/forgot-password',
  asyncHandler(async (req, res) => {
    const email = normalizeText(req.body.email).toLowerCase()
    if (!email) return res.status(400).json({ error: 'email required' })

    const user = await User.findOne({ email })
    if (!user)
      // Do not reveal if the email exists – exploit mitigation
      return res.json({ ok: true })

    const code = generateNumericCode(6)
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000) // 30 min

    await PasswordReset.findOneAndUpdate(
      { userId: user._id },
      { code, expiresAt, createdAt: new Date() },
      { upsert: true }
    )
    await sendEmail(
      user.email,
      'Password Reset',
      `Your password reset code is ${code}. It expires in 30 minutes.`
    )
    res.json({ ok: true })
  })
)

app.post(
  '/auth/reset-password',
  asyncHandler(async (req, res) => {
    const email = normalizeText(req.body.email).toLowerCase()
    const code = normalizeText(req.body.code)
    const newPassword = normalizeText(req.body.newPassword)

    if (!email || !code || !newPassword)
      return res
        .status(400)
        .json({ error: 'email, code and newPassword required' })
    if (newPassword.length < 6)
      return res
        .status(400)
        .json({ error: 'newPassword must be at least 6 characters' })

    const user = await User.findOne({ email })
    if (!user) return res.status(400).json({ error: 'Invalid request' })

    const reset = await PasswordReset.findOne({ userId: user._id })
    if (!reset) return res.status(404).json({ error: 'Reset not requested' })
    if (reset.expiresAt < new Date())
      return res.status(410).json({ error: 'Reset code expired' })
    if (reset.code !== code)
      return res.status(400).json({ error: 'Invalid reset code' })

    user.passwordHash = await bcrypt.hash(newPassword, 12)
    await user.save()
    await PasswordReset.deleteOne({ _id: reset._id })
    res.json({ ok: true })
  })
)

/* ---------- USER LOOKUP / SEARCH ---------- */
app.get(
  '/users/search',
  requireAuth,
  loadUser,
  asyncHandler(async (req, res) => {
    const q = normalizeText(req.query.q)
    if (!q) return res.json({ users: [] })
    const users = await User.find({
      $or: [
        { username: new RegExp(q, 'i') },
        { displayName: new RegExp(q, 'i') },
        { email: new RegExp(q, 'i') },
      ],
    }).limit(25)
    res.json({ users: users.map(sanitizeUser) })
  })
)

app.get(
  '/users/:userId',
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.userId)
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json({ user: sanitizeUser(user) })
  })
)

/* ---------- GET USER ID BY USERNAME ---------- */
app.post(
  '/users/getid',
  asyncHandler(async (req, res) => {
    const username = normalizeText(req.body.username).toLowerCase()
    if (!username) return res.status(400).json({ error: 'username is required' })

    const user = await User.findOne({ username })
    if (!user) return res.status(404).json({ error: 'User not found' })

    res.json({ id: user._id.toString() })
  })
)

/* ---------- FRIENDS ---------- */
app.post(
  '/friends/request',
  requireAuth,
  loadUser,
  asyncHandler(async (req, res) => {
    const targetUserId = req.body.targetUserId
    if (!targetUserId)
      return res.status(400).json({ error: 'targetUserId is required' })
    if (targetUserId.toString() === req.user._id.toString())
      return res.status(400).json({ error: 'You cannot add yourself' })

    const target = await User.findById(targetUserId)
    if (!target) return res.status(404).json({ error: 'Target user not found' })

    const alreadyFriends = await FriendRequest.findOne({
      $or: [
        {
          fromUserId: req.user._id,
          toUserId: target._id,
          status: 'accepted',
        },
        {
          fromUserId: target._id,
          toUserId: req.user._id,
          status: 'accepted',
        },
      ],
    })
    if (alreadyFriends)
      return res.status(409).json({ error: 'Already friends' })

    const existingPending = await FriendRequest.findOne({
      $or: [
        {
          fromUserId: req.user._id,
          toUserId: target._id,
          status: 'pending',
        },
        {
          fromUserId: target._id,
          toUserId: req.user._id,
          status: 'pending',
        },
      ],
    })
    if (existingPending)
      return res
        .status(409)
        .json({ error: 'Friend request already exists' })

    const request = await FriendRequest.create({
      fromUserId: req.user._id,
      toUserId: target._id,
    })
    await createNotification(
      target._id,
      'friend_request',
      'Friend request',
      `${req.user.displayName || req.user.username} sent you a friend request`,
      { friendRequestId: request._id }
    )
    res.status(201).json({ request })
  })
)

app.get(
  '/friends/requests/incoming',
  requireAuth,
  loadUser,
  asyncHandler(async (req, res) => {
    const requests = await FriendRequest.find({
      toUserId: req.user._id,
      status: 'pending',
    }).populate('fromUserId', 'username displayName imageUrl')
    res.json({ requests })
  })
)

app.get(
  '/friends/requests/outgoing',
  requireAuth,
  loadUser,
  asyncHandler(async (req, res) => {
    const requests = await FriendRequest.find({
      fromUserId: req.user._id,
      status: 'pending',
    }).populate('toUserId', 'username displayName imageUrl')
    res.json({ requests })
  })
)

app.post(
  '/friends/requests/:requestId/respond',
  requireAuth,
  loadUser,
  asyncHandler(async (req, res) => {
    const action = normalizeText(req.body.action).toLowerCase()
    const request = await FriendRequest.findById(req.params.requestId)
    if (!request) return res.status(404).json({ error: 'Request not found' })
    if (request.toUserId.toString() !== req.user._id.toString())
      return res.status(403).json({ error: 'Not allowed' })
    if (request.status !== 'pending')
      return res.status(409).json({ error: 'Request already handled' })
    if (!['accept', 'decline'].includes(action))
      return res
        .status(400)
        .json({ error: 'action must be accept or decline' })

    request.status = action === 'accept' ? 'accepted' : 'declined'
    request.respondedAt = new Date()
    await request.save()

    const otherUser = await User.findById(request.fromUserId)
    if (otherUser) {
      await createNotification(
        otherUser._id,
        'system',
        'Friend request update',
        `${req.user.displayName || req.user.username} ${
          action === 'accept' ? 'accepted' : 'declined'
        } your friend request`,
        { friendRequestId: request._id }
      )
    }

    res.json({ request })
  })
)

app.get(
  '/friends/list',
  requireAuth,
  loadUser,
  asyncHandler(async (req, res) => {
    const requests = await FriendRequest.find({
      status: 'accepted',
      $or: [{ fromUserId: req.user._id }, { toUserId: req.user._id }],
    })
      .populate('fromUserId', 'username displayName imageUrl')
      .populate('toUserId', 'username displayName imageUrl')

    const friends = requests.map((r) =>
      r.fromUserId._id.toString() === req.user._id.toString()
        ? r.toUserId
        : r.fromUserId
    )
    res.json({ friends })
  })
)

/* ---------- BLOCKING ---------- */
app.post(
  '/blocks',
  requireAuth,
  loadUser,
  asyncHandler(async (req, res) => {
    const blockedId = req.body.blockedId
    if (!blockedId)
      return res.status(400).json({ error: 'blockedId required' })
    if (blockedId.toString() === req.user._id.toString())
      return res.status(400).json({ error: "You can't block yourself" })

    const target = await User.findById(blockedId)
    if (!target) return res.status(404).json({ error: 'User not found' })

    const existing = await Block.findOne({
      blockerId: req.user._id,
      blockedId: target._id,
    })
    if (existing) return res.status(409).json({ error: 'Already blocked' })

    await Block.create({
      blockerId: req.user._id,
      blockedId: target._id,
    })
    res.json({ ok: true })
  })
)

app.get(
  '/blocks',
  requireAuth,
  loadUser,
  asyncHandler(async (req, res) => {
    const blocks = await Block.find({ blockerId: req.user._id }).populate(
      'blockedId',
      'username displayName imageUrl'
    )
    res.json({
      blocks: blocks.map((b) => ({
        id: b._id,
        user: sanitizeUser(b.blockedId),
        createdAt: b.createdAt,
      })),
    })
  })
)

app.delete(
  '/blocks/:blockedId',
  requireAuth,
  loadUser,
  asyncHandler(async (req, res) => {
    const blockedId = req.params.blockedId
    const result = await Block.deleteOne({
      blockerId: req.user._id,
      blockedId,
    })
    if (result.deletedCount === 0)
      return res.status(404).json({ error: 'Block not found' })
    res.json({ ok: true })
  })
)

/* ---------- SERVERS ---------- */
app.post(
  '/servers',
  requireAuth,
  loadUser,
  asyncHandler(async (req, res) => {
    const name = normalizeText(req.body.name)
    if (!name) return res.status(400).json({ error: 'name is required' })

    const serverDoc = await Server.create({
      name,
      iconUrl: normalizeText(req.body.iconUrl),
      description: normalizeText(req.body.description),
      ownerId: req.user._id,
      rulesText: normalizeText(req.body.rulesText),
      inviteCode: makeInviteCode(),
    })

    // @everyone role
    const everyoneRole = await Role.create({
      serverId: serverDoc._id,
      name: '@everyone',
      permissions: [
        'VIEW_CHANNEL',
        'SEND_MESSAGES',
        'READ_MESSAGE_HISTORY',
        'CONNECT_VOICE',
      ],
      position: 0,
      hoist: false,
      mentionable: false,
    })

    await ServerMember.create({
      serverId: serverDoc._id,
      userId: req.user._id,
      roleIds: [everyoneRole._id],
    })

    const generalCategory = await Category.create({
      serverId: serverDoc._id,
      name: 'General',
      position: 0,
    })
    await Channel.create({
      serverId: serverDoc._id,
      categoryId: generalCategory._id,
      name: 'general',
      type: 'text',
      position: 0,
    })
    await Channel.create({
      serverId: serverDoc._id,
      categoryId: generalCategory._id,
      name: 'voice',
      type: 'voice',
      position: 1,
    })

    await createAuditLog(
      serverDoc._id,
      'SERVER_CREATE',
      req.user._id,
      serverDoc._id,
      { name }
    )

    res.status(201).json({ server: serverDoc })
  })
)

app.get(
  '/servers',
  requireAuth,
  loadUser,
  asyncHandler(async (req, res) => {
    const memberships = await ServerMember.find({ userId: req.user._id }).populate(
      'serverId'
    )
    res.json({ servers: memberships.map((m) => m.serverId) })
  })
)

app.get(
  '/servers/:serverId',
  asyncHandler(async (req, res) => {
    const serverDoc = await Server.findById(req.params.serverId)
    if (!serverDoc) return res.status(404).json({ error: 'Server not found' })
    const members = await ServerMember.find({
      serverId: req.params.serverId,
    }).populate('userId', 'username displayName imageUrl status activity')
    const roles = await Role.find({ serverId: req.params.serverId }).sort({
      position: 1,
    })
    const categories = await Category.find({
      serverId: req.params.serverId,
    }).sort({ position: 1 })
    const channels = await Channel.find({ serverId: req.params.serverId }).sort({
      position: 1,
    })
    const emojis = await Emoji.find({ serverId: req.params.serverId })
    res.json({
      server: serverDoc,
      members,
      roles,
      categories,
      channels,
      emojis,
    })
  })
)

/* ---------- SERVER SETTINGS ----------
   Only the server owner can view and edit settings
*/
app.get(
  '/servers/:serverId/settings',
  requireAuth,
  loadUser,
  asyncHandler(async (req, res) => {
    const server = await Server.findById(req.params.serverId)
    if (!server) return res.status(404).json({ error: 'Server not found' })
    if (server.ownerId.toString() !== req.user._id.toString())
      return res.status(403).json({ error: 'Only the server owner can view settings' })
    res.json({ settings: server })
  })
)

app.patch(
  '/servers/:serverId/settings',
  requireAuth,
  loadUser,
  requireServerMember,
  requireEmailVerified,
  asyncHandler(async (req, res) => {
    const server = await Server.findById(req.params.serverId)
    if (!server) return res.status(404).json({ error: 'Server not found' })
    if (server.ownerId.toString() !== req.user._id.toString())
      return res
        .status(403)
        .json({ error: 'Only the server owner can edit settings' })

    const allowed = [
      'name',
      'iconUrl',
      'bannerUrl',
      'splashUrl',
      'description',
      'rulesText',
      'verificationLevel',
      'explicitContentFilter',
      'defaultMessageNotifications',
      'afkChannelId',
      'systemChannelId',
    ]
    for (const key of allowed) {
      if (req.body[key] !== undefined) server[key] = req.body[key]
    }
    await server.save()

    await createAuditLog(
      server._id,
      'SERVER_SETTINGS_UPDATE',
      req.user._id,
      null,
      { updatedFields: allowed.filter((k) => req.body[k] !== undefined) }
    )
    res.json({ server })
  })
)

/* ---------- SERVER INVITES ----------
   *Verified* e‑mail required for creating custom invites.
*/
app.post(
  '/servers/:serverId/invites/custom',
  requireAuth,
  loadUser,
  requireServerMember,
  requireEmailVerified,
  asyncHandler(async (req, res) => {
    const inviteeId = req.body.inviteeId || null
    const maxUses = Number(req.body.maxUses || 0) // 0 = unlimited
    const temporary = Boolean(req.body.temporary)
    const expiresInMinutes = Number(req.body.expiresInMinutes || 0) // 0 = never

    const invite = await ServerInvite.create({
      serverId: req.params.serverId,
      inviterId: req.user._id,
      inviteeId: inviteeId ? inviteeId : null,
      code: makeInviteCode(),
      maxUses,
      uses: 0,
      temporary,
      expiresAt:
        expiresInMinutes > 0
          ? new Date(Date.now() + expiresInMinutes * 60 * 1000)
          : null,
    })

    await createAuditLog(
      req.params.serverId,
      'INVITE_CREATE',
      req.user._id,
      null,
      {
        inviteId: invite._id,
        maxUses,
        temporary,
        expiresInMinutes,
      }
    )
    res.status(201).json({ invite })
  })
)

app.get(
  '/servers/:serverId/invites',
  requireAuth,
  loadUser,
  requireServerMember,
  asyncHandler(async (req, res) => {
    const invites = await ServerInvite.find({
      serverId: req.params.serverId,
    }).sort({ createdAt: -1 })
    res.json({ invites })
  })
)

app.get(
  '/servers/:serverId/invites/:inviteId',
  requireAuth,
  loadUser,
  requireServerMember,
  asyncHandler(async (req, res) => {
    const invite = await ServerInvite.findById(req.params.inviteId)
    if (!invite) return res.status(404).json({ error: 'Invite not found' })
    res.json({ invite })
  })
)

app.delete(
  '/servers/:serverId/invites/:inviteId',
  requireAuth,
  loadUser,
  requireServerMember,
  asyncHandler(async (req, res) => {
    const invite = await ServerInvite.findById(req.params.inviteId)
    if (!invite) return res.status(404).json({ error: 'Invite not found' })
    // Only the server owner, the inviter, or an admin may delete
    const server = await Server.findById(req.params.serverId)
    if (
      server.ownerId.toString() !== req.user._id.toString() &&
      invite.inviterId.toString() !== req.user._id.toString()
    )
      return res
        .status(403)
        .json({ error: 'Not allowed to delete this invite' })

    await ServerInvite.deleteOne({ _id: invite._id })
    await createAuditLog(
      req.params.serverId,
      'INVITE_DELETE',
      req.user._id,
      null,
      { inviteId: invite._id }
    )
    res.json({ ok: true })
  })
)

app.post(
  '/server-invites/:inviteId/respond',
  requireAuth,
  loadUser,
  asyncHandler(async (req, res) => {
    const action = normalizeText(req.body.action).toLowerCase()
    const invite = await ServerInvite.findById(req.params.inviteId)
    if (!invite) return res.status(404).json({ error: 'Invite not found' })
    if (invite.inviteeId && invite.inviteeId.toString() !== req.user._id.toString())
      return res.status(403).json({ error: 'Not allowed' })
    if (invite.status !== 'pending')
      return res.status(409).json({ error: 'Invite already handled' })
    if (!['accept', 'decline'].includes(action))
      return res.status(400).json({ error: 'action must be accept or decline' })

    // Update usage counters / expiration before checking
    if (invite.maxUses && invite.uses >= invite.maxUses) {
      invite.status = 'cancelled'
      await invite.save()
      return res.status(410).json({ error: 'Invite has reached its max uses' })
    }
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      invite.status = 'cancelled'
      await invite.save()
      return res.status(410).json({ error: 'Invite has expired' })
    }

    invite.status = action === 'accept' ? 'accepted' : 'declined'
    invite.respondedAt = new Date()
    invite.uses += 1
    await invite.save()

    if (action === 'accept') {
      const existing = await ServerMember.findOne({
        serverId: invite.serverId,
        userId: req.user._id,
      })
      if (!existing) {
        await ServerMember.create({
          serverId: invite.serverId,
          userId: req.user._id,
          roleIds: [],
        })
      }
      const everyoneRole = await Role.findOne({
        serverId: invite.serverId,
        name: '@everyone',
      })
      if (everyoneRole) {
        await ServerMember.updateOne(
          { serverId: invite.serverId, userId: req.user._id },
          { $addToSet: { roleIds: everyoneRole._id } }
        )
      }
    }

    await createAuditLog(
      invite.serverId,
      'INVITE_RESPOND',
      req.user._id,
      null,
      { inviteId: invite._id, action }
    )
    res.json({ invite })
  })
)

app.post(
  '/servers/:serverId/join',
  requireAuth,
  loadUser,
  asyncHandler(async (req, res) => {
    const code = normalizeText(req.body.code)
    const serverDoc = await Server.findById(req.params.serverId)
    if (!serverDoc) return res.status(404).json({ error: 'Server not found' })
    if (code && serverDoc.inviteCode !== code)
      return res.status(403).json({ error: 'Invalid invite code' })

    const existing = await ServerMember.findOne({
      serverId: serverDoc._id,
      userId: req.user._id,
    })
    if (!existing) {
      await ServerMember.create({
        serverId: serverDoc._id,
        userId: req.user._id,
        roleIds: [],
      })
      const everyoneRole = await Role.findOne({
        serverId: serverDoc._id,
        name: '@everyone',
      })
      if (everyoneRole) {
        await ServerMember.updateOne(
          { serverId: serverDoc._id, userId: req.user._id },
          { $addToSet: { roleIds: everyoneRole._id } }
        )
      }
    }

    await createAuditLog(
      serverDoc._id,
      'SERVER_JOIN',
      req.user._id,
      null,
      { method: code ? 'invite_code' : 'direct_join' }
    )

    res.json({ ok: true })
  })
)

app.post(
  '/servers/:serverId/leave',
  requireAuth,
  loadUser,
  asyncHandler(async (req, res) => {
    const serverDoc = await Server.findById(req.params.serverId)
    if (!serverDoc) return res.status(404).json({ error: 'Server not found' })
    if (serverDoc.ownerId.toString() === req.user._id.toString())
      return res
        .status(400)
        .json({ error: 'Owner cannot leave the server' })

    await ServerMember.deleteOne({
      serverId: req.params.serverId,
      userId: req.user._id,
    })

    await createAuditLog(
      serverDoc._id,
      'SERVER_LEAVE',
      req.user._id,
      null,
      {}
    )

    res.json({ ok: true })
  })
)

/* ---------- ROLES ----------
   Owner (or a user with MANAGE_ROLES) can create/update/delete.
*/
app.get(
  '/servers/:serverId/roles',
  asyncHandler(async (req, res) => {
    const roles = await Role.find({ serverId: req.params.serverId }).sort({
      position: 1,
    })
    res.json({ roles })
  })
)

app.post(
  '/servers/:serverId/roles',
  requireAuth,
  loadUser,
  requireServerMember,
  requirePermission('MANAGE_ROLES'),
  asyncHandler(async (req, res) => {
    const serverDoc = await Server.findById(req.params.serverId)
    const role = await Role.create({
      serverId: req.params.serverId,
      name: normalizeText(req.body.name),
      color: normalizeText(req.body.color) || '#99aab5',
      permissions: Array.isArray(req.body.permissions)
        ? req.body.permissions.map(String)
        : [],
      position: Number(req.body.position || 0),
      hoist: Boolean(req.body.hoist),
      mentionable: Boolean(req.body.mentionable),
    })
    await createAuditLog(
      serverDoc._id,
      'ROLE_CREATE',
      req.user._id,
      role._id,
      { name: role.name }
    )
    res.status(201).json({ role })
  })
)

app.patch(
  '/servers/:serverId/roles/:roleId',
  requireAuth,
  loadUser,
  requireServerMember,
  requirePermission('MANAGE_ROLES'),
  asyncHandler(async (req, res) => {
    const serverDoc = await Server.findById(req.params.serverId)
    const role = await Role.findOne({
      _id: req.params.roleId,
      serverId: req.params.serverId,
    })
    if (!role) return res.status(404).json({ error: 'Role not found' })

    const fields = ['name', 'color', 'position', 'hoist', 'mentionable']
    for (const field of fields) {
      if (req.body[field] !== undefined) role[field] = req.body[field]
    }
    if (Array.isArray(req.body.permissions))
      role.permissions = req.body.permissions.map(String)
    await role.save()

    await createAuditLog(
      serverDoc._id,
      'ROLE_UPDATE',
      req.user._id,
      role._id,
      { updatedFields: Object.keys(req.body) }
    )
    res.json({ role })
  })
)

app.delete(
  '/servers/:serverId/roles/:roleId',
  requireAuth,
  loadUser,
  requireServerMember,
  requirePermission('MANAGE_ROLES'),
  asyncHandler(async (req, res) => {
    const serverDoc = await Server.findById(req.params.serverId)
    await Role.deleteOne({
      _id: req.params.roleId,
      serverId: req.params.serverId,
    })
    await ServerMember.updateMany(
      { serverId: req.params.serverId },
      { $pull: { roleIds: req.params.roleId } }
    )
    await createAuditLog(
      serverDoc._id,
      'ROLE_DELETE',
      req.user._id,
      req.params.roleId,
      {}
    )
    res.json({ ok: true })
  })
)

/* ---------- CATEGORIES ----------
   Only the owner (or MANAGE_CHANNELS) can touch categories.
*/
app.post(
  '/servers/:serverId/categories',
  requireAuth,
  loadUser,
  requireServerMember,
  requirePermission('MANAGE_CHANNELS'),
  asyncHandler(async (req, res) => {
    const serverDoc = await Server.findById(req.params.serverId)
    const category = await Category.create({
      serverId: req.params.serverId,
      name: normalizeText(req.body.name),
      position: Number(req.body.position || 0),
    })
    await createAuditLog(
      serverDoc._id,
      'CATEGORY_CREATE',
      req.user._id,
      category._id,
      { name: category.name }
    )
    res.status(201).json({ category })
  })
)

app.patch(
  '/servers/:serverId/categories/:categoryId',
  requireAuth,
  loadUser,
  requireServerMember,
  requirePermission('MANAGE_CHANNELS'),
  asyncHandler(async (req, res) => {
    const serverDoc = await Server.findById(req.params.serverId)
    const category = await Category.findOne({
      _id: req.params.categoryId,
      serverId: req.params.serverId,
    })
    if (!category) return res.status(404).json({ error: 'Category not found' })
    if (req.body.name !== undefined) category.name = normalizeText(req.body.name)
    if (req.body.position !== undefined)
      category.position = Number(req.body.position)
    await category.save()
    await createAuditLog(
      serverDoc._id,
      'CATEGORY_UPDATE',
      req.user._id,
      category._id,
      { updatedFields: Object.keys(req.body) }
    )
    res.json({ category })
  })
)

app.delete(
  '/servers/:serverId/categories/:categoryId',
  requireAuth,
  loadUser,
  requireServerMember,
  requirePermission('MANAGE_CHANNELS'),
  asyncHandler(async (req, res) => {
    const serverDoc = await Server.findById(req.params.serverId)
    await Channel.updateMany(
      { serverId: req.params.serverId, categoryId: req.params.categoryId },
      { $set: { categoryId: null } }
    )
    await Category.deleteOne({
      _id: req.params.categoryId,
      serverId: req.params.serverId,
    })
    await createAuditLog(
      serverDoc._id,
      'CATEGORY_DELETE',
      req.user._id,
      req.params.categoryId,
      {}
    )
    res.json({ ok: true })
  })
)

/* ---------- CHANNELS ----------
   Creating / editing / deleting channels requires MANAGE_CHANNELS.
   Permission overwrites are stored in the channel doc.
*/
app.post(
  '/servers/:serverId/channels',
  requireAuth,
  loadUser,
  requireServerMember,
  requirePermission('MANAGE_CHANNELS'),
  asyncHandler(async (req, res) => {
    const serverDoc = await Server.findById(req.params.serverId)
    const channel = await Channel.create({
      serverId: req.params.serverId,
      categoryId: req.body.categoryId || null,
      name: normalizeText(req.body.name),
      type: req.body.type || 'text',
      topic: normalizeText(req.body.topic),
      position: Number(req.body.position || 0),
      allowedRoleIds: Array.isArray(req.body.allowedRoleIds)
        ? req.body.allowedRoleIds
        : [],
      deniedRoleIds: Array.isArray(req.body.deniedRoleIds)
        ? req.body.deniedRoleIds
        : [],
    })
    await createAuditLog(
      serverDoc._id,
      'CHANNEL_CREATE',
      req.user._id,
      channel._id,
      { name: channel.name, type: channel.type }
    )
    res.status(201).json({ channel })
  })
)

app.patch(
  '/servers/:serverId/channels/:channelId',
  requireAuth,
  loadUser,
  requireServerMember,
  requirePermission('MANAGE_CHANNELS'),
  asyncHandler(async (req, res) => {
    const serverDoc = await Server.findById(req.params.serverId)
    const channel = await Channel.findOne({
      _id: req.params.channelId,
      serverId: req.params.serverId,
    })
    if (!channel) return res.status(404).json({ error: 'Channel not found' })

    const fields = ['categoryId', 'name', 'type', 'topic', 'position']
    for (const field of fields) {
      if (req.body[field] !== undefined) channel[field] = req.body[field]
    }
    if (Array.isArray(req.body.allowedRoleIds))
      channel.allowedRoleIds = req.body.allowedRoleIds
    if (Array.isArray(req.body.deniedRoleIds))
      channel.deniedRoleIds = req.body.deniedRoleIds
    await channel.save()

    await createAuditLog(
      serverDoc._id,
      'CHANNEL_UPDATE',
      req.user._id,
      channel._id,
      { updatedFields: Object.keys(req.body) }
    )
    res.json({ channel })
  })
)

app.delete(
  '/servers/:serverId/channels/:channelId',
  requireAuth,
  loadUser,
  requireServerMember,
  requirePermission('MANAGE_CHANNELS'),
  asyncHandler(async (req, res) => {
    const serverDoc = await Server.findById(req.params.serverId)
    await Channel.deleteOne({
      _id: req.params.channelId,
      serverId: req.params.serverId,
    })
    await createAuditLog(
      serverDoc._id,
      'CHANNEL_DELETE',
      req.user._id,
      req.params.channelId,
      {}
    )
    res.json({ ok: true })
  })
)

/* ---------- CHANNEL PERMISSION OVERWRITES ----------
   These are distinct from role deny/allow lists.
*/
app.post(
  '/channels/:channelId/overwrites',
  requireAuth,
  loadUser,
  requireChannelMember,
  requirePermission('MANAGE_CHANNELS'),
  asyncHandler(async (req, res) => {
    const { targetId, type, allow, deny } = req.body // type: 'role'|'member'
    if (!targetId || !['role', 'member'].includes(type))
      return res
        .status(400)
        .json({ error: 'targetId and type (role/member) required' })
    const channel = req.channel

    // Upsert logic – remove existing overwrite for same target/type first
    channel.permissionOverwrites = channel.permissionOverwrites.filter(
      (ow) => !(ow.targetId.toString() === targetId && ow.type === type)
    )
    channel.permissionOverwrites.push({
      targetId,
      type,
      allow: Array.isArray(allow) ? allow : [],
      deny: Array.isArray(deny) ? deny : [],
    })
    await channel.save()

    await createAuditLog(
      channel.serverId,
      'CHANNEL_OVERWRITE_CREATE',
      req.user._id,
      channel._id,
      { targetId, type }
    )
    res.json({ channel })
  })
)

app.patch(
  '/channels/:channelId/overwrites/:overwriteId',
  requireAuth,
  loadUser,
  requireChannelMember,
  requirePermission('MANAGE_CHANNELS'),
  asyncHandler(async (req, res) => {
    const { allow, deny } = req.body
    const channel = req.channel
    const overwrites = channel.permissionOverwrites
    const idx = overwrites.findIndex(
      (ow) => ow._id.toString() === req.params.overwriteId
    )
    if (idx === -1)
      return res.status(404).json({ error: 'Overwrite not found' })
    if (Array.isArray(allow)) overwrites[idx].allow = allow
    if (Array.isArray(deny)) overwrites[idx].deny = deny
    await channel.save()
    await createAuditLog(
      channel.serverId,
      'CHANNEL_OVERWRITE_UPDATE',
      req.user._id,
      channel._id,
      { overwriteId: req.params.overwriteId }
    )
    res.json({ channel })
  })
)

app.delete(
  '/channels/:channelId/overwrites/:overwriteId',
  requireAuth,
  loadUser,
  requireChannelMember,
  requirePermission('MANAGE_CHANNELS'),
  asyncHandler(async (req, res) => {
    const channel = req.channel
    const originalLength = channel.permissionOverwrites.length
    channel.permissionOverwrites = channel.permissionOverwrites.filter(
      (ow) => ow._id.toString() !== req.params.overwriteId
    )
    if (channel.permissionOverwrites.length === originalLength)
      return res.status(404).json({ error: 'Overwrite not found' })
    await channel.save()
    await createAuditLog(
      channel.serverId,
      'CHANNEL_OVERWRITE_DELETE',
      req.user._id,
      channel._id,
      { overwriteId: req.params.overwriteId }
    )
    res.json({ ok: true })
  })
)

/* ---------- MESSAGES ----------
   Editing, deleting, pinning, reactions.
*/
app.post(
  '/channels/:channelId/messages',
  requireAuth,
  loadUser,
  requireChannelMember,
  asyncHandler(async (req, res) => {
    const content = normalizeText(req.body.content)
    if (!content) return res.status(400).json({ error: 'content is required' })
    const message = await Message.create({
      kind: 'server',
      senderId: req.user._id,
      serverId: req.channel.serverId,
      channelId: req.channel._id,
      content,
      attachments: Array.isArray(req.body.attachments) ? req.body.attachments : [],
    })
    await createAuditLog(
      req.channel.serverId,
      'MESSAGE_CREATE',
      req.user._id,
      message._id,
      { channelId: req.channel._id }
    )
    res.status(201).json({ message })
  })
)

app.get(
  '/channels/:channelId/messages',
  requireAuth,
  loadUser,
  requireChannelMember,
  asyncHandler(async (req, res) => {
    const messages = await Message.find({
      kind: 'server',
      channelId: req.channel._id,
    })
      .sort({ createdAt: 1 })
      .limit(500)
    res.json({ messages })
  })
)

// Edit a message – only author or a user with MANAGE_MESSAGES may edit.
app.patch(
  '/channels/:channelId/messages/:messageId',
  requireAuth,
  loadUser,
  requireChannelMember,
  asyncHandler(async (req, res) => {
    const newContent = normalizeText(req.body.content)
    if (!newContent) return res.status(400).json({ error: 'content required' })
    const message = await Message.findById(req.params.messageId)
    if (!message) return res.status(404).json({ error: 'Message not found' })
    if (message.channelId.toString() !== req.channel._id.toString())
      return res.status(400).json({ error: 'Message does not belong to this channel' })

    const isAuthor = message.senderId.toString() === req.user._id.toString()
    const perms = await getAggregatedPermissions(req.user._id, req.channel.serverId)
    if (!isAuthor && !perms.has('MANAGE_MESSAGES') && !perms.has('ADMINISTRATOR'))
      return res.status(403).json({ error: 'Not allowed to edit this message' })

    // store edit history
    message.editHistory.push({
      editedAt: new Date(),
      before: message.content,
      after: newContent,
    })
    message.content = newContent
    message.editedAt = new Date()
    await message.save()
    await createAuditLog(
      req.channel.serverId,
      'MESSAGE_EDIT',
      req.user._id,
      message._id,
      {}
    )
    res.json({ message })
  })
)

// Delete a message – same permission rules as edit.
app.delete(
  '/channels/:channelId/messages/:messageId',
  requireAuth,
  loadUser,
  requireChannelMember,
  asyncHandler(async (req, res) => {
    const message = await Message.findById(req.params.messageId)
    if (!message) return res.status(404).json({ error: 'Message not found' })
    if (message.channelId.toString() !== req.channel._id.toString())
      return res.status(400).json({ error: 'Message not in this channel' })

    const isAuthor = message.senderId.toString() === req.user._id.toString()
    const perms = await getAggregatedPermissions(req.user._id, req.channel.serverId)
    if (!isAuthor && !perms.has('MANAGE_MESSAGES') && !perms.has('ADMINISTRATOR'))
      return res.status(403).json({ error: 'Not allowed to delete this message' })

    message.deletedAt = new Date()
    await message.save()
    await createAuditLog(
      req.channel.serverId,
      'MESSAGE_DELETE',
      req.user._id,
      message._id,
      {}
    )
    res.json({ ok: true })
  })
)

// Pin / unpin a message – requires MANAGE_MESSAGES
app.post(
  '/channels/:channelId/pins/:messageId',
  requireAuth,
  loadUser,
  requireChannelMember,
  requirePermission('MANAGE_MESSAGES'),
  asyncHandler(async (req, res) => {
    const message = await Message.findById(req.params.messageId)
    if (!message) return res.status(404).json({ error: 'Message not found' })
    // for simplicity we store pins as a flag in Message
    message.pinned = true
    await message.save()
    await createAuditLog(
      req.channel.serverId,
      'MESSAGE_PIN',
      req.user._id,
      message._id,
      {}
    )
    res.json({ ok: true })
  })
)

app.get(
  '/channels/:channelId/pins',
  requireAuth,
  loadUser,
  requireChannelMember,
  asyncHandler(async (req, res) => {
    const pinned = await Message.find({
      kind: 'server',
      channelId: req.channel._id,
      pinned: true,
    }).sort({ createdAt: 1 })
    res.json({ pinned })
  })
)

app.delete(
  '/channels/:channelId/pins/:messageId',
  requireAuth,
  loadUser,
  requireChannelMember,
  requirePermission('MANAGE_MESSAGES'),
  asyncHandler(async (req, res) => {
    const message = await Message.findById(req.params.messageId)
    if (!message) return res.status(404).json({ error: 'Message not found' })
    message.pinned = false
    await message.save()
    await createAuditLog(
      req.channel.serverId,
      'MESSAGE_UNPIN',
      req.user._id,
      message._id,
      {}
    )
    res.json({ ok: true })
  })
)

// Reactions – very lightweight, stored directly on Message
app.post(
  '/channels/:channelId/messages/:messageId/reactions',
  requireAuth,
  loadUser,
  requireChannelMember,
  asyncHandler(async (req, res) => {
    const { emoji } = req.body
    if (!emoji) return res.status(400).json({ error: 'emoji required' })
    const message = await Message.findById(req.params.messageId)
    if (!message) return res.status(404).json({ error: 'Message not found' })
    if (!message.reactions) message.reactions = []
    const existing = message.reactions.find(
      (r) => r.emoji === emoji && r.userId.toString() === req.user._id.toString()
    )
    if (existing) return res.status(409).json({ error: 'Already reacted' })
    message.reactions.push({ emoji, userId: req.user._id, createdAt: new Date() })
    await message.save()
    await createAuditLog(
      req.channel.serverId,
      'MESSAGE_REACTION_ADD',
      req.user._id,
      message._id,
      { emoji }
    )
    res.json({ ok: true })
  })
)

app.delete(
  '/channels/:channelId/messages/:messageId/reactions',
  requireAuth,
  loadUser,
  requireChannelMember,
  asyncHandler(async (req, res) => {
    const { emoji } = req.body
    if (!emoji) return res.status(400).json({ error: 'emoji required' })
    const message = await Message.findById(req.params.messageId)
    if (!message) return res.status(404).json({ error: 'Message not found' })
    if (!message.reactions) return res.status(404).json({ error: 'No reactions' })

    const beforeCount = message.reactions.length
    message.reactions = message.reactions.filter(
      (r) =>
        !(r.emoji === emoji && r.userId.toString() === req.user._id.toString())
    )
    if (message.reactions.length === beforeCount)
      return res.status(404).json({ error: 'Reaction not found' })
    await message.save()
    await createAuditLog(
      req.channel.serverId,
      'MESSAGE_REACTION_REMOVE',
      req.user._id,
      message._id,
      { emoji }
    )
    res.json({ ok: true })
  })
)

/* ---------- EMOJIS (CUSTOM) ----------
   Only the server owner (or MANAGE_EMOJIS) can add/remove.
*/
app.get(
  '/servers/:serverId/emojis',
  requireAuth,
  loadUser,
  requireServerMember,
  asyncHandler(async (req, res) => {
    const emojis = await Emoji.find({ serverId: req.params.serverId })
    res.json({ emojis })
  })
)

app.post(
  '/servers/:serverId/emojis',
  requireAuth,
  loadUser,
  requireServerMember,
  requirePermission('MANAGE_EMOJIS'), // we'll assume this permission exists
  asyncHandler(async (req, res) => {
    const { name, imageUrl, roleId } = req.body
    if (!name || !imageUrl)
      return res
        .status(400)
        .json({ error: 'name and imageUrl are required' })

    const emoji = await Emoji.create({
      serverId: req.params.serverId,
      name: normalizeText(name),
      imageUrl,
      roleId: roleId || null,
    })
    await createAuditLog(
      req.params.serverId,
      'EMOJI_CREATE',
      req.user._id,
      emoji._id,
      { name }
    )
    res.status(201).json({ emoji })
  })
)

app.delete(
  '/servers/:serverId/emojis/:emojiId',
  requireAuth,
  loadUser,
  requireServerMember,
  requirePermission('MANAGE_EMOJIS'),
  asyncHandler(async (req, res) => {
    const emoji = await Emoji.findOne({
      _id: req.params.emojiId,
      serverId: req.params.serverId,
    })
    if (!emoji) return res.status(404).json({ error: 'Emoji not found' })
    await Emoji.deleteOne({ _id: emoji._id })
    await createAuditLog(
      req.params.serverId,
      'EMOJI_DELETE',
      req.user._id,
      emoji._id,
      {}
    )
    res.json({ ok: true })
  })
)

/* ---------- GROUPS ---------- */
// (existing group routes stay as they were – no changes needed)

/* ---------- DM THREADS & MESSAGES ---------- */
// (unchanged – already in the original file)

/* ---------- NOTIFICATIONS ---------- */
// existing endpoints stay

/* ---------- SEARCH ---------- */
// existing endpoint stays

/* ---------- AUDIT LOG ----------
   Simple endpoint that returns the last N audit entries for a server.
   Owner or anyone with VIEW_AUDIT_LOG permission can query.
*/
app.get(
  '/servers/:serverId/audit-logs',
  requireAuth,
  loadUser,
  requireServerMember,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200)
    const perms = await getAggregatedPermissions(req.user._id, req.params.serverId)
    if (
      !perms.has('VIEW_AUDIT_LOG') &&
      !perms.has('ADMINISTRATOR')
    )
      return res
        .status(403)
        .json({ error: 'Missing permission: VIEW_AUDIT_LOG' })

    const logs = await AuditLog.find({ serverId: req.params.serverId })
      .sort({ createdAt: -1 })
      .limit(limit)
    res.json({ logs })
  })
)

/* ---------- NOTIFICATION SETTINGS ----------
   Users may change the per‑type mute preferences.
*/
app.get(
  '/users/:userId/notification-settings',
  requireAuth,
  loadUser,
  asyncHandler(async (req, res) => {
    if (req.params.userId !== req.user._id.toString())
      return res.status(403).json({ error: 'Cannot view another user settings' })
    res.json({ notificationSettings: req.user.notificationSettings })
  })
)

app.patch(
  '/users/:userId/notification-settings',
  requireAuth,
  loadUser,
  asyncHandler(async (req, res) => {
    if (req.params.userId !== req.user._id.toString())
      return res.status(403).json({ error: 'Cannot change another user settings' })
    // accepted body structure: { type: Boolean, ... }
    const updates = req.body || {}
    for (const [type, enabled] of Object.entries(updates)) {
      req.user.notificationSettings.set(type, Boolean(enabled))
    }
    await req.user.save()
    res.json({ notificationSettings: req.user.notificationSettings })
  })
)

/* ---------- PRESENCE ----------
   Get and set user status & activity.
*/
app.get(
  '/users/:userId/presence',
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.userId)
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json({
      userId: user._id.toString(),
      status: user.status,
      activity: user.activity,
      lastSeenAt: user.lastSeenAt,
    })
  })
)

app.patch(
  '/users/:userId/presence',
  requireAuth,
  loadUser,
  asyncHandler(async (req, res) => {
    if (req.params.userId !== req.user._id.toString())
      return res.status(403).json({ error: 'Cannot set another user presence' })
    const { status, activity } = req.body
    if (status && ['online', 'idle', 'dnd', 'offline'].includes(status))
      req.user.status = status
    if (activity) req.user.activity = activity
    await req.user.save()
    res.json({ presence: { status: req.user.status, activity: req.user.activity } })
  })
)

/* ---------- HEALTH (already defined above) ---------- */

/* ---------- AI CHAT ----------
   User-specific AI chat sessions with persistent history.
*/

// Create a new AI chat session
app.post(
  '/ai/chats',
  requireAuth,
  loadUser,
  asyncHandler(async (req, res) => {
    const chat = await AiChat.create({
      userId: req.user._id,
      title: normalizeText(req.body.title) || 'New Chat',
      messages: [],
    })
    res.status(201).json({ chat })
  })
)

// Get all AI chat sessions for the user
app.get(
  '/ai/chats',
  requireAuth,
  loadUser,
  asyncHandler(async (req, res) => {
    const chats = await AiChat.find({ userId: req.user._id })
      .select('_id title createdAt updatedAt')
      .sort({ updatedAt: -1 })
    res.json({ chats })
  })
)

// Get a specific AI chat session with full message history
app.get(
  '/ai/chats/:chatId',
  requireAuth,
  loadUser,
  asyncHandler(async (req, res) => {
    const chat = await AiChat.findOne({
      _id: req.params.chatId,
      userId: req.user._id,
    })
    if (!chat) return res.status(404).json({ error: 'Chat not found' })
    res.json({ chat })
  })
)

// Delete an AI chat session
app.delete(
  '/ai/chats/:chatId',
  requireAuth,
  loadUser,
  asyncHandler(async (req, res) => {
    const result = await AiChat.deleteOne({
      _id: req.params.chatId,
      userId: req.user._id,
    })
    if (result.deletedCount === 0)
      return res.status(404).json({ error: 'Chat not found' })
    res.json({ ok: true })
  })
)

// Send a message to AI and get a response
app.post(
  '/ai/chats/:chatId/messages',
  requireAuth,
  loadUser,
  asyncHandler(async (req, res) => {
    const { message, data } = req.body
    if (!message) return res.status(400).json({ error: 'message is required' })

    const chat = await AiChat.findOne({
      _id: req.params.chatId,
      userId: req.user._id,
    })
    if (!chat) return res.status(404).json({ error: 'Chat not found' })

    // Build the user message content
    let userContent = message
    
    // If data is provided, append it as a JSON block
    if (data && typeof data === 'object') {
      const dataJson = JSON.stringify(data, null, 2)
      userContent += `\n\n[Realtime Data]:\n\`\`\`json\n${dataJson}\n\`\`\``
    }

    // Add user message
    chat.messages.push({ role: 'user', content: userContent })

    // Prepare messages for AI (limit to last 20 for context)
    const aiMessages = chat.messages.slice(-20).map((m) => ({
      role: m.role,
      content: m.content,
    }))

    try {
      const response = await hf.chat({
        model: 'meta-llama/Meta-Llama-3-8B-Instruct',
        messages: aiMessages,
        max_tokens: 120,
        temperature: 0.7,
      })

      const reply = response.choices[0].message.content
      chat.messages.push({ role: 'assistant', content: reply })
      chat.updatedAt = new Date()
      await chat.save()

      res.json({ reply, messageCount: chat.messages.length })
    } catch (e) {
      console.error('AI Error:', e.toString())
      res.status(500).json({ error: 'AI error' })
    }
  })
)

// Export a chat
app.get(
  '/ai/chats/:chatId/export',
  requireAuth,
  loadUser,
  asyncHandler(async (req, res) => {
    const chat = await AiChat.findOne({
      _id: req.params.chatId,
      userId: req.user._id,
    })
    if (!chat) return res.status(404).json({ error: 'Chat not found' })
    res.json({
      chatId: chat._id,
      title: chat.title,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      messages: chat.messages,
    })
  })
)

// Import a chat
app.post(
  '/ai/chats/import',
  requireAuth,
  loadUser,
  asyncHandler(async (req, res) => {
    const { title, messages } = req.body
    if (!Array.isArray(messages))
      return res.status(400).json({ error: 'messages array required' })

    const chat = await AiChat.create({
      userId: req.user._id,
      title: normalizeText(title) || 'Imported Chat',
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        createdAt: m.createdAt || new Date(),
      })),
    })
    res.status(201).json({ chat })
  })
)

/* ---------- ADMIN CLEAR‑DB ----------
   unchanged – still requires ADMIN_AUTH key.
*/
app.post(
  '/clear-db',
  asyncHandler(async (req, res) => {
    const key = normalizeText(req.body.key)
    if (key !== ADMIN_AUTH) return res.status(403).json({ error: 'Invalid admin key' })
    await Promise.all([
      User.deleteMany({}),
      FriendRequest.deleteMany({}),
      Server.deleteMany({}),
      ServerMember.deleteMany({}),
      Role.deleteMany({}),
      Category.deleteMany({}),
      Channel.deleteMany({}),
      ServerInvite.deleteMany({}),
      Group.deleteMany({}),
      DmThread.deleteMany({}),
      Message.deleteMany({}),
      Notification.deleteMany({}),
      HealthPing.deleteMany({}),
      EmailVerification.deleteMany({}),
      PasswordReset.deleteMany({}),
      Block.deleteMany({}),
      Emoji.deleteMany({}),
      AuditLog.deleteMany({}),
    ])
    res.json({ ok: true, cleared: true })
  })
)

/* ---------- FALLBACK 404 & ERROR HANDLER ---------- */
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' })
})

app.use((err, req, res, next) => {
  const status = err.status || 500
  const message = err.message || 'Server error'
  console.error(err)
  res.status(status).json({ error: message })
})

/* ---------- START ----------
   Connect to MongoDB and start the server.
*/
async function start() {
  try {
    await mongoose.connect(MONGODB_URL)
    console.log('✅ MongoDB connected')
    app.listen(PORT, () => {
      console.log(`🚀 API running on port ${PORT}`)
      // Start self-ping to keep Render instance alive
      startSelfPing()
    })
  } catch (e) {
    console.error('❌ MongoDB connection error:', e.message)
    process.exit(1)
  }
}

/* ---------- SELF-PING (keep Render alive) ----------
   Sends random pings to /health at random intervals (30s–5min)
   to prevent the free tier from spinning down.
*/
function startSelfPing() {
  const BASE_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`
  const parsedUrl = new URL(`${BASE_URL}/health`)
  const httpModule = parsedUrl.protocol === 'https:' ? https : http
  
  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min
  }
  
  function randomString(len) {
    return crypto.randomBytes(len).toString('hex').slice(0, len)
  }
  
  function ping() {
    const payload = {
      heartbeat: true,
      timestamp: Date.now(),
      nonce: randomString(8 + randomInt(0, 24)),
      jitter: Math.random(),
      slot: randomInt(1, 100),
    }
    
    const postData = JSON.stringify(payload)
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: '/health',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    }
    
    const req = httpModule.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          console.log(`[SelfPing] OK at ${new Date().toISOString()} — pingId: ${json.pingId || 'n/a'}`)
        } catch {
          console.log(`[SelfPing] HTTP ${res.statusCode} at ${new Date().toISOString()}`)
        }
      })
    })
    
    req.on('error', (err) => {
      console.log(`[SelfPing] Error at ${new Date().toISOString()}: ${err.message}`)
    })
    
    req.write(postData)
    req.end()
    
    // Schedule next ping: ~2 seconds with small jitter (±200ms)
    const delay = 2000 + randomInt(-200, 200)
    setTimeout(ping, delay)
  }
  
  // Initial delay before first ping (1-2s)
  const initialDelay = randomInt(1000, 2000)
  console.log(`[SelfPing] Starting in ${initialDelay}ms, targeting ${BASE_URL}/health every ~2s`)
  setTimeout(ping, initialDelay)
}

start()
