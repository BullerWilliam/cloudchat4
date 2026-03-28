import express from 'express'
import http from 'http'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import { Server as IOServer } from 'socket.io'
import crypto from 'crypto'

const app = express()
const server = http.createServer(app)
const io = new IOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE']
  }
})

const PORT = process.env.PORT || 3000
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret'
const MONGODB_PASSWORD = process.env.MONGODB_PASSWORD || ''
const MONGODB_URL = process.env.MONGODB_URL || `mongodb+srv://mongo:${encodeURIComponent(MONGODB_PASSWORD)}@cloudchat4.aoxoo9t.mongodb.net/?appName=cloudchat4`

app.use(helmet())
app.use(cors({ origin: '*', credentials: true }))
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(rateLimit({ windowMs: 60 * 1000, max: 300 }))

mongoose.set('strictQuery', true)

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, lowercase: true },
  displayName: { type: String, default: '' },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  passwordHash: { type: String, required: true },
  imageUrl: { type: String, default: '' },
  bio: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now }
})

const friendRequestSchema = new mongoose.Schema({
  fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  respondedAt: { type: Date, default: null }
})
friendRequestSchema.index({ fromUserId: 1, toUserId: 1 }, { unique: true })

const serverSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  iconUrl: { type: String, default: '' },
  description: { type: String, default: '' },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rulesText: { type: String, default: '' },
  inviteCode: { type: String, unique: true, index: true },
  createdAt: { type: Date, default: Date.now }
})

const serverMemberSchema = new mongoose.Schema({
  serverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Server', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  roleIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Role' }],
  nick: { type: String, default: '' },
  joinedAt: { type: Date, default: Date.now },
  muted: { type: Boolean, default: false },
  deafened: { type: Boolean, default: false }
})
serverMemberSchema.index({ serverId: 1, userId: 1 }, { unique: true })

const roleSchema = new mongoose.Schema({
  serverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Server', required: true },
  name: { type: String, required: true },
  color: { type: String, default: '#99aab5' },
  permissions: [{ type: String }],
  position: { type: Number, default: 0 },
  hoist: { type: Boolean, default: false },
  mentionable: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
})

const categorySchema = new mongoose.Schema({
  serverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Server', required: true },
  name: { type: String, required: true },
  position: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
})

const channelSchema = new mongoose.Schema({
  serverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Server', required: true },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  name: { type: String, required: true },
  type: { type: String, enum: ['text', 'voice', 'announcement', 'forum'], default: 'text' },
  topic: { type: String, default: '' },
  position: { type: Number, default: 0 },
  allowedRoleIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Role' }],
  deniedRoleIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Role' }],
  createdAt: { type: Date, default: Date.now }
})

const serverInviteSchema = new mongoose.Schema({
  serverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Server', required: true },
  inviterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  inviteeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  code: { type: String, unique: true, index: true },
  status: { type: String, enum: ['pending', 'accepted', 'declined', 'cancelled'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  respondedAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null }
})

const groupSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  imageUrl: { type: String, default: '' },
  memberIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now }
})

groupSchema.pre('save', function (next) {
  if (!this.memberIds.some(id => id.toString() === this.ownerId.toString())) this.memberIds.unshift(this.ownerId)
  next()
})

const dmThreadSchema = new mongoose.Schema({
  key: { type: String, unique: true, index: true },
  memberIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now },
  lastMessageAt: { type: Date, default: Date.now }
})

const messageSchema = new mongoose.Schema({
  kind: { type: String, enum: ['dm', 'server', 'group'], required: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  threadId: { type: mongoose.Schema.Types.ObjectId, ref: 'DmThread', default: null },
  serverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Server', default: null },
  channelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', default: null },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  content: { type: String, required: true, trim: true },
  attachments: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
  editedAt: { type: Date, default: null },
  deletedAt: { type: Date, default: null }
})

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['friend_request', 'server_invite', 'group_added', 'message', 'system'], required: true },
  title: { type: String, required: true },
  body: { type: String, default: '' },
  data: { type: Object, default: {} },
  readAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
})

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

function sanitizeUser(user) {
  if (!user) return null
  return {
    id: user._id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    imageUrl: user.imageUrl,
    bio: user.bio,
    createdAt: user.createdAt,
    lastSeenAt: user.lastSeenAt
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

async function requireServerMember(req, res, next) {
  const serverId = req.params.serverId || req.body.serverId || req.query.serverId
  const member = await ServerMember.findOne({ serverId, userId: req.user._id })
  if (!member) return res.status(403).json({ error: 'Not a server member' })
  req.serverMember = member
  next()
}

async function requireChannelMember(req, res, next) {
  const channel = await Channel.findById(req.params.channelId)
  if (!channel) return res.status(404).json({ error: 'Channel not found' })
  const member = await ServerMember.findOne({ serverId: channel.serverId, userId: req.user._id })
  if (!member) return res.status(403).json({ error: 'Not a member of this server' })
  req.channel = channel
  next()
}

async function createNotification(userId, type, title, body, data = {}) {
  const notification = await Notification.create({ userId, type, title, body, data })
  io.to(userId.toString()).emit('notification', notification)
  return notification
}

async function isFriends(userA, userB) {
  const existing = await FriendRequest.findOne({
    $or: [
      { fromUserId: userA, toUserId: userB, status: 'accepted' },
      { fromUserId: userB, toUserId: userA, status: 'accepted' }
    ]
  })
  return !!existing
}

async function areInSameServer(userA, userB) {
  const aServers = await ServerMember.find({ userId: userA }).select('serverId')
  const b = await ServerMember.findOne({ userId: userB, serverId: { $in: aServers.map(x => x.serverId) } })
  return !!b
}

async function canDM(userA, userB) {
  return (await isFriends(userA, userB)) || (await areInSameServer(userA, userB))
}

app.get('/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() })
})

app.post('/auth/register', asyncHandler(async (req, res) => {
  const username = normalizeText(req.body.username).toLowerCase()
  const email = normalizeText(req.body.email).toLowerCase()
  const password = normalizeText(req.body.password)
  const displayName = normalizeText(req.body.displayName)
  const imageUrl = normalizeText(req.body.imageUrl)

  if (!username || !email || !password) return res.status(400).json({ error: 'username, email and password are required' })
  if (password.length < 6) return res.status(400).json({ error: 'password must be at least 6 characters' })

  const existing = await User.findOne({ $or: [{ username }, { email }] })
  if (existing) return res.status(409).json({ error: 'username or email already exists' })

  const passwordHash = await bcrypt.hash(password, 12)
  const user = await User.create({
    username,
    displayName: displayName || username,
    email,
    passwordHash,
    imageUrl
  })

  res.status(201).json({ token: signToken(user), user: sanitizeUser(user) })
}))

app.post('/auth/login', asyncHandler(async (req, res) => {
  const identifier = normalizeText(req.body.identifier).toLowerCase()
  const password = normalizeText(req.body.password)
  if (!identifier || !password) return res.status(400).json({ error: 'identifier and password are required' })

  const user = await User.findOne({ $or: [{ username: identifier }, { email: identifier }] })
  if (!user) return res.status(401).json({ error: 'Invalid credentials' })

  const ok = await bcrypt.compare(password, user.passwordHash)
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' })

  user.lastSeenAt = new Date()
  await user.save()

  res.json({ token: signToken(user), user: sanitizeUser(user) })
}))

app.get('/auth/me', requireAuth, loadUser, asyncHandler(async (req, res) => {
  res.json({ user: sanitizeUser(req.user) })
}))

app.patch('/auth/me', requireAuth, loadUser, asyncHandler(async (req, res) => {
  const updates = {}
  const allowed = ['username', 'displayName', 'email', 'imageUrl', 'bio']
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = normalizeText(req.body[key])
  }

  if (updates.username) updates.username = updates.username.toLowerCase()
  if (updates.email) updates.email = updates.email.toLowerCase()

  if (updates.username || updates.email) {
    const conflict = await User.findOne({
      _id: { $ne: req.user._id },
      $or: [updates.username ? { username: updates.username } : null, updates.email ? { email: updates.email } : null].filter(Boolean)
    })
    if (conflict) return res.status(409).json({ error: 'username or email already exists' })
  }

  Object.assign(req.user, updates)
  await req.user.save()
  res.json({ user: sanitizeUser(req.user) })
}))

app.get('/users/search', requireAuth, loadUser, asyncHandler(async (req, res) => {
  const q = normalizeText(req.query.q)
  if (!q) return res.json({ users: [] })
  const users = await User.find({
    $or: [
      { username: new RegExp(q, 'i') },
      { displayName: new RegExp(q, 'i') },
      { email: new RegExp(q, 'i') }
    ]
  }).limit(25)
  res.json({ users: users.map(sanitizeUser) })
}))

app.get('/users/:userId', requireAuth, loadUser, asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.userId)
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json({ user: sanitizeUser(user) })
}))

app.post('/friends/request', requireAuth, loadUser, asyncHandler(async (req, res) => {
  const targetUserId = req.body.targetUserId
  if (!targetUserId) return res.status(400).json({ error: 'targetUserId is required' })
  if (targetUserId.toString() === req.user._id.toString()) return res.status(400).json({ error: 'You cannot add yourself' })

  const target = await User.findById(targetUserId)
  if (!target) return res.status(404).json({ error: 'Target user not found' })

  const alreadyFriends = await FriendRequest.findOne({
    $or: [
      { fromUserId: req.user._id, toUserId: target._id, status: 'accepted' },
      { fromUserId: target._id, toUserId: req.user._id, status: 'accepted' }
    ]
  })
  if (alreadyFriends) return res.status(409).json({ error: 'Already friends' })

  const existingPending = await FriendRequest.findOne({
    $or: [
      { fromUserId: req.user._id, toUserId: target._id, status: 'pending' },
      { fromUserId: target._id, toUserId: req.user._id, status: 'pending' }
    ]
  })
  if (existingPending) return res.status(409).json({ error: 'Friend request already exists' })

  const request = await FriendRequest.create({ fromUserId: req.user._id, toUserId: target._id })
  await createNotification(target._id, 'friend_request', 'Friend request', `${req.user.displayName || req.user.username} sent you a friend request`, { friendRequestId: request._id })
  io.to(target._id.toString()).emit('friend_request', request)
  res.status(201).json({ request })
}))

app.get('/friends/requests/incoming', requireAuth, loadUser, asyncHandler(async (req, res) => {
  const requests = await FriendRequest.find({ toUserId: req.user._id, status: 'pending' }).populate('fromUserId', 'username displayName imageUrl')
  res.json({ requests })
}))

app.get('/friends/requests/outgoing', requireAuth, loadUser, asyncHandler(async (req, res) => {
  const requests = await FriendRequest.find({ fromUserId: req.user._id, status: 'pending' }).populate('toUserId', 'username displayName imageUrl')
  res.json({ requests })
}))

app.post('/friends/requests/:requestId/respond', requireAuth, loadUser, asyncHandler(async (req, res) => {
  const action = normalizeText(req.body.action).toLowerCase()
  const request = await FriendRequest.findById(req.params.requestId)
  if (!request) return res.status(404).json({ error: 'Request not found' })
  if (request.toUserId.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Not allowed' })
  if (request.status !== 'pending') return res.status(409).json({ error: 'Request already handled' })
  if (!['accept', 'decline'].includes(action)) return res.status(400).json({ error: 'action must be accept or decline' })

  request.status = action === 'accept' ? 'accepted' : 'declined'
  request.respondedAt = new Date()
  await request.save()

  const otherUser = await User.findById(request.fromUserId)
  if (otherUser) {
    await createNotification(otherUser._id, 'system', 'Friend request update', `${req.user.displayName || req.user.username} ${action === 'accept' ? 'accepted' : 'declined'} your friend request`, { friendRequestId: request._id })
  }

  res.json({ request })
}))

app.get('/friends/list', requireAuth, loadUser, asyncHandler(async (req, res) => {
  const requests = await FriendRequest.find({
    status: 'accepted',
    $or: [{ fromUserId: req.user._id }, { toUserId: req.user._id }]
  })
    .populate('fromUserId', 'username displayName imageUrl')
    .populate('toUserId', 'username displayName imageUrl')

  const friends = requests.map(r => (r.fromUserId._id.toString() === req.user._id.toString() ? r.toUserId : r.fromUserId))
  res.json({ friends })
}))

app.post('/servers', requireAuth, loadUser, asyncHandler(async (req, res) => {
  const name = normalizeText(req.body.name)
  if (!name) return res.status(400).json({ error: 'name is required' })

  const serverDoc = await Server.create({
    name,
    iconUrl: normalizeText(req.body.iconUrl),
    description: normalizeText(req.body.description),
    ownerId: req.user._id,
    rulesText: normalizeText(req.body.rulesText),
    inviteCode: makeInviteCode()
  })

  const everyoneRole = await Role.create({
    serverId: serverDoc._id,
    name: '@everyone',
    permissions: ['read_messages', 'send_messages', 'view_channels'],
    position: 0,
    hoist: false,
    mentionable: false
  })

  await ServerMember.create({ serverId: serverDoc._id, userId: req.user._id, roleIds: [everyoneRole._id] })

  const generalCategory = await Category.create({ serverId: serverDoc._id, name: 'General', position: 0 })
  await Channel.create({ serverId: serverDoc._id, categoryId: generalCategory._id, name: 'general', type: 'text', position: 0 })
  await Channel.create({ serverId: serverDoc._id, categoryId: generalCategory._id, name: 'voice', type: 'voice', position: 1 })

  res.status(201).json({ server: serverDoc })
}))

app.get('/servers', requireAuth, loadUser, asyncHandler(async (req, res) => {
  const memberships = await ServerMember.find({ userId: req.user._id }).populate('serverId')
  res.json({ servers: memberships.map(m => m.serverId) })
}))

app.get('/servers/:serverId', requireAuth, loadUser, requireServerMember, asyncHandler(async (req, res) => {
  const serverDoc = await Server.findById(req.params.serverId)
  const members = await ServerMember.find({ serverId: req.params.serverId }).populate('userId', 'username displayName imageUrl')
  const roles = await Role.find({ serverId: req.params.serverId }).sort({ position: 1 })
  const categories = await Category.find({ serverId: req.params.serverId }).sort({ position: 1 })
  const channels = await Channel.find({ serverId: req.params.serverId }).sort({ position: 1 })
  res.json({ server: serverDoc, members, roles, categories, channels })
}))

app.patch('/servers/:serverId', requireAuth, loadUser, requireServerMember, asyncHandler(async (req, res) => {
  const serverDoc = await Server.findById(req.params.serverId)
  if (!serverDoc) return res.status(404).json({ error: 'Server not found' })
  if (serverDoc.ownerId.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Only the owner can edit this server' })

  const allowed = ['name', 'iconUrl', 'description', 'rulesText']
  for (const key of allowed) {
    if (req.body[key] !== undefined) serverDoc[key] = normalizeText(req.body[key])
  }
  await serverDoc.save()
  res.json({ server: serverDoc })
}))

app.post('/servers/:serverId/invites', requireAuth, loadUser, requireServerMember, asyncHandler(async (req, res) => {
  const inviteeId = req.body.inviteeId || null
  const invitee = inviteeId ? await User.findById(inviteeId) : null
  if (inviteeId && !invitee) return res.status(404).json({ error: 'Invitee not found' })

  const invite = await ServerInvite.create({
    serverId: req.params.serverId,
    inviterId: req.user._id,
    inviteeId: invitee ? invitee._id : null,
    code: makeInviteCode(),
    status: 'pending'
  })

  if (invitee) {
    await createNotification(invitee._id, 'server_invite', 'Server invite', `${req.user.displayName || req.user.username} invited you to join a server`, { serverInviteId: invite._id, serverId: req.params.serverId })
  }

  res.status(201).json({ invite })
}))

app.get('/servers/:serverId/invites', requireAuth, loadUser, requireServerMember, asyncHandler(async (req, res) => {
  const invites = await ServerInvite.find({ serverId: req.params.serverId }).sort({ createdAt: -1 })
  res.json({ invites })
}))

app.post('/server-invites/:inviteId/respond', requireAuth, loadUser, asyncHandler(async (req, res) => {
  const action = normalizeText(req.body.action).toLowerCase()
  const invite = await ServerInvite.findById(req.params.inviteId)
  if (!invite) return res.status(404).json({ error: 'Invite not found' })
  if (invite.inviteeId && invite.inviteeId.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Not allowed' })
  if (invite.status !== 'pending') return res.status(409).json({ error: 'Invite already handled' })
  if (!['accept', 'decline'].includes(action)) return res.status(400).json({ error: 'action must be accept or decline' })

  invite.status = action === 'accept' ? 'accepted' : 'declined'
  invite.respondedAt = new Date()
  await invite.save()

  if (action === 'accept') {
    const existingMember = await ServerMember.findOne({ serverId: invite.serverId, userId: req.user._id })
    if (!existingMember) {
      await ServerMember.create({ serverId: invite.serverId, userId: req.user._id, roleIds: [] })
    }
    const everyoneRole = await Role.findOne({ serverId: invite.serverId, name: '@everyone' })
    if (everyoneRole) {
      await ServerMember.updateOne({ serverId: invite.serverId, userId: req.user._id }, { $addToSet: { roleIds: everyoneRole._id } })
    }
  }

  res.json({ invite })
}))

app.post('/servers/:serverId/join', requireAuth, loadUser, asyncHandler(async (req, res) => {
  const code = normalizeText(req.body.code)
  const serverDoc = await Server.findById(req.params.serverId)
  if (!serverDoc) return res.status(404).json({ error: 'Server not found' })
  if (code && serverDoc.inviteCode !== code) return res.status(403).json({ error: 'Invalid invite code' })

  const existing = await ServerMember.findOne({ serverId: serverDoc._id, userId: req.user._id })
  if (!existing) {
    await ServerMember.create({ serverId: serverDoc._id, userId: req.user._id, roleIds: [] })
    const everyoneRole = await Role.findOne({ serverId: serverDoc._id, name: '@everyone' })
    if (everyoneRole) {
      await ServerMember.updateOne({ serverId: serverDoc._id, userId: req.user._id }, { $addToSet: { roleIds: everyoneRole._id } })
    }
  }

  res.json({ ok: true })
}))

app.post('/servers/:serverId/leave', requireAuth, loadUser, asyncHandler(async (req, res) => {
  const serverDoc = await Server.findById(req.params.serverId)
  if (!serverDoc) return res.status(404).json({ error: 'Server not found' })
  if (serverDoc.ownerId.toString() === req.user._id.toString()) return res.status(400).json({ error: 'Owner cannot leave the server' })
  await ServerMember.deleteOne({ serverId: req.params.serverId, userId: req.user._id })
  res.json({ ok: true })
}))

app.post('/servers/:serverId/roles', requireAuth, loadUser, requireServerMember, asyncHandler(async (req, res) => {
  const serverDoc = await Server.findById(req.params.serverId)
  if (serverDoc.ownerId.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Only the owner can manage roles' })

  const role = await Role.create({
    serverId: req.params.serverId,
    name: normalizeText(req.body.name),
    color: normalizeText(req.body.color) || '#99aab5',
    permissions: Array.isArray(req.body.permissions) ? req.body.permissions.map(String) : [],
    position: Number(req.body.position || 0),
    hoist: Boolean(req.body.hoist),
    mentionable: Boolean(req.body.mentionable)
  })

  res.status(201).json({ role })
}))

app.patch('/servers/:serverId/roles/:roleId', requireAuth, loadUser, requireServerMember, asyncHandler(async (req, res) => {
  const serverDoc = await Server.findById(req.params.serverId)
  if (serverDoc.ownerId.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Only the owner can manage roles' })
  const role = await Role.findOne({ _id: req.params.roleId, serverId: req.params.serverId })
  if (!role) return res.status(404).json({ error: 'Role not found' })

  const fields = ['name', 'color', 'position', 'hoist', 'mentionable']
  for (const field of fields) {
    if (req.body[field] !== undefined) role[field] = req.body[field]
  }
  if (Array.isArray(req.body.permissions)) role.permissions = req.body.permissions.map(String)
  await role.save()
  res.json({ role })
}))

app.delete('/servers/:serverId/roles/:roleId', requireAuth, loadUser, requireServerMember, asyncHandler(async (req, res) => {
  const serverDoc = await Server.findById(req.params.serverId)
  if (serverDoc.ownerId.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Only the owner can manage roles' })
  await Role.deleteOne({ _id: req.params.roleId, serverId: req.params.serverId })
  await ServerMember.updateMany({ serverId: req.params.serverId }, { $pull: { roleIds: req.params.roleId } })
  res.json({ ok: true })
}))

app.post('/servers/:serverId/categories', requireAuth, loadUser, requireServerMember, asyncHandler(async (req, res) => {
  const serverDoc = await Server.findById(req.params.serverId)
  if (serverDoc.ownerId.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Only the owner can manage categories' })
  const category = await Category.create({
    serverId: req.params.serverId,
    name: normalizeText(req.body.name),
    position: Number(req.body.position || 0)
  })
  res.status(201).json({ category })
}))

app.patch('/servers/:serverId/categories/:categoryId', requireAuth, loadUser, requireServerMember, asyncHandler(async (req, res) => {
  const serverDoc = await Server.findById(req.params.serverId)
  if (serverDoc.ownerId.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Only the owner can manage categories' })
  const category = await Category.findOne({ _id: req.params.categoryId, serverId: req.params.serverId })
  if (!category) return res.status(404).json({ error: 'Category not found' })
  if (req.body.name !== undefined) category.name = normalizeText(req.body.name)
  if (req.body.position !== undefined) category.position = Number(req.body.position)
  await category.save()
  res.json({ category })
}))

app.delete('/servers/:serverId/categories/:categoryId', requireAuth, loadUser, requireServerMember, asyncHandler(async (req, res) => {
  const serverDoc = await Server.findById(req.params.serverId)
  if (serverDoc.ownerId.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Only the owner can manage categories' })
  await Channel.updateMany({ serverId: req.params.serverId, categoryId: req.params.categoryId }, { $set: { categoryId: null } })
  await Category.deleteOne({ _id: req.params.categoryId, serverId: req.params.serverId })
  res.json({ ok: true })
}))

app.post('/servers/:serverId/channels', requireAuth, loadUser, requireServerMember, asyncHandler(async (req, res) => {
  const serverDoc = await Server.findById(req.params.serverId)
  if (serverDoc.ownerId.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Only the owner can manage channels' })
  const channel = await Channel.create({
    serverId: req.params.serverId,
    categoryId: req.body.categoryId || null,
    name: normalizeText(req.body.name),
    type: req.body.type || 'text',
    topic: normalizeText(req.body.topic),
    position: Number(req.body.position || 0),
    allowedRoleIds: Array.isArray(req.body.allowedRoleIds) ? req.body.allowedRoleIds : [],
    deniedRoleIds: Array.isArray(req.body.deniedRoleIds) ? req.body.deniedRoleIds : []
  })
  res.status(201).json({ channel })
}))

app.patch('/servers/:serverId/channels/:channelId', requireAuth, loadUser, requireServerMember, asyncHandler(async (req, res) => {
  const serverDoc = await Server.findById(req.params.serverId)
  if (serverDoc.ownerId.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Only the owner can manage channels' })
  const channel = await Channel.findOne({ _id: req.params.channelId, serverId: req.params.serverId })
  if (!channel) return res.status(404).json({ error: 'Channel not found' })

  const fields = ['categoryId', 'name', 'type', 'topic', 'position']
  for (const field of fields) {
    if (req.body[field] !== undefined) channel[field] = req.body[field]
  }
  if (Array.isArray(req.body.allowedRoleIds)) channel.allowedRoleIds = req.body.allowedRoleIds
  if (Array.isArray(req.body.deniedRoleIds)) channel.deniedRoleIds = req.body.deniedRoleIds
  await channel.save()
  res.json({ channel })
}))

app.delete('/servers/:serverId/channels/:channelId', requireAuth, loadUser, requireServerMember, asyncHandler(async (req, res) => {
  const serverDoc = await Server.findById(req.params.serverId)
  if (serverDoc.ownerId.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Only the owner can manage channels' })
  await Channel.deleteOne({ _id: req.params.channelId, serverId: req.params.serverId })
  res.json({ ok: true })
}))

app.get('/servers/:serverId/members', requireAuth, loadUser, requireServerMember, asyncHandler(async (req, res) => {
  const members = await ServerMember.find({ serverId: req.params.serverId }).populate('userId', 'username displayName imageUrl')
  res.json({ members })
}))

app.post('/servers/:serverId/members/:userId/roles', requireAuth, loadUser, requireServerMember, asyncHandler(async (req, res) => {
  const serverDoc = await Server.findById(req.params.serverId)
  if (serverDoc.ownerId.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Only the owner can manage member roles' })
  const roleIds = Array.isArray(req.body.roleIds) ? req.body.roleIds : []
  const member = await ServerMember.findOne({ serverId: req.params.serverId, userId: req.params.userId })
  if (!member) return res.status(404).json({ error: 'Member not found' })
  member.roleIds = roleIds
  await member.save()
  res.json({ member })
}))

app.delete('/servers/:serverId/members/:userId', requireAuth, loadUser, requireServerMember, asyncHandler(async (req, res) => {
  const serverDoc = await Server.findById(req.params.serverId)
  if (serverDoc.ownerId.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Only the owner can remove members' })
  await ServerMember.deleteOne({ serverId: req.params.serverId, userId: req.params.userId })
  res.json({ ok: true })
}))

app.post('/groups', requireAuth, loadUser, asyncHandler(async (req, res) => {
  const name = normalizeText(req.body.name)
  if (!name) return res.status(400).json({ error: 'name is required' })
  const memberIds = Array.isArray(req.body.memberIds) ? req.body.memberIds.filter(Boolean) : []
  const uniqueMemberIds = [...new Set([req.user._id.toString(), ...memberIds.map(String)])]
  const validUsers = await User.find({ _id: { $in: uniqueMemberIds } })
  if (validUsers.length !== uniqueMemberIds.length) return res.status(400).json({ error: 'One or more users were not found' })
  const group = await Group.create({ ownerId: req.user._id, name, imageUrl: normalizeText(req.body.imageUrl), memberIds: uniqueMemberIds })
  res.status(201).json({ group })
}))

app.get('/groups', requireAuth, loadUser, asyncHandler(async (req, res) => {
  const groups = await Group.find({ memberIds: req.user._id })
  res.json({ groups })
}))

app.get('/groups/:groupId', requireAuth, loadUser, asyncHandler(async (req, res) => {
  const group = await Group.findOne({ _id: req.params.groupId, memberIds: req.user._id })
  if (!group) return res.status(404).json({ error: 'Group not found' })
  res.json({ group })
}))

app.post('/groups/:groupId/members', requireAuth, loadUser, asyncHandler(async (req, res) => {
  const group = await Group.findOne({ _id: req.params.groupId, memberIds: req.user._id })
  if (!group) return res.status(404).json({ error: 'Group not found' })
  if (group.ownerId.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Only the owner can add members' })
  const userId = req.body.userId
  const user = await User.findById(userId)
  if (!user) return res.status(404).json({ error: 'User not found' })
  if (!group.memberIds.some(id => id.toString() === user._id.toString())) group.memberIds.push(user._id)
  await group.save()
  await createNotification(user._id, 'group_added', 'Added to group', `You were added to ${group.name}`, { groupId: group._id })
  res.json({ group })
}))

app.delete('/groups/:groupId/members/:userId', requireAuth, loadUser, asyncHandler(async (req, res) => {
  const group = await Group.findOne({ _id: req.params.groupId, memberIds: req.user._id })
  if (!group) return res.status(404).json({ error: 'Group not found' })
  if (group.ownerId.toString() !== req.user._id.toString() && req.params.userId !== req.user._id.toString()) return res.status(403).json({ error: 'Not allowed' })
  group.memberIds = group.memberIds.filter(id => id.toString() !== req.params.userId)
  await group.save()
  res.json({ group })
}))

app.post('/groups/:groupId/messages', requireAuth, loadUser, asyncHandler(async (req, res) => {
  const group = await Group.findOne({ _id: req.params.groupId, memberIds: req.user._id })
  if (!group) return res.status(404).json({ error: 'Group not found' })
  const content = normalizeText(req.body.content)
  if (!content) return res.status(400).json({ error: 'content is required' })
  const message = await Message.create({ kind: 'group', senderId: req.user._id, groupId: group._id, content })
  io.to(`group:${group._id.toString()}`).emit('message', message)
  res.status(201).json({ message })
}))

app.get('/groups/:groupId/messages', requireAuth, loadUser, asyncHandler(async (req, res) => {
  const group = await Group.findOne({ _id: req.params.groupId, memberIds: req.user._id })
  if (!group) return res.status(404).json({ error: 'Group not found' })
  const messages = await Message.find({ kind: 'group', groupId: group._id }).sort({ createdAt: 1 }).limit(500)
  res.json({ messages })
}))

app.get('/dm/threads', requireAuth, loadUser, asyncHandler(async (req, res) => {
  const threads = await DmThread.find({ memberIds: req.user._id }).sort({ lastMessageAt: -1 })
  res.json({ threads })
}))

app.post('/dm/send', requireAuth, loadUser, asyncHandler(async (req, res) => {
  const toUserId = req.body.toUserId
  const content = normalizeText(req.body.content)
  if (!toUserId || !content) return res.status(400).json({ error: 'toUserId and content are required' })
  if (toUserId.toString() === req.user._id.toString()) return res.status(400).json({ error: 'You cannot message yourself' })

  const target = await User.findById(toUserId)
  if (!target) return res.status(404).json({ error: 'Target user not found' })
  const allowed = await canDM(req.user._id, target._id)
  if (!allowed) return res.status(403).json({ error: 'You can only DM friends or users you share a server with' })

  const key = getDmKey(req.user._id, target._id)
  let thread = await DmThread.findOne({ key })
  if (!thread) thread = await DmThread.create({ key, memberIds: [req.user._id, target._id] })

  thread.lastMessageAt = new Date()
  await thread.save()

  const message = await Message.create({ kind: 'dm', senderId: req.user._id, recipientId: target._id, threadId: thread._id, content })
  io.to(`dm:${thread._id.toString()}`).emit('message', message)
  io.to(target._id.toString()).emit('dm_message', message)
  await createNotification(target._id, 'message', 'New direct message', `${req.user.displayName || req.user.username} sent you a message`, { threadId: thread._id, messageId: message._id })
  res.status(201).json({ thread, message })
}))

app.get('/dm/threads/:threadId/messages', requireAuth, loadUser, asyncHandler(async (req, res) => {
  const thread = await DmThread.findOne({ _id: req.params.threadId, memberIds: req.user._id })
  if (!thread) return res.status(404).json({ error: 'Thread not found' })
  const messages = await Message.find({ kind: 'dm', threadId: thread._id }).sort({ createdAt: 1 }).limit(500)
  res.json({ messages })
}))

app.post('/channels/:channelId/messages', requireAuth, loadUser, requireChannelMember, asyncHandler(async (req, res) => {
  const content = normalizeText(req.body.content)
  if (!content) return res.status(400).json({ error: 'content is required' })
  const message = await Message.create({
    kind: 'server',
    senderId: req.user._id,
    serverId: req.channel.serverId,
    channelId: req.channel._id,
    content,
    attachments: Array.isArray(req.body.attachments) ? req.body.attachments : []
  })
  io.to(`channel:${req.channel._id.toString()}`).emit('message', message)
  res.status(201).json({ message })
}))

app.get('/channels/:channelId/messages', requireAuth, loadUser, requireChannelMember, asyncHandler(async (req, res) => {
  const messages = await Message.find({ kind: 'server', channelId: req.channel._id }).sort({ createdAt: 1 }).limit(500)
  res.json({ messages })
}))

app.get('/notifications', requireAuth, loadUser, asyncHandler(async (req, res) => {
  const notifications = await Notification.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(100)
  res.json({ notifications })
}))

app.post('/notifications/:notificationId/read', requireAuth, loadUser, asyncHandler(async (req, res) => {
  const notification = await Notification.findOne({ _id: req.params.notificationId, userId: req.user._id })
  if (!notification) return res.status(404).json({ error: 'Notification not found' })
  notification.readAt = new Date()
  await notification.save()
  res.json({ notification })
}))

app.post('/notifications/read-all', requireAuth, loadUser, asyncHandler(async (req, res) => {
  await Notification.updateMany({ userId: req.user._id, readAt: null }, { $set: { readAt: new Date() } })
  res.json({ ok: true })
}))

app.get('/search', requireAuth, loadUser, asyncHandler(async (req, res) => {
  const q = normalizeText(req.query.q)
  if (!q) return res.json({ users: [], servers: [], groups: [] })
  const users = await User.find({ $or: [{ username: new RegExp(q, 'i') }, { displayName: new RegExp(q, 'i') }] }).limit(20)
  const serverIds = await ServerMember.find({ userId: req.user._id }).distinct('serverId')
  const servers = await Server.find({ _id: { $in: serverIds }, name: new RegExp(q, 'i') }).limit(20)
  const groups = await Group.find({ memberIds: req.user._id, name: new RegExp(q, 'i') }).limit(20)
  res.json({ users: users.map(sanitizeUser), servers, groups })
}))

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' })
})

app.use((err, req, res, next) => {
  const status = err.status || 500
  const message = err.message || 'Server error'
  res.status(status).json({ error: message })
})

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || (socket.handshake.headers.authorization || '').replace('Bearer ', '')
    if (!token) return next(new Error('Missing token'))
    const payload = jwt.verify(token, JWT_SECRET)
    const user = await User.findById(payload.id)
    if (!user) return next(new Error('Invalid token'))
    socket.user = user
    next()
  } catch {
    next(new Error('Invalid token'))
  }
})

io.on('connection', async socket => {
  socket.join(socket.user._id.toString())

  const servers = await ServerMember.find({ userId: socket.user._id }).select('serverId')
  for (const member of servers) socket.join(`server:${member.serverId.toString()}`)

  const groups = await Group.find({ memberIds: socket.user._id }).select('_id')
  for (const group of groups) socket.join(`group:${group._id.toString()}`)

  const dms = await DmThread.find({ memberIds: socket.user._id }).select('_id')
  for (const thread of dms) socket.join(`dm:${thread._id.toString()}`)

  socket.on('join_server', async serverId => {
    const member = await ServerMember.findOne({ serverId, userId: socket.user._id })
    if (member) socket.join(`server:${serverId}`)
  })

  socket.on('join_channel', async channelId => {
    const channel = await Channel.findById(channelId)
    if (!channel) return
    const member = await ServerMember.findOne({ serverId: channel.serverId, userId: socket.user._id })
    if (member) socket.join(`channel:${channelId}`)
  })

  socket.on('join_group', async groupId => {
    const group = await Group.findOne({ _id: groupId, memberIds: socket.user._id })
    if (group) socket.join(`group:${groupId}`)
  })

  socket.on('join_dm', async threadId => {
    const thread = await DmThread.findOne({ _id: threadId, memberIds: socket.user._id })
    if (thread) socket.join(`dm:${threadId}`)
  })

  socket.on('typing', data => {
    if (data?.channelId) socket.to(`channel:${data.channelId}`).emit('typing', { userId: socket.user._id, channelId: data.channelId })
    if (data?.groupId) socket.to(`group:${data.groupId}`).emit('typing', { userId: socket.user._id, groupId: data.groupId })
    if (data?.threadId) socket.to(`dm:${data.threadId}`).emit('typing', { userId: socket.user._id, threadId: data.threadId })
  })

  socket.on('disconnect', async () => {
    await User.updateOne({ _id: socket.user._id }, { $set: { lastSeenAt: new Date() } })
  })
})

async function start() {
  try {
    await mongoose.connect(MONGODB_URL)
    server.listen(PORT, () => {
      console.log(`API running on port ${PORT}`)
    })
  } catch (error) {
    console.error('MongoDB connection failed:', error.message)
    process.exit(1)
  }
}

start()