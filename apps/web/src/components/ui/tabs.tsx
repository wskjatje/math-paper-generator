import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

type TabsVariant = "default" | "portal";

type TabsListProps = React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & {
  /** portal：设置/课堂/运维等产品页签（可换行，不改选中逻辑） */
  variant?: TabsVariant;
};

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  TabsListProps
>(({ className, variant = "default", ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center rounded-lg text-muted-foreground",
      variant === "default" && "h-9 bg-muted p-1",
      variant === "portal" &&
        "h-auto min-h-10 w-full flex-wrap justify-start gap-1 border border-border/70 bg-muted/35 p-1 shadow-sm sm:w-auto",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

type TabsTriggerProps = React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & {
  variant?: TabsVariant;
};

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  TabsTriggerProps
>(({ className, variant = "default", ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium ring-offset-background transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      "disabled:pointer-events-none disabled:opacity-50",
      "data-[state=active]:text-foreground",
      variant === "default" &&
        "px-3 py-1 text-sm data-[state=active]:bg-background data-[state=active]:shadow",
      variant === "portal" &&
        "px-3.5 py-1.5 text-sm data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-accent/40 data-[state=inactive]:hover:text-foreground",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
