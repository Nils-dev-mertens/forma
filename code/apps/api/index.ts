import express from "express"
import type { RequestHandler } from "express"
import { getData } from "@repo/db"
import { get } from "@repo/auth"

const app = express()

const Logger: RequestHandler = (req, res, next) => {
  console.log("there was an action " + req.baseUrl)
  next()
}

app.use(Logger)

app.get("/", async (req, res) => {
  try {
    const data = await getData()
    res.json(data)
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to fetch shared data",
    })
  }
})

app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000')
})