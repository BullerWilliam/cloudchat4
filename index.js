const express = require("express")

const app = express()

const PORT = process.env.PORT || 3000

app.get("/health", (req, res) => {
    res.json({ status: "ok" })
})

app.get("/time", (req, res) => {
    res.json({ time: new Date().toISOString() })
})

app.get("/random", (req, res) => {
    res.json({ random: Math.random() })
})

app.get("/status", (req, res) => {
    res.json({
        status: "running",
        uptime: process.uptime(),
        timestamp: Date.now()
    })
})

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})