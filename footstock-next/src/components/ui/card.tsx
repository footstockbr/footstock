import { forwardRef } from "react";
import { cn } from "@/lib/utils";

const Card = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    elevated?: boolean;
    clickable?: boolean;
  }
>(({ className, elevated, clickable, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-lg border p-4 transition-all duration-150",
      elevated
        ? "bg-[#161d28] border-[rgba(201,168,76,.25)] shadow-lg"
        : "bg-[#141210] border-[rgba(201,168,76,.18)] shadow-sm",
      clickable &&
        "cursor-pointer hover:border-[rgba(201,168,76,.35)] hover:bg-[rgba(201,168,76,.04)]",
      className
    )}
    {...props}
  />
));
Card.displayName = "Card";

const CardHeader = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col gap-1 mb-3", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

const CardTitle = forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("text-base font-semibold text-[#f0ead6]", className)}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardContent = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center mt-3 pt-3 border-t border-[rgba(201,168,76,.1)]", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardTitle, CardContent, CardFooter };
