const fs = require('fs').promises;
const path = require('path');

class UserDataStore {
    constructor() {
        this.storageDir = path.join(process.cwd(), 'user_data');
        this.ensureStorageDir();
    }

    async ensureStorageDir() {
        try {
            await fs.mkdir(this.storageDir, { recursive: true });
        } catch (error) {
            console.error('Error creating storage directory:', error);
        }
    }

    /**
     * Save user's business data
     * @param {string} userId - User ID
     * @param {object} data - User data { businessData, apiKey }
     */
    async saveUserData(userId, data) {
        try {
            const filePath = path.join(this.storageDir, `${userId}.json`);
            const dataToSave = {
                userId: userId,
                businessData: data.businessData || '',
                apiKey: data.apiKey || null,
                savedAt: new Date().toISOString()
            };
            
            await fs.writeFile(filePath, JSON.stringify(dataToSave, null, 2));
            console.log(`💾 Saved data for user: ${userId}`);
            return true;
        } catch (error) {
            console.error(`Error saving data for ${userId}:`, error);
            return false;
        }
    }

    /**
     * Load user's business data
     * @param {string} userId - User ID
     * @returns {object|null} User data or null if not found
     */
    async loadUserData(userId) {
        try {
            const filePath = path.join(this.storageDir, `${userId}.json`);
            const fileContent = await fs.readFile(filePath, 'utf8');
            const data = JSON.parse(fileContent);
            console.log(`📂 Loaded data for user: ${userId}`);
            return data;
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error(`Error loading data for ${userId}:`, error);
            }
            return null;
        }
    }

    /**
     * Delete user's data
     * @param {string} userId - User ID
     */
    async deleteUserData(userId) {
        try {
            const filePath = path.join(this.storageDir, `${userId}.json`);
            await fs.unlink(filePath);
            console.log(`🗑️ Deleted data for user: ${userId}`);
            return true;
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error(`Error deleting data for ${userId}:`, error);
            }
            return false;
        }
    }

    /**
     * Check if user has saved data
     * @param {string} userId - User ID
     * @returns {boolean}
     */
    async hasUserData(userId) {
        try {
            const filePath = path.join(this.storageDir, `${userId}.json`);
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }
}

module.exports = UserDataStore;
