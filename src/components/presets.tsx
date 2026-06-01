import { appDataDir, join } from "@tauri-apps/api/path"
import { load } from "@tauri-apps/plugin-store"
import { confirm } from "@tauri-apps/plugin-dialog"

import { useEffect, useState } from "react"

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
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
import { CheckIcon, EraserIcon, PlusIcon, TrashIcon } from "lucide-react"
import { Button } from "./ui/button"
import { Field, FieldLabel } from "./ui/field"
import { Input } from "./ui/input"

const store = await load(await join(await appDataDir(), "presets.json"))

interface Preset {
  columns: number[]
}

export function Presets(props: {
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

    if (await confirm(`Preset '${name}' already exists. Replace?`)) {
      await upsert(name, props.wantColumns, true)
    }
  }

  return (
    <div className="flex justify-between">
      <div className="flex gap-x-4">
        <Combobox<[string, Preset]>
          items={presets}
          value={selected}
          onValueChange={(v) => {
            console.log("onValueChange", v)
            setSelected(v)
          }}
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
            disabled={!selected || !selected[0]}
            onClick={async () => {
              if (!selected) return
              const name = selected[0]
              if (await confirm(`Remove '${name}' preset?`)) {
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
          disabled={!selected || !selected[0]}
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
