import express from 'express'
import multer from 'multer'
import { MinioClient } from './storage'
import { FileMetadataRepository } from './repositories'
import { EventBus } from './events'
import { FileController } from './controllers'
import { errorHandler, notFoundHandler } from './middleware'

const app = express()
const port = process.env.PORT || 3000

// Initialize dependencies
const minioClient = new MinioClient()
const metadataRepo = new FileMetadataRepository()
const eventBus = new EventBus()
const fileController = new FileController(minioClient, metadataRepo, eventBus)

// Initialize database
metadataRepo.init().catch((err) => {
  console.error('Failed to initialize database:', err)
  process.exit(1)
})

// Initialize event bus
eventBus.connect().catch((err) => {
  console.error('Failed to connect to event bus:', err)
  process.exit(1)
})

// Middleware
app.use(express.json())
const upload = multer({ storage: multer.memoryStorage() })

// Routes
app.post(
  '/files',
  upload.single('file'),
  fileController.uploadFile.bind(fileController)
)
app.get('/files/:id', fileController.downloadFile.bind(fileController))
app.get('/files/:id/stream', fileController.streamFile.bind(fileController))
app.delete('/files/:id', fileController.deleteFile.bind(fileController))

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }))

// OpenAPI
app.get('/openapi.json', (req, res) => {
  res.json({})
})

// Error handling
app.use(notFoundHandler)
app.use(errorHandler)

app.listen(port, () => {
  console.log(`File service running on port ${port}`)
})
