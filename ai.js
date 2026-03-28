import express from "express"
import { v4 as uuidv4 } from "uuid"
import cors from "cors"
import { InferenceClient } from "@huggingface/inference"

const app = express()
app.use(express.json())
app.use(cors())

const PORT = 8000

const client = new InferenceClient(process.env.HF_TOKEN || "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")

let chats = {}

app.get("/", (req, res) => {
    res.json({ status: "running", port: PORT })
})

app.post("/chat/create", (req, res) => {
    const id = uuidv4()
    chats[id] = []
    res.json({ chatId: id })
})

app.delete("/chat/:id", (req, res) => {
    const id = req.params.id
    if (!chats[id]) return res.status(404).json({ error: "not found" })
    delete chats[id]
    res.json({ success: true })
})

app.get("/chat/:id", (req, res) => {
    const id = req.params.id
    if (!chats[id]) return res.status(404).json({ error: "not found" })
    res.json({ messages: chats[id] })
})

app.post("/chat/:id/message", async (req, res) => {
    const id = req.params.id
    const { message } = req.body

    if (!chats[id]) return res.status(404).json({ error: "not found" })
    if (!message) return res.status(400).json({ error: "no message" })

    chats[id].push({ role: "user", content: message })

    try {
        const response = await client.chatCompletion({
            model: "meta-llama/Meta-Llama-3-8B-Instruct",
            messages: chats[id],
            max_tokens: 100,
            temperature: 0.7
        })

        const reply = response.choices[0].message.content

        chats[id].push({ role: "assistant", content: reply })

        res.json({ reply })
    } catch (e) {
        console.error("AI Error:", e)
        res.status(500).json({ error: "ai error" })
    }
})

app.get("/chats", (req, res) => {
    res.json({ chats: Object.keys(chats) })
})

app.get("/chat/:id/export", (req, res) => {
    const id = req.params.id
    if (!chats[id]) return res.status(404).json({ error: "not found" })
    res.json({ id, messages: chats[id] })
})

app.post("/chat/import", (req, res) => {
    const { id, messages } = req.body

    if (!messages) return res.status(400).json({ error: "no data" })

    const newId = id || uuidv4()
    chats[newId] = messages

    res.json({ chatId: newId })
})

app.listen(PORT, "0.0.0.0", () => {
    console.log("Server running on port", PORT)
})