import { useEffect, useState } from "react"

export function useLocalStorage<T>(key: string, init: T) {
  const [data, setData] = useState<T>(init)

  function load() {
    const value = localStorage.getItem(key)
    if (value) setData(JSON.parse(value))
  }

  function store(data: T) {
    localStorage.setItem(key, JSON.stringify(data))
    setData(data)
  }

  useEffect(() => {
    load()
  }, [])

  return [data, store] as const
}
