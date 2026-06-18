export type ExtensionIssueCode =
  | 'not_implemented'
  | 'invalid_document'
  | 'unsupported_schema_version'
  | 'unsupported_platform_extension'
  | 'unsupported_message'
  | 'routing_error'
  | 'unsupported_page'
  | 'permission_denied'
  | 'content_not_ready'
  | 'compiler_error'
  | 'export_error'
  | 'storage_error'
  | 'runtime_error'
  | 'inspector_error'

export type ExtensionIssuePath = readonly (string | number)[]

export type ExtensionIssue = Readonly<{
  code: ExtensionIssueCode
  message: string
  path?: ExtensionIssuePath
  details?: Readonly<Record<string, unknown>>
}>

export type ExtensionResult<TValue> =
  | Readonly<{ ok: true; value: TValue }>
  | Readonly<{ ok: false; issues: readonly ExtensionIssue[] }>

export function ok<TValue>(value: TValue): ExtensionResult<TValue> {
  return { ok: true, value }
}

export function failure<TValue = never>(
  issue: ExtensionIssue | readonly ExtensionIssue[],
): ExtensionResult<TValue> {
  return {
    ok: false,
    issues: Array.isArray(issue) ? issue : [issue],
  }
}

export function notImplementedIssue(
  boundary: string,
  details: Readonly<Record<string, unknown>> = {},
): ExtensionIssue {
  return {
    code: 'not_implemented',
    message: `${boundary} is not implemented yet.`,
    details: { boundary, ...details },
  }
}
