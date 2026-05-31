import { useEffect, useRef, useState } from "react"

import * as dialog from "@tauri-apps/plugin-dialog"
import { Channel, convertFileSrc, invoke, InvokeArgs } from "@tauri-apps/api/core"
import { appDataDir, basename, join } from "@tauri-apps/api/path"
import { load } from "@tauri-apps/plugin-store"

import { Input } from "./components/ui/input"
import { Field, FieldGroup, FieldLabel } from "./components/ui/field"
import { Card, CardContent, CardFooter } from "./components/ui/card"
import { Button } from "./components/ui/button"
import { ButtonGroup } from "./components/ui/button-group"
import { Checkbox } from "./components/ui/checkbox"
import { Label } from "./components/ui/label"
import { Spinner } from "./components/ui/spinner"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { CircleAlertIcon, PlusIcon, SaveIcon, TrashIcon, X } from "lucide-react"
import { Separator } from "./components/ui/separator"
import { Progress } from "./components/ui/progress"

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

function FileInput(props: dialog.OpenDialogOptions & { onChange?: (paths: string[]) => void }) {
  const ref = useRef<HTMLInputElement>(null)

  async function onClick() {
    let paths: string | string[] | null = await dialog.open(props)

    if (!paths) return

    if (!Array.isArray(paths)) {
      paths = [paths]
    }

    props?.onChange?.(paths)

    if (ref.current) {
      const names = await Promise.all(paths.map((path) => basename(path)))
      ref.current.value = names.join(", ")
    }
  }

  return (
    <ButtonGroup>
      <Button variant="secondary" onClick={onClick}>
        Choose file
      </Button>
      <Input ref={ref} disabled={true} className="truncate" />
    </ButtonGroup>
  )
}

function useIPC<T>(
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
    }
    opts?.onEnd?.()
    setIsLoading(false)
  }

  return {
    send,
    data,
    error,
    isLoading,
  }
}

const store = await load(await join(await appDataDir(), "presets.json"))

interface Preset {
  headers: number[]
}

function usePresets() {
  const [presets, setPresets] = useState<[key: string, val: Preset][]>([])

  async function load() {
    const data = await store.entries<Preset>()
    setPresets(data)
  }

  useEffect(() => {
    load()
  }, [])

  return {
    presets,
  }
}

interface Item {
  name: string
  creatable?: string
}

const initItems: Item[] = [{ name: "platoon" }, { name: "bellamente" }, { name: "swan" }]

function Presets() {
  const [items, setItems] = useState(initItems)
  // const [selected, setSelected] = useState<string>()
  const [query, setQuery] = useState("")

  return (
    <Combobox<Item>
      items={items}
      itemToStringLabel={(item) => item.name}
      onValueChange={(item) => {
        console.log(item)
      }}
      // inputValue={query}
      // onInputValueChange={setQuery}
    >
      <div className="flex justify-between">
        <ComboboxInput placeholder="Select a preset" />
        {/* <Button variant="destructive" disabled={!selected}> */}
        {/*   <TrashIcon /> */}
        {/* </Button> */}
      </div>
      <ComboboxContent>
        <ComboboxEmpty>No items found.</ComboboxEmpty>
        <ComboboxList>
          {(item: Item) => (
            <ComboboxItem key={item.name} value={item}>
              {item.name}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

const frameworks = ["Next.js", "SvelteKit", "Nuxt.js", "Remix", "Astro"] as const

export function ComboboxBasic() {
  return (
    <Combobox items={frameworks} onInputValueChange={(e) => console.log(e)}>
      <ComboboxInput placeholder="Select a framework" />
      <ComboboxContent>
        <ComboboxEmpty>No items found.</ComboboxEmpty>
        <ComboboxList>
          {(item) => (
            <ComboboxItem key={item} value={item}>
              {item}
              <TrashIcon
                className="border rounded"
                onClick={(e) => {
                  e.stopPropagation()
                  console.log("click")
                }}
              />
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

// const onProgress = new Channel<number>()

export function App() {
  const [csvPath, setCsvPath] = useState<string>()
  const [imagePaths, setImagePaths] = useState<string[]>([])
  const [wantColumns, setWantColumns] = useState<number[]>([])

  const [imageSrc, setImageSrc] = useState<string>()
  const [error, setError] = useState<string | null>()

  const onProgress = useRef<Channel<number>>(null)
  const [progress, setProgress] = useState(0)

  const loadCsv = useIPC<string[]>("load_csv", {
    onSend: () => setError(null),
    onSuccess: () => setWantColumns([]),
    onError: (e) => setError(e),
  })

  const generate = useIPC<string>("generate", {
    onSend: () => setError(null),
    onSuccess: () => {},
    onError: (e) => setError(e),
    onEnd: () => {
      setProgress(0)
      onProgress.current = null
    },
  })

  const save = useIPC<string>("save", {
    onError: (e) => setError(e),
  })

  async function onCsvPath(paths: string[]) {
    const path = paths[0]
    if (path && path !== csvPath) {
      setCsvPath(path)
      await loadCsv.send({ path })
    }
  }

  async function onImagePaths(paths: string[]) {
    setImagePaths(paths)
  }

  function validate() {
    if (!csvPath || imagePaths.length === 0) {
      setError("Please provide both CSV and image(s).")
      return false
    }

    if (wantColumns.length === 0) {
      setError("Please select columns.")
      return false
    }

    return true
  }

  function onPreview() {
    if (!validate()) return
  }

  async function onGenerate() {
    console.log({ csvPath, imagePaths, wantColumns })

    if (!validate()) return

    const columns = wantColumns.sort((a, b) => a - b)

    onProgress.current = new Channel()
    onProgress.current.onmessage = (n) => setProgress(n)

    await generate.send({ imagePaths, columns, onProgress: onProgress.current })
  }

  return (
    <main className="relative h-screen flex flex-col items-center">
      <div className="container grid grid-cols-1 lg:grid-cols-2 pt-8 gap-4">
        <Card className="flex flex-col">
          <CardContent className="flex flex-col gap-y-8">
            {/* <ComboboxBasic /> */}

            <Button
              onClick={async () => {
                const paths = await dialog.open({ multiple: true })
                console.log(paths)
              }}
            >
              Batch
            </Button>

            {/* <FieldGroup className="grid grid-cols-2"> */}
            <Field>
              <FieldLabel>CSV</FieldLabel>
              <FileInput onChange={onCsvPath} />
            </Field>

            <Field>
              <FieldLabel>Images</FieldLabel>
              <FileInput
                multiple={true}
                onChange={onImagePaths}
                filters={[{ name: "images", extensions: ["jpg", "jpeg", "png", "webp"] }]}
              />
            </Field>
            {/* </FieldGroup> */}

            {/* <FieldGroup className="grid grid-cols-2"> */}
            {/*   <Field> */}
            {/*     <FieldLabel>Time</FieldLabel> */}
            {/*     <Input */}
            {/*       type="time" */}
            {/*       step={1} */}
            {/*       value={time} */}
            {/*       onChange={(e) => { */}
            {/*         setTime(e.target.value) */}
            {/*         setTimeTouched(true) */}
            {/*       }} */}
            {/*     /> */}
            {/*   </Field> */}
            {/* </FieldGroup> */}

            <Separator />

            <Field>
              <FieldLabel>Preset</FieldLabel>
              <Presets />
            </Field>

            {loadCsv.data && (
              <>
                <Separator />
                <FieldGroup>
                  <Field>
                    <FieldLabel className="justify-between">Columns</FieldLabel>
                    <FieldGroup className="grid grid-cols-[repeat(auto-fit,minmax(100px,1fr))] max-h-64 overflow-auto">
                      {loadCsv.data.map((header, i) => (
                        <Field key={header} orientation="horizontal">
                          <Checkbox
                            onCheckedChange={(v) => {
                              if (v) {
                                setWantColumns((prev) => [...prev, i])
                              } else {
                                setWantColumns((prev) => prev.filter((n) => n !== i))
                              }
                            }}
                          />
                          <Label>{header}</Label>
                        </Field>
                      ))}
                    </FieldGroup>
                  </Field>
                </FieldGroup>
              </>
            )}

            {error && (
              <div className="text-destructive flex items-center gap-x-2">
                <CircleAlertIcon />
                <span>{error}</span>
              </div>
            )}

            <Separator />
          </CardContent>

          <CardFooter className="gap-x-4">
            <Button onClick={onGenerate} disabled={generate.isLoading}>
              {generate.isLoading && <Spinner />}
              Generate
            </Button>
            {generate.isLoading && (
              <Field>
                <FieldLabel>
                  <span>Generating...</span>
                  <span className="ml-auto">{progress} / 5</span>
                </FieldLabel>
                <Progress value={(progress / 5) * 100} />
              </Field>
            )}
            <div className="flex justify-between">
              {/* <Button */}
              {/*   disabled={!imageSrc} */}
              {/*   onClick={async () => { */}
              {/*     const dest = await dialog.save({ */}
              {/*       canCreateDirectories: true, */}
              {/*       filters: [{ name: "filter", extensions: ["png"] }], */}
              {/*     }) */}
              {/*     if (!dest) return */}
              {/*     await save.send({ dest }) */}
              {/*   }} */}
              {/* > */}
              {/*   <SaveIcon /> */}
              {/*   Save */}
              {/* </Button> */}
            </div>
          </CardFooter>
        </Card>
        <Card className="items-center justify-center py-0">
          {generate.isLoading ? (
            <Spinner className="size-6 text-muted-foreground" />
          ) : imageSrc ? (
            <img className="object-contain w-full h-full" src={imageSrc} />
          ) : (
            <div className="text-muted-foreground">Image preview</div>
          )}
        </Card>
      </div>
      <TailwindIndicator />
    </main>
  )
}
