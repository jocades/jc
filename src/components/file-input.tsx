import { basename } from "@tauri-apps/api/path"
import { OpenDialogOptions, open } from "@tauri-apps/plugin-dialog"

import { useRef } from "react"
import { ButtonGroup } from "./ui/button-group"
import { Button } from "./ui/button"
import { Input } from "./ui/input"

export function FileInput(props: OpenDialogOptions & { onChange?: (paths: string[]) => void }) {
  const ref = useRef<HTMLInputElement>(null)

  async function onClick() {
    let paths: string | string[] | null = await open(props)

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
