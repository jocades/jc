import { useEffect, useRef, useState } from "react"

import * as dialog from "@tauri-apps/plugin-dialog"
import { Channel, convertFileSrc, invoke, InvokeArgs } from "@tauri-apps/api/core"
import { appDataDir, basename, join } from "@tauri-apps/api/path"
import { load } from "@tauri-apps/plugin-store"

import { Input } from "./components/ui/input"
import { Field, FieldError, FieldGroup, FieldLabel } from "./components/ui/field"
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
import {
  CheckIcon,
  CircleAlertIcon,
  EraserIcon,
  PlusIcon,
  SaveIcon,
  TrashIcon,
  WaypointsIcon,
  X,
} from "lucide-react"
import { Separator } from "./components/ui/separator"
import { Progress } from "./components/ui/progress"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

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
  columns: number[]
}

function Presets(props: {
  wantColumns: number[]
  onApply?: (cols: number[]) => void
  onClear?: () => void
}) {
  const [presets, setPresets] = useState<[string, Preset][]>([])
  const [selected, setSelected] = useState<[string, Preset] | null>(null)

  const [addOpen, setAddOpen] = useState(false)
  const [addName, setAddName] = useState("")

  async function load() {
    const data = await store.entries<Preset>()
    setPresets(data)
  }

  useEffect(() => {
    load()
  }, [])

  async function upsert(name: string, columns: number[], exists: boolean) {
    const item: [string, Preset] = [name, { columns }]
    await store.set(item[0], item[1])

    if (exists) {
      setPresets((prev) => prev.map((p) => (p[0] === name ? item : p)))
    } else {
      setPresets((prev) => [...prev, item])
    }

    setSelected(item)
    setAddOpen(false)
    setAddName("")
  }

  async function onAddSubmit() {
    const name = addName.trim().toLowerCase()
    if (!name) return

    if (!presets.some((p) => p[0] === name)) {
      await upsert(name, props.wantColumns, false)
      return
    }

    if (await dialog.confirm(`Preset '${name}' already exists. Replace?`)) {
      await upsert(name, props.wantColumns, true)
    }
  }

  return (
    <div className="flex justify-between">
      <div className="flex gap-x-4">
        <Combobox<[string, Preset]>
          items={presets}
          value={selected}
          onValueChange={setSelected}
          itemToStringLabel={(item) => item[0]}
        >
          <div className="flex justify-between">
            <ComboboxInput placeholder="Select a preset" showClear />
          </div>
          <ComboboxContent>
            <ComboboxEmpty>No items found.</ComboboxEmpty>
            <ComboboxList>
              {(item) => (
                <ComboboxItem key={item[0]} value={item}>
                  {item[0]}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>

        <div className="flex gap-x-1">
          <Dialog open={addOpen} onOpenChange={setAddOpen} modal={true}>
            <DialogTrigger asChild>
              <Button variant="outline" disabled={props.wantColumns.length === 0}>
                <PlusIcon />
              </Button>
            </DialogTrigger>

            <DialogContent>
              <DialogHeader>
                <DialogTitle>New preset</DialogTitle>
                <DialogDescription>
                  Create a preset for the current columns selected.
                </DialogDescription>
              </DialogHeader>
              <form
                className="flex flex-col gap-y-6"
                onSubmit={async (e) => {
                  e.preventDefault()
                  await onAddSubmit()
                }}
              >
                <Field orientation="horizontal">
                  <FieldLabel>Name</FieldLabel>
                  <Input value={addName} onChange={(e) => setAddName(e.target.value)} />
                </Field>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Cancel</Button>
                  </DialogClose>
                  <Button type="submit">Create</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Button
            variant="destructive"
            disabled={!selected}
            onClick={async () => {
              if (!selected) return
              const name = selected[0]
              if (await dialog.confirm(`Remove '${name}' preset?`)) {
                await store.delete(selected[0])
                setPresets((prev) => prev.filter((p) => p[0] !== name))
                setSelected(null)
              }
            }}
          >
            <TrashIcon />
          </Button>
        </div>
      </div>

      <div className="flex gap-x-1">
        <Button
          variant="secondary"
          disabled={!selected}
          onClick={() => {
            if (!selected) return
            props.onApply?.(selected[1].columns)
          }}
        >
          <CheckIcon />
        </Button>
        <Button
          variant="secondary"
          disabled={props.wantColumns.length === 0}
          onClick={props.onClear}
        >
          <EraserIcon />
        </Button>
      </div>
    </div>
  )
}

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
      <div className="container pt-8 max-w-4xl">
        <Card className="flex flex-col">
          <CardContent className="flex flex-col gap-y-8">
            <FieldGroup className="grid grid-cols-2">
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
            </FieldGroup>

            {loadCsv.data && (
              <>
                <Separator />

                <Field>
                  <FieldLabel>Preset</FieldLabel>
                  <Presets
                    wantColumns={wantColumns}
                    onApply={(cols) => setWantColumns(cols)}
                    onClear={() => setWantColumns([])}
                  />
                </Field>

                <FieldGroup>
                  <Field>
                    <FieldLabel className="justify-between">Columns</FieldLabel>
                    <FieldGroup className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] max-h-80 overflow-auto">
                      {loadCsv.data.map((header, i) => (
                        <Field key={header} orientation="horizontal">
                          <Checkbox
                            checked={wantColumns.includes(i)}
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
        {/* <Card className="items-center justify-center py-0"> */}
        {/*   {generate.isLoading ? ( */}
        {/*     <Spinner className="size-6 text-muted-foreground" /> */}
        {/*   ) : imageSrc ? ( */}
        {/*     <img className="object-contain w-full h-full" src={imageSrc} /> */}
        {/*   ) : ( */}
        {/*     <div className="text-muted-foreground">Image preview</div> */}
        {/*   )} */}
        {/* </Card> */}
      </div>
      <TailwindIndicator />
    </main>
  )
}
