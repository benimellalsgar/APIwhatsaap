const cloudinary = require('cloudinary').v2;
const fs = require('fs').promises;

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

class CloudinaryService {
    /**
     * Upload file to Cloudinary
     * @param {Buffer|string} fileSource - File buffer or local file path
     * @param {string} tenantId - Tenant identifier
     * @param {string} fileName - Original file name
     * @param {string} fileType - File type (image, document, audio, video)
     * @returns {Promise<Object>} Upload result with URL and metadata
     */
    async uploadFile(fileSource, tenantId, fileName, fileType = 'auto') {
        try {
            const folder = `whatsapp-bot/${tenantId}`;
            
            // Determine resource type
            let resourceType = 'auto';
            if (fileType === 'audio') resourceType = 'video'; // Cloudinary uses 'video' for audio
            else if (fileType === 'video') resourceType = 'video';
            else if (fileType === 'document') resourceType = 'raw';
            else if (fileType === 'image') resourceType = 'image';

            let uploadResult;

            // Check if fileSource is a Buffer
            if (Buffer.isBuffer(fileSource)) {
                // Upload from buffer (in-memory file)
                uploadResult = await new Promise((resolve, reject) => {
                    const uploadStream = cloudinary.uploader.upload_stream(
                        {
                            folder: folder,
                            resource_type: resourceType,
                            public_id: `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`,
                            overwrite: false
                        },
                        (error, result) => {
                            if (error) reject(error);
                            else resolve(result);
                        }
                    );
                    uploadStream.end(fileSource);
                });
            } else {
                // Upload from file path
                uploadResult = await cloudinary.uploader.upload(fileSource, {
                    folder: folder,
                    resource_type: resourceType,
                    public_id: `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`,
                    overwrite: false
                });
            }

            return {
                success: true,
                url: uploadResult.secure_url,
                publicId: uploadResult.public_id,
                format: uploadResult.format,
                size: uploadResult.bytes,
                resourceType: uploadResult.resource_type,
                fileName: fileName
            };

        } catch (error) {
            console.error('Cloudinary upload error:', error);
            throw new Error(`Failed to upload file: ${error.message}`);
        }
    }

    /**
     * Delete file from Cloudinary
     * @param {string} publicId - Cloudinary public ID
     * @param {string} resourceType - Resource type (image, video, raw)
     * @returns {Promise<Object>} Deletion result
     */
    async deleteFile(publicId, resourceType = 'image') {
        try {
            const result = await cloudinary.uploader.destroy(publicId, {
                resource_type: resourceType
            });
            return {
                success: result.result === 'ok',
                message: result.result
            };
        } catch (error) {
            console.error('Cloudinary delete error:', error);
            throw new Error(`Failed to delete file: ${error.message}`);
        }
    }

    /**
     * Get file URL from Cloudinary
     * @param {string} publicId - Cloudinary public ID
     * @param {string} resourceType - Resource type
     * @returns {string} File URL
     */
    getFileUrl(publicId, resourceType = 'image') {
        return cloudinary.url(publicId, {
            resource_type: resourceType,
            secure: true
        });
    }

    /**
     * List all files for a tenant
     * @param {string} tenantId - Tenant identifier
     * @returns {Promise<Array>} List of files
     */
    async listTenantFiles(tenantId) {
        try {
            const folder = `whatsapp-bot/${tenantId}`;
            const result = await cloudinary.api.resources({
                type: 'upload',
                prefix: folder,
                max_results: 100
            });

            return result.resources.map(resource => ({
                publicId: resource.public_id,
                url: resource.secure_url,
                format: resource.format,
                size: resource.bytes,
                createdAt: resource.created_at
            }));
        } catch (error) {
            console.error('Cloudinary list error:', error);
            return [];
        }
    }
}

module.exports = new CloudinaryService();
