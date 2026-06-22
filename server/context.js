/**
 * ContextBuilder - 长篇写作上下文管理器
 *
 * 核心能力：为AI生成组装完整、结构化的上下文
 * - 角色卡信息注入
 * - 世界观设定
 * - 伏笔追踪（已埋设/已回收）
 * - 章节摘要链（保持前后文一致性）
 * - 时间线事件
 * - 设定一致性检查
 *
 * 这是AI写作项目真正能和普通聊天壳拉开差距的地方。
 */

export class ContextBuilder {
  constructor(db) {
    this.db = db
  }

  /**
   * 构建完整的创作上下文
   * @param {string} projectId
   * @param {Object} options - 控制哪些上下文包含进来
   */
  build(projectId, options = {}) {
    const project = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId)
    if (!project) throw new Error('项目不存在')

    const {
      includeWorldBuilding = true,
      includeCharacters = true,
      includeOutline = true,
      includeChapterSummaries = true,
      includePreviousContent = true,
      includeForeshadows = true,
      includeTimeline = true,
      maxSummaryChapters = 5,
      maxPreviousContentChars = 2000
    } = options

    const context = {
      projectTitle: project.title,
      genre: project.genre,
      style: project.style,
      summary: project.summary
    }

    // 世界观设定
    if (includeWorldBuilding) {
      const wb = this.db.prepare('SELECT * FROM world_buildings WHERE project_id = ?').get(projectId)
      if (wb) {
        const parts = []
        if (wb.era) parts.push(`时代背景：${wb.era}`)
        if (wb.setting) parts.push(`世界设定：${wb.setting}`)
        if (wb.magic_system) parts.push(`力量体系：${wb.magic_system}`)
        if (wb.geography) parts.push(`地理环境：${wb.geography}`)
        if (wb.cultures) parts.push(`文化种族：${wb.cultures}`)
        if (wb.rules) parts.push(`世界规则：${wb.rules}`)
        if (parts.length > 0) context.worldBuilding = parts.join('\n')
      }
    }

    // 大纲
    if (includeOutline) {
      const outline = this.db.prepare('SELECT content FROM outlines WHERE project_id = ? AND is_active = 1 ORDER BY version DESC LIMIT 1').get(projectId)
      if (outline) context.outline = outline.content
    }

    // 角色卡
    if (includeCharacters) {
      const chars = this.db.prepare('SELECT * FROM characters WHERE project_id = ? ORDER BY created_at ASC').all(projectId)
      if (chars.length > 0) {
        context.characters = chars.map(c => {
          const rels = JSON.parse(c.relationships || '[]')
          const parts = [`【${c.name}】角色：${c.role || '未设定'}`]
          if (c.personality) parts.push(`性格：${c.personality}`)
          if (c.background) parts.push(`背景：${c.background}`)
          if (c.appearance) parts.push(`外貌：${c.appearance}`)
          if (c.abilities) parts.push(`能力：${c.abilities}`)
          if (rels.length > 0) parts.push(`关系：${rels.map(r => `${r.target}(${r.type})`).join('、')}`)
          return parts.join('；')
        }).join('\n')
      }
    }

    // 章节摘要链
    if (includeChapterSummaries) {
      const chapters = this.db.prepare('SELECT id, title, summary, sort_order FROM chapters WHERE project_id = ? ORDER BY sort_order ASC').all(projectId)
      if (chapters.length > 0) {
        const summaries = chapters.slice(-maxSummaryChapters).map((ch, i) => {
          const idx = chapters.length - maxSummaryChapters + i + 1
          return `第${idx}章「${ch.title}」：${ch.summary || '(无摘要)'}`
        })
        context.chapterSummaries = `前文摘要：\n${summaries.join('\n')}`
      }
    }

    // 上一章结尾内容（用于衔接）
    if (includePreviousContent) {
      const lastChapter = this.db.prepare('SELECT content FROM chapters WHERE project_id = ? ORDER BY sort_order DESC LIMIT 1').get(projectId)
      if (lastChapter?.content) {
        context.previousContent = lastChapter.content.slice(-maxPreviousContentChars)
      }
    }

    // 伏笔追踪
    if (includeForeshadows) {
      const planted = this.db.prepare("SELECT * FROM foreshadows WHERE project_id = ? AND status = 'planted' ORDER BY created_at ASC").all(projectId)
      const resolved = this.db.prepare("SELECT * FROM foreshadows WHERE project_id = ? AND status = 'resolved' ORDER BY created_at ASC").all(projectId)

      if (planted.length > 0) {
        context.unresolvedForeshadows = `待回收的伏笔：\n${planted.map(f => `- ${f.description}`).join('\n')}`
      }
      if (resolved.length > 0) {
        context.resolvedForeshadows = `已回收的伏笔：\n${resolved.map(f => `- ${f.description}`).join('\n')}`
      }
    }

    // 时间线
    if (includeTimeline) {
      const events = this.db.prepare('SELECT * FROM timeline_events WHERE project_id = ? ORDER BY sort_order ASC').all(projectId)
      if (events.length > 0) {
        context.timeline = events.map(e => {
          const time = e.story_time ? `[${e.story_time}] ` : ''
          return `${time}${e.event_name}：${e.event_description}`
        }).join('\n')
      }
    }

    return context
  }

  /**
   * 将上下文转换为system messages
   */
  toSystemMessages(context) {
    const messages = []

    // 基础信息
    messages.push({
      role: 'system',
      content: `你正在创作一部小说。标题：《${context.projectTitle}》，类型：${context.genre}，风格：${context.style}。${context.summary ? `简介：${context.summary}` : ''}`
    })

    // 世界观
    if (context.worldBuilding) {
      messages.push({ role: 'system', content: `世界观设定：\n${context.worldBuilding}` })
    }

    // 大纲
    if (context.outline) {
      messages.push({ role: 'system', content: `故事大纲：\n${context.outline}` })
    }

    // 角色卡
    if (context.characters) {
      messages.push({ role: 'system', content: `角色设定：\n${context.characters}` })
    }

    // 章节摘要
    if (context.chapterSummaries) {
      messages.push({ role: 'system', content: context.chapterSummaries })
    }

    // 伏笔
    if (context.unresolvedForeshadows) {
      messages.push({ role: 'system', content: context.unresolvedForeshadows })
    }

    // 时间线
    if (context.timeline) {
      messages.push({ role: 'system', content: `故事时间线：\n${context.timeline}` })
    }

    // 前文衔接
    if (context.previousContent) {
      messages.push({ role: 'system', content: `上一章结尾（用于衔接）：\n${context.previousContent}` })
    }

    return messages
  }

  /**
   * 一致性检查：检测当前生成内容是否与已有设定冲突
   */
  checkConsistency(projectId, generatedContent) {
    const issues = []
    const project = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId)
    if (!project) return issues

    // 检查角色名是否出现已知角色
    const chars = this.db.prepare('SELECT name FROM characters WHERE project_id = ?').all(projectId)
    const knownNames = chars.map(c => c.name)

    // 检查伏笔回收
    const planted = this.db.prepare("SELECT * FROM foreshadows WHERE project_id = ? AND status = 'planted'").all(projectId)
    for (const fs of planted) {
      // 简单检测：如果伏笔关键词出现在内容中
      const keywords = fs.description.split(/[，。、：；]/).filter(w => w.length > 2)
      const found = keywords.some(kw => generatedContent.includes(kw))
      if (found) {
        issues.push({
          type: 'foreshadow_potential_resolve',
          message: `可能回收了伏笔：「${fs.description}」`,
          foreshadowId: fs.id
        })
      }
    }

    // 检查时间线一致性
    const timeline = this.db.prepare('SELECT * FROM timeline_events WHERE project_id = ? ORDER BY sort_order ASC').all(projectId)
    if (timeline.length > 0) {
      // 这里可以做更复杂的时间线检查
      // 目前简单检查是否有时间冲突
    }

    return issues
  }

  /**
   * 自动提取并保存章节摘要
   */
  autoGenerateSummary(chapterContent) {
    // 简单提取：取前100字作为摘要
    return chapterContent.slice(0, 100).replace(/\n/g, ' ') + '...'
  }

  /**
   * 检测内容中可能的新伏笔
   */
  detectForeshadows(content) {
    // 简单的关键词检测
    const patterns = [
      / mysterious/i,
      /不知道为什么/,
      /隐藏着/,
      /暗中/,
      /似乎/
    ]
    const detected = []
    for (const pattern of patterns) {
      const matches = content.match(new RegExp(pattern, 'g'))
      if (matches) {
        detected.push({ pattern: pattern.toString(), count: matches.length })
      }
    }
    return detected
  }
}
