"use client";

import { cn } from "@/lib/utils";
import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * PromptInput — a morphing chat input (adapted from 21st.dev "ai-chat-input").
 *
 * Kept from the original: the collapsed pill that springs open into a card,
 * the auto-growing textarea with scroll fades, Enter-to-send / Shift+Enter
 * newline, Esc-to-collapse, and the round send button.
 *
 * Deliberately left out for Repulabs:
 *  - model + effort pickers (one fixed model server-side; its icons came from
 *    an external CDN our CSP img-src blocks),
 *  - image attachments (the assistant API is text-only),
 *  - voice input (Permissions-Policy sets microphone=(), and the original's
 *    fallback typed a canned demo sentence into the box).
 */

const SPRING = "cubic-bezier(0.175, 0.885, 0.32, 1.275)";
const SPRING_TRANSITION = `max-width 0.4s ${SPRING}, height 0.4s ${SPRING}`;
const SMOOTH_HEIGHT_TRANSITION = `max-width 0.4s ${SPRING}, height 0.15s ease-out`;
const MIN_TEXT = 44;
const MAX_TEXT = 160;
const FOOTER = 40;

function ArrowUpIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M7 12V2M7 2L2.5 6.5M7 2L11.5 6.5"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface PromptInputProps {
  onSubmit?: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Extra classes for the input card itself (e.g. a glass fill). */
  cardClassName?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  /** max-width when collapsed / expanded (any CSS length). */
  collapsedWidth?: number | string;
  expandedWidth?: number | string;
  /** Shown bottom-left of the open card. */
  hint?: React.ReactNode;
}

export const PromptInput = React.forwardRef<HTMLDivElement, PromptInputProps>(
  (
    {
      onSubmit,
      placeholder = "Ask anything",
      className,
      cardClassName,
      defaultValue = "",
      value: controlledValue,
      onChange,
      disabled = false,
      collapsedWidth = 320,
      expandedWidth = 480,
      hint = "Enter to send · Shift + Enter for a new line",
    },
    ref,
  ) => {
    const [expanded, setExpanded] = useState(false);
    const [isSmoothResize, setIsSmoothResize] = useState(false);
    const [localValue, setLocalValue] = useState(defaultValue);
    const [textareaHeight, setTextareaHeight] = useState(MIN_TEXT);
    const [isScrolling, setIsScrolling] = useState(false);

    const isControlled = controlledValue !== undefined;
    const value = isControlled ? controlledValue : localValue;
    const hasValue = value.trim() !== "";
    const containerHeight = textareaHeight + FOOTER;

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const topFadeRef = useRef<HTMLDivElement>(null);
    const bottomFadeRef = useRef<HTMLDivElement>(null);

    const updateFades = useCallback(() => {
      const el = textareaRef.current;
      if (!el) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (topFadeRef.current) {
        topFadeRef.current.style.opacity = Math.min(scrollTop / 20, 1).toString();
      }
      if (bottomFadeRef.current) {
        const bottomScroll = scrollHeight - clientHeight - scrollTop;
        bottomFadeRef.current.style.opacity = Math.min(
          Math.max(bottomScroll - 16, 0) / 10,
          1,
        ).toString();
      }
    }, []);

    const handleValueChange = useCallback(
      (val: string) => {
        setIsSmoothResize(true);
        if (!isControlled) setLocalValue(val);
        onChange?.(val);
      },
      [isControlled, onChange],
    );

    const expand = () => {
      if (disabled) return;
      setIsSmoothResize(false);
      setExpanded(true);
    };

    // Text arriving from outside (e.g. a prefilled value) opens the card.
    useEffect(() => {
      if (hasValue && !expanded) {
        setIsSmoothResize(false);
        setExpanded(true);
      }
    }, [hasValue, expanded]);

    useEffect(() => {
      if (!expanded) return;
      const timer = setTimeout(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }, 50);
      return () => clearTimeout(timer);
    }, [expanded]);

    // Auto-grow: measure the content height, clamp, animate to it.
    // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure whenever the text or open state changes
    useEffect(() => {
      const el = textareaRef.current;
      if (!el) return;
      const current = el.style.height;
      el.style.transition = "none";
      el.style.height = "0px";
      const scrollHeight = el.scrollHeight;
      el.style.height = current;
      void el.offsetHeight;
      el.style.transition = "";
      const next = Math.max(MIN_TEXT, Math.min(scrollHeight, MAX_TEXT));
      el.style.height = `${next}px`;
      setTextareaHeight(next);
      setIsScrolling(scrollHeight > MAX_TEXT);
      setTimeout(updateFades, 0);
    }, [value, expanded, updateFades]);

    const collapse = () => {
      setIsSmoothResize(false);
      setExpanded(false);
    };

    const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
      if (containerRef.current?.contains(e.relatedTarget as Node)) return;
      if (!hasValue) collapse();
    };

    const handleSubmit = () => {
      if (!hasValue || disabled) return;
      setIsSmoothResize(false);
      onSubmit?.(value.trim());
      handleValueChange("");
    };

    const len = (v: number | string) => (typeof v === "number" ? `${v}px` : v);

    return (
      <div
        ref={(node) => {
          containerRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
        onBlur={handleBlur}
        className={cn("relative flex w-full flex-col", className)}
        style={{
          maxWidth: len(expanded ? expandedWidth : collapsedWidth),
          transition: isSmoothResize ? "max-width 0.15s ease-out" : `max-width 0.4s ${SPRING}`,
        }}
      >
        <div
          onMouseDown={(e) => {
            if (expanded && e.target !== textareaRef.current) {
              e.preventDefault();
              textareaRef.current?.focus();
            }
          }}
          style={{
            borderRadius: 24,
            height: expanded ? containerHeight : 48,
            transition: isSmoothResize ? SMOOTH_HEIGHT_TRANSITION : SPRING_TRANSITION,
            overflow: expanded ? "visible" : "hidden",
          }}
          className={cn(
            "aci-card relative z-10 w-full border border-border bg-card shadow-sm focus-within:border-ring/40 focus-within:ring-1 focus-within:ring-ring/20",
            expanded ? "cursor-text" : "cursor-default",
            disabled && "opacity-70",
            cardClassName,
          )}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => handleValueChange(e.target.value)}
            onScroll={updateFades}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
              if (e.key === "Escape" && !hasValue) collapse();
            }}
            placeholder={placeholder}
            aria-label={placeholder}
            disabled={disabled}
            rows={1}
            style={{
              transition: isSmoothResize
                ? "height 0.15s ease-out"
                : `opacity 0.3s ease-out, transform 0.3s ease-out, height 0.4s ${SPRING}`,
            }}
            className={cn(
              "aci-scroll absolute inset-x-0 top-0 z-[1] w-full resize-none bg-transparent py-3 pl-4 pr-12 text-sm leading-[22px] text-foreground outline-none placeholder:text-muted-foreground/80",
              expanded
                ? "translate-y-0 scale-100 opacity-100"
                : "pointer-events-none -translate-y-1 scale-95 opacity-0",
              isScrolling ? "overflow-y-auto" : "overflow-y-hidden",
            )}
          />

          <div
            ref={topFadeRef}
            className="aci-fade pointer-events-none absolute left-4 right-12 top-0 z-[2] h-6 opacity-0"
          />
          <div
            ref={bottomFadeRef}
            className="aci-fade aci-fade--bottom pointer-events-none absolute left-4 right-12 z-[2] h-6"
            style={{
              opacity: 0,
              top: `${textareaHeight - 24}px`,
              transition: isSmoothResize ? "top 0.15s ease-out" : `top 0.4s ${SPRING}`,
            }}
          />

          <button
            type="button"
            onClick={expand}
            disabled={disabled}
            style={{ transition: isSmoothResize ? "none" : `all 0.4s ${SPRING}` }}
            className={cn(
              "absolute inset-x-0 top-0 z-[1] cursor-text py-[15px] pl-4 pr-12 text-left text-sm leading-[17px] text-muted-foreground/80 outline-none",
              !expanded
                ? "translate-y-0 scale-100 opacity-100"
                : "pointer-events-none translate-y-1 scale-105 opacity-0",
            )}
            aria-label="Open question input"
          >
            {placeholder}
          </button>

          {hint && (
            <div
              className={cn(
                "pointer-events-none absolute bottom-3 left-4 right-14 z-[3] truncate text-[11px] text-muted-foreground transition-all duration-300",
                expanded ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
              )}
            >
              {hint}
            </div>
          )}

          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              if (expanded) handleSubmit();
              else expand();
            }}
            disabled={disabled || (expanded && !hasValue)}
            aria-label="Send"
            className="aci-send absolute bottom-2 right-2 z-[10] flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground outline-none transition-all duration-300 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-40"
          >
            <ArrowUpIcon />
          </button>
        </div>
      </div>
    );
  },
);

PromptInput.displayName = "PromptInput";
