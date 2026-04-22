"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";

type JsonSchema = Record<string, unknown>;

export type MonacoMarker = {
  severity: "error" | "warning" | "info" | "hint";
  message: string;
  startLineNumber: number;
};

type RawMarker = {
  severity: number;
  message: string;
  startLineNumber: number;
};

const MODEL_URI = "inmemory://config/openclaw.json";
const SCHEMA_URI = "inmemory://schema/openclaw-config.json";

// Monaco marker severity values (copied from monaco-editor so we don't need
// a direct monaco-editor dependency at type level):
//   Hint = 1, Info = 2, Warning = 4, Error = 8.
function mapSeverity(code: number): MonacoMarker["severity"] {
  if (code === 8) return "error";
  if (code === 4) return "warning";
  if (code === 2) return "info";
  return "hint";
}

export interface MonacoJsonEditorProps {
  value: string;
  schema: JsonSchema;
  onChange: (value: string) => void;
  onMarkersChange?: (markers: MonacoMarker[]) => void;
  height?: string | number;
}

export default function MonacoJsonEditor({
  value,
  schema,
  onChange,
  onMarkersChange,
  height = "32rem",
}: MonacoJsonEditorProps) {
  const monacoRef = useRef<Monaco | null>(null);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  // Stable schema object for the diagnostics config.
  const schemaJson = useMemo(() => schema ?? { type: "object" }, [schema]);

  const applySchema = useCallback(
    (monaco: Monaco) => {
      try {
        monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
          validate: true,
          allowComments: false,
          schemas: [
            {
              uri: SCHEMA_URI,
              fileMatch: [MODEL_URI],
              schema: schemaJson,
            },
          ],
        });
      } catch {
        // non-fatal; keep editor usable even without schema
      }
    },
    [schemaJson],
  );

  const handleBeforeMount = useCallback(
    (monaco: Monaco) => {
      monacoRef.current = monaco;
      applySchema(monaco);
    },
    [applySchema],
  );

  const handleMount = useCallback<OnMount>(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;
    },
    [],
  );

  const handleValidate = useCallback(
    (markers: RawMarker[]) => {
      if (!onMarkersChange) return;
      onMarkersChange(
        markers.map((m) => ({
          severity: mapSeverity(m.severity),
          message: m.message,
          startLineNumber: m.startLineNumber,
        })),
      );
    },
    [onMarkersChange],
  );

  // Re-apply schema when it changes after mount.
  useEffect(() => {
    if (monacoRef.current) applySchema(monacoRef.current);
  }, [applySchema]);

  return (
    <div
      className="overflow-hidden rounded border border-zinc-700 bg-[#1e1e1e]"
      style={{ height: typeof height === "number" ? `${height}px` : height }}
    >
      <Editor
        height="100%"
        defaultLanguage="json"
        language="json"
        path={MODEL_URI}
        theme="vs-dark"
        value={value}
        beforeMount={handleBeforeMount}
        onMount={handleMount}
        onValidate={handleValidate}
        onChange={(v) => onChange(v ?? "")}
        loading={
          <div className="flex h-full items-center justify-center text-xs text-zinc-500">
            Loading editor…
          </div>
        }
        options={{
          minimap: { enabled: false },
          fontSize: 12,
          lineNumbers: "on",
          folding: true,
          matchBrackets: "always",
          automaticLayout: true,
          scrollBeyondLastLine: false,
          tabSize: 2,
          insertSpaces: true,
          renderWhitespace: "selection",
          wordWrap: "off",
          fixedOverflowWidgets: true,
          formatOnPaste: true,
        }}
      />
    </div>
  );
}
