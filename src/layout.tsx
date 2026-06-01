import { Toaster } from "./components/ui/sonner"

export function Layout(props: { children: React.ReactNode }) {
  return (
    <main className="relative h-screen flex flex-col items-center">
      {props.children}
      <Toaster />
    </main>
  )
}
