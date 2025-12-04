const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const mime = require('mime-types');

class FileStorageService {
    constructor() {
        this.uploadsDir = path.join(process.cwd(), 'uploads');
        this.ensureUploadDir();
    }

    async ensureUploadDir() {
        try {
            await fs.mkdir(this.uploadsDir, { recursive: true });
            
            // Create subdirectories for different file types
            const subdirs = ['images', 'audio', 'videos', 'documents'];
            for (const dir of subdirs) {
                await fs.mkdir(path.join(this.uploadsDir, dir), { recursive: true });
            }
        } catch (error) {
            console.error('Error creating upload directories:', error);
        }
    }

    /**
     * Get file type category from mime type
     */
    getFileCategory(mimeType) {
        if (mimeType.startsWith('image/')) return 'images';
        if (mimeType.startsWith('audio/')) return 'audio';
        if (mimeType.startsWith('video/')) return 'videos';
        if (mimeType.includes('pdf') || mimeType.includes('document')) return 'documents';
        return 'documents';
    }

    /**
     * Save file from WhatsApp media
     * @param {Buffer} buffer - File buffer
     * @param {string} mimeType - MIME type
     * @param {string} tenantId - Tenant ID
     * @param {string} originalName - Original filename
     * @returns {Promise<object>} File info
     */
    async saveFile(buffer, mimeType, tenantId, originalName = null) {
        try {
            const category = this.getFileCategory(mimeType);
            const extension = mime.extension(mimeType) || 'bin';
            const timestamp = Date.now();
            const fileName = originalName 
                ? `${tenantId}_${timestamp}_${originalName}`
                : `${tenantId}_${timestamp}.${extension}`;
            
            const filePath = path.join(this.uploadsDir, category, fileName);
            
            await fs.writeFile(filePath, buffer);
            
            const fileInfo = {
                fileName,
                filePath,
                category,
                mimeType,
                size: buffer.length,
                uploadedAt: new Date().toISOString(),
                tenantId
            };
            
            console.log(`✅ File saved: ${fileName} (${(buffer.length / 1024).toFixed(2)} KB)`);
            
            return fileInfo;
        } catch (error) {
            console.error('Error saving file:', error);
            throw error;
        }
    }

    /**
     * Download file from WhatsApp media URL
     * @param {object} media - WhatsApp media object
     * @param {string} tenantId - Tenant ID
     * @returns {Promise<object>} File info
     */
    async downloadWhatsAppMedia(media, tenantId) {
        try {
            console.log('📥 Downloading WhatsApp media...');
            
            const buffer = await media.downloadMedia();
            if (!buffer) {
                throw new Error('Failed to download media');
            }
            
            const mimeType = media.mimetype;
            const originalName = media.filename || null;
            
            const fileInfo = await this.saveFile(
                Buffer.from(buffer.data, 'base64'),
                mimeType,
                tenantId,
                originalName
            );
            
            return fileInfo;
        } catch (error) {
            console.error('Error downloading WhatsApp media:', error);
            throw error;
        }
    }

    /**
     * Get file as base64 for API requests
     * @param {string} filePath - Path to file
     * @returns {Promise<string>} Base64 encoded file
     */
    async getFileAsBase64(filePath) {
        try {
            const buffer = await fs.readFile(filePath);
            return buffer.toString('base64');
        } catch (error) {
            console.error('Error reading file:', error);
            throw error;
        }
    }

    /**
     * Delete file
     * @param {string} filePath - Path to file
     */
    async deleteFile(filePath) {
        try {
            await fs.unlink(filePath);
            console.log(`🗑️ File deleted: ${filePath}`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('Error deleting file:', error);
            }
        }
    }

    /**
     * Clean up old files (older than 24 hours)
     */
    async cleanupOldFiles() {
        try {
            const categories = ['images', 'audio', 'videos', 'documents'];
            const maxAge = 24 * 60 * 60 * 1000; // 24 hours
            const now = Date.now();
            
            for (const category of categories) {
                const dirPath = path.join(this.uploadsDir, category);
                const files = await fs.readdir(dirPath);
                
                for (const file of files) {
                    const filePath = path.join(dirPath, file);
                    const stats = await fs.stat(filePath);
                    
                    if (now - stats.mtimeMs > maxAge) {
                        await this.deleteFile(filePath);
                    }
                }
            }
            
            console.log('✅ Old files cleaned up');
        } catch (error) {
            console.error('Error cleaning up files:', error);
        }
    }

    /**
     * Start automatic cleanup job (runs every hour)
     */
    startCleanupJob() {
        // Run cleanup immediately
        this.cleanupOldFiles();
        
        // Schedule cleanup every hour
        this.cleanupInterval = setInterval(() => {
            this.cleanupOldFiles();
        }, 60 * 60 * 1000); // 1 hour
        
        console.log('🗑️ File cleanup job started (runs every hour)');
    }

    /**
     * Stop automatic cleanup job
     */
    stopCleanupJob() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
            console.log('🛑 File cleanup job stopped');
        }
    }
}

module.exports = new FileStorageService();
