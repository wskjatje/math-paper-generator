"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
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
import {
  TEXTBOOK_EDITION_CUSTOM_PLACEHOLDER,
  textbookEditionSelectOptions,
} from "@/lib/generateCatalog";

type Props = {
  subjectId: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
};

export function TextbookEditionCombobox({ subjectId, value, onChange, disabled }: Props) {
  const [open, setOpen] = React.useState(false);
  const [customMode, setCustomMode] = React.useState(false);

  const options = React.useMemo(
    () => (subjectId.trim() ? textbookEditionSelectOptions(subjectId) : []),
    [subjectId],
  );
  const presetSet = React.useMemo(() => new Set(options.map((o) => o.value)), [options]);

  React.useEffect(() => {
    setCustomMode(false);
  }, [subjectId]);

  React.useEffect(() => {
    if (!value.trim()) return;
    if (!presetSet.has(value)) setCustomMode(true);
    else setCustomMode(false);
  }, [value, presetSet]);

  const isPreset = Boolean(value.trim()) && presetSet.has(value);
  const showCustomInput =
    Boolean(subjectId.trim()) && (customMode || (!!value.trim() && !isPreset));

  const triggerLabel = React.useMemo(() => {
    if (!subjectId.trim()) return "请先选择学科";
    if (!value.trim()) return "搜索或选择教材版本…";
    if (isPreset) return value;
    return value.length > 40 ? `${value.slice(0, 40)}…` : value;
  }, [subjectId, value, isPreset]);

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled || !subjectId.trim()}
            className={cn(
              "h-auto min-h-10 w-full justify-between rounded-lg border-input px-3 py-2.5 font-normal shadow-sm",
            )}
          >
            <span className="truncate text-left text-sm">{triggerLabel}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[min(100vw-2rem,var(--radix-popover-trigger-width))] p-0"
          align="start"
        >
          <Command>
            <CommandInput placeholder="输入关键字筛选…" className="h-10" />
            <CommandList>
              <CommandEmpty>无匹配版本</CommandEmpty>
              <CommandGroup heading="标准枚举">
                {options.map((o) => (
                  <CommandItem
                    key={o.value}
                    value={`${o.label} ${o.value}`}
                    onSelect={() => {
                      onChange(o.value);
                      setCustomMode(false);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === o.value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {o.label}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup heading="其他">
                <CommandItem
                  value="__custom__"
                  onSelect={() => {
                    onChange("");
                    setCustomMode(true);
                    setOpen(false);
                  }}
                >
                  自定义填写（使用下方输入框）
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {showCustomInput && (
        <input
          type="text"
          value={isPreset ? "" : value}
          onChange={(e) => onChange(e.target.value.slice(0, 80))}
          placeholder={TEXTBOOK_EDITION_CUSTOM_PLACEHOLDER}
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          maxLength={80}
          disabled={disabled || !subjectId.trim()}
        />
      )}
    </div>
  );
}
