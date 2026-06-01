export type ExampleItem = {
  userId: number
  id: number
  title: string
  body: string
}

export async function getData(): Promise<ExampleItem> {
  const response = await fetch("https://jsonplaceholder.typicode.com/posts/1")

  if (!response.ok) {
    throw new Error(`Failed to fetch data: ${response.status}`)
  }

  return response.json()
}
