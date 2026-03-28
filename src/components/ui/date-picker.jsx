import * as React from "react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { Calendar as CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export function DatePicker({ value, onChange }) {
  // Convert current string input "YYYY-MM-DD" back to date (ignoring timezone offsets)
  const dateValue = value ? new Date(value + 'T00:00:00') : null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          className={cn(
            "w-full justify-start text-left font-normal bg-surface-app border-borders-strong text-white hover:bg-surface-hover hover:text-white",
            !dateValue && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {dateValue ? format(dateValue, "PPP", { locale: es }) : <span>Seleccionar fecha</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 border-borders-strong bg-surface-app text-white" align="start">
        <Calendar
          mode="single"
          selected={dateValue}
          onSelect={(date) => {
             // Extract just YYYY-MM-DD for consistency with input[type="date"]
             if (!date) {
               onChange({ target: { value: '' } });
               return;
             }
             const offset = date.getTimezoneOffset();
             const d = new Date(date.getTime() - (offset*60*1000));
             onChange({ target: { value: d.toISOString().split('T')[0] } });
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}
