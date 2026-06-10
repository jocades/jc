import * as dialog from "@tauri-apps/plugin-dialog"
import { Channel, convertFileSrc } from "@tauri-apps/api/core"
import { openPath } from "@tauri-apps/plugin-opener"

import { useIPC } from "@/hooks/use-ipc"

import { useRef, useState } from "react"
import { Layout } from "./layout"
import { Button } from "./components/ui/button"
import { Field, FieldGroup, FieldLabel } from "./components/ui/field"
import { Card, CardContent, CardFooter } from "./components/ui/card"
import { Checkbox } from "./components/ui/checkbox"
import { Label } from "./components/ui/label"
import { Spinner } from "./components/ui/spinner"
import { Separator } from "./components/ui/separator"
import { Progress } from "./components/ui/progress"
import { CircleAlertIcon } from "lucide-react"
import { FileInput } from "@/components/file-input"
import { toast } from "sonner"
import { Presets } from "@/components/presets"
import { Compact as ColorPicker, hexToRgba } from "@uiw/react-color"
import { Popover, PopoverContent, PopoverTrigger } from "./components/ui/popover"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "./lib/utils"
import { useLocalStorage } from "./hooks/use-local-storage"

export function App() {
  const [csvPath, setCsvPath] = useState<string>()
  const [imagePaths, setImagePaths] = useState<string[]>([])
  const [textColor, setTextColor] = useLocalStorage("textColor", "#fcdc00")
  const [rotation, setRotation] = useState(0)

  const [wantColumns, setWantColumns] = useState<number[]>([])

  const [imageSrc, setImageSrc] = useState<string | null>()
  const [error, setError] = useState<string | null>()

  const onProgress = useRef<Channel<number>>(null)
  const [progress, setProgress] = useState(0)

  const onError = (e: string) => setError(e)

  const loadCsv = useIPC<string[]>("load_csv", {
    onSend: () => setError(null),
    onSuccess: () => setWantColumns([]),
    onError,
  })

  const preview = useIPC<string>("preview", {
    onSend: () => setError(null),
    onSuccess: (path) => setImageSrc(convertFileSrc(path) + "?v=" + Date.now()),
    onError,
  })

  const generate = useIPC<string>("generate", {
    onSend: () => setError(null),
    onSuccess: (outDir) => {
      toast.info(`Generated ${imagePaths.length} images.`, {
        action: {
          label: "Open",
          onClick: () => openPath(outDir),
        },
      })
    },
    onEnd: () => {
      setProgress(0)
      onProgress.current = null
    },
    onError,
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

  async function onPreview() {
    console.log({ csvPath, imagePath: imagePaths[0], wantColumns, textColor, rotation })

    if (!validate()) return

    const { r, g, b } = hexToRgba(textColor)
    await preview.send({
      imagePath: imagePaths[0],
      options: {
        columns: wantColumns,
        textColor: [r, g, b],
        rotation,
      },
    })
  }

  async function onGenerate() {
    console.log({ csvPath, imagePaths, wantColumns })

    if (!validate()) return

    const outDir = await dialog.open({
      directory: true,
      canCreateDirectories: true,
    })
    if (!outDir) return

    onProgress.current = new Channel()
    onProgress.current.onmessage = (n) => setProgress(n)

    const { r, g, b } = hexToRgba(textColor)

    await generate.send({
      imagePaths,
      options: {
        columns: wantColumns,
        textColor: [r, g, b],
        rotation,
      },
      outDir,
      onProgress: onProgress.current,
    })
  }

  return (
    <Layout>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)] gap-4">
        <Card>
          <CardContent className="flex flex-col gap-y-8">
            <FieldGroup className="grid sm:grid-cols-2 grid-cols-1">
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

            <FieldGroup className="grid grid-cols-2">
              <Field>
                <FieldLabel>Text color</FieldLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button style={{ backgroundColor: textColor }}>
                      {textColor.toUpperCase()}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-auto">
                    <ColorPicker color={textColor} onChange={(color) => setTextColor(color.hex)} />
                  </PopoverContent>
                </Popover>
              </Field>
              <Field>
                <FieldLabel>Rotation</FieldLabel>
                <Select value={rotation.toString()} onValueChange={(v) => setRotation(parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a fruit" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectGroup>
                      {["0", "90", "180", "270"].map((value, index) => (
                        <SelectItem key={value} value={index.toString()}>
                          {value}°
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>

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
                <FieldLabel>Columns</FieldLabel>
                {loadCsv.data ? (
                  <FieldGroup className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] max-h-72 overflow-auto bg-muted/50 p-2">
                    {loadCsv.data.map((header, i) => (
                      <Field key={header} orientation="horizontal">
                        <Checkbox
                          checked={wantColumns.includes(i)}
                          onCheckedChange={(v) => {
                            v
                              ? setWantColumns((prev) => [...prev, i])
                              : setWantColumns((prev) => prev.filter((n) => n !== i))
                          }}
                        />
                        <Label>{header}</Label>
                      </Field>
                    ))}
                  </FieldGroup>
                ) : (
                  <div className="bg-muted/50 p-2 rounded h-72 text-muted-foreground">
                    Add a CSV to select columns.
                  </div>
                )}
              </Field>
            </FieldGroup>

            {error && (
              <div className="text-destructive flex items-center gap-x-2">
                <CircleAlertIcon />
                <span>{error}</span>
              </div>
            )}
            <Separator />
          </CardContent>

          <CardFooter className="gap-x-4">
            <Button onClick={onPreview} disabled={preview.isLoading}>
              {preview.isLoading && <Spinner />}
              Preview
            </Button>
            <Button onClick={onGenerate} disabled={generate.isLoading}>
              {generate.isLoading && <Spinner />}
              Generate
            </Button>
            {generate.isLoading && (
              <Field>
                <FieldLabel>
                  <span>Generating...</span>
                  <span className="ml-auto">
                    {progress} / {imagePaths.length}
                  </span>
                </FieldLabel>
                <Progress value={(progress / imagePaths.length) * 100} />
              </Field>
            )}
          </CardFooter>
        </Card>

        <div className="relative h-full min-h-[28rem] lg:min-h-[36rem] border flex items-center justify-center bg-muted/40 rounded">
          {imageSrc ? (
            <img src={imageSrc} className="max-h-[70vh] object-contain" />
          ) : (
            <p className="text-muted-foreground text-sm">Preview</p>
          )}
          <div
            className={cn(
              "absolute inset-0 flex items-center justify-center bg-muted/40 backdrop-blur-[1px] transition-opacity",
              preview.isLoading ? "opacity-100" : "opacity-0 pointer-events-none",
            )}
          >
            <Spinner className="size-6" />
          </div>
        </div>
      </div>
    </Layout>
  )
}
