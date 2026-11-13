"use client";

import * as React from "react";

// A small popover menu. The parent of <PopMenu> must be positioned
// (relative or absolute); the panel opens below it, right-aligned.
export function PopMenu({ open, onClose, children, testId }: { open: boolean; onClose: () => void; children: React.ReactNode; testId?: string }) {
  if (!open) return null;
  return (
    <>
      <div
        className="fixed inset-0 z-10"
        aria-hidden
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
      />
      <div
        role="menu"
        data-testid={testId}
        className="absolute right-0 top-full z-20 mt-1 w-56 rounded-xl border border-border bg-card p-1 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </>
  );
}

export function PopMenuItem({ children, onClick, testId }: { children: React.ReactNode; onClick: () => void; testId?: string }) {
  return (
    <button
      type="button"
      role="menuitem"
      data-testid={testId}
      onClick={onClick}
      className="block w-full rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  );
}
