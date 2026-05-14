import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { DictionaryRecord, FieldConfig } from "@/types";

type Props = {
  fieldConfig: FieldConfig;
  records: DictionaryRecord[];
  value: string;
  onChange: (value: string) => void;
  onFill: (formField: string, value: string) => void;
};

function applyDisplay(pattern: string, record: DictionaryRecord): string {
  return pattern.replace(/\{([^}]+)\}/g, (_, key: string) => record[key] ?? "");
}

export function DictionaryField({ fieldConfig, records, value, onChange, onFill }: Props) {
  const [open, setOpen] = useState(false);
  const displayPattern = fieldConfig.display ?? "{name}";
  const fills = fieldConfig.fills ?? {};

  const handleSelect = (idx: number) => {
    const record = records[idx];
    const display = applyDisplay(displayPattern, record);
    onChange(display);
    for (const [formField, recordField] of Object.entries(fills)) {
      onFill(formField, record[recordField] ?? "");
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={fieldConfig.name}
          variant="outline"
          role="combobox"
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value || "Выберите…"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        style={{ width: "var(--radix-popover-trigger-width)" }}
      >
        <Command>
          <CommandInput placeholder="Поиск…" />
          <CommandList>
            <CommandEmpty>Не найдено.</CommandEmpty>
            <CommandGroup>
              {records.map((r, idx) => {
                const display = applyDisplay(displayPattern, r);
                const selected = display === value;
                return (
                  <CommandItem key={idx} value={display} onSelect={() => handleSelect(idx)}>
                    <Check
                      className={cn("mr-2 h-4 w-4", selected ? "opacity-100" : "opacity-0")}
                    />
                    {display}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
