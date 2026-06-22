import crypto from 'crypto'

// 加密密钥：优先从环境变量获取，否则生成一个基于机器特征的默认密钥
function getEncryptionKey() {
  const envKey = process.env.ENCRYPTION_KEY
  if (envKey) {
    // 确保密钥是32字节
    return crypto.createHash('sha256').update(envKey).digest()
  }
  // 回退：使用固定密钥（仅用于开发环境，生产必须设置ENCRYPTION_KEY）
  return crypto.createHash('sha256').update('ai-novel-writer-default-key-change-me').digest()
}

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12

/**
 * 加密API Key
 */
export function encrypt(plaintext) {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag()

  // 格式: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

/**
 * 解密API Key
 */
export function decrypt(ciphertext) {
  try {
    const [ivHex, authTagHex, encrypted] = ciphertext.split(':')
    if (!ivHex || !authTagHex || !encrypted) return null

    const key = getEncryptionKey()
    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch {
    return null
  }
}

/**
 * 配置管理器：合并环境变量和数据库配置
 */
export class ConfigManager {
  constructor(db) {
    this.db = db
    this.cache = new Map()
  }

  /**
   * 获取指定provider的API Key
   * 优先级: 环境变量 > 数据库(解密) > null
   */
  getApiKey(provider) {
    // 1. 检查环境变量
    const envKey = process.env[`${provider.toUpperCase()}_API_KEY`]
    if (envKey) return envKey

    // 2. 检查数据库
    const config = this.db.prepare('SELECT api_key_encrypted FROM ai_configs WHERE provider = ?').get(provider)
    if (config?.api_key_encrypted) {
      return decrypt(config.api_key_encrypted)
    }

    return null
  }

  /**
   * 设置API Key到数据库（加密存储）
   */
  setApiKey(provider, apiKey) {
    const encrypted = encrypt(apiKey)
    const now = new Date().toISOString()
    this.db.prepare(`
      INSERT OR REPLACE INTO ai_configs (provider, api_key_encrypted, model, updated_at)
      VALUES (@provider, @encrypted,
        COALESCE((SELECT model FROM ai_configs WHERE provider = @provider), ''),
        @now)
    `).run({ provider, encrypted, now })
  }

  /**
   * 更新模型选择
   */
  setModel(provider, model) {
    const now = new Date().toISOString()
    this.db.prepare(`
      UPDATE ai_configs SET model = ?, updated_at = ?
      WHERE provider = ?
    `).run(model, now, provider)
  }

  /**
   * 获取所有provider的配置状态（不暴露API Key）
   */
  getAllConfigs() {
    const rows = this.db.prepare('SELECT provider, model, updated_at FROM ai_configs').all()
    const result = {}
    for (const row of rows) {
      result[row.provider] = {
        configured: true,
        model: row.model,
        fromEnv: !!process.env[`${row.provider.toUpperCase()}_API_KEY`],
        updatedAt: row.updated_at
      }
    }
    // 也检查环境变量
    for (const provider of ['zhipu', 'deepseek', 'openai']) {
      if (!result[provider] && process.env[`${provider.toUpperCase()}_API_KEY`]) {
        result[provider] = { configured: true, model: '', fromEnv: true, updatedAt: null }
      }
    }
    return result
  }

  /**
   * 删除API Key
   */
  deleteApiKey(provider) {
    this.db.prepare('DELETE FROM ai_configs WHERE provider = ?').run(provider)
  }
}
