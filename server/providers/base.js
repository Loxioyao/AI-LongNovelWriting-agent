/**
 * BaseAIProvider - 统一的AI服务商接口抽象层
 *
 * 所有Provider继承此类，实现统一接口：
 * - chat(): 非流式对话
 * - chatStream(): 流式对话
 * - getModels(): 获取可用模型列表
 *
 * 支持OpenAI-compatible API的快速扩展：
 * 只需设置baseUrl和getHeaders即可复用chat/chatStream实现
 */
export class BaseAIProvider {
  constructor(options) {
    this.name = options.name
    this.baseUrl = options.baseUrl
    this.defaultModel = options.defaultModel
    this.models = options.models || []
    this.timeout = options.timeout || parseInt(process.env.REQUEST_TIMEOUT || '60000')
    this.maxRetries = options.maxRetries || parseInt(process.env.MAX_RETRIES || '3')
  }

  /**
   * 获取请求头（子类必须实现）
   * @param {string} apiKey
   * @returns {Object}
   */
  getHeaders(apiKey) {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    }
  }

  /**
   * 构建请求体（子类可覆盖以支持特殊参数）
   */
  buildBody({ model, messages, temperature, maxTokens, stream }) {
    return {
      model: model || this.defaultModel,
      messages,
      temperature: temperature ?? 0.8,
      max_tokens: maxTokens ?? 4096,
      ...(stream !== undefined ? { stream } : {})
    }
  }

  /**
   * 解析流式响应的chunk（子类可覆盖以处理特殊格式）
   */
  parseStreamChunk(data) {
    return {
      content: data.choices?.[0]?.delta?.content || '',
      usage: data.usage || null,
      done: false
    }
  }

  /**
   * 非流式对话
   */
  async chat({ model, messages, temperature, maxTokens, apiKey, signal }) {
    const body = this.buildBody({ model, messages, temperature, maxTokens, stream: false })

    const response = await this._fetchWithRetry(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(apiKey),
      body: JSON.stringify(body),
      signal
    })

    const data = await response.json()
    return {
      content: data.choices?.[0]?.message?.content || '',
      usage: data.usage,
      model: data.model
    }
  }

  /**
   * 流式对话 - 统一的SSE流式解析
   * 支持动态超时：只在一定时间内没有收到新数据时才超时
   */
  async chatStream({ model, messages, temperature, maxTokens, apiKey, onChunk, signal }) {
    const body = this.buildBody({ model, messages, temperature, maxTokens, stream: true })

    // 创建 AbortController，支持动态超时和外部取消
    const controller = new AbortController()
    const externalSignal = signal

    // 外部信号关联
    if (externalSignal) {
      externalSignal.addEventListener('abort', () => controller.abort())
    }

    // 动态超时配置：从收到最后一个 chunk 开始计时
    const idleTimeout = parseInt(process.env.STREAM_IDLE_TIMEOUT || '30000') // 默认 30 秒无数据超时
    const totalTimeout = parseInt(process.env.REQUEST_TIMEOUT || '600000') // 总超时限制（10分钟）
    let lastChunkTime = Date.now()
    let startTime = Date.now()
    let idleTimer = null
    let totalTimer = null

    // 启动空闲超时定时器
    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        controller.abort(new Error(`流式传输空闲超时：${idleTimeout}ms 内未收到新数据`))
      }, idleTimeout)
    }

    // 启动总超时定时器
    totalTimer = setTimeout(() => {
      controller.abort(new Error(`流式传输总超时：${totalTimeout}ms`))
    }, totalTimeout)

    resetIdleTimer()

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.getHeaders(apiKey),
        body: JSON.stringify(body),
        signal: controller.signal
      })

      if (!response.ok) {
        const err = await response.text()
        throw new ProviderError(this.name, response.status, err)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullContent = ''
      let usage = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        // 收到数据，重置空闲定时器
        lastChunkTime = Date.now()
        resetIdleTimer()

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue

          const jsonStr = trimmed.slice(6)
          if (jsonStr === '[DONE]') continue

          try {
            const data = JSON.parse(jsonStr)
            const parsed = this.parseStreamChunk(data)

            if (parsed.error) {
              throw new ProviderError(this.name, 500, parsed.error)
            }

            if (parsed.content) {
              fullContent += parsed.content
              onChunk?.({ content: parsed.content, fullContent })
            }

            if (parsed.usage) usage = parsed.usage
            if (parsed.done) return { content: fullContent, usage }
          } catch (e) {
            if (e instanceof ProviderError) throw e
            // 跳过格式错误的行
          }
        }
      }

      return { content: fullContent, usage }
    } finally {
      // 清理定时器
      if (idleTimer) clearTimeout(idleTimer)
      if (totalTimer) clearTimeout(totalTimer)
    }
  }

  /**
   * 带重试的fetch
   */
  async _fetchWithRetry(url, options, retryCount = 0) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: options.signal || AbortSignal.timeout(this.timeout)
      })

      if (!response.ok) {
        const err = await response.text()

        // 429 Too Many Requests - 可重试
        if (response.status === 429 && retryCount < this.maxRetries) {
          await this._delay(Math.pow(2, retryCount) * 1000)
          return this._fetchWithRetry(url, options, retryCount + 1)
        }

        // 5xx 服务器错误 - 可重试
        if (response.status >= 500 && retryCount < this.maxRetries) {
          await this._delay(Math.pow(2, retryCount) * 1000)
          return this._fetchWithRetry(url, options, retryCount + 1)
        }

        throw new ProviderError(this.name, response.status, err)
      }

      return response
    } catch (error) {
      // 超时或网络错误 - 可重试
      if (retryCount < this.maxRetries && !(error instanceof ProviderError)) {
        await this._delay(Math.pow(2, retryCount) * 1000)
        return this._fetchWithRetry(url, options, retryCount + 1)
      }
      throw error
    }
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  getModels() {
    return this.models
  }
}

/**
 * 自定义错误类 - 区分不同类型的API错误
 */
export class ProviderError extends Error {
  constructor(provider, statusCode, message) {
    super(`[${provider}] ${statusCode}: ${message}`)
    this.name = 'ProviderError'
    this.provider = provider
    this.statusCode = statusCode
    this.rawMessage = message
  }

  get isAuthError() {
    return this.statusCode === 401 || this.statusCode === 403
  }

  get isRateLimit() {
    return this.statusCode === 429
  }

  get isServerError() {
    return this.statusCode >= 500
  }

  get userMessage() {
    if (this.isAuthError) return `${this.provider} API Key无效或已过期，请检查配置`
    if (this.isRateLimit) return `${this.provider} API请求频率超限，请稍后重试`
    if (this.isServerError) return `${this.provider} 服务器错误，请稍后重试`
    if (this.statusCode === 400) return `${this.provider} 请求参数错误：${this.rawMessage}`
    return `${this.provider} 请求失败：${this.rawMessage}`
  }
}
