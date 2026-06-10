import { useEffect } from "react"
import { Toaster } from "./components/ui/sonner"
import { TwIndicator } from "./components/ui/tw-indicator"
import { MoonIcon, SunIcon } from "lucide-react"
import { Button } from "./components/ui/button"
import { useLocalStorage } from "./hooks/use-local-storage"

export function Layout(props: { children: React.ReactNode }) {
  const [theme, setTheme] = useLocalStorage("theme", "light")

  useEffect(() => {
    document.documentElement.setAttribute("class", theme)
  }, [theme])

  function toggleTheme() {
    setTheme(theme === "light" ? "dark" : "light")
  }

  return (
    <main className="relative h-screen flex flex-col items-center">
      <div className="container py-4">
        <div className="flex w-full pb-2 justify-between">
          <p className="font-bold tracking-tighter text-2xl font-mono">JC Solutions</p>
          <Button size="sm" variant="ghost" onClick={toggleTheme}>
            <SunIcon className="rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <MoonIcon className="absolute rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>
        </div>
        {props.children}
      </div>
      <Toaster />
      {import.meta.env.DEV && <TwIndicator />}
    </main>
  )
}
