"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  parsePortNumber,
  suggestListenPort,
  type VmRoutePortMapping,
} from "@/lib/public-routes";
import { cn } from "@/lib/utils";

export interface RouteMappingDraft {
  id: string;
  listen_port: string;
  target_port: string;
}

interface RouteMappingsBuilderProps {
  value: RouteMappingDraft[];
  onChange: (nextValue: RouteMappingDraft[]) => void;
  title?: string;
  description?: string;
  className?: string;
  defaultExpanded?: boolean;
  compact?: boolean;
}

function createDraftId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `route-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

export function createRouteMappingDraft(
  listenPort = 443,
  targetPort = 3000,
): RouteMappingDraft {
  return {
    id: createDraftId(),
    listen_port: String(listenPort),
    target_port: String(targetPort),
  };
}

export function parseRouteMappingDrafts(drafts: RouteMappingDraft[]) {
  const mappings: VmRoutePortMapping[] = [];
  const usedListenPorts = new Set<number>();

  for (const [index, draft] of drafts.entries()) {
    const listenPort = parsePortNumber(draft.listen_port);

    if (!listenPort) {
      return {
        error: `Host port dong ${index + 1} khong hop le. Hay nhap so tu 1 den 65535.`,
        mappings: [] as VmRoutePortMapping[],
      };
    }

    const targetPort = parsePortNumber(draft.target_port);

    if (!targetPort) {
      return {
        error: `Target port dong ${index + 1} khong hop le. Hay nhap so tu 1 den 65535.`,
        mappings: [] as VmRoutePortMapping[],
      };
    }

    if (usedListenPorts.has(listenPort)) {
      return {
        error: `Host port :${listenPort} bi trung. Moi mapping phai dung host port rieng.`,
        mappings: [] as VmRoutePortMapping[],
      };
    }

    usedListenPorts.add(listenPort);
    mappings.push({
      listen_port: listenPort,
      target_port: targetPort,
    });
  }

  return { error: "", mappings };
}

export default function RouteMappingsBuilder({
  value,
  onChange,
  title = "Public port mappings",
  description = "Chon nhieu host port cong khai de forward vao cac target port ben trong VM.",
  className,
  defaultExpanded = false,
  compact = false,
}: RouteMappingsBuilderProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const parsedSummaries = useMemo(
    () =>
      value.map((draft) => ({
        id: draft.id,
        listen_port: parsePortNumber(draft.listen_port),
        target_port: parsePortNumber(draft.target_port),
      })),
    [value],
  );

  function updateDraft(id: string, field: "listen_port" | "target_port", nextValue: string) {
    onChange(
      value.map((draft) =>
        draft.id === id
          ? {
              ...draft,
              [field]: nextValue,
            }
          : draft,
      ),
    );
  }

  function addDraft() {
    const nextTargetPort =
      parsePortNumber(value[value.length - 1]?.target_port) ||
      parsePortNumber(value[0]?.target_port) ||
      3000;
    const nextListenPort = suggestListenPort(
      parsedSummaries
        .filter(
          (
            item,
          ): item is {
            id: string;
            listen_port: number;
            target_port: number | null;
          } => typeof item.listen_port === "number",
        )
        .map((item) => ({ listen_port: item.listen_port })),
      nextTargetPort,
    );

    onChange([...value, createRouteMappingDraft(nextListenPort, nextTargetPort)]);
    setExpanded(true);
  }

  function removeDraft(id: string) {
    onChange(value.filter((draft) => draft.id !== id));
  }

  return (
    <div
      className={cn(
        compact
          ? "rounded-[1.2rem] border border-border/70 bg-background/70 p-3"
          : "rounded-[1.5rem] border border-border/70 bg-background/70 p-4",
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p
            className={cn(
              "font-semibold uppercase text-muted-foreground",
              compact ? "text-[11px] tracking-[0.18em]" : "text-xs tracking-[0.22em]",
            )}
          >
            {title}
          </p>
          <p
            className={cn(
              "text-muted-foreground",
              compact ? "mt-1 text-xs leading-5" : "mt-2 text-sm leading-6",
            )}
          >
            {description}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={addDraft}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-full border border-border/70 bg-background/80 font-semibold text-foreground transition hover:border-primary/35 hover:text-primary",
              compact ? "h-9 px-3 text-xs" : "h-10 px-4 text-sm",
            )}
          >
            <Plus className="h-4 w-4" />
            Them
          </button>
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-full border border-border/70 bg-background/80 font-semibold text-foreground transition hover:border-primary/35 hover:text-primary",
              compact ? "h-9 px-3 text-xs" : "h-10 px-4 text-sm",
            )}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {expanded ? "Thu gon" : "Mo"}
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {parsedSummaries.length > 0 ? (
          parsedSummaries.map((mapping) => (
            <span
              key={mapping.id}
              className="rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-semibold text-foreground"
            >
              {mapping.listen_port ? `:${mapping.listen_port}` : ":?"}
              {" -> "}
              {mapping.target_port ? `:${mapping.target_port}` : ":?"}
            </span>
          ))
        ) : (
          <span className="rounded-full border border-dashed border-border/70 bg-background/55 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
            Khong tao public route luc deploy
          </span>
        )}
      </div>

      {expanded ? (
        <div className="mt-4 space-y-3">
          {value.length > 0 ? (
            value.map((draft, index) => (
              <div
                key={draft.id}
                className="grid gap-3 rounded-[1.1rem] border border-border/70 bg-card/75 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
              >
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Host port #{index + 1}
                  </span>
                  <Input
                    type="number"
                    min={1}
                    max={65535}
                    inputMode="numeric"
                    value={draft.listen_port}
                    onChange={(event) =>
                      updateDraft(draft.id, "listen_port", event.target.value)
                    }
                    placeholder="443"
                    className="mt-2 h-11 bg-background/75 font-mono"
                  />
                </label>

                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Target port
                  </span>
                  <Input
                    type="number"
                    min={1}
                    max={65535}
                    inputMode="numeric"
                    value={draft.target_port}
                    onChange={(event) =>
                      updateDraft(draft.id, "target_port", event.target.value)
                    }
                    placeholder="3000"
                    className="mt-2 h-11 bg-background/75 font-mono"
                  />
                </label>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => removeDraft(draft.id)}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-rose-500/25 bg-rose-500/10 px-4 text-sm font-semibold text-rose-200 transition hover:border-rose-500/40 hover:text-rose-100"
                  >
                    <Trash2 className="h-4 w-4" />
                    Xoa
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-[1.1rem] border border-dashed border-border/70 bg-background/55 px-4 py-4 text-sm leading-6 text-muted-foreground">
              Chua co mapping nao. Bam <span className="font-semibold text-foreground">Them port</span> de them host port cong khai.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
