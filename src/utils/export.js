import { saveAs } from 'file-saver'
import JSZip from 'jszip'

export function exportAsTxt(project) {
  let content = `${project.title}\n`
  content += `类型：${project.genre}  风格：${project.style}\n`
  content += `${'─'.repeat(50)}\n\n`

  if (project.summary) {
    content += `【简介】\n${project.summary}\n\n${'─'.repeat(50)}\n\n`
  }

  if (project.outline) {
    content += `【大纲】\n${project.outline}\n\n${'─'.repeat(50)}\n\n`
  }

  const sortedChapters = [...project.chapters].sort((a, b) => (a.order || 0) - (b.order || 0))
  sortedChapters.forEach((ch, i) => {
    content += `第${i + 1}章 ${ch.title}\n\n`
    content += `${ch.content || '(暂无内容)'}\n\n`
    content += `${'─'.repeat(50)}\n\n`
  })

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  saveAs(blob, `${project.title}.txt`)
}

export function exportAsMarkdown(project) {
  let content = `# ${project.title}\n\n`
  content += `> 类型：${project.genre} | 风格：${project.style}\n\n`

  if (project.summary) {
    content += `## 简介\n\n${project.summary}\n\n`
  }

  if (project.outline) {
    content += `## 大纲\n\n${project.outline}\n\n`
  }

  const sortedChapters = [...project.chapters].sort((a, b) => (a.order || 0) - (b.order || 0))
  sortedChapters.forEach((ch, i) => {
    content += `## 第${i + 1}章 ${ch.title}\n\n`
    content += `${ch.content || '*(暂无内容)*'}\n\n`
  })

  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  saveAs(blob, `${project.title}.md`)
}

export async function exportAsZip(project) {
  const zip = new JSZip()

  let readme = `# ${project.title}\n\n`
  readme += `类型：${project.genre} | 风格：${project.style}\n`
  readme += `创建时间：${project.createdAt}\n`
  readme += `更新时间：${project.updatedAt}\n`
  readme += `总字数：${project.chapters.reduce((s, c) => s + (c.wordCount || 0), 0)}\n`
  zip.file('README.md', readme)

  if (project.summary) {
    zip.file('简介.txt', project.summary)
  }

  if (project.outline) {
    zip.file('大纲.md', project.outline)
  }

  if (project.characters.length > 0) {
    let charContent = '# 人物设定\n\n'
    project.characters.forEach(c => {
      charContent += `## ${c.name}\n`
      charContent += `- 角色定位：${c.role || '未设定'}\n`
      charContent += `- 性格：${c.personality || '未设定'}\n`
      charContent += `- 背景：${c.background || '未设定'}\n`
      if (c.appearance) charContent += `- 外貌：${c.appearance}\n`
      if (c.abilities) charContent += `- 能力：${c.abilities}\n`
      charContent += '\n'
    })
    zip.file('人物设定.md', charContent)
  }

  const chaptersFolder = zip.folder('章节')
  const sortedChapters = [...project.chapters].sort((a, b) => (a.order || 0) - (b.order || 0))
  sortedChapters.forEach((ch, i) => {
    const num = String(i + 1).padStart(2, '0')
    chaptersFolder.file(`第${num}章_${ch.title}.txt`, ch.content || '')
  })

  const blob = await zip.generateAsync({ type: 'blob' })
  saveAs(blob, `${project.title}.zip`)
}
