export interface FileMetadata {
  id: string
  object_name: string
  original_name: string
  size: number
  sha256: string
  owner_id: string
  created_at: Date
  updated_at: Date
}

export interface UploadFileResponse {
  id: string
  object_name: string
  original_name: string
  size: number
  sha256: string
  download_url: string
  stream_url: string
}

export interface FileEvent {
  type: 'uploaded' | 'deleted'
  file_id: string
  object_name: string
  owner_id: string
  timestamp: Date
}

export interface DownloadFileRequest {
  id: string
  disposition?: 'inline' | 'attachment'
}

export interface StreamFileRequest {
  id: string
  range?: string
}

export interface ErrorResponse {
  error: string
  details?: unknown[]
}

export interface ValidationError {
  msg: string
  param: string
  location: string
  value: string
}
