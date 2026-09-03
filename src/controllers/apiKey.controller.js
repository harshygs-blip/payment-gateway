import { SettingModel } from '../models/setting.model.js';
import { config } from '../../config.js';
import logger from '../utils/logger.js';

export const ApiKeyController = {
  /**
   * Get currently active API Key and settings
   */
  async getApiKey(req, res) {
    try {
      const apiKey = await SettingModel.getApiKey();
      const requireApiKey = await SettingModel.isApiKeyRequired();
      const createdAt = await SettingModel.get('api_key_created_at', Date.now().toString());

      const maskedKey = apiKey.length > 12 
        ? `${apiKey.slice(0, 8)}••••••••••••••••${apiKey.slice(-4)}`
        : '••••••••';

      return res.json({
        success: true,
        apiKey,
        maskedKey,
        requireApiKey,
        createdAt: parseInt(createdAt, 10)
      });
    } catch (err) {
      logger.error(`[ApiKeyController Error]: ${err.message}`);
      return res.status(500).json({ success: false, error: 'Failed to retrieve API key' });
    }
  },

  /**
   * Regenerate a brand new API Key
   */
  async regenerateApiKey(req, res) {
    try {
      const newKey = await SettingModel.regenerateApiKey();
      config.auth = config.auth || {};
      config.auth.apiKey = newKey;

      logger.info(`[ApiKey] Brand new API Key generated: ${newKey.slice(0, 10)}...`);

      return res.json({
        success: true,
        apiKey: newKey,
        message: 'New API Key generated and activated successfully!'
      });
    } catch (err) {
      logger.error(`[ApiKeyController Error]: ${err.message}`);
      return res.status(500).json({ success: false, error: 'Failed to regenerate API key' });
    }
  },

  /**
   * Toggle enforcement of API key verification on order creation
   */
  async toggleRequireApiKey(req, res) {
    try {
      const { required } = req.body;
      const isRequired = required === true || required === 'true';

      await SettingModel.setApiKeyRequired(isRequired);
      config.auth = config.auth || {};
      config.auth.requireApiKey = isRequired;

      logger.info(`[ApiKey] Require API Key enforcement set to: ${isRequired}`);

      return res.json({
        success: true,
        requireApiKey: isRequired,
        message: isRequired 
          ? 'API Key is now strictly REQUIRED for creating orders.' 
          : 'API Key requirement is now OPTIONAL (Open Testing Mode).'
      });
    } catch (err) {
      logger.error(`[ApiKeyController Error]: ${err.message}`);
      return res.status(500).json({ success: false, error: 'Failed to update API key enforcement setting' });
    }
  }
};

export default ApiKeyController;
