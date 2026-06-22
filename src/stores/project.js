import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { projectApi, outlineApi, characterApi, chapterApi, worldApi, foreshadowApi, timelineApi, historyApi } from '@/utils/api'

export const useProjectStore = defineStore('project', () => {
  const projects = ref([])
  const currentProjectId = ref(null)
  const currentProject = ref(null)
  const loading = ref(false)

  const chapters = computed(() => currentProject.value?.chapters || [])
  const characters = computed(() => currentProject.value?.characters || [])
  const outline = computed(() => currentProject.value?.outline || null)
  const foreshadows = computed(() => currentProject.value?.foreshadows || [])
  const timeline = computed(() => currentProject.value?.timeline || [])

  const totalWords = computed(() =>
    chapters.value.reduce((sum, ch) => sum + (ch.word_count || ch.wordCount || 0), 0)
  )

  async function loadProjects() {
    loading.value = true
    try {
      const data = await projectApi.getAll()
      projects.value = data.projects || []
    } catch (e) {
      console.error('加载项目失败:', e)
    } finally {
      loading.value = false
    }
  }

  async function openProject(id) {
    currentProjectId.value = id
    try {
      const data = await projectApi.get(id)
      currentProject.value = normalizeProject(data.project)
    } catch (e) {
      console.error('打开项目失败:', e)
      currentProject.value = null
    }
  }

  function normalizeProject(p) {
    if (!p) return null
    const worldBuilding = p.worldBuilding || p.world_building || {}
    return {
      ...p,
      worldBuilding: {
        era: worldBuilding.era || '',
        setting: worldBuilding.setting || '',
        magicSystem: worldBuilding.magic_system || worldBuilding.magicSystem || '',
        geography: worldBuilding.geography || '',
        cultures: worldBuilding.cultures || '',
        rules: worldBuilding.rules || ''
      },
      outline: p.outline || null,
      characters: (p.characters || []).map(c => ({
        ...c,
        relationships: typeof c.relationships === 'string' ? JSON.parse(c.relationships || '[]') : (c.relationships || []),
        color: c.color || '#6c5ce7'
      })),
      chapters: (p.chapters || []).map(c => ({
        ...c,
        wordCount: c.word_count ?? c.wordCount ?? 0,
        sortOrder: c.sort_order ?? c.sortOrder ?? 0
      })),
      foreshadows: p.foreshadows || [],
      timeline: p.timeline || [],
      targetWords: p.target_words ?? p.targetWords ?? 100000,
      createdAt: p.created_at || p.createdAt,
      updatedAt: p.updated_at || p.updatedAt
    }
  }

  async function createProject(data) {
    const result = await projectApi.create(data)
    const project = normalizeProject(result.project)
    projects.value.unshift(project)
    currentProjectId.value = project.id
    currentProject.value = project
    return project
  }

  async function deleteProject(id) {
    await projectApi.delete(id)
    const idx = projects.value.findIndex(p => p.id === id)
    if (idx !== -1) projects.value.splice(idx, 1)
    if (currentProjectId.value === id) {
      currentProjectId.value = null
      currentProject.value = null
    }
  }

  async function updateProject(id, data) {
    await projectApi.update(id, _toSnakeCase(data))
    if (currentProjectId.value === id) {
      await openProject(id)
    }
  }

  async function updateOutline(content) {
    if (!currentProjectId.value) return
    await outlineApi.save(currentProjectId.value, content)
    if (currentProject.value) currentProject.value.outline = content
  }

  async function addCharacter(char) {
    if (!currentProjectId.value) return
    const result = await characterApi.create(currentProjectId.value, char)
    const newChar = {
      ...result.character,
      relationships: typeof result.character.relationships === 'string'
        ? JSON.parse(result.character.relationships || '[]')
        : (result.character.relationships || [])
    }
    currentProject.value.characters.push(newChar)
    return newChar
  }

  async function updateCharacter(id, data) {
    await characterApi.update(id, _toSnakeCase(data))
    const char = currentProject.value?.characters.find(c => c.id === id)
    if (char) Object.assign(char, data)
  }

  async function deleteCharacter(id) {
    await characterApi.delete(id)
    const idx = currentProject.value?.characters.findIndex(c => c.id === id)
    if (idx !== -1) currentProject.value.characters.splice(idx, 1)
  }

  async function addChapter(chapter) {
    if (!currentProjectId.value) return
    const result = await chapterApi.create(currentProjectId.value, chapter)
    const newCh = {
      ...result.chapter,
      wordCount: result.chapter.word_count || 0,
      sortOrder: result.chapter.sort_order || currentProject.value.chapters.length
    }
    currentProject.value.chapters.push(newCh)
    return newCh
  }

  async function updateChapter(id, data) {
    await chapterApi.update(id, _toSnakeCase(data))
    const ch = currentProject.value?.chapters.find(c => c.id === id)
    if (ch) {
      Object.assign(ch, data)
      if (data.content !== undefined) {
        ch.wordCount = data.content.length
        ch.word_count = data.content.length
      }
    }
  }

  async function deleteChapter(id) {
    await chapterApi.delete(id)
    const idx = currentProject.value?.chapters.findIndex(c => c.id === id)
    if (idx !== -1) currentProject.value.chapters.splice(idx, 1)
  }

  async function reorderChapters(ids) {
    if (!currentProjectId.value) return
    await chapterApi.reorder(currentProjectId.value, ids)
  }

  async function addAgentHistory(entry) {
    // 历史现在在后端自动保存
  }

  async function updateWorldBuilding(data) {
    if (!currentProjectId.value) return
    await worldApi.update(currentProjectId.value, _toSnakeCase(data))
    if (currentProject.value) Object.assign(currentProject.value.worldBuilding, data)
  }

  // 伏笔管理
  async function addForeshadow(data) {
    if (!currentProjectId.value) return
    const result = await foreshadowApi.create(currentProjectId.value, data)
    currentProject.value.foreshadows.push(result.foreshadow)
    return result.foreshadow
  }

  async function resolveForeshadow(id, chapterId) {
    await foreshadowApi.resolve(id, chapterId)
    const fs = currentProject.value?.foreshadows.find(f => f.id === id)
    if (fs) {
      fs.status = 'resolved'
      fs.resolution_chapter_id = chapterId
    }
  }

  async function deleteForeshadow(id) {
    await foreshadowApi.delete(id)
    const idx = currentProject.value?.foreshadows.findIndex(f => f.id === id)
    if (idx !== -1) currentProject.value.foreshadows.splice(idx, 1)
  }

  // 时间线
  async function addTimelineEvent(data) {
    if (!currentProjectId.value) return
    const result = await timelineApi.create(currentProjectId.value, data)
    currentProject.value.timeline.push(result.event)
    return result.event
  }

  async function deleteTimelineEvent(id) {
    await timelineApi.delete(id)
    const idx = currentProject.value?.timeline.findIndex(t => t.id === id)
    if (idx !== -1) currentProject.value.timeline.splice(idx, 1)
  }

  // 工具函数：驼峰转下划线
  function _toSnakeCase(obj) {
    const result = {}
    for (const [key, value] of Object.entries(obj)) {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase()
      result[snakeKey] = value
    }
    return result
  }

  // 初始化：加载项目列表
  loadProjects()

  return {
    projects, currentProjectId, currentProject, loading,
    chapters, characters, outline, foreshadows, timeline, totalWords,
    loadProjects, openProject, createProject, deleteProject, updateProject,
    updateOutline, addCharacter, updateCharacter, deleteCharacter,
    addChapter, updateChapter, deleteChapter, reorderChapters,
    addAgentHistory, updateWorldBuilding,
    addForeshadow, resolveForeshadow, deleteForeshadow,
    addTimelineEvent, deleteTimelineEvent
  }
})
