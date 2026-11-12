// Human-readable labels for the tutor's tool calls, shown as live activity
// steps so the RAG + multi-agent process is visible, not hidden.
export const TOOL_LABELS = {
  ingest_notes: 'Filing your notes',
  list_sources: 'Checking your library',
  search_notes: 'Searching your notes',
  search_agent: 'Searching the live web',
  save_quiz_question: 'Writing a question',
  get_grading_reference: 'Checking the source answer',
  record_result: 'Recording your score',
  get_weakest_concept: 'Finding your weak spot',
}

// Which provenance a step implies, for coloring the step dot.
export const TOOL_SOURCE = {
  search_notes: 'notes',
  ingest_notes: 'notes',
  search_agent: 'web',
}

export function labelForTool(name) {
  return TOOL_LABELS[name] || name.replace(/_/g, ' ')
}
