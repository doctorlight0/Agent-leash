import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const tabsListVariants = cva(
  'inline-flex max-w-full items-center justify-start overflow-x-auto rounded-lg bg-muted p-1 text-muted-foreground'
)

const tabsTriggerVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm'
)

const tabsContentVariants = cva(
  'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
)

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string
  onValueChange?: (value: string) => void
  defaultValue?: string
  orientation?: 'horizontal' | 'vertical'
  activationMode?: 'automatic' | 'manual'
}

interface TabsListProps extends React.HTMLAttributes<HTMLDivElement> {}

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof tabsTriggerVariants> {
  value: string
}

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof tabsContentVariants> {
  value: string
  forceMount?: boolean
}

const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
  ({ className, children, value, onValueChange, defaultValue, orientation = 'horizontal', activationMode = 'automatic', ...props }, ref) => {
    const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue || '')
    const controlled = value !== undefined
    const activeValue = controlled ? value : uncontrolledValue

    const handleValueChange = (newValue: string) => {
      if (!controlled) {
        setUncontrolledValue(newValue)
      }
      onValueChange?.(newValue)
    }

    const contextValue = React.useMemo(() => ({
      value: activeValue,
      onValueChange: handleValueChange,
      orientation,
      activationMode,
    }), [activeValue, controlled, onValueChange, orientation, activationMode])

    return (
      <TabsContext.Provider value={contextValue}>
        <div ref={ref} className={cn('flex flex-col', className)} {...props}>
          {children}
        </div>
      </TabsContext.Provider>
    )
  }
)
Tabs.displayName = 'Tabs'

const TabsContext = React.createContext<{
  value: string
  onValueChange: (value: string) => void
  orientation: 'horizontal' | 'vertical'
  activationMode: 'automatic' | 'manual'
} | null>(null)

function useTabsContext() {
  const context = React.useContext(TabsContext)
  if (!context) {
    throw new Error('Tabs components must be used within Tabs')
  }
  return context
}

const TabsList = React.forwardRef<HTMLDivElement, TabsListProps>(
  ({ className, children, ...props }, ref) => {
    const { orientation } = useTabsContext()
    return (
      <div
        ref={ref}
        className={cn(tabsListVariants(), className)}
        role="tablist"
        aria-orientation={orientation}
        {...props}
      >
        {children}
      </div>
    )
  }
)
TabsList.displayName = 'TabsList'

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, value, disabled, ...props }, ref) => {
    const { value: contextValue, onValueChange, orientation, activationMode } = useTabsContext()
    const isActive = contextValue === value

    return (
      <button
        ref={ref}
        className={cn(tabsTriggerVariants({ className }))}
        role="tab"
        aria-selected={isActive}
        aria-disabled={disabled}
        data-state={isActive ? 'active' : 'inactive'}
        data-orientation={orientation}
        onClick={() => !disabled && onValueChange(value)}
        {...props}
      />
    )
  }
)
TabsTrigger.displayName = 'TabsTrigger'

const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ className, value, forceMount, children, ...props }, ref) => {
    const { value: contextValue } = useTabsContext()
    const isActive = contextValue === value

    if (!forceMount && !isActive) {
      return null
    }

    return (
      <div
        ref={ref}
        className={cn(tabsContentVariants(), className)}
        role="tabpanel"
        hidden={!isActive}
        {...props}
      >
        {isActive && children}
      </div>
    )
  }
)
TabsContent.displayName = 'TabsContent'

export { Tabs, TabsList, TabsTrigger, TabsContent }
