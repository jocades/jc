import { useState } from "react"
import { invoke, InvokeArgs } from "@tauri-apps/api/core"

export function useIPC<T>(
  name: string,
  opts?: {
    onSend?: (args: InvokeArgs) => void
    onEnd?: () => void
    onSuccess?: (data: T) => void
    onError?: (err: string) => void
  },
) {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<string>()
  const [isLoading, setIsLoading] = useState(false)

  async function send(args: InvokeArgs) {
    setError(undefined)
    setIsLoading(true)
    try {
      opts?.onSend?.(args)
      const res = await invoke<T>(name, args)
      setData(res)
      opts?.onSuccess?.(res)
    } catch (err: any) {
      setError(err)
      setData(undefined)
      opts?.onError?.(err)
    } finally {
      opts?.onEnd?.()
      setIsLoading(false)
    }
  }

  return {
    send,
    data,
    error,
    isLoading,
  }
}
