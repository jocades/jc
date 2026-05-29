import { useRef, useState } from "react"

import * as dialog from "@tauri-apps/plugin-dialog"
import { convertFileSrc, invoke, InvokeArgs } from "@tauri-apps/api/core"
import { basename } from "@tauri-apps/api/path"

import { Input } from "./components/ui/input"
import { Field, FieldGroup, FieldLabel } from "./components/ui/field"
import { Card, CardContent, CardFooter } from "./components/ui/card"
import { Button } from "./components/ui/button"
import { ButtonGroup } from "./components/ui/button-group"
import { Checkbox } from "./components/ui/checkbox"
import { Label } from "./components/ui/label"
import { Spinner } from "./components/ui/spinner"
import { CircleAlertIcon, SaveIcon } from "lucide-react"

export function TailwindIndicator() {
  return (
    <div className="fixed bottom-1 left-1 z-50 flex h-6 w-6 items-center justify-center rounded-full bg-gray-800 p-3 font-mono text-xs text-white">
      <div className="block sm:hidden">xs</div>
      <div className="hidden sm:block md:hidden lg:hidden xl:hidden 2xl:hidden">sm</div>
      <div className="hidden md:block lg:hidden xl:hidden 2xl:hidden">md</div>
      <div className="hidden lg:block xl:hidden 2xl:hidden">lg</div>
      <div className="hidden xl:block 2xl:hidden">xl</div>
      <div className="hidden 2xl:block">2xl</div>
    </div>
  )
}

function FileInput(props: dialog.OpenDialogOptions & { onChange?: (path?: string) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <ButtonGroup>
      <Button
        variant="secondary"
        onClick={async () => {
          const path = await dialog.open(props)
          ref.current!.value = path ? await basename(path) : ""
          props.onChange?.(path || undefined)
        }}
      >
        Choose file
      </Button>
      <Input ref={ref} disabled={true} />
    </ButtonGroup>
  )
}

function useIPC<T>(
  name: string,
  opts?: {
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
      const res = await invoke<T>(name, args)
      setData(res)
      opts?.onSuccess?.(res)
    } catch (err: any) {
      setError(err)
      setData(undefined)
      opts?.onError?.(err)
    }
    setIsLoading(false)
  }

  return {
    send,
    data,
    error,
    isLoading,
  }
}

export function App() {
  const [csvPath, setCsvPath] = useState<string>()
  const [imagePath, setImagePath] = useState<string>()
  const [wantHeaders, setWantHeaders] = useState<number[]>([])
  const [imageSrc, setImageSrc] = useState<string>()
  const [error, setError] = useState<string>()

  const headers = useIPC<string[]>("load_csv", {
    onSuccess() {
      setWantHeaders([])
    },
    onError(err) {
      setError(err)
    },
  })

  const generate = useIPC<string>("generate", {
    onSuccess(path) {
      setImageSrc(convertFileSrc(path))
    },
    onError(err) {
      setError(err)
    },
  })

  const saveOnDisk = useIPC<string>("save", {
    onSuccess(dest) {
      console.log(`saved at ${dest}`)
    },
    onError(err) {
      setError(err)
    },
  })

  async function onSubmit() {
    if (!imagePath && !csvPath) {
      setError("Provide both an image and a CSV.")
      return
    }

    if (wantHeaders.length === 0) {
      setError("Must select headers")
      return
    }

    const indices = wantHeaders.sort((a, b) => a - b)
    await generate.send({ imagePath, indices })
  }

  return (
    <main className="relative h-screen flex flex-col items-center">
      <div className="container grid grid-cols-1 lg:grid-cols-2 pt-8 gap-4">
        <Card className="flex flex-col h-full">
          <CardContent className="flex flex-col gap-y-8">
            <FieldGroup className="grid grid-cols-2">
              <Field>
                <FieldLabel>Log file</FieldLabel>
                <FileInput
                  onChange={async (path) => {
                    if (path !== csvPath) {
                      setCsvPath(path)
                      await headers.send({ path })
                    }
                  }}
                />
              </Field>
              <Field>
                <FieldLabel>Image</FieldLabel>
                <FileInput
                  filters={[
                    {
                      name: "images",
                      extensions: ["jpg", "jpeg", "png", "webp"],
                    },
                  ]}
                  onChange={(path) => {
                    if (path !== imagePath) {
                      setImagePath(path)
                    }
                  }}
                />
              </Field>
            </FieldGroup>

            {headers.data && (
              <FieldGroup>
                <Field>
                  <FieldLabel>Headers</FieldLabel>
                  <FieldGroup className="grid grid-cols-[repeat(auto-fit,minmax(100px,1fr))] max-h-52 overflow-auto">
                    {headers.data.map((header, i) => (
                      <Field key={header} orientation="horizontal">
                        <Checkbox
                          onCheckedChange={(v) => {
                            if (v) {
                              setWantHeaders((prev) => [...prev, i])
                            } else {
                              setWantHeaders((prev) => prev.filter((n) => n !== i))
                            }
                          }}
                        />
                        <Label>{header}</Label>
                      </Field>
                    ))}
                  </FieldGroup>
                </Field>
              </FieldGroup>
            )}
            {error && (
              <div className="text-destructive flex items-center gap-x-2">
                <CircleAlertIcon />
                <span>{error}</span>
              </div>
            )}
          </CardContent>
          <CardFooter className="justify-between">
            <Button onClick={onSubmit} disabled={generate.isLoading}>
              {generate.isLoading && <Spinner />}
              Generate
            </Button>
            <Button
              disabled={!imageSrc}
              onClick={async () => {
                const dest = await dialog.save({
                  canCreateDirectories: true,
                  filters: [{ name: "filter", extensions: ["png"] }],
                })
                if (!dest) return
                await saveOnDisk.send({ dest })
              }}
            >
              <SaveIcon />
              Save
            </Button>
          </CardFooter>
        </Card>
        <Card className="relative py-0">
          {imageSrc ? (
            <img className="object-cover w-full h-full" src={imageSrc} />
          ) : (
            <div className="flex w-full h-full items-center justify-center text-muted-foreground self-auto">
              Image preview
            </div>
          )}
        </Card>
      </div>
      <TailwindIndicator />
    </main>
  )
}
