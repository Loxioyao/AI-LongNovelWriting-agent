import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.DB_PATH
  ? resolve(process.cwd(), process.env.DB_PATH)
  : resolve(__dirname, '../data/novel.db')

// 确保数据目录存在
mkdirSync(dirname(DB_PATH), { recursive: true })

const db = new Database(DB_PATH)

// 启用WAL模式提升并发性能
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// ====== 数据库Schema ======
db.exec(`
  -- 小说项目表
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    genre TEXT DEFAULT '未指定',
    style TEXT DEFAULT '未指定',
    summary TEXT DEFAULT '',
    target_words INTEGER DEFAULT 100000,
    status TEXT DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- 世界观设定表
  CREATE TABLE IF NOT EXISTS world_buildings (
    project_id TEXT PRIMARY KEY,
    era TEXT DEFAULT '',
    setting TEXT DEFAULT '',
    magic_system TEXT DEFAULT '',
    geography TEXT DEFAULT '',
    cultures TEXT DEFAULT '',
    rules TEXT DEFAULT '',
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  -- 大纲表（支持版本管理）
  CREATE TABLE IF NOT EXISTS outlines (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    content TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  -- 角色卡表
  CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT '',
    color TEXT DEFAULT '#6c5ce7',
    personality TEXT DEFAULT '',
    background TEXT DEFAULT '',
    appearance TEXT DEFAULT '',
    abilities TEXT DEFAULT '',
    relationships TEXT DEFAULT '[]',
    created_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  -- 章节表
  CREATE TABLE IF NOT EXISTS chapters (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT DEFAULT '',
    summary TEXT DEFAULT '',
    status TEXT DEFAULT 'draft',
    word_count INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  -- 伏笔追踪表
  CREATE TABLE IF NOT EXISTS foreshadows (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    chapter_id TEXT,
    description TEXT NOT NULL,
    status TEXT DEFAULT 'planted',
    resolution_chapter_id TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  -- 时间线事件表
  CREATE TABLE IF NOT EXISTS timeline_events (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    chapter_id TEXT,
    event_name TEXT NOT NULL,
    event_description TEXT DEFAULT '',
    story_time TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  -- 工作流实例表
  CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'idle',
    current_step INTEGER DEFAULT 0,
    current_chapter_index INTEGER DEFAULT 0,
    review_round INTEGER DEFAULT 0,
    max_review_rounds INTEGER DEFAULT 2,
    phase TEXT DEFAULT 'idle',
    auto_mode INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  -- 工作流步骤结果表
  CREATE TABLE IF NOT EXISTS workflow_results (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    step_id TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata TEXT DEFAULT '{}',
    created_at TEXT NOT NULL,
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
  );

  -- 工作流章节结果表
  CREATE TABLE IF NOT EXISTS workflow_chapter_results (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    chapter_index INTEGER NOT NULL,
    step_type TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(workflow_id, chapter_index, step_type),
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
  );

  -- 工作流日志表
  CREATE TABLE IF NOT EXISTS workflow_logs (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    step_name TEXT NOT NULL,
    message TEXT NOT NULL,
    log_type TEXT DEFAULT 'info',
    created_at TEXT NOT NULL,
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
  );

  -- AI配置表（加密存储）
  CREATE TABLE IF NOT EXISTS ai_configs (
    provider TEXT PRIMARY KEY,
    api_key_encrypted TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  );

  -- AI对话历史表
  CREATE TABLE IF NOT EXISTS agent_history (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    prompt TEXT NOT NULL,
    response TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  -- 索引
  CREATE INDEX IF NOT EXISTS idx_characters_project ON characters(project_id);
  CREATE INDEX IF NOT EXISTS idx_chapters_project ON chapters(project_id);
  CREATE INDEX IF NOT EXISTS idx_outlines_project ON outlines(project_id);
  CREATE INDEX IF NOT EXISTS idx_workflows_project ON workflows(project_id);
  CREATE INDEX IF NOT EXISTS idx_workflow_results_workflow ON workflow_results(workflow_id);
  CREATE INDEX IF NOT EXISTS idx_agent_history_project ON agent_history(project_id);
`)

// ====== 数据访问层 ======

// --- Projects ---
export const ProjectRepo = {
  getAll() {
    return db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM chapters WHERE project_id = p.id) as chapter_count,
        (SELECT COUNT(*) FROM characters WHERE project_id = p.id) as character_count,
        (SELECT COALESCE(SUM(word_count), 0) FROM chapters WHERE project_id = p.id) as total_words
      FROM projects p ORDER BY p.updated_at DESC
    `).all()
  },

  getById(id) {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id)
    if (!project) return null

    const worldBuilding = db.prepare('SELECT * FROM world_buildings WHERE project_id = ?').get(id)
    const outline = db.prepare('SELECT content FROM outlines WHERE project_id = ? AND is_active = 1 ORDER BY version DESC LIMIT 1').get(id)
    const characters = db.prepare('SELECT * FROM characters WHERE project_id = ? ORDER BY created_at ASC').all(id)
    const chapters = db.prepare('SELECT * FROM chapters WHERE project_id = ? ORDER BY sort_order ASC').all(id)
    const foreshadows = db.prepare('SELECT * FROM foreshadows WHERE project_id = ? ORDER BY created_at ASC').all(id)
    const timeline = db.prepare('SELECT * FROM timeline_events WHERE project_id = ? ORDER BY sort_order ASC').all(id)

    return {
      ...project,
      worldBuilding: worldBuilding || { era: '', setting: '', magicSystem: '', geography: '', cultures: '', rules: '' },
      outline: outline?.content || null,
      characters: characters.map(c => ({ ...c, relationships: JSON.parse(c.relationships || '[]') })),
      chapters,
      foreshadows,
      timeline
    }
  },

  create(data) {
    const id = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO projects (id, title, genre, style, summary, target_words, status, created_at, updated_at)
      VALUES (@id, @title, @genre, @style, @summary, @targetWords, 'active', @now, @now)
    `).run({ id, title: data.title, genre: data.genre || '未指定', style: data.style || '未指定', summary: data.summary || '', targetWords: data.targetWords || 100000, now })

    db.prepare(`INSERT INTO world_buildings (project_id, era, setting, magic_system, geography, cultures, rules) VALUES (?, '', '', '', '', '', '')`).run(id)

    return this.getById(id)
  },

  update(id, data) {
    const now = new Date().toISOString()
    const fields = []
    const values = { id, now }
    for (const [key, value] of Object.entries(data)) {
      const col = key.replace(/([A-Z])/g, '_$1').toLowerCase()
      fields.push(`${col} = @${key}`)
      values[key] = value
    }
    if (fields.length === 0) return this.getById(id)
    fields.push('updated_at = @now')
    db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = @id`).run(values)
    return this.getById(id)
  },

  delete(id) {
    db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  }
}

// --- Outlines ---
export const OutlineRepo = {
  getActive(projectId) {
    return db.prepare('SELECT * FROM outlines WHERE project_id = ? AND is_active = 1 ORDER BY version DESC LIMIT 1').get(projectId)
  },

  getVersions(projectId) {
    return db.prepare('SELECT id, version, is_active, created_at FROM outlines WHERE project_id = ? ORDER BY version DESC').all(projectId)
  },

  save(projectId, content) {
    const now = new Date().toISOString()
    const versionRow = db.prepare('SELECT MAX(version) as max_ver FROM outlines WHERE project_id = ?').get(projectId)
    const version = (versionRow?.max_ver || 0) + 1
    const id = `outline-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

    const txn = db.transaction(() => {
      db.prepare('UPDATE outlines SET is_active = 0 WHERE project_id = ?').run(projectId)
      db.prepare('INSERT INTO outlines (id, project_id, content, version, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)').run(id, projectId, content, version, now)
      db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, projectId)
    })
    txn()
    return { id, version, content }
  },

  activate(outlineId) {
    const now = new Date().toISOString()
    const txn = db.transaction(() => {
      const outline = db.prepare('SELECT project_id FROM outlines WHERE id = ?').get(outlineId)
      if (!outline) return null
      db.prepare('UPDATE outlines SET is_active = 0 WHERE project_id = ?').run(outline.project_id)
      db.prepare('UPDATE outlines SET is_active = 1 WHERE id = ?').run(outlineId)
      db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, outline.project_id)
      return outline.project_id
    })
    const projectId = txn()
    return projectId ? this.getActive(projectId) : null
  }
}

// --- Characters ---
export const CharacterRepo = {
  getAll(projectId) {
    return db.prepare('SELECT * FROM characters WHERE project_id = ? ORDER BY created_at ASC').all(projectId)
      .map(c => ({ ...c, relationships: JSON.parse(c.relationships || '[]') }))
  },

  create(projectId, data) {
    const id = `char-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO characters (id, project_id, name, role, color, personality, background, appearance, abilities, relationships, created_at)
      VALUES (@id, @projectId, @name, @role, @color, @personality, @background, @appearance, @abilities, @relationships, @now)
    `).run({
      id, projectId,
      name: data.name || '未命名',
      role: data.role || '',
      color: data.color || '#6c5ce7',
      personality: data.personality || '',
      background: data.background || '',
      appearance: data.appearance || '',
      abilities: data.abilities || '',
      relationships: JSON.stringify(data.relationships || []),
      now
    })
    return { id, projectId, ...data, relationships: data.relationships || [] }
  },

  update(id, data) {
    const sets = []
    const values = { id }
    for (const [key, value] of Object.entries(data)) {
      const col = key.replace(/([A-Z])/g, '_$1').toLowerCase()
      if (col === 'relationships') {
        sets.push('relationships = @relationships')
        values.relationships = JSON.stringify(value)
      } else {
        sets.push(`${col} = @${key}`)
        values[key] = value
      }
    }
    if (sets.length === 0) return
    db.prepare(`UPDATE characters SET ${sets.join(', ')} WHERE id = @id`).run(values)
  },

  delete(id) {
    db.prepare('DELETE FROM characters WHERE id = ?').run(id)
  }
}

// --- Chapters ---
export const ChapterRepo = {
  getAll(projectId) {
    return db.prepare('SELECT * FROM chapters WHERE project_id = ? ORDER BY sort_order ASC').all(projectId)
  },

  create(projectId, data) {
    const id = `chap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const now = new Date().toISOString()
    const maxOrder = db.prepare('SELECT MAX(sort_order) as max_order FROM chapters WHERE project_id = ?').get(projectId)
    const sortOrder = (maxOrder?.max_order || 0) + 1
    db.prepare(`
      INSERT INTO chapters (id, project_id, title, content, summary, status, word_count, sort_order, created_at, updated_at)
      VALUES (@id, @projectId, @title, '', @summary, 'draft', 0, @sortOrder, @now, @now)
    `).run({
      id, projectId,
      title: data.title || '新章节',
      summary: data.summary || '',
      sortOrder,
      now
    })
    return { id, projectId, title: data.title, summary: data.summary, status: 'draft', wordCount: 0, sortOrder }
  },

  update(id, data) {
    const now = new Date().toISOString()
    const sets = ['updated_at = @now']
    const values = { id, now }
    for (const [key, value] of Object.entries(data)) {
      const col = key.replace(/([A-Z])/g, '_$1').toLowerCase()
      sets.push(`${col} = @${key}`)
      values[key] = value
    }
    if (data.content !== undefined) {
      values.wordCount = data.content.length
      sets.push('word_count = @wordCount')
    }
    db.prepare(`UPDATE chapters SET ${sets.join(', ')} WHERE id = @id`).run(values)
  },

  delete(id) {
    db.prepare('DELETE FROM chapters WHERE id = ?').run(id)
  },

  reorder(projectId, chapterIds) {
    const txn = db.transaction(() => {
      chapterIds.forEach((id, index) => {
        db.prepare('UPDATE chapters SET sort_order = ? WHERE id = ? AND project_id = ?').run(index + 1, id, projectId)
      })
    })
    txn()
  }
}

// --- World Building ---
export const WorldBuildingRepo = {
  get(projectId) {
    return db.prepare('SELECT * FROM world_buildings WHERE project_id = ?').get(projectId)
  },

  update(projectId, data) {
    const existing = db.prepare('SELECT project_id FROM world_buildings WHERE project_id = ?').get(projectId)
    const fields = { era: '', setting: '', magic_system: '', geography: '', cultures: '', rules: '' }
    for (const [key, value] of Object.entries(data)) {
      const col = key.replace(/([A-Z])/g, '_$1').toLowerCase()
      if (col in fields) fields[col] = value
    }
    if (existing) {
      db.prepare(`
        UPDATE world_buildings SET era = @era, setting = @setting, magic_system = @magic_system, geography = @geography, cultures = @cultures, rules = @rules
        WHERE project_id = @projectId
      `).run({ projectId, ...fields })
    } else {
      db.prepare(`
        INSERT INTO world_buildings (project_id, era, setting, magic_system, geography, cultures, rules)
        VALUES (@projectId, @era, @setting, @magic_system, @geography, @cultures, @rules)
      `).run({ projectId, ...fields })
    }
  }
}

// --- Foreshadows ---
export const ForeshadowRepo = {
  getAll(projectId) {
    return db.prepare('SELECT * FROM foreshadows WHERE project_id = ? ORDER BY created_at ASC').all(projectId)
  },

  create(projectId, data) {
    const id = `fs-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO foreshadows (id, project_id, chapter_id, description, status, resolution_chapter_id, created_at)
      VALUES (@id, @projectId, @chapterId, @description, 'planted', NULL, @now)
    `).run({ id, projectId, chapterId: data.chapterId || null, description: data.description, now })
    return { id, projectId, ...data, status: 'planted' }
  },

  resolve(id, resolutionChapterId) {
    db.prepare("UPDATE foreshadows SET status = 'resolved', resolution_chapter_id = ? WHERE id = ?").run(resolutionChapterId, id)
  },

  delete(id) {
    db.prepare('DELETE FROM foreshadows WHERE id = ?').run(id)
  }
}

// --- Timeline ---
export const TimelineRepo = {
  getAll(projectId) {
    return db.prepare('SELECT * FROM timeline_events WHERE project_id = ? ORDER BY sort_order ASC').all(projectId)
  },

  create(projectId, data) {
    const id = `tl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const now = new Date().toISOString()
    const maxOrder = db.prepare('SELECT MAX(sort_order) as max_order FROM timeline_events WHERE project_id = ?').get(projectId)
    const sortOrder = (maxOrder?.max_order || 0) + 1
    db.prepare(`
      INSERT INTO timeline_events (id, project_id, chapter_id, event_name, event_description, story_time, sort_order, created_at)
      VALUES (@id, @projectId, @chapterId, @eventName, @eventDescription, @storyTime, @sortOrder, @now)
    `).run({
      id, projectId,
      chapterId: data.chapterId || null,
      eventName: data.eventName,
      eventDescription: data.eventDescription || '',
      storyTime: data.storyTime || '',
      sortOrder,
      now
    })
    return { id, projectId, ...data, sortOrder }
  },

  delete(id) {
    db.prepare('DELETE FROM timeline_events WHERE id = ?').run(id)
  }
}

// --- Workflows ---
export const WorkflowRepo = {
  getByProject(projectId) {
    const wf = db.prepare('SELECT * FROM workflows WHERE project_id = ? ORDER BY updated_at DESC LIMIT 1').get(projectId)
    if (!wf) return null

    const results = db.prepare('SELECT step_id, content, created_at FROM workflow_results WHERE workflow_id = ?').all(wf.id)
    const chapterResults = db.prepare('SELECT chapter_index, step_type, content FROM workflow_chapter_results WHERE workflow_id = ?').all(wf.id)
    const logs = db.prepare('SELECT * FROM workflow_logs WHERE workflow_id = ? ORDER BY created_at ASC').all(wf.id)

    const resultsMap = {}
    results.forEach(r => { resultsMap[r.step_id] = { content: r.content, timestamp: r.created_at } })

    const chapterResultsMap = {}
    chapterResults.forEach(r => {
      if (!chapterResultsMap[r.chapter_index]) chapterResultsMap[r.chapter_index] = {}
      chapterResultsMap[r.chapter_index][r.step_type] = r.content
    })

    return {
      ...wf,
      results: resultsMap,
      chapterResults: chapterResultsMap,
      logs
    }
  },

  create(projectId, maxReviewRounds = 2) {
    const id = `wf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO workflows (id, project_id, state, current_step, current_chapter_index, review_round, max_review_rounds, phase, auto_mode, created_at, updated_at)
      VALUES (?, ?, 'idle', 0, 0, 0, ?, 'idle', 0, ?, ?)
    `).run(id, projectId, maxReviewRounds, now, now)
    return this.getByProject(projectId)
  },

  update(id, data) {
    const now = new Date().toISOString()
    const sets = ['updated_at = ?']
    const values = [now]
    const fieldMap = { currentStep: 'current_step', currentChapterIndex: 'current_chapter_index', reviewRound: 'review_round', maxReviewRounds: 'max_review_rounds', autoMode: 'auto_mode' }
    for (const [key, value] of Object.entries(data)) {
      const col = fieldMap[key] || key
      sets.push(`${col} = ?`)
      values.push(typeof value === 'boolean' ? (value ? 1 : 0) : value)
    }
    values.push(id)
    db.prepare(`UPDATE workflows SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  },

  setResult(workflowId, stepId, content) {
    const id = `wr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const now = new Date().toISOString()
    db.prepare(`
      INSERT OR REPLACE INTO workflow_results (id, workflow_id, step_id, content, metadata, created_at)
      VALUES (?, ?, ?, ?, '{}', ?)
    `).run(id, workflowId, stepId, content, now)
  },

  setChapterResult(workflowId, chapterIndex, stepType, content) {
    const id = `wcr-${workflowId}-${chapterIndex}-${stepType}`
    const now = new Date().toISOString()
    db.prepare(`
      INSERT OR REPLACE INTO workflow_chapter_results (id, workflow_id, chapter_index, step_type, content, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, workflowId, chapterIndex, stepType, content, now)
  },

  addLog(workflowId, stepName, message, logType = 'info') {
    const id = `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO workflow_logs (id, workflow_id, step_name, message, log_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, workflowId, stepName, message, logType, now)
  },

  clearResults(workflowId) {
    const txn = db.transaction(() => {
      db.prepare('DELETE FROM workflow_results WHERE workflow_id = ?').run(workflowId)
      db.prepare('DELETE FROM workflow_chapter_results WHERE workflow_id = ?').run(workflowId)
      db.prepare('DELETE FROM workflow_logs WHERE workflow_id = ?').run(workflowId)
    })
    txn()
  }
}

// --- AI Configs (encrypted) ---
export const AIConfigRepo = {
  get(provider) {
    return db.prepare('SELECT * FROM ai_configs WHERE provider = ?').get(provider)
  },

  getAll() {
    return db.prepare('SELECT provider, model, updated_at FROM ai_configs').all()
  },

  set(provider, apiKeyEncrypted, model) {
    const now = new Date().toISOString()
    db.prepare(`
      INSERT OR REPLACE INTO ai_configs (provider, api_key_encrypted, model, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(provider, apiKeyEncrypted, model || '', now)
  },

  delete(provider) {
    db.prepare('DELETE FROM ai_configs WHERE provider = ?').run(provider)
  }
}

// --- Agent History ---
export const AgentHistoryRepo = {
  getAll(projectId, limit = 50) {
    return db.prepare('SELECT * FROM agent_history WHERE project_id = ? ORDER BY created_at DESC LIMIT ?').all(projectId, limit)
  },

  create(projectId, data) {
    const id = `ah-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO agent_history (id, project_id, agent_id, agent_name, prompt, response, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, projectId, data.agentId, data.agentName, data.prompt, data.response, now)
    return { id, projectId, ...data, createdAt: now }
  },

  clear(projectId) {
    db.prepare('DELETE FROM agent_history WHERE project_id = ?').run(projectId)
  }
}

export default db
