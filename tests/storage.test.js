import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import db, { ProjectRepo, OutlineRepo, CharacterRepo, ChapterRepo, WorldBuildingRepo, ForeshadowRepo, TimelineRepo, AIConfigRepo, AgentHistoryRepo } from '../server/db.js'

// 测试前清理数据库
before(() => {
  db.prepare('DELETE FROM agent_history').run()
  db.prepare('DELETE FROM workflow_logs').run()
  db.prepare('DELETE FROM workflow_chapter_results').run()
  db.prepare('DELETE FROM workflow_results').run()
  db.prepare('DELETE FROM workflows').run()
  db.prepare('DELETE FROM foreshadows').run()
  db.prepare('DELETE FROM timeline_events').run()
  db.prepare('DELETE FROM chapters').run()
  db.prepare('DELETE FROM characters').run()
  db.prepare('DELETE FROM outlines').run()
  db.prepare('DELETE FROM world_buildings').run()
  db.prepare('DELETE FROM projects').run()
  db.prepare('DELETE FROM ai_configs').run()
})

describe('SQLite 数据层', () => {
  test('数据库连接成功', () => {
    assert.ok(db, '数据库实例应存在')
    // 测试基础查询
    const result = db.prepare('SELECT 1 as val').get()
    assert.equal(result.val, 1)
  })

  test('ProjectRepo 创建项目', () => {
    const project = ProjectRepo.create({
      title: '测试小说',
      genre: '玄幻',
      style: '热血',
      summary: '测试摘要',
      status: 'active'
    })
    assert.ok(project.id, '应返回带 id 的项目')
    assert.equal(project.title, '测试小说')
    assert.equal(project.genre, '玄幻')
  })

  test('ProjectRepo 获取所有项目', () => {
    ProjectRepo.create({ title: '项目2', genre: '都市', style: '轻松' })
    const projects = ProjectRepo.getAll()
    assert.ok(projects.length >= 2, '应至少有2个项目')
  })

  test('ProjectRepo 按 ID 获取', () => {
    const created = ProjectRepo.create({ title: '查找测试', genre: '科幻' })
    const found = ProjectRepo.getById(created.id)
    assert.ok(found)
    assert.equal(found.title, '查找测试')
  })

  test('ProjectRepo 更新项目', () => {
    const created = ProjectRepo.create({ title: '更新前', genre: '武侠' })
    const updated = ProjectRepo.update(created.id, { title: '更新后', summary: '新摘要' })
    assert.equal(updated.title, '更新后')
    assert.equal(updated.summary, '新摘要')
  })

  test('ProjectRepo 删除项目', () => {
    const created = ProjectRepo.create({ title: '删除测试' })
    ProjectRepo.delete(created.id)
    const found = ProjectRepo.getById(created.id)
    assert.equal(found, null)
  })
})

describe('大纲版本管理', () => {
  test('保存大纲并获取版本', () => {
    const project = ProjectRepo.create({ title: '大纲测试' })
    const v1 = OutlineRepo.save(project.id, '第一版大纲内容')
    OutlineRepo.save(project.id, '第二版大纲内容')

    const versions = OutlineRepo.getVersions(project.id)
    assert.ok(versions.length >= 2, '应至少有2个版本')

    const active = OutlineRepo.getActive(project.id)
    assert.ok(active, '应有活跃大纲')
    assert.equal(active.content, '第二版大纲内容')
  })

  test('激活特定版本', () => {
    const project = ProjectRepo.create({ title: '激活测试' })
    const v1 = OutlineRepo.save(project.id, 'V1')
    OutlineRepo.save(project.id, 'V2')

    OutlineRepo.activate(v1.id)
    const active = OutlineRepo.getActive(project.id)
    assert.equal(active.content, 'V1', '应激活V1')
  })
})

describe('角色管理', () => {
  test('创建和获取角色', () => {
    const project = ProjectRepo.create({ title: '角色测试' })
    const char = CharacterRepo.create(project.id, {
      name: '主角',
      role: 'protagonist',
      personality: '勇敢坚毅',
      background: '出身贫寒',
      abilities: '剑术、火魔法',
      relationships: '与女主是青梅竹马'
    })
    assert.ok(char.id)
    assert.equal(char.name, '主角')

    const chars = CharacterRepo.getAll(project.id)
    assert.ok(chars.length >= 1)
  })

  test('更新角色', () => {
    const project = ProjectRepo.create({ title: '角色更新测试' })
    const char = CharacterRepo.create(project.id, { name: '原角色' })
    CharacterRepo.update(char.id, { name: '更新角色', personality: '冷酷' })
    const chars = CharacterRepo.getAll(project.id)
    const updated = chars.find(c => c.id === char.id)
    assert.equal(updated.name, '更新角色')
    assert.equal(updated.personality, '冷酷')
  })

  test('删除角色', () => {
    const project = ProjectRepo.create({ title: '角色删除测试' })
    const char = CharacterRepo.create(project.id, { name: '待删除' })
    CharacterRepo.delete(char.id)
    const chars = CharacterRepo.getAll(project.id)
    assert.equal(chars.length, 0)
  })
})

describe('章节管理', () => {
  test('创建和排序章节', () => {
    const project = ProjectRepo.create({ title: '章节测试' })
    ChapterRepo.create(project.id, { title: '第一章' })
    ChapterRepo.create(project.id, { title: '第二章' })
    ChapterRepo.create(project.id, { title: '第三章' })

    const chapters = ChapterRepo.getAll(project.id)
    assert.equal(chapters.length, 3)
    assert.equal(chapters[0].title, '第一章')
    assert.equal(chapters[2].title, '第三章')
  })

  test('更新章节内容', () => {
    const project = ProjectRepo.create({ title: '章节更新测试' })
    const ch = ChapterRepo.create(project.id, { title: '测试章' })
    ChapterRepo.update(ch.id, {
      content: '这是章节内容...',
      status: 'completed'
    })
    const updated = ChapterRepo.getAll(project.id).find(c => c.id === ch.id)
    assert.equal(updated.content, '这是章节内容...')
    assert.equal(updated.word_count, 9)
    assert.equal(updated.status, 'completed')
  })

  test('章节重新排序', () => {
    const project = ProjectRepo.create({ title: '排序测试' })
    const ch1 = ChapterRepo.create(project.id, { title: 'A' })
    const ch2 = ChapterRepo.create(project.id, { title: 'B' })

    ChapterRepo.reorder(project.id, [ch2.id, ch1.id])
    const chapters = ChapterRepo.getAll(project.id)
    assert.equal(chapters[0].title, 'B')
    assert.equal(chapters[1].title, 'A')
  })
})

describe('伏笔管理', () => {
  test('创建伏笔并标记回收', () => {
    const project = ProjectRepo.create({ title: '伏笔测试' })
    const ch = ChapterRepo.create(project.id, { title: '伏笔回收章' })
    const fs = ForeshadowRepo.create(project.id, {
      chapterId: ch.id,
      description: '主角身上的神秘印记'
    })
    assert.ok(fs.id)
    assert.equal(fs.status, 'planted')

    ForeshadowRepo.resolve(fs.id, ch.id)
    const foreshadows = ForeshadowRepo.getAll(project.id)
    assert.equal(foreshadows[0].status, 'resolved')
    assert.ok(foreshadows[0].resolution_chapter_id)
  })
})

describe('时间线管理', () => {
  test('创建和获取时间线事件', () => {
    const project = ProjectRepo.create({ title: '时间线测试' })
    const event = TimelineRepo.create(project.id, {
      eventName: '主角出生',
      eventDescription: '主角在偏远村庄出生',
      storyTime: '故事开始前20年'
    })
    assert.ok(event.id)

    const events = TimelineRepo.getAll(project.id)
    assert.ok(events.length >= 1)
  })
})

describe('AI 配置管理', () => {
  test('保存和读取模型配置', () => {
    AIConfigRepo.set('zhipu', 'encrypted-key-data', 'glm-4-plus')
    const config = AIConfigRepo.get('zhipu')
    assert.ok(config)
    assert.equal(config.model, 'glm-4-plus')
    assert.equal(config.api_key_encrypted, 'encrypted-key-data')
  })

  test('保存加密的 API Key', () => {
    AIConfigRepo.set('deepseek', 'encrypted-key-data', 'deepseek-v4-flash')
    const config = AIConfigRepo.get('deepseek')
    assert.equal(config.api_key_encrypted, 'encrypted-key-data')
    assert.equal(config.model, 'deepseek-v4-flash')
  })

  test('getAll 返回配置列表', () => {
    AIConfigRepo.set('openai', 'enc-key', 'gpt-4o-mini')
    const configs = AIConfigRepo.getAll()
    assert.ok(Array.isArray(configs))
    assert.ok(configs.some(c => c.provider === 'openai'))
  })

  test('删除配置', () => {
    AIConfigRepo.set('zhipu', 'temp-key', 'glm-4')
    AIConfigRepo.delete('zhipu')
    const config = AIConfigRepo.get('zhipu')
    assert.equal(config, undefined)
  })
})
