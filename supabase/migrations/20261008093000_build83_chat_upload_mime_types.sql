-- Build 83 follow-up: chat documents use the existing private Isabella upload bucket.
-- Keep the bucket private; only widen its explicit MIME allowlist and align the per-file limit
-- with the 12 MiB client/server contract introduced in Build 83.

update storage.buckets
set
  file_size_limit = 12582912,
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'message/rfc822'
  ]::text[]
where id = 'isabella-uploads';
