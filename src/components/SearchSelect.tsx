import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ChangeEvent } from "react";
import { createPortal } from "react-dom";

export interface SearchSelectOption {
  value: string;
  label: string;
  meta?: Record<string, any>;
}

export interface SearchSelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  dropdownClassName?: string;
  noMatchesText?: string;
  autoFocus?: boolean;
}

export function SearchSelect({
  id,
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled = false,
  className = "",
  dropdownClassName = "",
  noMatchesText = "No matches",
  autoFocus = false,
}: SearchSelectProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const controlRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const anchorElRef = useRef<HTMLElement | null>(null);
  const anchorRectRef = useRef<DOMRect | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties | null>(null);

  const normalizedOptions = useMemo(() => {
    const deduped = new Map<string, SearchSelectOption>();
    options.forEach(opt => {
      if (!deduped.has(opt.value)) {
        deduped.set(opt.value, opt);
      }
    });
    return Array.from(deduped.values());
  }, [options]);

  const selectedOption = useMemo(
    () => normalizedOptions.find(option => option.value === value) ?? null,
    [normalizedOptions, value]
  );

  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return normalizedOptions;
    return normalizedOptions.filter(option =>
      option.label.toLowerCase().includes(needle) || option.value.toLowerCase().includes(needle)
    );
  }, [normalizedOptions, query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHighlightedIndex(0);
      anchorElRef.current = null;
      anchorRectRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (autoFocus && inputRef.current && !disabled) {
      // Small delay to ensure the input is fully mounted and visible
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [autoFocus, disabled]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;
      const inRoot = rootRef.current?.contains(event.target) ?? false;
      const inDropdown = dropdownRef.current?.contains(event.target) ?? false;
      if (!inRoot && !inDropdown) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Helper to compute dropdown style based on an anchor rect
  const computeStyleFromRect = (rect: DOMRect): React.CSSProperties => {
    const margin = 4;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    // getBoundingClientRect() gives viewport coordinates, which already accounts
    // for scrolling because it's relative to the current viewport position.
    // For a portaled dropdown with position:fixed, rect.left and rect.top are correct.
    let top = rect.bottom + margin;
    let left = rect.left;
    const minWidth = rect.width;
    const maxWidth = Math.max(280, Math.min(600, viewportW - 16));

    // If dropdown would go off the bottom, prefer placing above
    const estimatedHeight = Math.min(320, viewportH * 0.6);
    if (top + estimatedHeight > viewportH && rect.top > estimatedHeight) {
      top = Math.max(8, rect.top - margin - estimatedHeight);
    }

    // No horizontal clamping - always align with the control

    return {
      position: "fixed",
      top,
      left,
      minWidth,
      width: "max-content",
      maxWidth,
      maxHeight: 320,
      overflowY: "auto",
      overflowX: "hidden",
      // Ensure we appear above the sticky sidebar (sidebar uses z-index ~10001)
      zIndex: 12000,
    } as React.CSSProperties;
  };

  // Position dropdown using a portal attached to <body> so it isn't clipped by container overflow
  useLayoutEffect(() => {
    if (!open) {
      setDropdownStyle(null);
      return;
    }

    const updatePosition = () => {
      const anchorEl = anchorElRef.current || controlRef.current || inputRef.current;
      if (!anchorEl) return;
      const rect = anchorEl.getBoundingClientRect();



      anchorRectRef.current = rect;
      setDropdownStyle(computeStyleFromRect(rect));
    };

    updatePosition();
    const onScroll = () => updatePosition();
    const onResize = () => updatePosition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    window.addEventListener("wheel", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("wheel", onScroll as any);
    };
  }, [open]);

  const displayValue = selectedOption?.label ?? "";
  const inputValue = open ? query : displayValue;

  const selectOption = (option: SearchSelectOption | undefined, shouldBlur = false) => {
    if (!option) return;
    onChange(option.value);
    setOpen(false);
    setQuery("");
    setHighlightedIndex(0);
    if (shouldBlur) {
      requestAnimationFrame(() => {
        inputRef.current?.blur();
      });
    }
  };

  const handleInputFocus = () => {
    if (disabled) return;
    // Anchor to the control wrapper for positioning
    if (controlRef.current) {
      anchorElRef.current = controlRef.current;
    }
    setOpen(true);
    setQuery("");
    requestAnimationFrame(() => {
      inputRef.current?.select();
    });
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    setOpen(true);
    setQuery(event.target.value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        if (controlRef.current) {
          anchorElRef.current = controlRef.current;
        }
        setOpen(true);
        return;
      }
      setHighlightedIndex(prev => Math.min(prev + 1, Math.max(filteredOptions.length - 1, 0)));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        if (controlRef.current) {
          anchorElRef.current = controlRef.current;
        }
        setOpen(true);
        return;
      }
      setHighlightedIndex(prev => Math.max(prev - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (!open) {
        if (controlRef.current) {
          anchorElRef.current = controlRef.current;
        }
        setOpen(true);
        return;
      }
      // Select highlighted option and keep focus so Tab can move to next field
      selectOption(filteredOptions[highlightedIndex], false);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      // If dropdown is open, select current highlighted option before tabbing
      if (open && filteredOptions[highlightedIndex]) {
        selectOption(filteredOptions[highlightedIndex], false);
      }
      setOpen(false);
      // Allow natural tab navigation by removing focus from current input
      // so browser can move to next tabbable element
      setTimeout(() => {
        const form = inputRef.current?.closest('form') || inputRef.current?.closest('.ruleComposer, .builderSplit');
        if (!form) {
          // No form container, just blur and let browser handle tab
          inputRef.current?.blur();
          return;
        }
        const tabbables = Array.from(
          form.querySelectorAll('input:not([disabled]), button:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
        ) as HTMLElement[];
        const currentIndex = tabbables.indexOf(inputRef.current!);
        const nextElement = tabbables[currentIndex + 1];
        if (nextElement) {
          nextElement.focus();
        }
      }, 0);
      return;
    }
  };

  return (
    <div ref={rootRef} className={`searchSelect${disabled ? " disabled" : ""} ${className}`.trim()}>
      <div
        ref={controlRef}
        className={`searchSelectControl${open ? " open" : ""}${disabled ? " disabled" : ""}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-owns={id ? `${id}-listbox` : undefined}
        aria-controls={id ? `${id}-listbox` : undefined}
        aria-disabled={disabled}
        onMouseDown={event => {
          if (disabled) return;
          // Anchor to the control wrapper for positioning
          if (controlRef.current) {
            anchorElRef.current = controlRef.current;
          }
          if (event.target !== inputRef.current) {
            event.preventDefault();
            inputRef.current?.focus();
          }
        }}
      >
        <input
          id={id}
          ref={inputRef}
          className="searchSelectInput"
          value={inputValue}
          placeholder={placeholder}
          onFocus={handleInputFocus}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          readOnly={disabled}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          aria-autocomplete="list"
          aria-controls={id ? `${id}-listbox` : undefined}
          aria-activedescendant={
            open && filteredOptions[highlightedIndex]
              ? `${id ?? ""}-option-${filteredOptions[highlightedIndex].value}`
              : undefined
          }
        />
        <span className="searchSelectArrow" aria-hidden>
          ▾
        </span>
      </div>
      {open ? createPortal(
        <div
          ref={dropdownRef}
          className={`searchSelectDropdown ${dropdownClassName}`.trim()}
          role="listbox"
          id={id ? `${id}-listbox` : undefined}
          style={dropdownStyle ?? undefined}
        >
          {filteredOptions.length ? (
            filteredOptions.map((option, optionIndex) => {
              const isActive = optionIndex === highlightedIndex;
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value || option.label}
                  type="button"
                  role="option"
                  id={`${id ?? ""}-option-${option.value}`}
                  className={`searchSelectOption${isActive ? " active" : ""}${isSelected ? " selected" : ""}`}
                  aria-selected={isSelected}
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => selectOption(option, true)}
                >
                  {option.label}
                </button>
              );
            })
          ) : (
            <div className="searchSelectEmpty">{noMatchesText}</div>
          )}
        </div>,
        document.body
      ) : null}
    </div>
  );
}
