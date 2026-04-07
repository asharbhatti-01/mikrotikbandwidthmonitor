import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-zinc-800 text-zinc-100',
        success: 'bg-emerald-900/50 text-emerald-400 border border-emerald-800',
        destructive: 'bg-red-900/50 text-red-400 border border-red-800',
        warning: 'bg-amber-900/50 text-amber-400 border border-amber-800',
        secondary: 'bg-zinc-700 text-zinc-300',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
