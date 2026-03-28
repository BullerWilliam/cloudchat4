const express = require("express")

const app = express()

const PORT = process.env.PORT || 3000

// Fun data arrays
const jokes = [
  "Why don't scientists trust atoms? Because they make up everything!",
  "Why did the scarecrow win an award? He was outstanding in his field!",
  "What do you call fake spaghetti? An impasta!",
  "Why did the math book look sad? Because it had too many problems.",
  "How does a penguin build its house? Igloos it together!"
];

const compliments = [
  "You are absolutely brilliant!",
  "Your smile lights up the room!",
  "You're doing an amazing job!",
  "You have incredible energy!",
  "You're one of a kind!"
];

const insults = [
  "You're like a cloud... when you disappear, it's a beautiful day!",
  "If you were any slower, you'd be going backward.",
  "You're the reason they put instructions on shampoo bottles.",
  "You bring everyone so much joy... when you leave the room.",
  "I bet your brain feels as good as new, since you never use it."
];

const magic8ball = [
  "It is certain.",
  "It is decidedly so.",
  "Without a doubt.",
  "Yes definitely.",
  "You may rely on it.",
  "As I see it, yes.",
  "Most likely.",
  "Outlook good.",
  "Yes.",
  "Signs point to yes.",
  "Reply hazy, try again.",
  "Ask again later.",
  "Better not tell you now.",
  "Cannot predict now.",
  "Concentrate and ask again.",
  "Don't count on it.",
  "My reply is no.",
  "My sources say no.",
  "Outlook not so good.",
  "Very doubtful."
];

const fortunes = [
  "A beautiful, smart, and loving person will be coming into your life.",
  "A lifetime of happiness lies ahead of you.",
  "All your hard work will soon pay off.",
  "Do not fear what you don't understand.",
  "Fortune favors the bold.",
  "Good news will come to you by mail.",
  "Great things are on the horizon.",
  "Now is a good time to expand your knowledge.",
  "You will have a long and happy life."
];

function getRandomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

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

// Fun endpoints
app.get("/joke", (req, res) => {
    res.json({ message: getRandomItem(jokes) })
})

app.get("/compliment", (req, res) => {
    res.json({ message: getRandomItem(compliments) })
})

app.get("/insult", (req, res) => {
    res.json({ message: getRandomItem(insults) })
})

app.get("/magic8ball/:question", (req, res) => {
    res.json({ message: getRandomItem(magic8ball) })
})

app.get("/coinflip", (req, res) => {
    const flip = Math.random() < 0.5 ? "Heads" : "Tails";
    res.json({ result: flip })
})

app.get("/fortune", (req, res) => {
    res.json({ message: getRandomItem(fortunes) })
})

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})
