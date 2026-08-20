import { createServerFn } from "@tanstack/react-start"
import { GenerateKey } from "@repo/auth"

export const performAction = createServerFn().handler(async () => {
  return await GenerateKey()
})
