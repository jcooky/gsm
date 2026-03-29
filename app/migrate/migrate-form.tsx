"use client"

import { parseMemoryFile } from "@/lib/migration"
import { useRef, useState } from "react"

type ParsePreview = {
  entities: number
  relations: number
  observations: number
  format: "json" | "jsonl"
  sample: { name: string; type: string }[]
  errors: string[]
}

type ImportResult = {
  imported: { entities: number; relations: number }
  skipped: { entities: number; relations: number }
  warnings: string[]
}

export function MigrateForm() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [filename, setFilename] = useState<string>("")
  const [preview, setPreview] = useState<ParsePreview | null>(null)
  const [dragging, setDragging] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const handleFile = (file: File) => {
    setFilename(file.name)
    setResult(null)
    setImportError(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      setFileContent(content)
      const { graph, format, errors } = parseMemoryFile(content)
      const observations = graph.entities.reduce((sum, e) => sum + e.observations.length, 0)
      setPreview({
        entities: graph.entities.length,
        relations: graph.relations.length,
        observations,
        format,
        sample: graph.entities.slice(0, 5).map((e) => ({ name: e.name, type: e.entityType })),
        errors,
      })
    }
    reader.readAsText(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleImport = async () => {
    if (!fileContent) return
    setImporting(true)
    setImportError(null)

    try {
      const res = await fetch("/migrate/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: fileContent }),
      })
      const data = await res.json()
      if (!res.ok) {
        setImportError(data.error ?? "Import failed")
      } else {
        setResult(data)
        setPreview(null)
        setFileContent(null)
        setFilename("")
      }
    } catch {
      setImportError("Network error. Please try again.")
    } finally {
      setImporting(false)
    }
  }

  if (result) {
    return (
      <div className="space-y-6">
        <div className="bg-emerald-950 border border-emerald-800 rounded-xl p-6">
          <div className="text-emerald-400 text-2xl mb-2">✓ Import complete</div>
          <div className="grid grid-cols-2 gap-4 text-sm mt-4">
            <div>
              <div className="text-neutral-400">Entities imported</div>
              <div className="text-2xl font-bold text-neutral-100">{result.imported.entities}</div>
              {result.skipped.entities > 0 && (
                <div className="text-neutral-500 text-xs">{result.skipped.entities} skipped (duplicates)</div>
              )}
            </div>
            <div>
              <div className="text-neutral-400">Relations imported</div>
              <div className="text-2xl font-bold text-neutral-100">{result.imported.relations}</div>
              {result.skipped.relations > 0 && (
                <div className="text-neutral-500 text-xs">{result.skipped.relations} skipped (duplicates)</div>
              )}
            </div>
          </div>
        </div>
        {result.warnings.length > 0 && (
          <div className="bg-yellow-950 border border-yellow-800 rounded-xl p-4 text-sm">
            <p className="text-yellow-400 font-medium mb-2">Warnings ({result.warnings.length})</p>
            <ul className="text-yellow-200/70 space-y-1 list-disc list-inside">
              {result.warnings.slice(0, 5).map((w, i) => <li key={i}>{w}</li>)}
              {result.warnings.length > 5 && <li>…and {result.warnings.length - 5} more</li>}
            </ul>
          </div>
        )}
        <button
          onClick={() => setResult(null)}
          className="text-sm text-neutral-500 hover:text-neutral-300 underline underline-offset-4 cursor-pointer"
        >
          Import another file
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          dragging
            ? "border-emerald-500 bg-emerald-950/30"
            : "border-neutral-700 hover:border-neutral-500"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".json,.jsonl"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <p className="text-neutral-400 text-sm">
          {filename
            ? <span className="text-neutral-200 font-medium">{filename}</span>
            : "Drop your memory.json or memory.jsonl here, or click to browse"
          }
        </p>
        {!filename && (
          <p className="text-neutral-600 text-xs mt-2">Supports both .json (legacy) and .jsonl (current) formats</p>
        )}
      </div>

      {/* Preview */}
      {preview && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Preview</h2>
            <span className="text-xs bg-neutral-800 px-2 py-1 rounded text-neutral-400 uppercase tracking-wide">
              {preview.format}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-neutral-500">Entities</div>
              <div className="text-xl font-bold">{preview.entities}</div>
            </div>
            <div>
              <div className="text-neutral-500">Relations</div>
              <div className="text-xl font-bold">{preview.relations}</div>
            </div>
            <div>
              <div className="text-neutral-500">Observations</div>
              <div className="text-xl font-bold">{preview.observations}</div>
            </div>
          </div>

          {preview.sample.length > 0 && (
            <div>
              <p className="text-xs text-neutral-500 mb-2">Sample entities</p>
              <div className="space-y-1">
                {preview.sample.map((e, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="text-neutral-100">{e.name}</span>
                    <span className="text-neutral-600 text-xs">{e.type}</span>
                  </div>
                ))}
                {preview.entities > 5 && (
                  <p className="text-neutral-600 text-xs">…and {preview.entities - 5} more</p>
                )}
              </div>
            </div>
          )}

          {preview.errors.length > 0 && (
            <div className="bg-yellow-950/50 border border-yellow-800/50 rounded-lg p-3 text-xs text-yellow-300/70">
              <p className="font-medium text-yellow-400 mb-1">{preview.errors.length} warning(s)</p>
              {preview.errors.slice(0, 3).map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}

          {importError && (
            <p className="text-red-400 text-sm">{importError}</p>
          )}

          <button
            onClick={handleImport}
            disabled={importing || preview.entities === 0}
            className="w-full py-2.5 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-500 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {importing ? "Importing…" : `Import ${preview.entities} entities`}
          </button>
        </div>
      )}

      {/* Export section */}
      <div className="border-t border-neutral-800 pt-6">
        <h2 className="font-semibold mb-1">Export your graph</h2>
        <p className="text-neutral-500 text-sm mb-4">Download your current knowledge graph to back up or migrate away.</p>
        <div className="flex gap-3">
          <a
            href="/migrate/export"
            className="flex-1 text-center py-2 rounded-lg border border-neutral-700 text-sm text-neutral-300 hover:bg-neutral-800 transition-colors"
          >
            Download as JSONL
          </a>
          <a
            href="/migrate/export?format=json"
            className="flex-1 text-center py-2 rounded-lg border border-neutral-700 text-sm text-neutral-300 hover:bg-neutral-800 transition-colors"
          >
            Download as JSON
          </a>
        </div>
      </div>
    </div>
  )
}
