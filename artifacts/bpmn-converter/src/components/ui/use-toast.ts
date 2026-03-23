import { useState, useEffect } from "react"

export interface ToastProps {
  title?: string
  description?: string
  variant?: "default" | "destructive"
}

let subscribers: ((toast: ToastProps) => void)[] = []

export function toast(props: ToastProps) {
  subscribers.forEach((sub) => sub(props))
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastProps[]>([])

  useEffect(() => {
    const subscriber = (t: ToastProps) => {
      setToasts((prev) => [...prev, t])
      setTimeout(() => {
        setToasts((prev) => prev.slice(1))
      }, 3000)
    }
    subscribers.push(subscriber)
    return () => {
      subscribers = subscribers.filter((s) => s !== subscriber)
    }
  }, [])

  return { toast, toasts }
}
