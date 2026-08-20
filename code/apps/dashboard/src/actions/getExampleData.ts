import { createServerFn } from "@tanstack/react-start"
import { getData } from "@repo/db"

export const getExampleData = createServerFn().handler(async () => {
  return await getData()
})
