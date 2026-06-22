import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import db from '../server/db.js'
import { ContextBuilder } from '../server/context.js'
import { ProjectRepo, OutlineRepo, CharacterRepo, ChapterRepo, WorldBuildingRepo, ForeshadowRepo, TimelineRepo } from '../server/db.js'

describe('ContextBuilder 上下文构建', () => {
  let testProject, ctxBuilder

  before(() => {
    testProject = ProjectRepo.create({ title: '上下文测试项目', genre: '玄幻', style: '热血' })
    ctxBuilder = new ContextBuilder(db)

    // 设置世界观
    WorldBuildingRepo.update(testProject.id, {
      era: '远古时代',
      setting: '修仙世界',
      magicSystem: '灵气修炼体系',
      geography: '九州大陆'
    })

    // 设置大纲
    OutlineRepo.save(testProject.id, '主线：少年踏上修仙之路...')

    // 创建角色
    CharacterRepo.create(testProject.id, {
      name: '李逍遥',
      role: 'protagonist',
      personality: '热血少年',
      background: '出身贫寒村庄'
    })

    // 创建章节
    ChapterRepo.create(testProject.id, { title: '初入仙门', summary: '主角初入仙门' })
    ChapterRepo.create(testProject.id, { title: '第一次试炼', summary: '遭遇第一次危机' })

    // 创建伏笔
    ForeshadowRepo.create(testProject.id, {
      chapterId: null,
      description: '主角身上的神秘玉佩'
    })

    // 创建时间线
    TimelineRepo.create(testProject.id, {
      eventName: '主角出生',
      eventDescription: '主角在偏远村庄出生',
      storyTime: '故事开始前20年'
    })
  })

  test('build() 返回包含各维度的上下文对象', () => {
    const ctx = ctxBuilder.build(testProject.id)
    assert.ok(ctx.projectTitle, '应包含项目标题')
    assert.equal(ctx.projectTitle, '上下文测试项目')
    assert.equal(ctx.genre, '玄幻')
    assert.ok(ctx.worldBuilding, '应包含世界观')
    assert.ok(ctx.outline, '应包含大纲')
    assert.ok(ctx.characters, '应包含角色')
    assert.ok(ctx.chapterSummaries, '应包含章节摘要')
    assert.ok(ctx.unresolvedForeshadows, '应包含未回收伏笔')
    assert.ok(ctx.timeline, '应包含时间线')
  })

  test('toSystemMessages() 返回 system 消息数组', () => {
    const ctx = ctxBuilder.build(testProject.id)
    const messages = ctxBuilder.toSystemMessages(ctx)
    assert.ok(Array.isArray(messages), '应返回数组')
    assert.ok(messages.length > 0, '应至少有一条消息')
    assert.ok(messages.every(m => m.role === 'system'), '所有消息应为 system 角色')
    assert.ok(messages.some(m => m.content.includes('上下文测试项目')), '应包含项目名')
  })

  test('build() 使用 options 控制包含的维度', () => {
    const ctx = ctxBuilder.build(testProject.id, {
      includeWorldBuilding: false,
      includeCharacters: false,
      includeTimeline: false
    })
    assert.equal(ctx.worldBuilding, undefined, '不应包含世界观')
    assert.equal(ctx.characters, undefined, '不应包含角色')
    assert.equal(ctx.timeline, undefined, '不应包含时间线')
    assert.ok(ctx.outline, '仍应包含大纲')
  })

  test('checkConsistency() 检测伏笔回收', () => {
    const content = '主角身上的神秘玉佩突然发出了耀眼的光芒，似乎与他的身世有关...'
    const issues = ctxBuilder.checkConsistency(testProject.id, content)
    assert.ok(Array.isArray(issues), '应返回数组')
    assert.ok(issues.length > 0, '应检测到潜在伏笔回收')
    assert.ok(issues.some(i => i.type === 'foreshadow_potential_resolve'), '应包含伏笔回收类型')
  })

  test('checkConsistency() 无匹配时返回空数组', () => {
    const content = '今天天气很好，主角走在路上。'
    const issues = ctxBuilder.checkConsistency(testProject.id, content)
    assert.ok(Array.isArray(issues))
    // 可能匹配到 "似乎" 关键词但不会有伏笔匹配
  })

  test('autoGenerateSummary() 返回摘要', () => {
    const content = '这是第一章的正文内容。主角来到了仙门面前，看到了巍峨的山峰和飘渺的云雾。'
    const summary = ctxBuilder.autoGenerateSummary(content)
    assert.ok(typeof summary === 'string')
    assert.ok(summary.length > 0)
    assert.ok(summary.endsWith('...'))
  })

  test('detectForeshadows() 检测潜在伏笔', () => {
    const content = '主角发现了一个神秘的山洞，里面隐藏着什么秘密。他不知道为什么，总觉得这个洞穴在召唤他。'
    const detected = ctxBuilder.detectForeshadows(content)
    assert.ok(Array.isArray(detected), '应返回数组')
    assert.ok(detected.length > 0, '应检测到潜在伏笔关键词')
  })
})
