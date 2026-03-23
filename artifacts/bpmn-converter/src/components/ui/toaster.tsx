import { useToast } from "./use-toast"
import { motion, AnimatePresence } from "framer-motion"
import { AlertCircle, CheckCircle2, X } from "lucide-react"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-full max-w-sm">
      <AnimatePresence>
        {toasts.map((toast, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`
              flex items-start gap-3 p-4 rounded-xl shadow-lg border
              ${toast.variant === 'destructive' 
                ? 'bg-destructive/10 border-destructive/20 text-destructive' 
                : 'bg-card border-border text-foreground'}
            `}
          >
            {toast.variant === 'destructive' ? (
              <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
            ) : (
              <CheckCircle2 className="w-5 h-5 mt-0.5 text-primary shrink-0" />
            )}
            <div className="flex-1">
              {toast.title && <h3 className="font-semibold text-sm">{toast.title}</h3>}
              {toast.description && <p className="text-sm opacity-90 mt-1">{toast.description}</p>}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
