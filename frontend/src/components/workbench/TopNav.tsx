"use client";

export type WorkbenchMode = "explore" | "compare" | "report";

type TopNavProps = {
  mode: WorkbenchMode;
  onModeChange: (mode: WorkbenchMode) => void;
};

const MODES: Array<{ id: WorkbenchMode; label: string }> = [
  { id: "explore", label: "Explore" },
  { id: "compare", label: "Compare" },
  { id: "report", label: "Report" },
];

export function TopNav({ mode, onModeChange }: TopNavProps) {
  return (
    <header className="pio-topnav sticky top-0 z-50">
      <div className="mx-auto flex h-[44px] w-full max-w-[1500px] items-center gap-0 px-8">
        {/* Mode nav */}
        <nav className="flex h-full items-center gap-6" aria-label="Workbench mode">
          {MODES.map((item) => {
            const isActive = mode === item.id;
            if (isActive) {
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onModeChange(item.id)}
                  className="flex h-full items-center rounded-[12px] bg-[#1A406A] px-5 text-[13.5px] font-semibold text-white transition-colors"
                >
                  {item.label}
                </button>
              );
            }
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onModeChange(item.id)}
                className="text-[13.5px] font-semibold text-[var(--pio-ink)] opacity-70 transition-opacity hover:opacity-100"
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Right links */}
        <div className="ml-auto flex items-center gap-6">
          <a
            href="https://github.com/can-karakoc/protein-io/tree/main/docs"
            target="_blank"
            rel="noreferrer"
            className="text-[13.5px] font-medium text-[var(--pio-ink)] opacity-50 transition-opacity hover:opacity-80"
          >
            Docs
          </a>
          <a
            href="https://github.com/can-karakoc/protein-io"
            target="_blank"
            rel="noreferrer"
            className="text-[13.5px] font-medium text-[var(--pio-ink)] opacity-50 transition-opacity hover:opacity-80"
          >
            GitHub
          </a>
        </div>
      </div>
    </header>
  );
}
