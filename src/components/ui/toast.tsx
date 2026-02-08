import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "./button"

const toastVariants = cva(
  "relative w-full rounded-lg border px-4 py-3 text-sm shadow-lg [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg~*]:pl-7",
  {
    variants: {
      variant: {
        success:
          "bg-green-500/10 border-green-500/30 text-green-400 [&>svg]:text-green-400",
        error:
          "bg-red-500/10 border-red-500/30 text-red-400 [&>svg]:text-red-400",
        warning:
          "bg-yellow-500/10 border-yellow-500/30 text-yellow-400 [&>svg]:text-yellow-400",
        info:
          "bg-blue-500/10 border-blue-500/30 text-blue-400 [&>svg]:text-blue-400",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  }
)

const Toast = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof toastVariants> & {
    onClose?: () => void
    action?: {
      label: string
      onClick: () => void
    }
  }
>(({ className, variant, onClose, action, children, ...props }, ref) => {
  const Icon = variant === "success"
    ? CheckCircle
    : variant === "error"
    ? XCircle
    : variant === "warning"
    ? AlertTriangle
    : Info

  return (
    <div
      ref={ref}
      role="alert"
      className={cn(toastVariants({ variant }), className)}
      {...props}
    >
      <Icon className="size-5" />
      <div className="flex-1">
        {children}
        {action && (
          <Button
            variant="outline"
            size="sm"
            onClick={action.onClick}
            className="mt-2"
          >
            {action.label}
          </Button>
        )}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="ml-auto p-1 rounded-lg hover:bg-white/10 transition-colors absolute top-3 right-3"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
})
Toast.displayName = "Toast"

const ToastTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-medium leading-none tracking-tight", className)}
    {...props}
  />
))
ToastTitle.displayName = "ToastTitle"

const ToastDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm [&_p]:leading-relaxed", className)}
    {...props}
  />
))
ToastDescription.displayName = "ToastDescription"

export { Toast, ToastTitle, ToastDescription }
