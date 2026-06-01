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

export function App() {
  const [csvPath, setCsvPath] = useState<string>()
  const [imagePaths, setImagePaths] = useState<string[]>([])
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
    onSend: () => {
      setError(null)
      setImageSrc(null)
    },
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
    if (!validate()) return
    console.log({ csvPath, imagePath: imagePaths[0], wantColumns })

    setImageSrc(undefined)
    await preview.send({
      imagePath: imagePaths[0],
      columns: wantColumns,
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

    await generate.send({
      imagePaths,
      columns: wantColumns,
      outDir,
      onProgress: onProgress.current,
    })
  }

  return (
    <Layout>
      <div className="container py-8 max-w-4xl">
        <Card>
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

        {imageSrc && <img src={imageSrc} className="pt-4" />}
      </div>
    </Layout>
  )
}
