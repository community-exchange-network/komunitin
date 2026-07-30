import type { MigrationValidationError } from './types'

const FILE_ORDER = new Map([
  ['community.csv', 0],
  ['users.csv', 1],
  ['members.csv', 2],
  ['transfers.csv', 3],
  ['categories.csv', 4],
  ['posts.csv', 5],
])

export class ErrorCollector {
  readonly #errors: MigrationValidationError[] = []
  readonly #maxErrors: number
  #truncated = false

  constructor(maxErrors: number) {
    this.#maxErrors = maxErrors
  }

  add(error: MigrationValidationError): void {
    if (this.#errors.length < this.#maxErrors) {
      this.#errors.push(error)
    } else {
      this.#truncated = true
    }
  }

  field(
    code: string,
    message: string,
    file: string,
    row: number,
    column: string,
  ): void {
    this.add({ code, message, file, row, column })
  }

  get hasErrors(): boolean {
    return this.#errors.length > 0 || this.#truncated
  }

  result(): MigrationValidationError[] {
    const errors = [...this.#errors].sort(compareErrors)
    if (this.#truncated) {
      errors.push({
        code: 'ERROR_LIMIT_EXCEEDED',
        message: `Validation stopped after ${this.#maxErrors} errors`,
        file: null,
        row: null,
        column: null,
      })
    }
    return errors
  }
}

const compareNullable = <T>(a: T | null, b: T | null, fallback: T): number => {
  const left = a ?? fallback
  const right = b ?? fallback
  return left < right ? -1 : left > right ? 1 : 0
}

export const compareErrors = (a: MigrationValidationError, b: MigrationValidationError): number => {
  const fileComparison = compareNullable(
    a.file === null ? null : (FILE_ORDER.get(a.file) ?? 100),
    b.file === null ? null : (FILE_ORDER.get(b.file) ?? 100),
    -1,
  )
  if (fileComparison !== 0) return fileComparison

  const unknownFileComparison = compareNullable(a.file, b.file, '')
  if (unknownFileComparison !== 0) return unknownFileComparison

  const rowComparison = compareNullable(a.row, b.row, 0)
  if (rowComparison !== 0) return rowComparison

  const columnComparison = compareNullable(a.column, b.column, '')
  if (columnComparison !== 0) return columnComparison

  const codeComparison = a.code.localeCompare(b.code)
  return codeComparison !== 0 ? codeComparison : a.message.localeCompare(b.message)
}

